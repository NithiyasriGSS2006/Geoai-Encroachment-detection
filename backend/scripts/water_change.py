import rasterio
import numpy as np
import os
import csv
import geopandas as gpd
from rasterio.features import shapes, rasterize
from shapely.geometry import shape, mapping
from shapely.ops import unary_union
from shapely.strtree import STRtree

# ============================================================
# POLYGON-BASED WATER-BODY CHANGE ANALYSIS
# ============================================================
# Existing yearly water masks are preserved:
#   0   = Non-water
#   255 = Water
#
# Main change methodology:
#   1. Convert each yearly water mask into water-body polygons.
#   2. Compare historical and current polygons using geometric
#      intersection, difference, area, and spatial relationships.
#   3. Classify polygon-level changes as contracted, expanded,
#      disappeared, new, split, or merged where supported.
#   4. Rasterize polygon-derived results only for compatibility
#      with the existing GeoTIFF outputs.
#
# No multi-date persistent-water assessment is performed.
# Raster masks are the source data, so polygon boundaries still
# inherit their spatial resolution and classification accuracy.
# ============================================================


# ============================================================
# 1. FOLDERS
# ============================================================

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.dirname(SCRIPT_DIR)

WATER_MASK_FOLDER = os.environ.get(
    "WATER_MASK_FOLDER",
    os.path.join(BASE_DIR, "data", "water_masks_tif")
)

OUTPUT_FOLDER = os.environ.get(
    "OUTPUT_FOLDER",
    os.path.join(BASE_DIR, "data", "gisoutputs", "water_change")
)

os.makedirs(OUTPUT_FOLDER, exist_ok=True)


# ============================================================
# 2. YEARS
# ============================================================

YEARS = [2017, 2020, 2023, 2024, 2026]


# ============================================================
# 3. CREATE YEAR PAIRS
# ============================================================

YEAR_PAIRS = [
    (2017, 2020),
    (2017, 2023),
    (2017, 2024),
    (2017, 2026)
]


# ============================================================
# 4. POLYGON / GEOMETRY FUNCTIONS
# ============================================================

def calculate_polygon_area(mask, transform, crs):
    """
    Preserve the original function name.

    Calculates the area represented by a binary raster mask by
    polygonizing its water cells and measuring the resulting
    geometries. Requires a projected CRS with metre units for m².
    """
    polygons = []

    for geometry, value in shapes(
        mask.astype(np.uint8),
        mask=mask.astype(bool),
        transform=transform
    ):
        if value == 1:
            geom = shape(geometry)
            if not geom.is_empty:
                polygons.append(geom)

    if not polygons:
        return 0.0

    gdf = gpd.GeoDataFrame(geometry=polygons, crs=crs)
    return float(gdf.geometry.area.sum())


def polygonize_water_mask(historical_water, historical_transform,
                          historical_crs, valid_mask=None):
    """
    Convert one year's water mask into individual water-body polygons.
    Each connected polygon is treated as one water-body object.
    """
    if valid_mask is None:
        valid_mask = np.ones(historical_water.shape, dtype=bool)

    water_mask = historical_water.astype(bool) & valid_mask.astype(bool)
    polygons = []

    for geometry, value in shapes(
        water_mask.astype(np.uint8),
        mask=water_mask,
        transform=historical_transform,
        connectivity=8
    ):
        if value != 1:
            continue

        geom = shape(geometry)
        if not geom.is_empty and geom.area > 0:
            polygons.append(geom)

    if not polygons:
        return gpd.GeoDataFrame(
            {"object_id": [], "area_m2": [], "area_ha": [], "perimeter_m": []},
            geometry=[],
            crs=historical_crs
        )

    gdf = gpd.GeoDataFrame(
        {"object_id": np.arange(1, len(polygons) + 1, dtype=int)},
        geometry=polygons,
        crs=historical_crs
    )
    gdf["area_m2"] = gdf.geometry.area
    gdf["area_ha"] = gdf["area_m2"] / 10000.0
    gdf["perimeter_m"] = gdf.geometry.length
    gdf["compactness"] = np.where(
        gdf["perimeter_m"] > 0,
        (4.0 * np.pi * gdf["area_m2"]) / (gdf["perimeter_m"] ** 2),
        0.0
    )
    return gdf


def repair_geometries(gdf):
    """Repair invalid polygon geometries before overlay operations."""
    if gdf.empty:
        return gdf
    gdf = gdf.copy()
    gdf["geometry"] = gdf.geometry.apply(
        lambda geom: geom if geom is None or geom.is_valid else geom.buffer(0)
    )
    gdf = gdf[~gdf.geometry.isna() & ~gdf.geometry.is_empty].copy()
    return gdf


def union_geometry(gdf, crs):
    """Return the union of all water-body polygons, or an empty geometry."""
    if gdf.empty:
        from shapely.geometry import GeometryCollection
        return GeometryCollection()
    return unary_union(list(gdf.geometry))


def polygonize_difference(geometry, min_area_m2=0.0):
    """Return polygon parts from a geometry result, filtering tiny slivers."""
    if geometry is None or geometry.is_empty:
        return []
    if geometry.geom_type == "Polygon":
        parts = [geometry]
    elif geometry.geom_type == "MultiPolygon":
        parts = list(geometry.geoms)
    elif hasattr(geometry, "geoms"):
        parts = []
        for item in geometry.geoms:
            if item.geom_type == "Polygon":
                parts.append(item)
            elif item.geom_type == "MultiPolygon":
                parts.extend(list(item.geoms))
    else:
        parts = []
    return [
        geom for geom in parts
        if not geom.is_empty and geom.area > min_area_m2
    ]


def build_change_polygons(historical_gdf, current_gdf, historical_year,
                          current_year, crs):
    """
    Perform vector geometry comparison, not per-pixel transition tests.

    Water loss = historical water polygon union minus current water union.
    Water gain = current water polygon union minus historical water union.

    Individual historical/current polygons are also related through
    geometric intersections. This identifies object-level changes and
    possible splits/merges.
    """
    historical_union = union_geometry(historical_gdf, crs)
    current_union = union_geometry(current_gdf, crs)

    water_loss_geometry = historical_union.difference(current_union)
    water_gain_geometry = current_union.difference(historical_union)

    water_loss_polygons = polygonize_difference(water_loss_geometry)
    water_gain_polygons = polygonize_difference(water_gain_geometry)

    def make_gdf(geometries, change_type):
        if not geometries:
            return gpd.GeoDataFrame(
                {"change_id": [], "change_type": [], "area_m2": [], "area_ha": [],
                 "historical_year": [], "current_year": []},
                geometry=[],
                crs=crs
            )
        result = gpd.GeoDataFrame(
            {
                "change_id": np.arange(1, len(geometries) + 1, dtype=int),
                "change_type": [change_type] * len(geometries),
                "area_m2": [geom.area for geom in geometries],
                "area_ha": [geom.area / 10000.0 for geom in geometries],
                "historical_year": [historical_year] * len(geometries),
                "current_year": [current_year] * len(geometries)
            },
            geometry=geometries,
            crs=crs
        )
        return result

    loss_gdf = make_gdf(water_loss_polygons, "Water loss")
    gain_gdf = make_gdf(water_gain_polygons, "Water gain")

    # Object relationship analysis: each pair of water-body polygons is
    # related only when their geometries intersect with positive area.
    relationship_rows = []
    historical_intersections = {int(i): 0 for i in historical_gdf.index}
    current_intersections = {int(i): 0 for i in current_gdf.index}

    for hist_idx, hist_row in historical_gdf.iterrows():
        hist_geom = hist_row.geometry
        for curr_idx, curr_row in current_gdf.iterrows():
            curr_geom = curr_row.geometry
            if not hist_geom.intersects(curr_geom):
                continue
            intersection = hist_geom.intersection(curr_geom)
            overlap_area_m2 = float(intersection.area)
            if overlap_area_m2 <= 0:
                continue

            historical_intersections[int(hist_idx)] += 1
            current_intersections[int(curr_idx)] += 1

            smaller_area = min(float(hist_row.area_m2), float(curr_row.area_m2))
            larger_area = max(float(hist_row.area_m2), float(curr_row.area_m2))
            overlap_ratio = overlap_area_m2 / smaller_area if smaller_area else 0.0
            iou = (
                overlap_area_m2 /
                (float(hist_row.area_m2) + float(curr_row.area_m2) - overlap_area_m2)
                if (float(hist_row.area_m2) + float(curr_row.area_m2) - overlap_area_m2) > 0
                else 0.0
            )

            relationship_rows.append({
                "historical_year": historical_year,
                "current_year": current_year,
                "historical_object_id": int(hist_row.object_id),
                "current_object_id": int(curr_row.object_id),
                "historical_area_ha": float(hist_row.area_ha),
                "current_area_ha": float(curr_row.area_ha),
                "intersection_area_ha": overlap_area_m2 / 10000.0,
                "intersection_over_union": iou,
                "overlap_of_smaller_object": overlap_ratio,
                "area_change_ha": float(curr_row.area_ha - hist_row.area_ha)
            })

    # Historical object classification: contraction/disappearance/splitting.
    object_change_rows = []
    for hist_idx, hist_row in historical_gdf.iterrows():
        related_count = historical_intersections[int(hist_idx)]
        hist_geom = hist_row.geometry
        lost_geom = hist_geom.difference(current_union)
        lost_area_m2 = float(lost_geom.area)
        lost_area_ha = lost_area_m2 / 10000.0
        if related_count == 0:
            change_class = "Disappeared"
        elif related_count > 1:
            change_class = "Possible split"
        elif lost_area_m2 > 0:
            change_class = "Contracted"
        else:
            change_class = "No detected loss"

        object_change_rows.append({
            "year_pair": f"{historical_year}_{current_year}",
            "reference_year": historical_year,
            "object_id": int(hist_row.object_id),
            "reference_area_ha": float(hist_row.area_ha),
            "related_objects_in_other_year": related_count,
            "lost_area_ha": lost_area_ha,
            "change_class": change_class
        })

    # Current object classification: expansion/new object/possible merging.
    for curr_idx, curr_row in current_gdf.iterrows():
        related_count = current_intersections[int(curr_idx)]
        curr_geom = curr_row.geometry
        gained_geom = curr_geom.difference(historical_union)
        gained_area_m2 = float(gained_geom.area)
        gained_area_ha = gained_area_m2 / 10000.0
        if related_count == 0:
            change_class = "New water body"
        elif related_count > 1:
            change_class = "Possible merge"
        elif gained_area_m2 > 0:
            change_class = "Expanded"
        else:
            change_class = "No detected gain"

        object_change_rows.append({
            "year_pair": f"{historical_year}_{current_year}",
            "reference_year": current_year,
            "object_id": int(curr_row.object_id),
            "reference_area_ha": float(curr_row.area_ha),
            "related_objects_in_other_year": related_count,
            "lost_area_ha": 0.0,
            "gained_area_ha": gained_area_ha,
            "change_class": change_class
        })

    relationship_gdf = gpd.GeoDataFrame(
        relationship_rows,
        geometry=[
            historical_gdf.loc[
                next(i for i in historical_gdf.index
                     if int(historical_gdf.loc[i, "object_id"]) == row["historical_object_id"])
            ].geometry.intersection(
                current_gdf.loc[
                    next(i for i in current_gdf.index
                         if int(current_gdf.loc[i, "object_id"]) == row["current_object_id"])
                ].geometry
            )
            for row in relationship_rows
        ],
        crs=crs
    ) if relationship_rows else gpd.GeoDataFrame(
        columns=[
            "historical_year", "current_year", "historical_object_id",
            "current_object_id", "historical_area_ha", "current_area_ha",
            "intersection_area_ha", "intersection_over_union",
            "overlap_of_smaller_object", "area_change_ha", "geometry"
        ],
        geometry="geometry",
        crs=crs
    )

    object_change_gdf = gpd.GeoDataFrame(
        object_change_rows,
        geometry=[None] * len(object_change_rows),
        crs=crs
    ) if object_change_rows else gpd.GeoDataFrame(
        columns=[
            "year_pair", "reference_year", "object_id", "reference_area_ha",
            "related_objects_in_other_year", "lost_area_ha", "gained_area_ha",
            "change_class", "geometry"
        ],
        geometry="geometry",
        crs=crs
    )

    return (
        loss_gdf, gain_gdf, relationship_gdf, object_change_gdf,
        historical_union, current_union
    )


def rasterize_geometry(geometry, out_shape, transform, value=1):
    """Rasterize a polygon geometry for compatibility with existing TIF outputs."""
    output = np.zeros(out_shape, dtype=np.uint8)
    if geometry is None or geometry.is_empty:
        return output
    output = rasterize(
        [(mapping(geometry), value)],
        out_shape=out_shape,
        transform=transform,
        fill=0,
        all_touched=False,
        dtype=np.uint8
    )
    return output


def save_geodataframe(gdf, output_path):
    """Save non-empty vector outputs as GeoJSON; skip empty geometry layers safely."""
    if gdf is not None and not gdf.empty:
        gdf.to_file(output_path, driver="GeoJSON")
    else:
        print(f"No features to save for: {output_path}")


# ============================================================
# 5. PROCESS EACH YEAR PAIR
# ============================================================

for historical_year, current_year in YEAR_PAIRS:

    print(f"\nPOLYGON-BASED WATER CHANGE: {historical_year} -> {current_year}")
    print("==========================================")

    # --------------------------------------------------------
    # Input paths (preserved)
    # --------------------------------------------------------
    historical_path = os.path.join(
        WATER_MASK_FOLDER, f"water_{historical_year}.tif"
    )
    current_path = os.path.join(
        WATER_MASK_FOLDER, f"water_{current_year}.tif"
    )

    # --------------------------------------------------------
    # Output paths (preserved, plus vector outputs)
    # --------------------------------------------------------
    water_loss_path = os.path.join(
        OUTPUT_FOLDER, f"water_loss_{historical_year}_{current_year}.tif"
    )
    water_gain_path = os.path.join(
        OUTPUT_FOLDER, f"water_gain_{historical_year}_{current_year}.tif"
    )
    change_map_path = os.path.join(
        OUTPUT_FOLDER, f"water_change_{historical_year}_{current_year}.tif"
    )
    display_map_path = os.path.join(
        OUTPUT_FOLDER, f"water_change_display_{historical_year}_{current_year}.tif"
    )
    report_path = os.path.join(
        OUTPUT_FOLDER, f"water_change_report_{historical_year}_{current_year}.csv"
    )

    historical_objects_path = os.path.join(
        OUTPUT_FOLDER, f"water_objects_{historical_year}.geojson"
    )
    current_objects_path = os.path.join(
        OUTPUT_FOLDER, f"water_objects_{current_year}.geojson"
    )
    loss_polygons_path = os.path.join(
        OUTPUT_FOLDER, f"water_loss_polygons_{historical_year}_{current_year}.geojson"
    )
    gain_polygons_path = os.path.join(
        OUTPUT_FOLDER, f"water_gain_polygons_{historical_year}_{current_year}.geojson"
    )
    relationships_path = os.path.join(
        OUTPUT_FOLDER, f"water_object_relationships_{historical_year}_{current_year}.geojson"
    )
    object_report_path = os.path.join(
        OUTPUT_FOLDER, f"water_object_change_report_{historical_year}_{current_year}.csv"
    )

    # --------------------------------------------------------
    # Check input files
    # --------------------------------------------------------
    if not os.path.exists(historical_path):
        print("Historical raster not found:", historical_path)
        continue
    if not os.path.exists(current_path):
        print("Current raster not found:", current_path)
        continue

    # --------------------------------------------------------
    # Read historical raster
    # --------------------------------------------------------
    with rasterio.open(historical_path) as src_hist:
        historical_raw = src_hist.read(1)
        historical_profile = src_hist.profile.copy()
        historical_width = src_hist.width
        historical_height = src_hist.height
        historical_crs = src_hist.crs
        historical_transform = src_hist.transform
        historical_valid = src_hist.dataset_mask() > 0

    # --------------------------------------------------------
    # Read current raster
    # --------------------------------------------------------
    with rasterio.open(current_path) as src_curr:
        current_raw = src_curr.read(1)
        current_width = src_curr.width
        current_height = src_curr.height
        current_crs = src_curr.crs
        current_transform = src_curr.transform
        current_valid = src_curr.dataset_mask() > 0

    print("\nHistorical raster:")
    print("Size:", historical_width, "×", historical_height)
    print("CRS:", historical_crs)
    print("Transform:", historical_transform)

    print("\nCurrent raster:")
    print("Size:", current_width, "×", current_height)
    print("CRS:", current_crs)
    print("Transform:", current_transform)

    # --------------------------------------------------------
    # Alignment checks (preserved)
    # --------------------------------------------------------
    if historical_width != current_width:
        print("\nERROR: Raster widths do not match.")
        continue
    if historical_height != current_height:
        print("\nERROR: Raster heights do not match.")
        continue
    if historical_crs != current_crs:
        print("\nERROR: CRS does not match.")
        continue
    if historical_transform != current_transform:
        print("\nERROR: Raster transforms do not match.")
        continue
    if historical_crs is None:
        print("\nERROR: Raster CRS is missing.")
        continue

    print("\nRaster alignment: OK")

    # Area values are meaningful as m² only for a projected CRS in metre units.
    if getattr(historical_crs, "is_geographic", False):
        print("ERROR: CRS is geographic. Reproject masks to a projected CRS in metres.")
        continue

    pixel_width = abs(historical_transform.a)
    pixel_height = abs(historical_transform.e)
    pixel_area = abs(
        historical_transform.a * historical_transform.e
        - historical_transform.b * historical_transform.d
    )

    print("Pixel size:", pixel_width, "×", pixel_height, "m")
    print("Pixel area:", pixel_area, "m²")
    print("\nHistorical mask values:", np.unique(historical_raw))
    print("Current mask values:", np.unique(current_raw))

    # --------------------------------------------------------
    # Binary masks (kept as input preparation, not change method)
    # --------------------------------------------------------
    historical_water = (historical_raw > 0) & historical_valid
    current_water = (current_raw > 0) & current_valid
    jointly_valid = historical_valid & current_valid

    historical_water = historical_water & jointly_valid
    current_water = current_water & jointly_valid

    historical_water_pixels = int(np.sum(historical_water))
    current_water_pixels = int(np.sum(current_water))

    # --------------------------------------------------------
    # POLYGONIZE each year's water bodies
    # --------------------------------------------------------
    historical_gdf = polygonize_water_mask(
        historical_water, historical_transform, historical_crs, jointly_valid
    )
    current_gdf = polygonize_water_mask(
        current_water, historical_transform, historical_crs, jointly_valid
    )

    historical_gdf = repair_geometries(historical_gdf)
    current_gdf = repair_geometries(current_gdf)

    # Save yearly water-body polygons (overwrite same-year outputs safely).
    save_geodataframe(historical_gdf, historical_objects_path)
    save_geodataframe(current_gdf, current_objects_path)

    historical_water_area_m2 = float(historical_gdf.geometry.area.sum()) if not historical_gdf.empty else 0.0
    current_water_area_m2 = float(current_gdf.geometry.area.sum()) if not current_gdf.empty else 0.0
    historical_water_area_ha = historical_water_area_m2 / 10000.0
    current_water_area_ha = current_water_area_m2 / 10000.0

    # --------------------------------------------------------
    # POLYGON-BASED CHANGE DETECTION
    # --------------------------------------------------------
    (
        loss_gdf, gain_gdf, relationship_gdf, object_change_gdf,
        historical_union, current_union
    ) = build_change_polygons(
        historical_gdf, current_gdf,
        historical_year, current_year, historical_crs
    )

    save_geodataframe(loss_gdf, loss_polygons_path)
    save_geodataframe(gain_gdf, gain_polygons_path)
    save_geodataframe(relationship_gdf, relationships_path)

    if not object_change_gdf.empty:
        object_change_gdf.drop(columns="geometry").to_csv(
            object_report_path, index=False
        )
    else:
        with open(object_report_path, "w", newline="", encoding="utf-8") as csvfile:
            writer = csv.writer(csvfile)
            writer.writerow([
                "year_pair", "reference_year", "object_id", "reference_area_ha",
                "related_objects_in_other_year", "lost_area_ha", "gained_area_ha",
                "change_class"
            ])

    # Union geometries and polygon difference areas, rather than cell-wise
    # logical operations, define the actual loss/gain outputs.
    water_loss_geometry = historical_union.difference(current_union)
    water_gain_geometry = current_union.difference(historical_union)

    loss_area_m2 = float(water_loss_geometry.area)
    gain_area_m2 = float(water_gain_geometry.area)
    loss_hectares = loss_area_m2 / 10000.0
    gain_hectares = gain_area_m2 / 10000.0

    net_change_area_m2 = current_water_area_m2 - historical_water_area_m2
    net_change_hectares = net_change_area_m2 / 10000.0

    if historical_water_area_m2 > 0:
        percentage_change = (
            net_change_area_m2 / historical_water_area_m2
        ) * 100.0
    else:
        percentage_change = 0.0

    # --------------------------------------------------------
    # Raster outputs retained for compatibility with existing GIS use.
    # These are rasterized from polygon-based vector change results.
    # --------------------------------------------------------
    water_loss = rasterize_geometry(
        water_loss_geometry, historical_raw.shape, historical_transform, value=1
    ).astype(bool)
    water_gain = rasterize_geometry(
        water_gain_geometry, historical_raw.shape, historical_transform, value=1
    ).astype(bool)

    loss_pixels = int(np.sum(water_loss))
    gain_pixels = int(np.sum(water_gain))

    water_loss_display = water_loss.astype(np.uint8) * 255
    water_gain_display = water_gain.astype(np.uint8) * 255

    # Change map classes: 0 = no detected change, 2 = water loss, 3 = water gain.
    # Persistent water/non-water classes are intentionally not assessed.
    change_map = np.zeros(historical_raw.shape, dtype=np.uint8)
    change_map[water_loss] = 2
    change_map[water_gain] = 3

    # Display values: 0 = background, 170 = loss, 255 = gain.
    display_map = np.zeros(change_map.shape, dtype=np.uint8)
    display_map[change_map == 2] = 170
    display_map[change_map == 3] = 255

    output_profile = historical_profile.copy()
    output_profile.update(
        driver="GTiff",
        dtype="uint8",
        count=1,
        nodata=0,
        compress="lzw"
    )

    with rasterio.open(water_loss_path, "w", **output_profile) as dst:
        dst.write(water_loss_display, 1)
    with rasterio.open(water_gain_path, "w", **output_profile) as dst:
        dst.write(water_gain_display, 1)
    with rasterio.open(change_map_path, "w", **output_profile) as dst:
        dst.write(change_map, 1)
    with rasterio.open(display_map_path, "w", **output_profile) as dst:
        dst.write(display_map, 1)

    # --------------------------------------------------------
    # Object-level counts and summary statistics
    # --------------------------------------------------------
    historical_object_count = len(historical_gdf)
    current_object_count = len(current_gdf)
    relationship_count = len(relationship_gdf)

    print("\n------------------------------------------")
    print("POLYGON-BASED WATER AREA")
    print("------------------------------------------")
    print(f"{historical_year} water objects:", historical_object_count)
    print(f"{historical_year} water pixels (input-mask statistic):", historical_water_pixels)
    print(f"{historical_year} water area:", round(historical_water_area_ha, 4), "ha")
    print()
    print(f"{current_year} water objects:", current_object_count)
    print(f"{current_year} water pixels (input-mask statistic):", current_water_pixels)
    print(f"{current_year} water area:", round(current_water_area_ha, 4), "ha")

    print("\n------------------------------------------")
    print("POLYGON-BASED CHANGE RESULTS")
    print("------------------------------------------")
    print("Water-loss polygon count:", len(loss_gdf))
    print("Water loss area:", round(loss_area_m2, 2), "m²")
    print("Water loss:", round(loss_hectares, 4), "ha")
    print()
    print("Water-gain polygon count:", len(gain_gdf))
    print("Water gain area:", round(gain_area_m2, 2), "m²")
    print("Water gain:", round(gain_hectares, 4), "ha")
    print("Net water change:", round(net_change_hectares, 4), "ha")
    print("Percentage change:", round(percentage_change, 2), "%")
    print("Intersecting object relationships:", relationship_count)
    print("Rasterized loss pixels (display output):", loss_pixels)
    print("Rasterized gain pixels (display output):", gain_pixels)

    # --------------------------------------------------------
    # Transition matrix is deliberately omitted: it is a
    # pixel-wise classification, not part of the polygon method.
    # Persistent-water assessment is also deliberately omitted.
    # --------------------------------------------------------

    # --------------------------------------------------------
    # Summary CSV report (same output filename, updated methodology)
    # --------------------------------------------------------
    with open(report_path, "w", newline="", encoding="utf-8") as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(["Parameter", "Value"])
        writer.writerow(["Methodology", "Polygon-based geometric change detection"])
        writer.writerow(["Historical Year", historical_year])
        writer.writerow(["Current Year", current_year])
        writer.writerow(["CRS", str(historical_crs)])
        writer.writerow(["Pixel Size X (m)", pixel_width])
        writer.writerow(["Pixel Size Y (m)", pixel_height])
        writer.writerow(["Pixel Area (m2)", pixel_area])
        writer.writerow(["Historical Water Objects", historical_object_count])
        writer.writerow(["Historical Water Pixels (input mask statistic)", historical_water_pixels])
        writer.writerow(["Historical Water Area (m2)", historical_water_area_m2])
        writer.writerow(["Historical Water Area (ha)", historical_water_area_ha])
        writer.writerow(["Current Water Objects", current_object_count])
        writer.writerow(["Current Water Pixels (input mask statistic)", current_water_pixels])
        writer.writerow(["Current Water Area (m2)", current_water_area_m2])
        writer.writerow(["Current Water Area (ha)", current_water_area_ha])
        writer.writerow(["Water Loss Polygon Count", len(loss_gdf)])
        writer.writerow(["Water Loss Area (m2)", loss_area_m2])
        writer.writerow(["Water Loss (ha)", loss_hectares])
        writer.writerow(["Water Gain Polygon Count", len(gain_gdf)])
        writer.writerow(["Water Gain Area (m2)", gain_area_m2])
        writer.writerow(["Water Gain (ha)", gain_hectares])
        writer.writerow(["Net Water Change (ha)", net_change_hectares])
        writer.writerow(["Percentage Change (%)", percentage_change])
        writer.writerow(["Object Intersection Relationships", relationship_count])
        writer.writerow(["Persistent Assessment", "Not performed"])
        writer.writerow(["Transition Matrix", "Not performed; pixel-wise method removed"])
        writer.writerow(["Object-level Report", object_report_path])
        writer.writerow(["Object Relationships GeoJSON", relationships_path])
        writer.writerow(["Water Loss Polygons GeoJSON", loss_polygons_path])
        writer.writerow(["Water Gain Polygons GeoJSON", gain_polygons_path])

    # --------------------------------------------------------
    # Output files
    # --------------------------------------------------------
    print("\n------------------------------------------")
    print("OUTPUT FILES")
    print("------------------------------------------")
    print("Water loss raster:", water_loss_path)
    print("Water gain raster:", water_gain_path)
    print("Analytical change map:", change_map_path)
    print("Display change map:", display_map_path)
    print("Summary CSV report:", report_path)
    print("Historical water objects:", historical_objects_path)
    print("Current water objects:", current_objects_path)
    print("Water loss polygons:", loss_polygons_path)
    print("Water gain polygons:", gain_polygons_path)
    print("Object relationships:", relationships_path)
    print("Object change report:", object_report_path)
    print(
        f"POLYGON-BASED WATER CHANGE COMPLETE: "
        f"{historical_year} -> {current_year}",
        flush=True
    )


# ============================================================
# 6. COMPLETED
# ============================================================

print("\n==========================================")
print("POLYGON-BASED WATER CHANGE ANALYSIS COMPLETED")
print("==========================================")
print("Comparisons configured:")
for historical_year, current_year in YEAR_PAIRS:
    print(f"{historical_year} -> {current_year}")
print("==========================================")
