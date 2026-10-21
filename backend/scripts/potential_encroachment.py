# ============================================================
# MODULE 05 - POTENTIAL ENCROACHMENT DETECTION
# VELACHERY
#
# INPUT:
#   Persistent encroachment raster
#   2024 Dynamic World LULC
#
# LOGIC:
#
# Persistent encroachment
# AND
# 2024 LULC = Built-up
#
#             ↓
#
# Potential Encroachment
#
# OUTPUT:
#   1. Potential encroachment GeoTIFF
#   2. Display GeoTIFF
#
# Area is calculated using polygons.
# ============================================================


import os
import csv
import rasterio
import numpy as np

# NEW IMPORTS FOR POLYGON AREA
from rasterio.features import shapes
import geopandas as gpd
from shapely.geometry import shape


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.dirname(SCRIPT_DIR)

PERSISTENT_2017_2020_2023_PATH = os.environ.get(
    "PERSISTENT_2017_2020_2023_PATH",
    os.path.join(
        BASE_DIR,
        "data",
        "gisoutputs",
        "persistent_check",
        "persistent_encroachment_2017_2020_to_2023.tif"
    )
)

PERSISTENT_2017_2023_2024_PATH = os.environ.get(
    "PERSISTENT_2017_2023_2024_PATH",
    os.path.join(
        BASE_DIR,
        "data",
        "gisoutputs",
        "persistent_check",
        "persistent_encroachment_2017_2023_to_2024.tif"
    )
)

LULC_2024_PATH = os.environ.get(
    "LULC_2024_PATH",
    os.path.join(SCRIPT_DIR, "Velachery_LULC_2024.tif")
)

OUTPUT_FOLDER = os.environ.get(
    "OUTPUT_FOLDER",
    os.path.join(BASE_DIR, "data", "gisoutputs", "potential_encroachment")
)


os.makedirs(
    OUTPUT_FOLDER,
    exist_ok=True
)


# ============================================================
# 3. OUTPUT FILES
# ============================================================

OUTPUT_2017_2023 = os.path.join(
    OUTPUT_FOLDER,
    "potential_encroachment_2017_2023.tif"
)


OUTPUT_2017_2024 = os.path.join(
    OUTPUT_FOLDER,
    "potential_encroachment_2017_2024.tif"
)


DISPLAY_2017_2023 = os.path.join(
    OUTPUT_FOLDER,
    "potential_encroachment_display_2017_2023.tif"
)


DISPLAY_2017_2024 = os.path.join(
    OUTPUT_FOLDER,
    "potential_encroachment_display_2017_2024.tif"
)


# ============================================================
# 4. BUILT-UP CLASS
# ============================================================
#
# Dynamic World:
#
# 6 = Built
#
# ============================================================

BUILT_UP_CLASS = 6


# ============================================================
# 5. CHECK INPUT FILES
# ============================================================

input_files = [

    PERSISTENT_2017_2020_2023_PATH,

    PERSISTENT_2017_2023_2024_PATH,

    LULC_2024_PATH

]


for path in input_files:

    if not os.path.exists(path):

        raise FileNotFoundError(
            f"\nInput file not found:\n{path}"
        )


# ============================================================
# 6. READ PERSISTENT 2017->2023
# ============================================================

print("\n")
print("=" * 60)
print("READING PERSISTENT ENCROACHMENT 2017->2023")
print("=" * 60)


with rasterio.open(
    PERSISTENT_2017_2020_2023_PATH
) as src:

    persistent_2017_2023 = src.read(1)

    width_1 = src.width
    height_1 = src.height

    crs_1 = src.crs
    transform_1 = src.transform

    profile_1 = src.profile.copy()


print(
    "Unique values:",
    np.unique(persistent_2017_2023)
)


# ============================================================
# 7. READ PERSISTENT 2017->2024
# ============================================================

print("\n")
print("=" * 60)
print("READING PERSISTENT ENCROACHMENT 2017->2024")
print("=" * 60)


with rasterio.open(
    PERSISTENT_2017_2023_2024_PATH
) as src:

    persistent_2017_2024 = src.read(1)

    width_2 = src.width
    height_2 = src.height

    crs_2 = src.crs
    transform_2 = src.transform


print(
    "Unique values:",
    np.unique(persistent_2017_2024)
)


# ============================================================
# 8. READ 2024 LULC
# ============================================================

print("\n")
print("=" * 60)
print("READING 2024 LULC")
print("=" * 60)


with rasterio.open(
    LULC_2024_PATH
) as src:

    lulc_2024 = src.read(1)

    lulc_width = src.width
    lulc_height = src.height

    lulc_crs = src.crs
    lulc_transform = src.transform


print(
    "Unique values:",
    np.unique(lulc_2024)
)


# ============================================================
# 9. CHECK ALIGNMENT
# ============================================================

print("\n")
print("=" * 60)
print("CHECKING RASTER ALIGNMENT")
print("=" * 60)


if width_1 != width_2:

    raise ValueError(
        "Persistent rasters have different widths."
    )


if height_1 != height_2:

    raise ValueError(
        "Persistent rasters have different heights."
    )


if width_1 != lulc_width:

    raise ValueError(
        "Persistent raster and LULC have different widths."
    )


if height_1 != lulc_height:

    raise ValueError(
        "Persistent raster and LULC have different heights."
    )


if crs_1 != crs_2:

    raise ValueError(
        "Persistent rasters have different CRS."
    )


if crs_1 != lulc_crs:

    raise ValueError(
        "Persistent raster and LULC have different CRS."
    )


if transform_1 != transform_2:

    raise ValueError(
        "Persistent rasters have different transforms."
    )


if transform_1 != lulc_transform:

    raise ValueError(
        "Persistent raster and LULC have different transforms."
    )


print("[OK] Width matches")
print("[OK] Height matches")
print("[OK] CRS matches")
print("[OK] Transform matches")

print("\n[OK] All rasters are aligned.")


# ============================================================
# 10. CONVERT PERSISTENT RASTERS TO BOOLEAN
# ============================================================
#
# 0   = Not persistent encroachment
# 255 = Persistent encroachment
#
# ============================================================

persistent_2023 = (
    persistent_2017_2023 > 0
)


persistent_2024 = (
    persistent_2017_2024 > 0
)


# ============================================================
# 11. IDENTIFY BUILT-UP AREA
# ============================================================

built_up_2024 = (
    lulc_2024 == BUILT_UP_CLASS
)


# ============================================================
# 12. POTENTIAL ENCROACHMENT
# ============================================================
#
# Persistent encroachment
# AND
# 2024 built-up
#
# ============================================================

potential_2017_2023 = (

    persistent_2023
    &
    built_up_2024

)


potential_2017_2024 = (

    persistent_2024
    &
    built_up_2024

)


# ============================================================
# 13. CONVERT TO OUTPUT RASTER
# ============================================================
#
# 0   = Not potential encroachment
# 255 = Potential encroachment
#
# ============================================================

output_1 = (
    potential_2017_2023
    .astype(np.uint8)
    * 255
)


output_2 = (
    potential_2017_2024
    .astype(np.uint8)
    * 255
)


# ============================================================
# 14. OUTPUT PROFILE
# ============================================================

output_profile = profile_1.copy()


output_profile.update(

    driver="GTiff",

    dtype="uint8",

    count=1,

    nodata=0,

    compress="lzw"

)


# ============================================================
# 15. SAVE 2017->2023 POTENTIAL ENCROACHMENT
# ============================================================

with rasterio.open(

    OUTPUT_2017_2023,

    "w",

    **output_profile

) as dst:

    dst.write(

        output_1,

        1

    )


print("\n")
print(
    "Potential encroachment 2017->2023 saved:"
)

print(
    OUTPUT_2017_2023
)


# ============================================================
# 16. SAVE 2017->2024 POTENTIAL ENCROACHMENT
# ============================================================

with rasterio.open(

    OUTPUT_2017_2024,

    "w",

    **output_profile

) as dst:

    dst.write(

        output_2,

        1

    )


print("\n")
print(
    "Potential encroachment 2017->2024 saved:"
)

print(
    OUTPUT_2017_2024
)


# ============================================================
# 17. SAVE DISPLAY 2017->2023
# ============================================================

with rasterio.open(

    DISPLAY_2017_2023,

    "w",

    **output_profile

) as dst:

    dst.write(

        output_1,

        1

    )


print(
    "\nDisplay raster 2017->2023 saved:"
)

print(
    DISPLAY_2017_2023
)


# ============================================================
# 18. SAVE DISPLAY 2017->2024
# ============================================================

with rasterio.open(

    DISPLAY_2017_2024,

    "w",

    **output_profile

) as dst:

    dst.write(

        output_2,

        1

    )


print(
    "\nDisplay raster 2017->2024 saved:"
)

print(
    DISPLAY_2017_2024
)


# ============================================================
# 19. POLYGON AREA FUNCTION
# ============================================================
#
# Converts potential encroachment pixels into polygons
# and calculates their geometric area.
#
# EPSG:32644 uses meters, so area is in m².
#
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


    if len(polygons) == 0:

        return 0.0


    gdf = gpd.GeoDataFrame(
        geometry=polygons,
        crs=crs
    )


    gdf["area_m2"] = (
        gdf.geometry.area
    )


    total_area_m2 = (
        gdf["area_m2"].sum()
    )


    return total_area_m2


# ============================================================
# 20. CALCULATE POTENTIAL ENCROACHMENT AREA
# ============================================================
#
# Polygon-based area calculation.
#
# ============================================================

area_2017_2023_m2 = calculate_polygon_area(
    potential_2017_2023,
    transform_1,
    crs_1
)


area_2017_2024_m2 = calculate_polygon_area(
    potential_2017_2024,
    transform_1,
    crs_1
)


# Convert m² -> hectares

area_2017_2023_ha = (
    area_2017_2023_m2 / 10000
)


area_2017_2024_ha = (
    area_2017_2024_m2 / 10000
)

report_path = os.path.join(
    OUTPUT_FOLDER,
    "potential_encroachment_report.csv"
)
with open(report_path, "w", newline="", encoding="utf-8") as report_file:
    writer = csv.writer(report_file)
    writer.writerow(["From Year", "To Year", "Pixels", "Area (m2)", "Area (ha)"])
    writer.writerow([
        2017,
        2023,
        int(np.sum(potential_2017_2023)),
        area_2017_2023_m2,
        area_2017_2023_ha,
    ])
    writer.writerow([
        2017,
        2024,
        int(np.sum(potential_2017_2024)),
        area_2017_2024_m2,
        area_2017_2024_ha,
    ])


# ============================================================
# 21. PRINT AREA
# ============================================================

print("\n")
print("=" * 60)
print("POTENTIAL ENCROACHMENT AREA")
print("=" * 60)


print(
    "\n2017->2023:"
)

print(
    "Area:",
    area_2017_2023_m2,
    "m²"
)

print(
    "Area:",
    area_2017_2023_ha,
    "ha"
)


print(
    "\n2017->2024:"
)

print(
    "Area:",
    area_2017_2024_m2,
    "m²"
)

print(
    "Area:",
    area_2017_2024_ha,
    "ha"
)


# ============================================================
# 22. FINAL
# ============================================================

print("\n")
print("=" * 60)
print("MODULE 05 COMPLETED")
print("=" * 60)

print(
    "Persistent encroachment was combined with"
)

print(
    "2024 Dynamic World Built-up class."
)

print(
    "\nPotential encroachment area was calculated"
)

print(
    "using polygon geometry."
)

print("\nOutput folder:")
print(OUTPUT_FOLDER)

print("=" * 60)