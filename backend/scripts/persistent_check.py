import rasterio
import numpy as np
import os
import csv

# NEW: polygon area calculation
from rasterio.features import shapes
import geopandas as gpd
from shapely.geometry import shape


# ============================================================
# PERSISTENT ENCROACHMENT CHECK
# ============================================================
#
# Water-loss raster:
#
# 0   = No water loss / No encroachment
# 255 = Water loss / Potential encroachment
#
#
# Logic:
#
# 1. Encroached in earlier comparison
#    + Encroached in later comparison
#    -> RETAIN
#
# 2. Not encroached in earlier comparison
#    + Encroached in later comparison
#    -> RETAIN
#
# 3. Encroached in earlier comparison
#    + Not encroached in later comparison
#    -> REMOVE
#
# Therefore:
#
# FINAL RETAINED ENCROACHMENT =
# pixels that are encroached in the LATER water-loss raster
#
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

os.makedirs(
    OUTPUT_FOLDER,
    exist_ok=True
)


# ============================================================
# 2. COMPARISONS
# ============================================================
#
# Each tuple contains:
#
# (earlier water-loss map, later water-loss map)
#
# ============================================================

COMPARISONS = [

    (2017, 2020, 2017, 2023),

    (2017, 2023, 2017, 2024)

]


# ============================================================
# 3. FUNCTION TO READ WATER-LOSS RASTER
# ============================================================

def read_water_loss(path):

    with rasterio.open(path) as src:

        raster = src.read(1)

        profile = src.profile.copy()

        width = src.width

        height = src.height

        crs = src.crs

        transform = src.transform

    return (
        raster,
        profile,
        width,
        height,
        crs,
        transform
    )


# ============================================================
# 4. FUNCTION TO CALCULATE POLYGON AREA
# ============================================================
#
# Converts the selected raster pixels into polygons
# and calculates their geometric area.
#
# mask:
#     Boolean raster
#
# transform:
#     Raster spatial transform
#
# crs:
#     Raster CRS
#
# Returns:
#     Total polygon area in m²
#
# ============================================================

def calculate_polygon_area(
    mask,
    transform,
    crs
):

    polygons = []


    # Convert selected raster regions into polygons

    for geom, value in shapes(
        mask.astype(np.uint8),
        mask=mask,
        transform=transform
    ):

        polygons.append(
            shape(geom)
        )


    # If no pixels are selected

    if len(polygons) == 0:

        return 0.0


    # Create GeoDataFrame

    gdf = gpd.GeoDataFrame(
        geometry=polygons,
        crs=crs
    )


    # Calculate area of every polygon

    gdf["area_m2"] = (
        gdf.geometry.area
    )


    # Add all polygon areas

    total_area_m2 = (
        gdf["area_m2"].sum()
    )


    return total_area_m2


# ============================================================
# 5. PROCESS EACH COMPARISON
# ============================================================

for (
    earlier_start,
    earlier_end,
    later_start,
    later_end
) in COMPARISONS:

    print("\n")
    print("==========================================")
    print(
        f"PERSISTENT CHECK: "
        f"{earlier_start} -> {earlier_end}"
    )
    print(
        f"AGAINST: "
        f"{later_start} -> {later_end}"
    )
    print("==========================================")


    # ========================================================
    # 6. INPUT FILE PATHS
    # ========================================================

    earlier_path = os.path.join(
        WATER_CHANGE_FOLDER,
        f"water_loss_{earlier_start}_{earlier_end}.tif"
    )

    later_path = os.path.join(
        WATER_CHANGE_FOLDER,
        f"water_loss_{later_start}_{later_end}.tif"
    )


    # ========================================================
    # 7. OUTPUT FILE PATHS
    # ========================================================

    persistent_path = os.path.join(
        OUTPUT_FOLDER,
        f"persistent_encroachment_"
        f"{earlier_start}_{earlier_end}_"
        f"to_{later_end}.tif"
    )

    report_path = os.path.join(
        OUTPUT_FOLDER,
        f"persistent_report_"
        f"{earlier_start}_{earlier_end}_"
        f"to_{later_end}.csv"
    )


    # ========================================================
    # 8. CHECK INPUT FILES
    # ========================================================

    if not os.path.exists(earlier_path):

        print(
            "\nEarlier water-loss raster not found:"
        )

        print(earlier_path)

        continue


    if not os.path.exists(later_path):

        print(
            "\nLater water-loss raster not found:"
        )

        print(later_path)

        continue


    # ========================================================
    # 9. READ EARLIER WATER-LOSS RASTER
    # ========================================================

    (
        earlier_raw,
        earlier_profile,
        earlier_width,
        earlier_height,
        earlier_crs,
        earlier_transform
    ) = read_water_loss(
        earlier_path
    )


    # ========================================================
    # 10. READ LATER WATER-LOSS RASTER
    # ========================================================

    (
        later_raw,
        later_profile,
        later_width,
        later_height,
        later_crs,
        later_transform
    ) = read_water_loss(
        later_path
    )


    # ========================================================
    # 11. PRINT RASTER INFORMATION
    # ========================================================

    print("\nEarlier raster:")

    print(
        "Size:",
        earlier_width,
        "×",
        earlier_height
    )

    print(
        "CRS:",
        earlier_crs
    )

    print(
        "Transform:",
        earlier_transform
    )


    print("\nLater raster:")

    print(
        "Size:",
        later_width,
        "×",
        later_height
    )

    print(
        "CRS:",
        later_crs
    )

    print(
        "Transform:",
        later_transform
    )


    # ========================================================
    # 12. CHECK RASTER ALIGNMENT
    # ========================================================

    if earlier_width != later_width:

        print(
            "\nERROR: Raster widths do not match."
        )

        continue


    if earlier_height != later_height:

        print(
            "\nERROR: Raster heights do not match."
        )

        continue


    if earlier_crs != later_crs:

        print(
            "\nERROR: CRS does not match."
        )

        continue


    if earlier_transform != later_transform:

        print(
            "\nERROR: Raster transforms do not match."
        )

        continue


    print(
        "\nRaster alignment: OK"
    )


    # ========================================================
    # 13. CHECK RASTER VALUES
    # ========================================================

    print("\nEarlier raster values:")

    print(
        np.unique(
            earlier_raw
        )
    )


    print(
        "\nLater raster values:"
    )

    print(
        np.unique(
            later_raw
        )
    )


    # ========================================================
    # 14. CONVERT TO BOOLEAN ENCROACHMENT MASK
    # ========================================================
    #
    # 0   -> False
    # 255 -> True
    #
    # ========================================================

    earlier_encroachment = (
        earlier_raw > 0
    )

    later_encroachment = (
        later_raw > 0
    )


    # ========================================================
    # 15. CONDITION 1
    # ========================================================
    #
    # Earlier = Encroached
    # Later   = Encroached
    #
    # Result = RETAIN
    #
    # ========================================================

    condition_1 = (
        earlier_encroachment &
        later_encroachment
    )


    # ========================================================
    # 16. CONDITION 2
    # ========================================================
    #
    # Earlier = Not encroached
    # Later   = Encroached
    #
    # Result = RETAIN
    #
    # ========================================================

    condition_2 = (
        (~earlier_encroachment) &
        later_encroachment
    )


    # ========================================================
    # 17. CONDITION 3
    # ========================================================
    #
    # Earlier = Encroached
    # Later   = Not encroached
    #
    # Result = REMOVE
    #
    # ========================================================

    condition_3 = (
        earlier_encroachment &
        (~later_encroachment)
    )


    # ========================================================
    # 18. CONDITION 4
    # ========================================================
    #
    # Earlier = Not encroached
    # Later   = Not encroached
    #
    # Result = REMOVE
    #
    # ========================================================

    condition_4 = (
        (~earlier_encroachment) &
        (~later_encroachment)
    )


    # ========================================================
    # 19. FINAL PERSISTENT ENCROACHMENT
    # ========================================================
    #
    # Conditions 1 and 2 are retained.
    #
    # Both conditions have:
    #
    # later_encroachment = True
    #
    # Therefore:
    #
    # final = later_encroachment
    #
    # ========================================================

    persistent_encroachment = (
        condition_1 |
        condition_2
    )


    # ========================================================
    # 20. CREATE OUTPUT RASTER
    # ========================================================
    #
    # 0   = Not retained
    # 255 = Retained encroachment
    #
    # ========================================================

    persistent_output = (
        persistent_encroachment
        .astype(np.uint8) * 255
    )


    # ========================================================
    # 21. OUTPUT PROFILE
    # ========================================================

    output_profile = (
        later_profile.copy()
    )

    output_profile.update(
        driver="GTiff",
        dtype="uint8",
        count=1,
        nodata=0,
        compress="lzw"
    )


    # ========================================================
    # 22. SAVE PERSISTENT ENCROACHMENT RASTER
    # ========================================================

    with rasterio.open(
        persistent_path,
        "w",
        **output_profile
    ) as dst:

        dst.write(
            persistent_output,
            1
        )


    # ========================================================
    # 23. COUNT PIXELS
    # ========================================================

    condition_1_pixels = np.sum(
        condition_1
    )

    condition_2_pixels = np.sum(
        condition_2
    )

    condition_3_pixels = np.sum(
        condition_3
    )

    condition_4_pixels = np.sum(
        condition_4
    )

    persistent_pixels = np.sum(
        persistent_encroachment
    )


    # ========================================================
    # 24. PIXEL AREA
    # ========================================================

    pixel_width = abs(
        later_transform.a
    )

    pixel_height = abs(
        later_transform.e
    )

    pixel_area = (
        pixel_width *
        pixel_height
    )


    # ========================================================
    # 25. AREA OF RETAINED ENCROACHMENT
    # ========================================================
    #
    # Polygon-based calculation
    #
    # ========================================================

    persistent_area_m2 = calculate_polygon_area(
        persistent_encroachment,
        later_transform,
        later_crs
    )


    persistent_area_ha = (
        persistent_area_m2 /
        10000
    )


    # ========================================================
    # 26. PRINT RESULTS
    # ========================================================

    print("\n")
    print("------------------------------------------")
    print("PERSISTENT ENCROACHMENT RESULTS")
    print("------------------------------------------")

    print(
        "Condition 1:"
    )

    print(
        "Earlier encroached -> "
        "Later encroached:",
        condition_1_pixels,
        "pixels"
    )


    print()

    print(
        "Condition 2:"
    )

    print(
        "Earlier not encroached -> "
        "Later encroached:",
        condition_2_pixels,
        "pixels"
    )


    print()

    print(
        "Condition 3:"
    )

    print(
        "Earlier encroached -> "
        "Later not encroached:",
        condition_3_pixels,
        "pixels"
    )


    print()

    print(
        "Condition 4:"
    )

    print(
        "Earlier not encroached -> "
        "Later not encroached:",
        condition_4_pixels,
        "pixels"
    )


    print("\n------------------------------------------")

    print(
        "Retained encroachment pixels:",
        persistent_pixels
    )

    print(
        "Retained encroachment area:",
        round(
            persistent_area_m2,
            2
        ),
        "m²"
    )

    print(
        "Retained encroachment area:",
        round(
            persistent_area_ha,
            4
        ),
        "hectares"
    )


    # ========================================================
    # 27. SAVE CSV REPORT
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
                "Earlier Comparison",
                f"{earlier_start}-{earlier_end}"
            ]
        )


        writer.writerow(
            [
                "Later Comparison",
                f"{later_start}-{later_end}"
            ]
        )


        writer.writerow(
            [
                "Pixel Width (m)",
                pixel_width
            ]
        )


        writer.writerow(
            [
                "Pixel Height (m)",
                pixel_height
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
                "Condition 1 Pixels",
                condition_1_pixels
            ]
        )


        writer.writerow(
            [
                "Condition 2 Pixels",
                condition_2_pixels
            ]
        )


        writer.writerow(
            [
                "Condition 3 Pixels",
                condition_3_pixels
            ]
        )


        writer.writerow(
            [
                "Condition 4 Pixels",
                condition_4_pixels
            ]
        )


        writer.writerow(
            [
                "Persistent Encroachment Pixels",
                persistent_pixels
            ]
        )


        writer.writerow(
            [
                "Persistent Encroachment Area (m2)",
                persistent_area_m2
            ]
        )


        writer.writerow(
            [
                "Persistent Encroachment Area (ha)",
                persistent_area_ha
            ]
        )


    # ========================================================
    # 28. OUTPUT FILES
    # ========================================================

    print("\n")
    print("------------------------------------------")
    print("OUTPUT FILES")
    print("------------------------------------------")

    print(
        "Persistent raster:",
        persistent_path
    )

    print(
        "CSV report:",
        report_path
    )


# ============================================================
# 29. COMPLETED
# ============================================================

print("\n")
print("==========================================")
print("PERSISTENT ENCROACHMENT CHECK COMPLETED")
print("==========================================")