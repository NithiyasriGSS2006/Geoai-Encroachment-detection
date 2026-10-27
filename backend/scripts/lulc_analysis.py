import rasterio
import numpy as np
import os
import csv
import geopandas as gpd

from rasterio.features import shapes, rasterize
from shapely.geometry import shape, mapping
from shapely.ops import unary_union


# ============================================================
# MODULE 04 - POLYGON-BASED LULC ANALYSIS OF POTENTIAL
# PERSISTENT ENCROACHMENT - VELACHERY
#
# INPUT:
#   persistent_encroachment_2017_2023_to_2024.tif
#   Velachery_LULC_2024.tif
#
# OUTPUT:
#   1. Analytical LULC raster
#   2. Colored RGB visualization
#   3. CSV LULC report
#   4. GeoJSON polygon layer for each LULC class within
#      the potential encroachment area
#
# Method change:
#   The persistent-encroachment mask and LULC classes are
#   converted to polygons. Polygon intersection is used to
#   identify each LULC class inside the potential encroachment
#   area. Raster outputs are recreated from these geometries
#   for compatibility with existing QGIS workflows.
# ============================================================


# ============================================================
# 1. PATHS
# ============================================================

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.dirname(SCRIPT_DIR)

PERSISTENT_PATH = os.environ.get(
    "PERSISTENT_PATH",
    os.path.join(
        BASE_DIR,
        "data",
        "gisoutputs",
        "persistent_check",
        "persistent_encroachment_2017_2023_to_2024.tif"
    )
)

LULC_PATH = os.environ.get(
    "LULC_PATH",
    os.path.join(SCRIPT_DIR, "Velachery_LULC_2024.tif")
)

OUTPUT_DIR = os.environ.get(
    "OUTPUT_DIR",
    os.path.join(BASE_DIR, "data", "gisoutputs", "lulc_analysis")
)

os.makedirs(OUTPUT_DIR, exist_ok=True)


# ============================================================
# 2. OUTPUT FILES
# ============================================================

ANALYTICAL_OUTPUT = os.path.join(
    OUTPUT_DIR,
    "lulc_persistent_encroachment_2017_2024.tif"
)

RGB_OUTPUT = os.path.join(
    OUTPUT_DIR,
    "lulc_persistent_encroachment_2017_2024_RGB.tif"
)

CSV_OUTPUT = os.path.join(
    OUTPUT_DIR,
    os.environ.get(
        "LULC_REPORT_FILENAME",
        "lulc_persistent_encroachment_report_2017_2024.csv"
    )
)

POLYGON_OUTPUT_DIR = os.path.join(
    OUTPUT_DIR,
    "lulc_encroachment_polygons_2017_2024"
)
os.makedirs(POLYGON_OUTPUT_DIR, exist_ok=True)


# ============================================================
# 3. DYNAMIC WORLD CLASS NAMES
# ============================================================

CLASS_NAMES = {
    0: "Water",
    1: "Trees",
    2: "Grass",
    3: "Flooded vegetation",
    4: "Crops",
    5: "Shrub and scrub",
    6: "Built-up",
    7: "Bare ground",
    8: "Snow and ice"
}

LULC_COLORS = {
    0: (0, 0, 255),        # Water - Blue
    1: (0, 128, 0),        # Trees - Green
    2: (144, 238, 144),    # Grass - Light Green
    3: (0, 255, 255),      # Flooded vegetation - Cyan
    4: (255, 255, 0),      # Crops - Yellow
    5: (128, 128, 0),      # Shrub and scrub - Olive
    6: (255, 0, 0),        # Built-up - Red
    7: (165, 42, 42),      # Bare ground - Brown
    8: (211, 211, 211)     # Snow and ice - Light Gray
}


# ============================================================
# 4. POLYGON HELPER FUNCTIONS
# ============================================================

def mask_to_polygons(mask, transform):
    """Convert True cells in a Boolean mask to polygon geometries."""
    polygons = []

    if not np.any(mask):
        return polygons

    for geom, value in shapes(
        mask.astype(np.uint8),
        mask=mask,
        transform=transform,
        connectivity=8
    ):
        if value == 1:
            polygon = shape(geom)
            if not polygon.is_empty and polygon.area > 0:
                polygons.append(polygon)

    return polygons


def dissolve_polygons(polygons):
    """Dissolve a list of polygons into a single geometry."""
    if not polygons:
        return None
    return unary_union(polygons)


def polygon_area(geometry):
    """Return geometry area in the projected CRS units squared."""
    if geometry is None or geometry.is_empty:
        return 0.0
    return float(geometry.area)


def rasterize_geometry(geometry, out_shape, transform):
    """Convert polygon geometry back to a Boolean raster for output."""
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


def save_polygon_layer(geometry, path, crs, class_value, class_name):
    """Save a class-intersection geometry as GeoJSON."""
    if geometry is None or geometry.is_empty:
        gdf = gpd.GeoDataFrame(
            {
                "class_value": [],
                "class_name": [],
                "area_m2": [],
                "geometry": gpd.GeoSeries([], crs=crs)
            },
            geometry="geometry",
            crs=crs
        )
    else:
        gdf = gpd.GeoDataFrame(
            [{
                "class_value": int(class_value),
                "class_name": class_name,
                "area_m2": polygon_area(geometry),
                "geometry": geometry
            }],
            geometry="geometry",
            crs=crs
        )

    gdf.to_file(path, driver="GeoJSON")


# ============================================================
# 5. READ PERSISTENT ENCROACHMENT MASK
# ============================================================

with rasterio.open(PERSISTENT_PATH) as src:
    persistent = src.read(1)
    persistent_profile = src.profile.copy()
    persistent_transform = src.transform
    persistent_crs = src.crs
    persistent_valid = src.read_masks(1) > 0

print("Persistent encroachment raster shape:", persistent.shape)
print("Persistent encroachment unique values:", np.unique(persistent))


# ============================================================
# 6. READ LULC
# ============================================================

with rasterio.open(LULC_PATH) as src:
    lulc = src.read(1)
    lulc_profile = src.profile.copy()
    lulc_transform = src.transform
    lulc_crs = src.crs
    lulc_valid = src.read_masks(1) > 0
    lulc_nodata = src.nodata

print("LULC raster shape:", lulc.shape)
print("LULC unique values:", np.unique(lulc))


# ============================================================
# 7. CHECK ALIGNMENT AND CRS
# ============================================================

if persistent.shape != lulc.shape:
    raise ValueError(
        "Persistent encroachment raster and LULC raster have different dimensions."
    )

if persistent_crs != lulc_crs:
    raise ValueError(
        "Persistent encroachment raster and LULC raster have different CRS."
    )

if persistent_transform != lulc_transform:
    raise ValueError(
        "Persistent encroachment raster and LULC raster have different transforms."
    )

if persistent_crs is None:
    raise ValueError("Raster CRS is missing.")

if persistent_crs.is_geographic:
    raise ValueError(
        "Use a projected CRS with metre units before calculating area. "
        "The input rasters currently use geographic coordinates."
    )

print("Raster alignment: OK")


# ============================================================
# 8. CREATE THE PERSISTENT ENCROACHMENT POLYGON
# ============================================================
# Only cells valid in both input rasters are analysed.
# NoData cells are not treated as non-encroached land.
# ============================================================

jointly_valid = persistent_valid & lulc_valid

if lulc_nodata is not None:
    jointly_valid &= (lulc != lulc_nodata)

persistent_mask = (persistent > 0) & jointly_valid

persistent_polygons = mask_to_polygons(
    persistent_mask,
    persistent_transform
)
persistent_geometry = dissolve_polygons(persistent_polygons)

if persistent_geometry is None or persistent_geometry.is_empty:
    raise ValueError(
        "No valid potential-encroachment polygons were found. "
        "Check the input raster values and NoData settings."
    )

print("Potential-encroachment polygon count:", len(persistent_polygons))
print("Potential-encroachment area (m²):", polygon_area(persistent_geometry))


# ============================================================
# 9. POLYGON-BASED LULC OVERLAY
# ============================================================
# For each LULC class:
#   1. Polygonize the class in the valid LULC raster.
#   2. Dissolve polygons belonging to the same class.
#   3. Intersect that geometry with the potential-encroachment
#      polygon geometry.
#   4. Store the intersection geometry and its area.
# ============================================================

height, width = persistent.shape
class_geometries = {}
class_stats = {}

for class_value, class_name in CLASS_NAMES.items():

    class_mask = (lulc == class_value) & jointly_valid
    class_polygons = mask_to_polygons(class_mask, lulc_transform)
    class_geometry = dissolve_polygons(class_polygons)

    if class_geometry is None or class_geometry.is_empty:
        intersected_geometry = None
    else:
        intersected_geometry = class_geometry.intersection(
            persistent_geometry
        )
        if intersected_geometry.is_empty:
            intersected_geometry = None

    class_geometries[class_value] = intersected_geometry

    area_m2 = polygon_area(intersected_geometry)
    area_ha = area_m2 / 10000.0

    class_output_path = os.path.join(
        POLYGON_OUTPUT_DIR,
        f"encroachment_lulc_{class_value}_{class_name.lower().replace(' ', '_')}.geojson"
    )

    save_polygon_layer(
        intersected_geometry,
        class_output_path,
        persistent_crs,
        class_value,
        class_name
    )

    class_stats[class_value] = {
        "class_name": class_name,
        "area_m2": area_m2,
        "area_ha": area_ha,
        "polygon_path": class_output_path
    }


# ============================================================
# 10. CREATE ANALYTICAL LULC RASTER FROM POLYGONS
# ============================================================
# Outside the potential-encroachment polygons = 255 (NoData).
# Inside, the value is the original LULC class.
# ============================================================

lulc_persistent = np.full((height, width), 255, dtype=np.uint8)

# Rasterize each class intersection. The class geometries are
# mutually exclusive because they originate from categorical LULC classes.
for class_value, geometry in class_geometries.items():
    class_mask_from_polygon = rasterize_geometry(
        geometry,
        (height, width),
        persistent_transform
    )
    lulc_persistent[class_mask_from_polygon] = np.uint8(class_value)

analytical_profile = persistent_profile.copy()
analytical_profile.update(
    driver="GTiff",
    dtype="uint8",
    count=1,
    nodata=255,
    compress="lzw"
)

with rasterio.open(ANALYTICAL_OUTPUT, "w", **analytical_profile) as dst:
    dst.write(lulc_persistent, 1)

print("\nAnalytical raster saved:", ANALYTICAL_OUTPUT)


# ============================================================
# 11. CREATE RGB VISUALIZATION FROM POLYGON INTERSECTIONS
# ============================================================
# Background = white.
# LULC class colors are applied by rasterizing the class polygons.
# ============================================================

rgb = np.ones((3, height, width), dtype=np.uint8) * 255

for class_value, geometry in class_geometries.items():
    color = LULC_COLORS[class_value]
    class_mask_from_polygon = rasterize_geometry(
        geometry,
        (height, width),
        persistent_transform
    )

    rgb[0][class_mask_from_polygon] = color[0]
    rgb[1][class_mask_from_polygon] = color[1]
    rgb[2][class_mask_from_polygon] = color[2]

rgb_profile = persistent_profile.copy()
rgb_profile.update(
    driver="GTiff",
    dtype="uint8",
    count=3,
    nodata=None,
    compress="lzw"
)

with rasterio.open(RGB_OUTPUT, "w", **rgb_profile) as dst:
    dst.write(rgb[0], 1)
    dst.write(rgb[1], 2)
    dst.write(rgb[2], 3)

print("RGB visualization saved:", RGB_OUTPUT)


# ============================================================
# 12. CSV REPORT - POLYGON AREAS
# ============================================================

total_persistent_area_m2 = polygon_area(persistent_geometry)
total_persistent_area_ha = total_persistent_area_m2 / 10000.0

with open(CSV_OUTPUT, "w", newline="", encoding="utf-8") as csvfile:
    writer = csv.writer(csvfile)

    writer.writerow([
        "LULC Value",
        "LULC Class",
        "Rasterized Cell Count",
        "Polygon Area (m2)",
        "Polygon Area (ha)",
        "Percentage of Potential Encroachment Area"
    ])

    for class_value, class_name in CLASS_NAMES.items():
        geometry = class_geometries[class_value]
        class_area_m2 = polygon_area(geometry)
        class_area_ha = class_area_m2 / 10000.0

        # Retained only as a compatibility statistic; area and
        # percentage calculations are based on polygon geometry.
        class_raster = rasterize_geometry(
            geometry,
            (height, width),
            persistent_transform
        )
        rasterized_cell_count = int(np.count_nonzero(class_raster))

        if total_persistent_area_m2 > 0:
            percentage = (
                class_area_m2 / total_persistent_area_m2
            ) * 100.0
        else:
            percentage = 0.0

        writer.writerow([
            class_value,
            class_name,
            rasterized_cell_count,
            class_area_m2,
            class_area_ha,
            percentage
        ])

print("\nCSV report saved:", CSV_OUTPUT)


# ============================================================
# 13. PRINT TOTAL POLYGON AREA AND OUTPUTS
# ============================================================

print("\n============================================")
print("POLYGON-BASED LULC ANALYSIS RESULTS")
print("============================================")

print(
    "Total potential-encroachment area:",
    round(total_persistent_area_m2, 2), "m²"
)
print(
    "Total potential-encroachment area:",
    round(total_persistent_area_ha, 4), "ha"
)

for class_value, stats in class_stats.items():
    print(
        f"{stats['class_name']}: "
        f"{stats['area_m2']:.2f} m² "
        f"({stats['area_ha']:.4f} ha)"
    )

print("\nOutput files:")
print("Analytical LULC raster:", ANALYTICAL_OUTPUT)
print("RGB visualization:", RGB_OUTPUT)
print("CSV report:", CSV_OUTPUT)
print("LULC intersection GeoJSON folder:", POLYGON_OUTPUT_DIR)

print("\n============================================")
print("MODULE 04 POLYGON-BASED ANALYSIS COMPLETED")
print("============================================")