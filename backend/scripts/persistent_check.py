import rasterio
import numpy as np
import os
import csv
import geopandas as gpd

from rasterio.features import shapes, rasterize
from shapely.geometry import shape, mapping
from shapely.ops import unary_union


# ============================================================
# PERSISTENT ENCROACHMENT CHECK - POLYGON-BASED
# ============================================================
# Input water-loss raster:
#   0   = No water loss / No potential encroachment
#   255 = Water loss / Potential encroachment
#
# Polygon-based logic:
#   Condition 1 = intersection(earlier loss polygons, later loss polygons)
#   Condition 2 = later loss polygons - earlier loss polygons
#   Condition 3 = earlier loss polygons - later loss polygons
#   Condition 4 = valid AOI - union(earlier loss, later loss)
#
# Retained potential encroachment = Condition 1 union Condition 2.
# This preserves the original program's rule: all loss present in the
# later comparison is retained. The geometry operation is now polygon-based.
#
# Raster output is retained for compatibility with existing QGIS workflows.
# It is created by rasterizing the resulting polygon geometry.
# ============================================================


# ============================================================
# 1. FOLDERS
# ============================================================

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.dirname(SCRIPT_DIR)

WATER_CHANGE_FOLDER = os.environ.get(
    "WATER_CHANGE_FOLDER",
    os.path.join(BASE_DIR, "data", "gisoutputs", "water_change")
)

OUTPUT_FOLDER = os.environ.get(
    "OUTPUT_FOLDER",
    os.path.join(BASE_DIR, "data", "gisoutputs", "persistent_check")
)

os.makedirs(OUTPUT_FOLDER, exist_ok=True)


# ============================================================
# 2. COMPARISONS
# ============================================================

COMPARISONS = [
    (2017, 2020, 2017, 2023),
    (2017, 2023, 2017, 2024)
]


# ============================================================
# 3. READ WATER-LOSS RASTER
# ============================================================

def read_water_loss(path):
    with rasterio.open(path) as src:
        raster = src.read(1)
        profile = src.profile.copy()
        width = src.width
        height = src.height
        crs = src.crs
        transform = src.transform
        nodata = src.nodata
        valid_mask = src.read_masks(1) > 0

    return raster, profile, width, height, crs, transform, valid_mask, nodata


# ============================================================
# 4. CONVERT A BINARY MASK INTO POLYGONS
# ============================================================

def mask_to_geometries(mask, transform):
    """Return valid polygon geometries for True regions in a Boolean mask."""
    geometries = []

    if not np.any(mask):
        return []

    for geom, value in shapes(
        mask.astype(np.uint8),
        mask=mask,
        transform=transform,
        connectivity=8
    ):
        if value == 1:
            polygon = shape(geom)
            if not polygon.is_empty and polygon.area > 0:
                geometries.append(polygon)

    return geometries


def mask_to_union(mask, transform):
    """Polygonize a mask and dissolve its polygons into one geometry."""
    geometries = mask_to_geometries(mask, transform)
    if not geometries:
        return None
    return unary_union(geometries)


def safe_union(geometry_a, geometry_b):
    """Union two geometries while handling empty inputs."""
    if geometry_a is None or geometry_a.is_empty:
        return geometry_b
    if geometry_b is None or geometry_b.is_empty:
        return geometry_a
    return unary_union([geometry_a, geometry_b])


def geometry_area(geometry):
    """Planar area in the raster CRS units squared."""
    if geometry is None or geometry.is_empty:
        return 0.0
    return float(geometry.area)


def geometry_to_gdf(geometry, crs, properties=None):
    """Create a GeoDataFrame for a single non-empty geometry."""
    if geometry is None or geometry.is_empty:
        return gpd.GeoDataFrame(
            {"geometry": gpd.GeoSeries([], crs=crs)},
            geometry="geometry",
            crs=crs
        )

    row = dict(properties or {})
    row["geometry"] = geometry
    return gpd.GeoDataFrame([row], geometry="geometry", crs=crs)


def save_geometry_geojson(geometry, path, crs, properties=None):
    """Save a polygon geometry as GeoJSON; create an empty file if no geometry."""
    gdf = geometry_to_gdf(geometry, crs, properties)
    gdf.to_file(path, driver="GeoJSON")


def rasterize_geometry(geometry, out_shape, transform):
    """Rasterize a polygon geometry into a Boolean mask."""
    if geometry is None or geometry.is_empty:
        return np.zeros(out_shape, dtype=bool)

    result = rasterize(
        [(mapping(geometry), 1)],
        out_shape=out_shape,
        transform=transform,
        fill=0,
        all_touched=False,
        dtype="uint8"
    )
    return result == 1


def count_rasterized_cells(geometry, out_shape, transform):
    """Compatibility statistic: count cells covered by polygon when rasterized."""
    return int(np.count_nonzero(rasterize_geometry(geometry, out_shape, transform)))


# ============================================================
# 5. PROCESS EACH COMPARISON
# ============================================================

for earlier_start, earlier_end, later_start, later_end in COMPARISONS:

    print("\n")
    print("==========================================")
    print(f"PERSISTENT CHECK: {earlier_start} -> {earlier_end}")
    print(f"AGAINST: {later_start} -> {later_end}")
    print("==========================================")

    # --------------------------------------------------------
    # 6. INPUT FILE PATHS
    # --------------------------------------------------------

    earlier_path = os.path.join(
        WATER_CHANGE_FOLDER,
        f"water_loss_{earlier_start}_{earlier_end}.tif"
    )
    later_path = os.path.join(
        WATER_CHANGE_FOLDER,
        f"water_loss_{later_start}_{later_end}.tif"
    )

    # --------------------------------------------------------
    # 7. OUTPUT FILE PATHS
    # --------------------------------------------------------

    output_stem = (
        f"{earlier_start}_{earlier_end}_to_{later_end}"
    )

    persistent_path = os.path.join(
        OUTPUT_FOLDER,
        f"persistent_encroachment_{output_stem}.tif"
    )
    report_path = os.path.join(
        OUTPUT_FOLDER,
        f"persistent_report_{output_stem}.csv"
    )

    condition1_path = os.path.join(
        OUTPUT_FOLDER,
        f"condition1_overlap_{output_stem}.geojson"
    )
    condition2_path = os.path.join(
        OUTPUT_FOLDER,
        f"condition2_new_loss_{output_stem}.geojson"
    )
    condition3_path = os.path.join(
        OUTPUT_FOLDER,
        f"condition3_removed_loss_{output_stem}.geojson"
    )
    persistent_polygon_path = os.path.join(
        OUTPUT_FOLDER,
        f"persistent_encroachment_{output_stem}.geojson"
    )

    # --------------------------------------------------------
    # 8. CHECK INPUT FILES
    # --------------------------------------------------------

    if not os.path.exists(earlier_path):
        print("\nEarlier water-loss raster not found:")
        print(earlier_path)
        continue

    if not os.path.exists(later_path):
        print("\nLater water-loss raster not found:")
        print(later_path)
        continue

    # --------------------------------------------------------
    # 9. READ INPUT RASTERS
    # --------------------------------------------------------

    (
        earlier_raw, earlier_profile, earlier_width, earlier_height,
        earlier_crs, earlier_transform, earlier_valid, earlier_nodata
    ) = read_water_loss(earlier_path)

    (
        later_raw, later_profile, later_width, later_height,
        later_crs, later_transform, later_valid, later_nodata
    ) = read_water_loss(later_path)

    print("\nEarlier raster:")
    print("Size:", earlier_width, "×", earlier_height)
    print("CRS:", earlier_crs)
    print("Transform:", earlier_transform)

    print("\nLater raster:")
    print("Size:", later_width, "×", later_height)
    print("CRS:", later_crs)
    print("Transform:", later_transform)

    # --------------------------------------------------------
    # 10. CHECK ALIGNMENT AND CRS
    # --------------------------------------------------------

    if earlier_width != later_width or earlier_height != later_height:
        print("\nERROR: Raster dimensions do not match.")
        continue

    if earlier_crs != later_crs:
        print("\nERROR: CRS does not match.")
        continue

    if earlier_transform != later_transform:
        print("\nERROR: Raster transforms do not match.")
        continue

    if earlier_crs is None:
        print("\nERROR: Raster CRS is missing; polygon area cannot be interpreted.")
        continue

    if earlier_crs.is_geographic:
        print(
            "\nERROR: Raster CRS uses geographic degrees. "
            "Reproject both rasters to a projected CRS in metres before running."
        )
        continue

    print("\nRaster alignment: OK")
    print("Earlier raster values:", np.unique(earlier_raw))
    print("Later raster values:", np.unique(later_raw))

    # --------------------------------------------------------
    # 11. CREATE VALID AREA AND LOSS POLYGONS
    # --------------------------------------------------------
    # Valid area is limited to cells that are valid in both rasters.
    # NoData is not treated as absence of encroachment.
    # --------------------------------------------------------

    jointly_valid = earlier_valid & later_valid

    if not np.any(jointly_valid):
        print("\nERROR: No overlapping valid raster area.")
        continue

    earlier_encroachment = (earlier_raw > 0) & jointly_valid
    later_encroachment = (later_raw > 0) & jointly_valid

    earlier_union = mask_to_union(earlier_encroachment, earlier_transform)
    later_union = mask_to_union(later_encroachment, later_transform)

    # Polygon representing the valid analysis footprint.
    valid_union = mask_to_union(jointly_valid, earlier_transform)

    # --------------------------------------------------------
    # 12. POLYGON-BASED CONDITIONS
    # --------------------------------------------------------
    # Condition 1: earlier and later potential-loss polygons overlap.
    # Condition 2: potential-loss polygons newly present in later period.
    # Condition 3: earlier potential-loss polygons absent from later period.
    # Condition 4: valid analysis footprint outside both loss geometries.
    # --------------------------------------------------------

    if earlier_union is not None and later_union is not None:
        condition_1_geometry = earlier_union.intersection(later_union)
    else:
        condition_1_geometry = None

    if later_union is not None:
        condition_2_geometry = (
            later_union.difference(earlier_union)
            if earlier_union is not None
            else later_union
        )
    else:
        condition_2_geometry = None

    if earlier_union is not None:
        condition_3_geometry = (
            earlier_union.difference(later_union)
            if later_union is not None
            else earlier_union
        )
    else:
        condition_3_geometry = None

    all_loss_geometry = safe_union(earlier_union, later_union)

    if valid_union is not None:
        condition_4_geometry = (
            valid_union.difference(all_loss_geometry)
            if all_loss_geometry is not None
            else valid_union
        )
    else:
        condition_4_geometry = None

    # Preserve the original rule: Condition 1 + Condition 2 = all later loss.
    persistent_geometry = safe_union(
        condition_1_geometry,
        condition_2_geometry
    )

    # --------------------------------------------------------
    # 13. SAVE POLYGON OUTPUTS
    # --------------------------------------------------------

    save_geometry_geojson(
        condition_1_geometry,
        condition1_path,
        earlier_crs,
        {
            "condition": "Condition 1",
            "description": "Overlap of earlier and later potential-loss polygons",
            "area_crs_units2": geometry_area(condition_1_geometry)
        }
    )

    save_geometry_geojson(
        condition_2_geometry,
        condition2_path,
        earlier_crs,
        {
            "condition": "Condition 2",
            "description": "Potential-loss polygons appearing in later comparison",
            "area_crs_units2": geometry_area(condition_2_geometry)
        }
    )

    save_geometry_geojson(
        condition_3_geometry,
        condition3_path,
        earlier_crs,
        {
            "condition": "Condition 3",
            "description": "Earlier potential-loss polygons absent from later comparison",
            "area_crs_units2": geometry_area(condition_3_geometry)
        }
    )

    save_geometry_geojson(
        persistent_geometry,
        persistent_polygon_path,
        earlier_crs,
        {
            "result": "Retained potential encroachment",
            "area_crs_units2": geometry_area(persistent_geometry)
        }
    )

    # --------------------------------------------------------
    # 14. RASTERIZE POLYGON RESULT FOR COMPATIBILITY
    # --------------------------------------------------------
    # The analysis conditions above are calculated using polygon geometry.
    # This GeoTIFF is generated from the final polygon, not Boolean mask logic.
    # --------------------------------------------------------

    persistent_mask = rasterize_geometry(
        persistent_geometry,
        (later_height, later_width),
        later_transform
    )

    persistent_output = persistent_mask.astype(np.uint8) * 255

    output_profile = later_profile.copy()
    output_profile.update(
        driver="GTiff",
        dtype="uint8",
        count=1,
        nodata=0,
        compress="lzw"
    )

    with rasterio.open(persistent_path, "w", **output_profile) as dst:
        dst.write(persistent_output, 1)

    # --------------------------------------------------------
    # 15. AREA STATISTICS FROM POLYGON GEOMETRIES
    # --------------------------------------------------------
    # This assumes the projected CRS units are metres.
    # --------------------------------------------------------

    condition_1_area_m2 = geometry_area(condition_1_geometry)
    condition_2_area_m2 = geometry_area(condition_2_geometry)
    condition_3_area_m2 = geometry_area(condition_3_geometry)
    condition_4_area_m2 = geometry_area(condition_4_geometry)
    persistent_area_m2 = geometry_area(persistent_geometry)

    persistent_area_ha = persistent_area_m2 / 10000.0

    # Counts are retained only as rasterized-cell compatibility statistics.
    condition_1_cells = count_rasterized_cells(
        condition_1_geometry, (later_height, later_width), later_transform
    )
    condition_2_cells = count_rasterized_cells(
        condition_2_geometry, (later_height, later_width), later_transform
    )
    condition_3_cells = count_rasterized_cells(
        condition_3_geometry, (later_height, later_width), later_transform
    )
    condition_4_cells = count_rasterized_cells(
        condition_4_geometry, (later_height, later_width), later_transform
    )
    persistent_cells = int(np.count_nonzero(persistent_mask))

    pixel_width = abs(later_transform.a)
    pixel_height = abs(later_transform.e)
    pixel_area = pixel_width * pixel_height

    # --------------------------------------------------------
    # 16. PRINT RESULTS
    # --------------------------------------------------------

    print("\n------------------------------------------")
    print("POLYGON-BASED PERSISTENT ENCROACHMENT RESULTS")
    print("------------------------------------------")

    print(
        "Condition 1 - overlapping loss area:",
        round(condition_1_area_m2, 2), "m²"
    )
    print(
        "Condition 2 - new later loss area:",
        round(condition_2_area_m2, 2), "m²"
    )
    print(
        "Condition 3 - earlier loss no longer present:",
        round(condition_3_area_m2, 2), "m²"
    )
    print(
        "Condition 4 - no loss in either comparison:",
        round(condition_4_area_m2, 2), "m²"
    )
    print(
        "Retained potential encroachment area:",
        round(persistent_area_m2, 2), "m²"
    )
    print(
        "Retained potential encroachment area:",
        round(persistent_area_ha, 4), "hectares"
    )
    print("Retained rasterized cells (compatibility statistic):", persistent_cells)

    # --------------------------------------------------------
    # 17. SAVE CSV REPORT
    # --------------------------------------------------------

    with open(report_path, "w", newline="", encoding="utf-8") as csvfile:
        writer = csv.writer(csvfile)

        writer.writerow(["Parameter", "Value"])
        writer.writerow([
            "Earlier Comparison", f"{earlier_start}-{earlier_end}"
        ])
        writer.writerow([
            "Later Comparison", f"{later_start}-{later_end}"
        ])
        writer.writerow(["Method", "Polygon intersection and difference"])
        writer.writerow(["CRS", str(later_crs)])
        writer.writerow(["Pixel Width (m)", pixel_width])
        writer.writerow(["Pixel Height (m)", pixel_height])
        writer.writerow(["Pixel Area (m2)", pixel_area])

        writer.writerow(["Condition 1 Area (m2)", condition_1_area_m2])
        writer.writerow(["Condition 1 Area (ha)", condition_1_area_m2 / 10000.0])
        writer.writerow(["Condition 1 Rasterized Cells", condition_1_cells])

        writer.writerow(["Condition 2 Area (m2)", condition_2_area_m2])
        writer.writerow(["Condition 2 Area (ha)", condition_2_area_m2 / 10000.0])
        writer.writerow(["Condition 2 Rasterized Cells", condition_2_cells])

        writer.writerow(["Condition 3 Area (m2)", condition_3_area_m2])
        writer.writerow(["Condition 3 Area (ha)", condition_3_area_m2 / 10000.0])
        writer.writerow(["Condition 3 Rasterized Cells", condition_3_cells])

        writer.writerow(["Condition 4 Area (m2)", condition_4_area_m2])
        writer.writerow(["Condition 4 Area (ha)", condition_4_area_m2 / 10000.0])
        writer.writerow(["Condition 4 Rasterized Cells", condition_4_cells])

        writer.writerow(["Persistent Encroachment Area (m2)", persistent_area_m2])
        writer.writerow(["Persistent Encroachment Area (ha)", persistent_area_ha])
        writer.writerow(["Persistent Encroachment Rasterized Cells", persistent_cells])

    # --------------------------------------------------------
    # 18. OUTPUT FILES
    # --------------------------------------------------------

    print("\n------------------------------------------")
    print("OUTPUT FILES")
    print("------------------------------------------")
    print("Persistent raster:", persistent_path)
    print("CSV report:", report_path)
    print("Condition 1 overlap polygons:", condition1_path)
    print("Condition 2 later/new loss polygons:", condition2_path)
    print("Condition 3 earlier-only loss polygons:", condition3_path)
    print("Retained potential encroachment polygons:", persistent_polygon_path)


print("\n")
print("==========================================")
print("POLYGON-BASED PERSISTENT ENCROACHMENT CHECK COMPLETED")
print("==========================================")


