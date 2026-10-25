
import numpy as np
import pandas as pd
import geopandas as gpd
import rasterio

from pathlib import Path
from rasterio.features import rasterize
from rasterio.transform import rowcol


# ==========================================================
# 1. PROJECT PATHS
# ==========================================================

PROJECT = Path(__file__).resolve().parents[2]

RASTER_PATH = (
    PROJECT
    / "backend"
    / "data"
    / "gisoutputs"
    / "overall_flood_vulnerability"
    / "overall_flood_vulnerability_scores.tif"
)

POINTS_PATH = (
    PROJECT
    / "backend"
    / "data"
    / "gisoutputs"
    / "flood_validation"
    / "velachery_historical_flood.geojson"
)

OUTPUT_DIR = (
    PROJECT
    / "backend"
    / "data"
    / "gisoutputs"
    / "flood_validation"
    / "coverage_analysis"
)

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


# ==========================================================
# 2. VULNERABILITY THRESHOLDS
# ==========================================================

LOW_THRESHOLD = 0.20
HIGH_THRESHOLD = 0.40

# Raster class values
LOW = 1
MODERATE = 2
HIGH = 3

# Overlay values for historical flood points
POINT_LOW = 4
POINT_MODERATE = 5
POINT_HIGH = 6


# ==========================================================
# 3. CHECK INPUT FILES
# ==========================================================

if not RASTER_PATH.exists():
    raise FileNotFoundError(
        f"Vulnerability raster not found: {RASTER_PATH}"
    )

if not POINTS_PATH.exists():
    raise FileNotFoundError(
        f"Historical flood points not found: {POINTS_PATH}"
    )

print("Loading vulnerability raster...")
print(f"Raster: {RASTER_PATH}")

print("\nLoading historical flood points...")
print(f"Points: {POINTS_PATH}")


# ==========================================================
# 4. READ VULNERABILITY RASTER
# ==========================================================

with rasterio.open(RASTER_PATH) as src:
    score = src.read(1).astype(np.float32)

    raster_profile = src.profile.copy()
    raster_transform = src.transform
    raster_crs = src.crs
    raster_nodata = src.nodata

    raster_height = src.height
    raster_width = src.width

print("\nRaster information")
print("------------------")
print(f"CRS: {raster_crs}")
print(f"Width: {raster_width}")
print(f"Height: {raster_height}")
print(f"NoData value: {raster_nodata}")


# ==========================================================
# 5. CLASSIFY THE VULNERABILITY RASTER
# ==========================================================

# Identify valid raster pixels.
valid_pixels = np.isfinite(score)

if raster_nodata is not None:
    valid_pixels &= score != raster_nodata

# Initialize all pixels as NoData (0).
classes = np.zeros(score.shape, dtype=np.uint8)

# Low: score < 0.20
classes[
    valid_pixels & (score < LOW_THRESHOLD)
] = LOW

# Moderate: 0.20 <= score < 0.40
classes[
    valid_pixels
    & (score >= LOW_THRESHOLD)
    & (score < HIGH_THRESHOLD)
] = MODERATE

# High: score >= 0.40
classes[
    valid_pixels & (score >= HIGH_THRESHOLD)
] = HIGH

print("\nVulnerability raster classified.")
print("1 = Low, 2 = Moderate, 3 = High, 0 = NoData")


# ==========================================================
# 6. LOAD AND REPROJECT HISTORICAL FLOOD POINTS
# ==========================================================

points = gpd.read_file(POINTS_PATH)

if points.empty:
    raise ValueError("The historical flood points file is empty.")

if points.crs is None:
    raise ValueError(
        "Historical flood points have no CRS. "
        "Assign the correct source CRS before running validation."
    )

# Reproject points to match the raster CRS.
points = points.to_crs(raster_crs)

# Remove empty or missing geometries.
points = points[
    points.geometry.notna()
    & ~points.geometry.is_empty
].copy()

print(f"\nValid historical flood points: {len(points)}")


# ==========================================================
# 7. SAMPLE RASTER SCORES AT HISTORICAL POINTS
# ==========================================================

sampled_scores = []
predicted_classes = []

for geometry in points.geometry:
    # For point geometries, get the raster cell containing the point.
    row, col = rowcol(
        raster_transform,
        geometry.x,
        geometry.y
    )

    # Check whether the point falls within the raster.
    if (
        row < 0
        or row >= raster_height
        or col < 0
        or col >= raster_width
    ):
        sampled_scores.append(np.nan)
        predicted_classes.append("Outside raster")
        continue

    pixel_score = score[row, col]

    # Check for invalid/NoData pixels.
    if (
        not np.isfinite(pixel_score)
        or (
            raster_nodata is not None
            and pixel_score == raster_nodata
        )
    ):
        sampled_scores.append(np.nan)
        predicted_classes.append("NoData")
        continue

    sampled_scores.append(float(pixel_score))

    if pixel_score < LOW_THRESHOLD:
        predicted_classes.append("Low")
    elif pixel_score < HIGH_THRESHOLD:
        predicted_classes.append("Moderate")
    else:
        predicted_classes.append("High")

points["vulnerability_score"] = sampled_scores
points["predicted_class"] = predicted_classes

# Only points with valid sampled vulnerability classes
# are included in class coverage percentages.
valid_points = points[
    points["predicted_class"].isin(
        ["Low", "Moderate", "High"]
    )
].copy()

total_valid_points = len(valid_points)

print("\nPoint sampling completed.")
print(f"Total input points: {len(points)}")
print(f"Points with valid raster scores: {total_valid_points}")


# ==========================================================
# 8. CALCULATE POINT COUNTS AND PERCENTAGES
# ==========================================================

class_order = ["Low", "Moderate", "High"]

class_counts = (
    valid_points["predicted_class"]
    .value_counts()
    .reindex(class_order, fill_value=0)
)

summary_rows = []

for class_name in class_order:
    count = int(class_counts[class_name])

    percentage = (
        count / total_valid_points * 100
        if total_valid_points > 0
        else 0.0
    )

    summary_rows.append({
        "vulnerability_class": class_name,
        "score_range": (
            "< 0.20"
            if class_name == "Low"
            else "0.20 to < 0.40"
            if class_name == "Moderate"
            else ">= 0.40"
        ),
        "point_count": count,
        "percentage_of_valid_points": round(
            percentage, 2
        )
    })

summary_df = pd.DataFrame(summary_rows)

# Combined Moderate + High coverage of historical points.
moderate_high_count = int(
    class_counts["Moderate"] + class_counts["High"]
)

moderate_high_percentage = (
    moderate_high_count / total_valid_points * 100
    if total_valid_points > 0
    else 0.0
)

summary_df.loc[len(summary_df)] = {
    "vulnerability_class": "Moderate + High",
    "score_range": ">= 0.20",
    "point_count": moderate_high_count,
    "percentage_of_valid_points": round(
        moderate_high_percentage, 2
    )
}

SUMMARY_CSV = OUTPUT_DIR / "vulnerability_coverage_summary.csv"

summary_df.to_csv(SUMMARY_CSV, index=False)

print("\n==========================================")
print("HISTORICAL FLOOD POINT COVERAGE")
print("==========================================")
print(summary_df.to_string(index=False))

print(
    f"\nModerate + High coverage: "
    f"{moderate_high_count}/{total_valid_points} "
    f"({moderate_high_percentage:.2f}%)"
)


# ==========================================================
# 9. SAVE POINT-LEVEL VALIDATION RESULTS
# ==========================================================

POINT_RESULTS_CSV = (
    OUTPUT_DIR / "flood_points_with_vulnerability.csv"
)

# Keep the original GeoJSON attributes alongside sampled values.
points.drop(columns="geometry").to_csv(
    POINT_RESULTS_CSV,
    index=False
)

print(f"\nPoint results saved to:\n{POINT_RESULTS_CSV}")


# Overlay values:
# 0 = NoData
# 1 = Low vulnerability
# 2 = Moderate vulnerability
# 3 = High vulnerability
# 4 = All historical flood points

OVERLAY_TIF = (
    OUTPUT_DIR / "flood_points_vulnerability_overlay.tif"
)

point_shapes = [
    (geometry, 4)
    for geometry in points.geometry
    if geometry is not None and not geometry.is_empty
]

point_grid = rasterize(
    shapes=point_shapes,
    out_shape=(raster_height, raster_width),
    transform=raster_transform,
    fill=0,
    dtype=np.uint8,
    all_touched=False
)

# Preserve vulnerability classes and mark one raster cell at each point.
overlay = classes.copy()
overlay[point_grid == 4] = 4

overlay_profile = raster_profile.copy()
overlay_profile.update(
    driver="GTiff",
    count=1,
    dtype="uint8",
    nodata=0,
    compress="lzw"
)

with rasterio.open(OVERLAY_TIF, "w", **overlay_profile) as dst:
    dst.write(overlay, 1)
    dst.set_band_description(
        1, "Vulnerability classes with historical flood point locations"
    )
    dst.update_tags(
        CLASS_0="NoData",
        CLASS_1="Low vulnerability",
        CLASS_2="Moderate vulnerability",
        CLASS_3="High vulnerability",
        CLASS_4="All historical flood points"
    )

print(f"Overlay GeoTIFF saved to: {OVERLAY_TIF}")
# ==========================================================
# 11. REPORT POINTS THAT COULD NOT BE VALIDATED
# ==========================================================

outside_count = int(
    (points["predicted_class"] == "Outside raster").sum()
)

nodata_count = int(
    (points["predicted_class"] == "NoData").sum()
)

print("\n==========================================")
print("VALIDATION SUMMARY")
print("==========================================")
print(f"Input points: {len(points)}")
print(f"Valid points: {total_valid_points}")
print(f"Outside raster: {outside_count}")
print(f"Points on NoData cells: {nodata_count}")
print(f"Low points: {int(class_counts['Low'])}")
print(f"Moderate points: {int(class_counts['Moderate'])}")
print(f"High points: {int(class_counts['High'])}")
print(f"Moderate + High: {moderate_high_percentage:.2f}%")
print("\nAll outputs saved successfully.")
