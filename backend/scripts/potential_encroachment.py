
# ============================================================
# MODULE 05 - POTENTIAL ENCROACHMENT DETECTION
# VELACHERY
#
# METHOD:
# Polygonization + Geometric Intersection
#
# LOGIC:
# Persistent encroachment polygons
#             INTERSECTION
# 2024 Built-up polygons (Dynamic World class 6)
#             =
# Potential encroachment polygons
#
# OUTPUTS:
# 1. potential_encroachment_2017_2023.tif
# 2. potential_encroachment_2017_2024.tif
# 3. Existing display GeoTIFFs
# 4. potential_encroachment_report.csv
# 5. Potential encroachment GeoJSON polygons
# ============================================================

import os
import csv
import numpy as np
import rasterio
import geopandas as gpd

from rasterio.features import shapes, rasterize
from shapely.geometry import shape, mapping


# ============================================================
# 1. PROJECT PATHS
# ============================================================

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
    os.path.join(
        BASE_DIR,
        "data",
        "gisoutputs",
        "potential_encroachment"
    )
)

os.makedirs(OUTPUT_FOLDER, exist_ok=True)


# ============================================================
# 2. OUTPUT FILES
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

GEOJSON_2017_2023 = os.path.join(
    OUTPUT_FOLDER,
    "potential_encroachment_2017_2023.geojson"
)

GEOJSON_2017_2024 = os.path.join(
    OUTPUT_FOLDER,
    "potential_encroachment_2017_2024.geojson"
)

REPORT_PATH = os.path.join(
    OUTPUT_FOLDER,
    "potential_encroachment_report.csv"
)

BUILT_UP_CLASS = 6


# ============================================================
# 3. CHECK INPUT FILES
# ============================================================

input_files = [
    PERSISTENT_2017_2020_2023_PATH,
    PERSISTENT_2017_2023_2024_PATH,
    LULC_2024_PATH
]

for path in input_files:
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"Input file not found:\n{path}"
        )


# ============================================================
# 4. READ RASTERS
# ============================================================

with rasterio.open(
    PERSISTENT_2017_2020_2023_PATH
) as src:

    persistent_2017_2023 = src.read(1)
    profile = src.profile.copy()

    width = src.width
    height = src.height
    crs = src.crs
    transform = src.transform


with rasterio.open(
    PERSISTENT_2017_2023_2024_PATH
) as src:

    persistent_2017_2024 = src.read(1)

    if (
        src.width != width
        or src.height != height
        or src.crs != crs
        or src.transform != transform
    ):
        raise ValueError(
            "The two persistent rasters are not aligned."
        )


with rasterio.open(LULC_2024_PATH) as src:

    lulc_2024 = src.read(1)

    if (
        src.width != width
        or src.height != height
        or src.crs != crs
        or src.transform != transform
    ):
        raise ValueError(
            "The LULC raster and persistent rasters "
            "are not aligned."
        )


if crs is None:
    raise ValueError("Input rasters have no CRS.")

if not crs.is_projected:
    raise ValueError(
        "Use a projected CRS measured in metres "
        "for area calculations."
    )

print("[OK] All input rasters are aligned.")
print("[OK] CRS:", crs)


# ============================================================
# 5. CONVERT MASK INTO POLYGONS
# ============================================================

def mask_to_polygons(mask, raster_transform, raster_crs):
    """
    Convert True pixels into polygon geometries.
    """

    mask = np.asarray(mask, dtype=bool)

    polygon_list = []

    polygon_generator = shapes(
        mask.astype(np.uint8),
        mask=mask,
        transform=raster_transform,
        connectivity=8
    )

    for geometry, value in polygon_generator:

        if value == 1:

            polygon_list.append(
                shape(geometry)
            )

    return gpd.GeoDataFrame(
        {"geometry": polygon_list},
        geometry="geometry",
        crs=raster_crs
    )


# ============================================================
# 6. INTERSECT PERSISTENT AND BUILT-UP POLYGONS
# ============================================================

def detect_potential_encroachment(
    persistent_mask,
    built_up_mask,
    raster_transform,
    raster_crs
):
    """
    Identify potential encroachment through geometric
    intersection of persistent encroachment polygons
    and 2024 built-up polygons.
    """

    print("\nConverting persistent areas into polygons...")

    persistent_gdf = mask_to_polygons(
        persistent_mask,
        raster_transform,
        raster_crs
    )

    print(
        "Persistent polygons:",
        len(persistent_gdf)
    )

    print("\nConverting built-up areas into polygons...")

    built_up_gdf = mask_to_polygons(
        built_up_mask,
        raster_transform,
        raster_crs
    )

    print(
        "Built-up polygons:",
        len(built_up_gdf)
    )

    if persistent_gdf.empty or built_up_gdf.empty:

        return gpd.GeoDataFrame(
            {"geometry": []},
            geometry="geometry",
            crs=raster_crs
        )

    print("\nPerforming geometric intersection...")

    # Spatial intersection of the two polygon layers.
    potential_gdf = gpd.overlay(
        persistent_gdf,
        built_up_gdf,
        how="intersection",
        keep_geom_type=True
    )

    # Remove empty or zero-area geometries.
    potential_gdf = potential_gdf[
        (~potential_gdf.geometry.is_empty)
        & (potential_gdf.geometry.area > 0)
    ].copy()

    potential_gdf = potential_gdf.reset_index(drop=True)

    print(
        "Potential encroachment polygons:",
        len(potential_gdf)
    )

    return potential_gdf


# ============================================================
# 7. PREPARE 2024 BUILT-UP MASK
# ============================================================

built_up_2024 = (
    lulc_2024 == BUILT_UP_CLASS
)

persistent_masks = {
    "2017_2023": persistent_2017_2023 > 0,
    "2017_2024": persistent_2017_2024 > 0
}


# ============================================================
# 8. SAVE POLYGONS AND RASTERIZE RESULTS
# ============================================================

def process_period(
    period_name,
    persistent_mask,
    geojson_path,
    raster_output_path,
    display_output_path
):
    print("\n" + "=" * 60)
    print("PROCESSING:", period_name)
    print("=" * 60)

    # Detect potential encroachment using polygons.
    potential_gdf = detect_potential_encroachment(
        persistent_mask,
        built_up_2024,
        transform,
        crs
    )

    # Calculate polygon-based area in square metres.
    if potential_gdf.empty:
        total_area_m2 = 0.0
    else:
        total_area_m2 = float(
            potential_gdf.geometry.area.sum()
        )

    total_area_ha = total_area_m2 / 10000.0

    # Save the vector result.
    if not potential_gdf.empty:
        potential_gdf.to_file(
            geojson_path,
            driver="GeoJSON"
        )
    else:
        print(
            "No intersecting polygons found; "
            "GeoJSON was not created."
        )

    # Rasterize the intersection polygons so the
    # existing GeoTIFF workflow remains compatible.
    if potential_gdf.empty:

        output_array = np.zeros(
            (height, width),
            dtype=np.uint8
        )

    else:

        raster_shapes = (
            (geometry, 255)
            for geometry in potential_gdf.geometry
        )

        output_array = rasterize(
            raster_shapes,
            out_shape=(height, width),
            transform=transform,
            fill=0,
            dtype=np.uint8,
            all_touched=False
        )

    # Preserve the original output raster settings.
    output_profile = profile.copy()

    output_profile.update(
        driver="GTiff",
        height=height,
        width=width,
        count=1,
        dtype="uint8",
        nodata=0,
        compress="lzw"
    )

    # Save analytical GeoTIFF.
    with rasterio.open(
        raster_output_path,
        "w",
        **output_profile
    ) as dst:

        dst.write(output_array, 1)

    # Save display GeoTIFF.
    with rasterio.open(
        display_output_path,
        "w",
        **output_profile
    ) as dst:

        dst.write(output_array, 1)

    # Pixel count is retained for comparison with
    # the original report. Area comes from polygons.
    pixel_count = int(
        np.count_nonzero(output_array == 255)
    )

    print("GeoTIFF:", raster_output_path)
    print("Display:", display_output_path)
    print("Polygons:", geojson_path)
    print("Pixels:", pixel_count)
    print("Polygon area:", total_area_m2, "m²")
    print("Polygon area:", total_area_ha, "ha")

    return {
        "period": period_name,
        "pixels": pixel_count,
        "area_m2": total_area_m2,
        "area_ha": total_area_ha
    }


# ============================================================
# 9. PROCESS 2017 -> 2023
# ============================================================

result_2017_2023 = process_period(
    "2017->2023",
    persistent_masks["2017_2023"],
    GEOJSON_2017_2023,
    OUTPUT_2017_2023,
    DISPLAY_2017_2023
)


# ============================================================
# 10. PROCESS 2017 -> 2024
# ============================================================

result_2017_2024 = process_period(
    "2017->2024",
    persistent_masks["2017_2024"],
    GEOJSON_2017_2024,
    OUTPUT_2017_2024,
    DISPLAY_2017_2024
)


# ============================================================
# 11. WRITE CSV REPORT
# ============================================================

with open(
    REPORT_PATH,
    "w",
    newline="",
    encoding="utf-8"
) as report_file:

    writer = csv.writer(report_file)

    writer.writerow([
        "From Year",
        "To Year",
        "Pixels",
        "Area (m2)",
        "Area (ha)"
    ])

    for result, to_year in [
        (result_2017_2023, 2023),
        (result_2017_2024, 2024)
    ]:

        writer.writerow([
            2017,
            to_year,
            result["pixels"],
            result["area_m2"],
            result["area_ha"]
        ])


# ============================================================
# 12. FINAL SUMMARY
# ============================================================

print("\n" + "=" * 60)
print("MODULE 05 COMPLETED")
print("=" * 60)

print(
    "Detection method: polygon geometric intersection"
)

print(
    "Input classes: persistent encroachment and "
    "2024 built-up (class 6)"
)

print("CSV report:", REPORT_PATH)
print("Output folder:", OUTPUT_FOLDER)

print("=" * 60)
