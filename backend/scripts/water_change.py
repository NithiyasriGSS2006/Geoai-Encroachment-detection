import rasterio
import numpy as np
import os
import csv
from rasterio.features import shapes
import geopandas as gpd
from shapely.geometry import shape

# ============================================================
# WATER CHANGE ANALYSIS
# ============================================================
#
# Water mask:
# 0   = Non-water
# 255 = Water
#
# Analytical change map:
#
# 0 = Persistent non-water
# 1 = Persistent water
# 2 = Water loss
# 3 = Water gain
#
#
# Additional long-term comparison:
#
# 2017 -> 2026
#
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

os.makedirs(
    OUTPUT_FOLDER,
    exist_ok=True
)


# ============================================================
# 2. YEARS
# ============================================================

YEARS = [
    2017,
    2020,
    2023,
    2024,
    2026
]


# ============================================================
# 3. CREATE YEAR PAIRS
# ============================================================

YEAR_PAIRS = [
    (2017, 2020),
    (2017, 2023),
    (2017, 2024),
    (2017, 2026)
]


def calculate_polygon_area(mask, transform, crs):
    polygons = []

    for geometry, _ in shapes(
        mask.astype(np.uint8),
        mask=mask,
        transform=transform
    ):
        polygons.append(shape(geometry))

    if len(polygons) == 0:
        return 0.0

    gdf = gpd.GeoDataFrame(
        geometry=polygons,
        crs=crs
    )
    gdf["area_m2"] = gdf.geometry.area
    return gdf["area_m2"].sum()


# ============================================================
# 4. PROCESS EACH YEAR PAIR
# ============================================================

for historical_year, current_year in YEAR_PAIRS:

    print(
            f"WATER CHANGE: "
            f"{historical_year} -> {current_year}"
        )

    print("==========================================")


    # ========================================================
    # 5. INPUT FILE PATHS
    # ========================================================

    historical_path = os.path.join(
        WATER_MASK_FOLDER,
        f"water_{historical_year}.tif"
    )

    current_path = os.path.join(
        WATER_MASK_FOLDER,
        f"water_{current_year}.tif"
    )


    # ========================================================
    # 6. OUTPUT FILE PATHS
    # ========================================================

    water_loss_path = os.path.join(
        OUTPUT_FOLDER,
        f"water_loss_{historical_year}_{current_year}.tif"
    )

    water_gain_path = os.path.join(
        OUTPUT_FOLDER,
        f"water_gain_{historical_year}_{current_year}.tif"
    )

    change_map_path = os.path.join(
        OUTPUT_FOLDER,
        f"water_change_{historical_year}_{current_year}.tif"
    )

    display_map_path = os.path.join(
        OUTPUT_FOLDER,
        f"water_change_display_{historical_year}_{current_year}.tif"
    )

    report_path = os.path.join(
        OUTPUT_FOLDER,
        f"water_change_report_{historical_year}_{current_year}.csv"
    )


    # ========================================================
    # 7. CHECK INPUT FILES
    # ========================================================

    if not os.path.exists(historical_path):

        print(
            "Historical raster not found:"
        )

        print(
            historical_path
        )

        continue


    if not os.path.exists(current_path):

        print(
            "Current raster not found:"
        )

        print(
            current_path
        )

        continue


    # ========================================================
    # 8. READ HISTORICAL RASTER
    # ========================================================

    with rasterio.open(
        historical_path
    ) as src_hist:

        historical_raw = src_hist.read(1)

        historical_profile = (
            src_hist.profile.copy()
        )

        historical_width = src_hist.width

        historical_height = src_hist.height

        historical_crs = src_hist.crs

        historical_transform = (
            src_hist.transform
        )


    # ========================================================
    # 9. READ CURRENT RASTER
    # ========================================================

    with rasterio.open(
        current_path
    ) as src_curr:

        current_raw = src_curr.read(1)

        current_width = src_curr.width

        current_height = src_curr.height

        current_crs = src_curr.crs

        current_transform = (
            src_curr.transform
        )


    # ========================================================
    # 10. PRINT RASTER INFORMATION
    # ========================================================

    print("\nHistorical raster:")

    print(
        "Size:",
        historical_width,
        "×",
        historical_height
    )

    print(
        "CRS:",
        historical_crs
    )

    print(
        "Transform:",
        historical_transform
    )


    print("\nCurrent raster:")

    print(
        "Size:",
        current_width,
        "×",
        current_height
    )

    print(
        "CRS:",
        current_crs
    )

    print(
        "Transform:",
        current_transform
    )


    # ========================================================
    # 11. CHECK RASTER ALIGNMENT
    # ========================================================

    if historical_width != current_width:

        print(
            "\nERROR: Raster widths do not match."
        )

        continue


    if historical_height != current_height:

        print(
            "\nERROR: Raster heights do not match."
        )

        continue


    if historical_crs != current_crs:

        print(
            "\nERROR: CRS does not match."
        )

        continue


    if historical_transform != current_transform:

        print(
            "\nERROR: Raster transforms do not match."
        )

        continue


    print(
        "\nRaster alignment: OK"
    )


    # ========================================================
    # 12. PIXEL SIZE
    # ========================================================

    pixel_width = abs(
        historical_transform.a
    )

    pixel_height = abs(
        historical_transform.e
    )

    pixel_area = (
        pixel_width *
        pixel_height
    )


    print(
        "Pixel size:",
        pixel_width,
        "×",
        pixel_height,
        "m"
    )

    print(
        "Pixel area:",
        pixel_area,
        "m²"
    )


    # ========================================================
    # 13. CHECK MASK VALUES
    # ========================================================

    print("\nHistorical mask values:")

    print(
        np.unique(
            historical_raw
        )
    )


    print(
        "Current mask values:"
    )

    print(
        np.unique(
            current_raw
        )
    )


    # ========================================================
    # 14. CONVERT TO BINARY WATER MASK
    # ========================================================
    #
    # 0   = False = non-water
    # 255 = True  = water
    #
    # ========================================================

    historical_water = (
        historical_raw > 0
    )

    current_water = (
        current_raw > 0
    )


    # ========================================================
    # 15. WATER AREA
    # ========================================================
    #
    # Polygon-based calculation
    #
    # ========================================================

    historical_water_pixels = np.sum(
        historical_water
    )

    current_water_pixels = np.sum(
        current_water
    )


    historical_water_area_m2 = calculate_polygon_area(
        historical_water,
        historical_transform,
        historical_crs
    )

    current_water_area_m2 = calculate_polygon_area(
        current_water,
        historical_transform,
        historical_crs
    )


    historical_water_area_ha = (
        historical_water_area_m2 /
        10000
    )

    current_water_area_ha = (
        current_water_area_m2 /
        10000
    )


    # ========================================================
    # 16. WATER LOSS
    # ========================================================
    #
    # Historical = Water
    # Current    = Non-water
    #
    # ========================================================

    water_loss = (
        historical_water &
        (~current_water)
    )


    # ========================================================
    # 17. WATER GAIN
    # ========================================================
    #
    # Historical = Non-water
    # Current    = Water
    #
    # ========================================================

    water_gain = (
        (~historical_water) &
        current_water
    )


    # ========================================================
    # 18. PERSISTENT WATER
    # ========================================================

    persistent_water = (
        historical_water &
        current_water
    )


    # ========================================================
    # 19. PERSISTENT NON-WATER
    # ========================================================

    persistent_non_water = (
        (~historical_water) &
        (~current_water)
    )


    # ========================================================
    # 20. COUNT PIXELS
    # ========================================================

    loss_pixels = np.sum(
        water_loss
    )

    gain_pixels = np.sum(
        water_gain
    )

    persistent_water_pixels = np.sum(
        persistent_water
    )

    persistent_non_water_pixels = np.sum(
        persistent_non_water
    )


    # ========================================================
    # 21. AREA CALCULATIONS
    # ========================================================
    #
    # Polygon-based area calculation
    #
    # ========================================================

    loss_area_m2 = calculate_polygon_area(
        water_loss,
        historical_transform,
        historical_crs
    )

    gain_area_m2 = calculate_polygon_area(
        water_gain,
        historical_transform,
        historical_crs
    )

    persistent_water_area_m2 = calculate_polygon_area(
        persistent_water,
        historical_transform,
        historical_crs
    )


    # ========================================================
    # 22. HECTARES
    # ========================================================

    loss_hectares = (
        loss_area_m2 /
        10000
    )

    gain_hectares = (
        gain_area_m2 /
        10000
    )

    persistent_water_hectares = (
        persistent_water_area_m2 /
        10000
    )


    # ========================================================
    # 23. NET WATER CHANGE
    # ========================================================

    net_change_area_m2 = (
        current_water_area_m2 -
        historical_water_area_m2
    )

    net_change_hectares = (
        net_change_area_m2 /
        10000
    )


    # ========================================================
    # 24. PERCENTAGE CHANGE
    # ========================================================

    if historical_water_area_m2 > 0:

        percentage_change = (
            net_change_area_m2 /
            historical_water_area_m2
        ) * 100

    else:

        percentage_change = 0


    # ========================================================
    # 25. ANALYTICAL CHANGE MAP
    # ========================================================
    #
    # 0 = Persistent non-water
    # 1 = Persistent water
    # 2 = Water loss
    # 3 = Water gain
    #
    # ========================================================

    change_map = np.zeros(
        historical_raw.shape,
        dtype=np.uint8
    )


    change_map[
        persistent_water
    ] = 1


    change_map[
        water_loss
    ] = 2


    change_map[
        water_gain
    ] = 3


    # ========================================================
    # 26. DISPLAY CHANGE MAP
    # ========================================================
    #
    # 0   = Persistent non-water
    # 85  = Persistent water
    # 170 = Water loss
    # 255 = Water gain
    #
    # ========================================================

    display_map = np.zeros(
        change_map.shape,
        dtype=np.uint8
    )


    display_map[
        change_map == 1
    ] = 85


    display_map[
        change_map == 2
    ] = 170


    display_map[
        change_map == 3
    ] = 255


    # ========================================================
    # 27. OUTPUT PROFILE
    # ========================================================

    output_profile = (
        historical_profile.copy()
    )

    output_profile.update(
        driver="GTiff",
        dtype="uint8",
        count=1,
        nodata=0,
        compress="lzw"
    )


    # ========================================================
    # 28. SAVE WATER LOSS
    # ========================================================

    water_loss_display = (
        water_loss.astype(
            np.uint8
        ) * 255
    )


    with rasterio.open(
        water_loss_path,
        "w",
        **output_profile
    ) as dst:

        dst.write(
            water_loss_display,
            1
        )


    # ========================================================
    # 29. SAVE WATER GAIN
    # ========================================================

    water_gain_display = (
        water_gain.astype(
            np.uint8
        ) * 255
    )


    with rasterio.open(
        water_gain_path,
        "w",
        **output_profile
    ) as dst:

        dst.write(
            water_gain_display,
            1
        )


    # ========================================================
    # 30. SAVE ANALYTICAL CHANGE MAP
    # ========================================================

    with rasterio.open(
        change_map_path,
        "w",
        **output_profile
    ) as dst:

        dst.write(
            change_map,
            1
        )


    # ========================================================
    # 31. SAVE DISPLAY CHANGE MAP
    # ========================================================

    with rasterio.open(
        display_map_path,
        "w",
        **output_profile
    ) as dst:

        dst.write(
            display_map,
            1
        )


    # ========================================================
    # 32. PRINT RESULTS
    # ========================================================

    print("\n")
    print("------------------------------------------")
    print("WATER AREA")
    print("------------------------------------------")

    print(
        f"{historical_year} water pixels:",
        historical_water_pixels
    )

    print(
        f"{historical_year} water area:",
        round(
            historical_water_area_ha,
            4
        ),
        "hectares"
    )


    print()

    print(
        f"{current_year} water pixels:",
        current_water_pixels
    )

    print(
        f"{current_year} water area:",
        round(
            current_water_area_ha,
            4
        ),
        "hectares"
    )


    print("\n")
    print("------------------------------------------")
    print("WATER CHANGE RESULTS")
    print("------------------------------------------")

    print(
        "Water loss pixels:",
        loss_pixels
    )

    print(
        "Water loss area:",
        round(
            loss_area_m2,
            2
        ),
        "m²"
    )

    print(
        "Water loss:",
        round(
            loss_hectares,
            4
        ),
        "hectares"
    )


    print()

    print(
        "Water gain pixels:",
        gain_pixels
    )

    print(
        "Water gain area:",
        round(
            gain_area_m2,
            2
        ),
        "m²"
    )

    print(
        "Water gain:",
        round(
            gain_hectares,
            4
        ),
        "hectares"
    )


    print()

    print(
        "Persistent water pixels:",
        persistent_water_pixels
    )

    print(
        "Persistent water:",
        round(
            persistent_water_hectares,
            4
        ),
        "hectares"
    )


    print()

    print(
        "Net water change:",
        round(
            net_change_hectares,
            4
        ),
        "hectares"
    )

    print(
        "Percentage change:",
        round(
            percentage_change,
            2
        ),
        "%"
    )


    # ========================================================
    # 33. TRANSITION MATRIX
    # ========================================================

    transition_00 = np.sum(
        (~historical_water) &
        (~current_water)
    )

    transition_01 = np.sum(
        (~historical_water) &
        current_water
    )

    transition_10 = np.sum(
        historical_water &
        (~current_water)
    )

    transition_11 = np.sum(
        historical_water &
        current_water
    )


    print("\n")
    print("------------------------------------------")
    print("TRANSITION MATRIX")
    print("------------------------------------------")

    print(
        "Non-water -> Non-water:",
        transition_00
    )

    print(
        "Non-water -> Water:",
        transition_01
    )

    print(
        "Water -> Non-water:",
        transition_10
    )

    print(
        "Water -> Water:",
        transition_11
    )


    # ========================================================
    # 34. SAVE CSV REPORT
    # ========================================================

    with open(
        report_path,
        "w",
        newline=""
    ) as csvfile:

        writer = csv.writer(
            csvfile
        )


        writer.writerow(
            [
                "Parameter",
                "Value"
            ]
        )


        writer.writerow(
            [
                "Historical Year",
                historical_year
            ]
        )


        writer.writerow(
            [
                "Current Year",
                current_year
            ]
        )


        writer.writerow(
            [
                "Pixel Size (m)",
                pixel_width
            ]
        )


        writer.writerow(
            [
                "Pixel Area (m2)",
                pixel_area
            ]
        )


        writer.writerow(
            [
                "Historical Water Pixels",
                historical_water_pixels
            ]
        )


        writer.writerow(
            [
                "Historical Water Area (ha)",
                historical_water_area_ha
            ]
        )


        writer.writerow(
            [
                "Current Water Pixels",
                current_water_pixels
            ]
        )


        writer.writerow(
            [
                "Current Water Area (ha)",
                current_water_area_ha
            ]
        )


        writer.writerow(
            [
                "Water Loss Pixels",
                loss_pixels
            ]
        )


        writer.writerow(
            [
                "Water Loss Area (m2)",
                loss_area_m2
            ]
        )


        writer.writerow(
            [
                "Water Loss (ha)",
                loss_hectares
            ]
        )


        writer.writerow(
            [
                "Water Gain Pixels",
                gain_pixels
            ]
        )


        writer.writerow(
            [
                "Water Gain Area (m2)",
                gain_area_m2
            ]
        )


        writer.writerow(
            [
                "Water Gain (ha)",
                gain_hectares
            ]
        )


        writer.writerow(
            [
                "Persistent Water Pixels",
                persistent_water_pixels
            ]
        )


        writer.writerow(
            [
                "Persistent Water (ha)",
                persistent_water_hectares
            ]
        )


        writer.writerow(
            [
                "Net Water Change (ha)",
                net_change_hectares
            ]
        )


        writer.writerow(
            [
                "Percentage Change (%)",
                percentage_change
            ]
        )


        writer.writerow(
            [
                "Persistent Non-water Pixels",
                persistent_non_water_pixels
            ]
        )


        writer.writerow(
            [
                "Water Loss Transition Pixels",
                transition_10
            ]
        )


        writer.writerow(
            [
                "Water Gain Transition Pixels",
                transition_01
            ]
        )


    # ========================================================
    # 35. OUTPUT FILES
    # ========================================================

    print("\n")
    print("------------------------------------------")
    print("OUTPUT FILES")
    print("------------------------------------------")

    print(
        "Water loss:",
        water_loss_path
    )

    print(
        "Water gain:",
        water_gain_path
    )

    print(
        "Analytical change map:",
        change_map_path
    )

    print(
        "Display change map:",
        display_map_path
    )

    print(
        "CSV report:",
        report_path
    )

    print(
        f"WATER CHANGE COMPLETE: {historical_year} -> {current_year}",
        flush=True
    )


# ============================================================
# 36. COMPLETED
# ============================================================

print("\n")
print("==========================================")
print("WATER CHANGE ANALYSIS COMPLETED")
print("==========================================")
print("Comparisons completed:")

for historical_year, current_year in YEAR_PAIRS:

    print(
        f"{historical_year} -> {current_year}"
    )

print("==========================================")