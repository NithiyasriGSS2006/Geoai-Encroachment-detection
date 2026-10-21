import rasterio
import numpy as np
import os
import csv

# NEW IMPORTS FOR POLYGON AREA
from rasterio.features import shapes
import geopandas as gpd
from shapely.geometry import shape


# ============================================================
# MODULE 04 - LULC CLASSIFICATION OF PERSISTENT ENCROACHMENT
# VELACHERY
#
# INPUT:
#   persistent_encroachment_2017_2023_to_2024.tif
#   Velachery_LULC_2024.tif
#
# OUTPUT:
#   1. Analytical LULC raster
#   2. Colored RGB visualization
#   3. CSV LULC report
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
# OUTPUT FILES
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


# ============================================================
# DYNAMIC WORLD CLASS NAMES
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


# ============================================================
# READ PERSISTENT ENCROACHMENT MASK
# ============================================================

with rasterio.open(PERSISTENT_PATH) as src:

    persistent = src.read(1)

    persistent_profile = src.profile.copy()

    persistent_transform = src.transform

    persistent_crs = src.crs


print(
    "Persistent encroachment raster shape:",
    persistent.shape
)

print(
    "Persistent encroachment unique values:",
    np.unique(persistent)
)


# ============================================================
# READ LULC
# ============================================================

with rasterio.open(LULC_PATH) as src:

    lulc = src.read(1)

    lulc_profile = src.profile.copy()

    lulc_transform = src.transform

    lulc_crs = src.crs


print(
    "LULC raster shape:",
    lulc.shape
)

print(
    "LULC unique values:",
    np.unique(lulc)
)


# ============================================================
# CHECK SIZE
# ============================================================

if persistent.shape != lulc.shape:

    raise ValueError(
        "Persistent encroachment raster and LULC raster "
        "have different dimensions."
    )


# ============================================================
# CHECK CRS
# ============================================================

if persistent_crs != lulc_crs:

    raise ValueError(
        "Persistent encroachment raster and LULC raster "
        "have different CRS."
    )


# ============================================================
# CHECK TRANSFORM
# ============================================================

if persistent_transform != lulc_transform:

    raise ValueError(
        "Persistent encroachment raster and LULC raster "
        "have different transforms."
    )


# ============================================================
# CREATE PERSISTENT ENCROACHMENT MASK
#
# Persistent raster:
#   0   = No persistent encroachment
#   > 0 = Persistent encroachment
# ============================================================

persistent_mask = persistent > 0


print(
    "Persistent encroachment pixels:",
    np.sum(persistent_mask)
)


# ============================================================
# CREATE ANALYTICAL LULC RASTER
#
# Inside persistent encroachment:
#     Keep original Dynamic World LULC class
#
# Outside persistent encroachment:
#     255 = NoData
# ============================================================

lulc_persistent = np.where(
    persistent_mask,
    lulc,
    255
).astype(np.uint8)


# ============================================================
# SAVE ANALYTICAL LULC RASTER
# ============================================================

analytical_profile = persistent_profile.copy()

analytical_profile.update(
    dtype=rasterio.uint8,
    count=1,
    nodata=255,
    compress="lzw"
)


with rasterio.open(
    ANALYTICAL_OUTPUT,
    "w",
    **analytical_profile
) as dst:

    dst.write(
        lulc_persistent,
        1
    )


print(
    "\nAnalytical raster saved:"
)

print(
    ANALYTICAL_OUTPUT
)


# ============================================================
# CREATE RGB VISUALIZATION
#
# Each LULC class inside the persistent
# encroachment region gets a different color.
#
# Outside persistent encroachment = WHITE
# ============================================================

height, width = persistent.shape


# Start with WHITE background
rgb = np.ones(
    (3, height, width),
    dtype=np.uint8
) * 255


# ============================================================
# LULC COLORS
# ============================================================

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
# APPLY LULC COLORS
# ONLY INSIDE PERSISTENT ENCROACHMENT
# ============================================================

for class_value, color in LULC_COLORS.items():

    mask = (
        persistent_mask &
        (lulc == class_value)
    )

    rgb[0][mask] = color[0]

    rgb[1][mask] = color[1]

    rgb[2][mask] = color[2]


# ============================================================
# SAVE RGB OUTPUT
# ============================================================

rgb_profile = persistent_profile.copy()

rgb_profile.update(
    dtype=rasterio.uint8,
    count=3,
    nodata=None,
    compress="lzw"
)


with rasterio.open(
    RGB_OUTPUT,
    "w",
    **rgb_profile
) as dst:

    dst.write(rgb[0], 1)

    dst.write(rgb[1], 2)

    dst.write(rgb[2], 3)


print(
    "\nRGB visualization saved:"
)

print(
    RGB_OUTPUT
)


# ============================================================
# POLYGON AREA FUNCTION
#
# Converts the selected raster pixels into polygons
# and calculates their geometric area.
#
# Output area is in square meters because
# the CRS is EPSG:32644 (UTM, meter units).
# ============================================================

def calculate_polygon_area(
    mask,
    transform,
    crs
):

    polygons = []

    for geom, value in shapes(
        mask.astype(np.uint8),
        mask=mask,
        transform=transform
    ):

        polygons.append(
            shape(geom)
        )


    # No polygons
    if len(polygons) == 0:

        return 0.0


    # Create GeoDataFrame
    gdf = gpd.GeoDataFrame(
        geometry=polygons,
        crs=crs
    )


    # Calculate area of each polygon
    gdf["area_m2"] = (
        gdf.geometry.area
    )


    # Total polygon area
    total_area_m2 = (
        gdf["area_m2"].sum()
    )


    return total_area_m2


# ============================================================
# LULC STATISTICS
# INSIDE PERSISTENT ENCROACHMENT
#
# AREA IS CALCULATED USING POLYGONS
# ============================================================

total_persistent_pixels = np.sum(
    persistent_mask
)


# Polygon-based total persistent area
total_persistent_area_m2 = calculate_polygon_area(
    persistent_mask,
    persistent_transform,
    persistent_crs
)


# ============================================================
# CSV REPORT
# ============================================================

with open(
    CSV_OUTPUT,
    "w",
    newline="",
    encoding="utf-8"
) as csvfile:

    writer = csv.writer(csvfile)

    writer.writerow([
        "LULC Value",
        "LULC Class",
        "Pixel Count",
        "Area (m2)",
        "Area (ha)",
        "Percentage of Persistent Encroachment"
    ])


    for class_value, class_name in CLASS_NAMES.items():

        class_mask = (
            persistent_mask &
            (lulc == class_value)
        )


        pixel_count = np.sum(
            class_mask
        )


        # ====================================================
        # POLYGON-BASED AREA
        # ====================================================

        area_m2 = calculate_polygon_area(
            class_mask,
            persistent_transform,
            persistent_crs
        )


        area_ha = (
            area_m2 / 10000
        )


        if total_persistent_pixels > 0:

            percentage = (
                pixel_count /
                total_persistent_pixels
            ) * 100

        else:

            percentage = 0


        writer.writerow([
            class_value,
            class_name,
            pixel_count,
            area_m2,
            area_ha,
            percentage
        ])


print(
    "\nCSV report saved:"
)

print(
    CSV_OUTPUT
)


# ============================================================
# PRINT TOTAL POLYGON AREA
# ============================================================

print(
    "\nTotal persistent encroachment area (polygon):",
    total_persistent_area_m2,
    "m²"
)

print(
    "Total persistent encroachment area:",
    total_persistent_area_m2 / 10000,
    "ha"
)


# ============================================================
# COMPLETION
# ============================================================

print(
    "\n============================================"
)

print(
    "MODULE 04 COMPLETED"
)

print(
    "============================================"
)