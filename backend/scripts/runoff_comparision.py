
import os
from pathlib import Path

import numpy as np
import pandas as pd
import rasterio
from rasterio.warp import reproject, Resampling


# ==========================================================
# 1. PROJECT PATHS
# ==========================================================

PROJECT = Path(__file__).resolve().parents[2]
BACKEND_DATA = PROJECT / "backend" / "data"

RAINFALL_CSV = (
    BACKEND_DATA
    / "rainfall_outputs"
    / "velachery_area_weighted_rainfall.csv"
)

LULC_2017_PATH = BACKEND_DATA / "Velachery_full_LULC_2017.tif"
LULC_2024_PATH = BACKEND_DATA / "Velachery_full_LULC_2024.tif"

OUTPUT_DIR = (
    BACKEND_DATA
    / "gisoutputs"
    / "runoff_comparison"
)

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


# ==========================================================
# 2. ASSUMPTIONS
# ==========================================================

# Preliminary Curve Number values for an assumed Group C soil.
# These are illustrative values, not site-calibrated values.
# Refine them using a suitable land-cover/CN reference and
# verified hydrologic soil-group information.

SOIL_GROUP = "C"

CN_BY_CLASS = {
    0: 100.0,  # Water
    1: 70.0,   # Trees
    2: 74.0,   # Grass
    3: 78.0,   # Flooded vegetation
    4: 82.0,   # Crops
    5: 77.0,   # Shrub and scrub
    6: 90.0,   # Built-up
    7: 86.0,   # Bare ground
    8: 100.0,  # Snow/ice; generally not relevant here
}

LULC_NAMES = {
    0: "Water",
    1: "Trees",
    2: "Grass",
    3: "Flooded vegetation",
    4: "Crops",
    5: "Shrub and scrub",
    6: "Built-up",
    7: "Bare ground",
    8: "Snow/ice",
}

# Pixels outside classes 0–8 are treated as invalid.
VALID_CLASSES = set(CN_BY_CLASS.keys())


# ==========================================================
# 3. READ RAINFALL
# ==========================================================

if not RAINFALL_CSV.exists():
    raise FileNotFoundError(
        f"Rainfall CSV not found: {RAINFALL_CSV}"
    )

rainfall_df = pd.read_csv(RAINFALL_CSV)

# Find the rainfall column without depending on one exact name.
possible_columns = [
    col for col in rainfall_df.columns
    if "rainfall" in col.lower()
    and ("mm" in col.lower() or "precipitation" in col.lower())
]

if not possible_columns:
    possible_columns = [
        col for col in rainfall_df.columns
        if "rainfall" in col.lower()
        or "precipitation" in col.lower()
    ]

if not possible_columns:
    raise ValueError(
        "Could not identify the rainfall column. "
        f"CSV columns: {list(rainfall_df.columns)}"
    )

RAINFALL_COLUMN = possible_columns[0]

rainfall_values = pd.to_numeric(
    rainfall_df[RAINFALL_COLUMN],
    errors="coerce"
).dropna()

if rainfall_values.empty:
    raise ValueError("No valid rainfall values were found.")

# The CSV contains daily area-weighted rainfall.
# Sum daily values to obtain the event-total rainfall.
RAINFALL_MM = float(rainfall_values.sum())

if RAINFALL_MM <= 0:
    raise ValueError("Total rainfall must be greater than zero.")

print(f"Rainfall column: {RAINFALL_COLUMN}")
print(f"Total rainfall: {RAINFALL_MM:.3f} mm")
print(f"Assumed soil group: {SOIL_GROUP}")


# ==========================================================
# 4. CHECK LULC FILES
# ==========================================================

for path in [LULC_2017_PATH, LULC_2024_PATH]:
    if not path.exists():
        raise FileNotFoundError(
            f"LULC file not found: {path}\n"
            "Update the path at the top of the script "
            "to match your actual file location."
        )


# ==========================================================
# 5. ALIGN 2017 LULC TO THE 2024 GRID
# ==========================================================

with rasterio.open(LULC_2024_PATH) as src_2024:
    lulc_2024 = src_2024.read(1)
    profile = src_2024.profile.copy()
    destination_transform = src_2024.transform
    destination_crs = src_2024.crs
    destination_shape = lulc_2024.shape

    if destination_crs is None:
        raise ValueError("2024 LULC has no defined CRS.")

    if destination_crs.is_geographic:
        raise ValueError(
            "LULC CRS must be projected in metres "
            "to calculate runoff volume per cell."
        )

    destination_nodata = src_2024.nodata

    if destination_nodata is None:
        destination_nodata = 255

with rasterio.open(LULC_2017_PATH) as src_2017:
    lulc_2017 = np.full(
        destination_shape,
        255,
        dtype=np.uint8
    )

    reproject(
        source=rasterio.band(src_2017, 1),
        destination=lulc_2017,
        src_transform=src_2017.transform,
        src_crs=src_2017.crs,
        src_nodata=src_2017.nodata,
        dst_transform=destination_transform,
        dst_crs=destination_crs,
        dst_nodata=255,
        resampling=Resampling.nearest,
    )

    if src_2017.crs is None:
        raise ValueError("2017 LULC has no defined CRS.")

# Convert both rasters to integer class arrays.
lulc_2017 = lulc_2017.astype(np.int16)
lulc_2024 = lulc_2024.astype(np.int16)

valid_2017 = np.isin(lulc_2017, list(VALID_CLASSES))
valid_2024 = np.isin(lulc_2024, list(VALID_CLASSES))

# Compare only cells where both years have valid LULC.
valid = valid_2017 & valid_2024

if not np.any(valid):
    raise ValueError(
        "No overlapping valid LULC pixels found. "
        "Check raster alignment, class values and NoData."
    )

print(f"Valid comparison pixels: {int(valid.sum())}")


# ==========================================================
# 6. CONVERT LULC CLASSES TO CURVE NUMBERS
# ==========================================================

def convert_to_cn(lulc):
    cn = np.full(lulc.shape, np.nan, dtype=np.float32)

    for class_value, curve_number in CN_BY_CLASS.items():
        cn[lulc == class_value] = curve_number

    return cn


cn_2017 = convert_to_cn(lulc_2017)
cn_2024 = convert_to_cn(lulc_2024)


# ==========================================================
# 7. NRCS CURVE NUMBER RUNOFF CALCULATION
# ==========================================================

def calculate_runoff(cn, rainfall_mm):
    """
    NRCS runoff equation:
        S = 25400 / CN - 254
        Ia = 0.2 * S
        Q = (P - Ia)^2 / (P + 0.8 * S), if P > Ia
        Q = 0 otherwise

    P, S, Ia and Q are expressed in millimetres.
    """

    runoff = np.full(cn.shape, np.nan, dtype=np.float32)

    valid_cn = np.isfinite(cn) & (cn > 0) & (cn <= 100)

    storage = np.zeros(cn.shape, dtype=np.float32)
    storage[valid_cn] = (
        25400.0 / cn[valid_cn]
    ) - 254.0

    initial_abstraction = 0.2 * storage

    produces_runoff = (
        valid_cn
        & (rainfall_mm > initial_abstraction)
    )

    runoff[valid_cn] = 0.0

    runoff[produces_runoff] = (
        (
            rainfall_mm
            - initial_abstraction[produces_runoff]
        ) ** 2
        /
        (
            rainfall_mm
            + 0.8 * storage[produces_runoff]
        )
    )

    return runoff


runoff_2017 = calculate_runoff(cn_2017, RAINFALL_MM)
runoff_2024 = calculate_runoff(cn_2024, RAINFALL_MM)

runoff_2017[~valid] = np.nan
runoff_2024[~valid] = np.nan

# Positive value means estimated runoff increased in 2024.
runoff_change = runoff_2024 - runoff_2017


# ==========================================================
# 8. CALCULATE RUNOFF VOLUME CHANGE
# ==========================================================

# Use the actual projected pixel dimensions.
pixel_width = abs(destination_transform.a)
pixel_height = abs(destination_transform.e)
cell_area_m2 = pixel_width * pixel_height

# Convert runoff depth in mm to volume in cubic metres.
volume_change = (runoff_change / 1000.0) * cell_area_m2

# Positive-only increase; negative changes contribute zero.
positive_increase_volume = np.where(
    valid,
    np.maximum(runoff_change, 0) / 1000.0 * cell_area_m2,
    np.nan
)

# Count cells with a meaningful positive runoff change.
increased_pixels = valid & (runoff_change > 0)


# ==========================================================
# 9. SAVE OUTPUT RASTERS
# ==========================================================

output_profile = profile.copy()
output_profile.update(
    driver="GTiff",
    count=1,
    dtype="float32",
    nodata=-9999.0,
    compress="lzw"
)


def save_raster(path, array):
    output = np.where(
        np.isfinite(array),
        array,
        -9999.0
    ).astype(np.float32)

    with rasterio.open(path, "w", **output_profile) as dst:
        dst.write(output, 1)


save_raster(
    OUTPUT_DIR / "runoff_before_2017_mm.tif",
    runoff_2017
)

save_raster(
    OUTPUT_DIR / "runoff_after_2024_mm.tif",
    runoff_2024
)

save_raster(
    OUTPUT_DIR / "runoff_change_2024_minus_2017_mm.tif",
    runoff_change
)

save_raster(
    OUTPUT_DIR / "runoff_volume_change_m3_per_cell.tif",
    volume_change
)

save_raster(
    OUTPUT_DIR / "positive_runoff_increase_m3_per_cell.tif",
    positive_increase_volume
)


# ==========================================================
# 10. SAVE SUMMARY CSV
# ==========================================================

mean_before = float(np.nanmean(runoff_2017[valid]))
mean_after = float(np.nanmean(runoff_2024[valid]))
mean_change = float(np.nanmean(runoff_change[valid]))

net_volume_change = float(np.nansum(volume_change[valid]))
positive_volume = float(
    np.nansum(positive_increase_volume[valid])
)

summary = pd.DataFrame([{
    "Soil Group": SOIL_GROUP,
    "Assumed Rainfall (mm)": RAINFALL_MM,
    "Mean Runoff Before 2017 (mm)": mean_before,
    "Mean Runoff After 2024 (mm)": mean_after,
    "Mean Runoff Change (mm)": mean_change,
    "Net Runoff Volume Change (m3)": net_volume_change,
    "Positive Runoff Increase Volume (m3)": positive_volume,
    "Pixels with Increased Runoff": int(increased_pixels.sum()),
    "Cell Area (m2)": cell_area_m2,
    "Valid Comparison Pixels": int(valid.sum()),
    "CN Method": "Preliminary NRCS AMC II scenario",
}])

summary_path = OUTPUT_DIR / "runoff_comparison_summary.csv"
summary.to_csv(summary_path, index=False)


# ==========================================================
# 11. PRINT RESULTS
# ==========================================================

print("\n========== RUNOFF COMPARISON ==========")
print(f"2017 mean runoff: {mean_before:.3f} mm")
print(f"2024 mean runoff: {mean_after:.3f} mm")
print(f"Mean runoff change: {mean_change:.3f} mm")
print(f"Net volume change: {net_volume_change:.3f} m3")
print(f"Positive increase volume: {positive_volume:.3f} m3")
print(f"Pixels with increased runoff: {increased_pixels.sum()}")
print(f"\nOutput folder: {OUTPUT_DIR}")
print(f"Summary CSV: {summary_path}")
print("=======================================")


# ==========================================================
# 11. PRINT RESULTS
# ==========================================================

print("\n========== RUNOFF COMPARISON ==========")
print(f"2017 mean runoff: {mean_before:.3f} mm")
print(f"2024 mean runoff: {mean_after:.3f} mm")
print(f"Mean runoff change: {mean_change:.3f} mm")
print(f"Net volume change: {net_volume_change:.3f} m3")
print(f"Positive increase volume: {positive_volume:.3f} m3")
print(f"Pixels with increased runoff: {increased_pixels.sum()}")
print(f"\nOutput folder: {OUTPUT_DIR}")
print(f"Summary CSV: {summary_path}")
print("=======================================")


# ==========================================================
# 12. CREATE DISPLAYABLE RGB GEOTIFFS AND PNG MAPS
# ==========================================================
# These are visualization products only. The original numeric
# runoff rasters and calculations above remain unchanged.

import matplotlib.pyplot as plt
from matplotlib import colormaps
from matplotlib.colors import Normalize, TwoSlopeNorm

DISPLAY_DIR = OUTPUT_DIR / "display_rgb"
DISPLAY_DIR.mkdir(parents=True, exist_ok=True)


def save_rgb_geotiff(path, rgb, base_profile):
    """Save an (rows, cols, 3) uint8 RGB array as a 3-band GeoTIFF."""
    rgb_profile = base_profile.copy()
    rgb_profile.update(
        driver="GTiff",
        count=3,
        dtype="uint8",
        nodata=None,
        compress="lzw",
        photometric="RGB"
    )
    with rasterio.open(path, "w", **rgb_profile) as dst:
        for band in range(3):
            dst.write(rgb[:, :, band], band + 1)


def make_rgb_map(array, valid_mask, cmap_name, vmin, vmax):
    """Convert numeric raster values to displayable 8-bit RGB."""
    cmap = colormaps[cmap_name]
    norm = Normalize(vmin=vmin, vmax=vmax, clip=True)
    safe = np.where(valid_mask, array, vmin)
    rgba = cmap(norm(safe))
    rgb = (rgba[:, :, :3] * 255).round().astype(np.uint8)
    # NoData pixels are white so they cannot be mistaken for low values.
    rgb[~valid_mask] = [255, 255, 255]
    return rgb


def save_png_map(path, array, valid_mask, title, cmap_name, vmin, vmax,
                 colorbar_label, change_map=False):
    shown = np.ma.masked_where(~valid_mask, array)
    fig, ax = plt.subplots(figsize=(10, 6), constrained_layout=True)
    if change_map:
        image = ax.imshow(
            shown, cmap=cmap_name,
            norm=TwoSlopeNorm(vmin=vmin, vcenter=0.0, vmax=vmax)
        )
    else:
        image = ax.imshow(shown, cmap=cmap_name, vmin=vmin, vmax=vmax)
    ax.set_title(title)
    ax.set_axis_off()
    cbar = fig.colorbar(image, ax=ax, shrink=0.82)
    cbar.set_label(colorbar_label)
    fig.savefig(path, dpi=220, bbox_inches="tight", facecolor="white")
    plt.close(fig)


# Use finite values from the actual arrays; ignore NaN/NoData.
valid_2017_runoff = np.isfinite(runoff_2017) & valid
valid_2024_runoff = np.isfinite(runoff_2024) & valid
valid_change = np.isfinite(runoff_change) & valid

if not valid_2017_runoff.any() or not valid_2024_runoff.any() or not valid_change.any():
    raise ValueError("No valid runoff cells available to create display maps.")

# Shared scale makes the two runoff maps comparable.
runoff_min = float(min(np.nanmin(runoff_2017[valid_2017_runoff]),
                       np.nanmin(runoff_2024[valid_2024_runoff])))
runoff_max = float(max(np.nanmax(runoff_2017[valid_2017_runoff]),
                       np.nanmax(runoff_2024[valid_2024_runoff])))
if runoff_max <= runoff_min:
    runoff_max = runoff_min + 1.0

# Robust symmetric limits keep a few extreme cells from hiding other changes.
abs_change = np.abs(runoff_change[valid_change])
change_limit = float(np.nanpercentile(abs_change, 98)) if abs_change.size else 1.0
if not np.isfinite(change_limit) or change_limit <= 0:
    change_limit = float(np.nanmax(abs_change)) if abs_change.size else 1.0
if not np.isfinite(change_limit) or change_limit <= 0:
    change_limit = 1.0

maps = [
    ("runoff_before_2017_mm", runoff_2017, valid_2017_runoff,
     "Runoff Before (2017)", "YlGnBu", runoff_min, runoff_max, "Runoff (mm)", False),
    ("runoff_after_2024_mm", runoff_2024, valid_2024_runoff,
     "Runoff After (2024)", "YlGnBu", runoff_min, runoff_max, "Runoff (mm)", False),
    ("runoff_change_2024_minus_2017_mm", runoff_change, valid_change,
     "Runoff Change (2024 - 2017)", "coolwarm", -change_limit, change_limit,
     "Change in runoff (mm)", True),
]

for name, array, mask, title, cmap_name, vmin, vmax, label, is_change in maps:
    rgb = make_rgb_map(array, mask, cmap_name, vmin, vmax)
    save_rgb_geotiff(DISPLAY_DIR / f"{name}_RGB.tif", rgb, profile)
    save_png_map(
        DISPLAY_DIR / f"{name}.png", array, mask, title,
        cmap_name, vmin, vmax, label, change_map=is_change
    )

print("\nDisplayable RGB maps created:")
print(f"  Folder: {DISPLAY_DIR}")
print("  - runoff_before_2017_mm.png / _RGB.tif")
print("  - runoff_after_2024_mm.png / _RGB.tif")
print("  - runoff_change_2024_minus_2017_mm.png / _RGB.tif")
print("PNG files include a legend; RGB GeoTIFFs are ready for GIS display.")
