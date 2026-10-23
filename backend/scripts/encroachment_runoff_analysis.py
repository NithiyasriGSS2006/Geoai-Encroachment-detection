
import os
from pathlib import Path

import numpy as np
import pandas as pd
import rasterio
from rasterio.warp import reproject, Resampling
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import TwoSlopeNorm


# ============================================================
# 1. PROJECT PATHS
# ============================================================

PROJECT = Path(__file__).resolve().parents[2]
DATA = PROJECT / "backend" / "data"

RUNOFF_PATH = (
    DATA / "gisoutputs" / "runoff_comparison"
    / "runoff_change_2024_minus_2017_mm.tif"
)

POTENTIAL_PATH = (
    DATA / "gisoutputs" / "potential_encroachment"
    / "potential_encroachment_2017_2024.tif"
)

OUTPUT_DIR = DATA / "gisoutputs" / "encroachment_runoff"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


# ============================================================
# 2. OUTPUT FILES
# ============================================================

OVERLAP_RUNOFF_PATH = (
    OUTPUT_DIR / "runoff_change_within_potential_encroachment_mm.tif"
)

POSITIVE_RUNOFF_PATH = (
    OUTPUT_DIR / "positive_runoff_increase_within_encroachment_mm.tif"
)

OVERLAP_MASK_PATH = (
    OUTPUT_DIR / "encroachment_with_runoff_increase_mask.tif"
)

SUMMARY_CSV = OUTPUT_DIR / "encroachment_runoff_summary.csv"


# ============================================================
# 3. CHECK INPUT FILES
# ============================================================

for path in [RUNOFF_PATH, POTENTIAL_PATH]:
    if not path.exists():
        raise FileNotFoundError(
            f"\nInput file not found:\n{path}\n\n"
            "Check the filename and folder path in Section 1."
        )

print("=" * 65)
print("POTENTIAL ENCROACHMENT AND RUNOFF ANALYSIS")
print("=" * 65)
print("Runoff raster:", RUNOFF_PATH)
print("Potential encroachment raster:", POTENTIAL_PATH)
print("Output folder:", OUTPUT_DIR)


# ============================================================
# 4. READ RUNOFF CHANGE RASTER
# ============================================================

with rasterio.open(RUNOFF_PATH) as src:
    runoff = src.read(1).astype(np.float32)
    runoff_profile = src.profile.copy()
    runoff_transform = src.transform
    runoff_crs = src.crs
    runoff_shape = runoff.shape
    runoff_nodata = src.nodata

    runoff_valid = np.isfinite(runoff)

    if runoff_nodata is not None:
        runoff_valid &= runoff != runoff_nodata

print("\nRunoff raster information")
print("CRS:", runoff_crs)
print("Shape:", runoff_shape)
print("NoData:", runoff_nodata)
print("Valid cells:", int(runoff_valid.sum()))

if not runoff_valid.any():
    raise ValueError(
        "The runoff raster has no valid cells. "
        "Check its NoData values and input file."
    )

print(
    "Runoff change range (mm):",
    float(runoff[runoff_valid].min()),
    "to",
    float(runoff[runoff_valid].max()),
)


# ============================================================
# 5. ALIGN POTENTIAL ENCROACHMENT RASTER
# ============================================================

with rasterio.open(POTENTIAL_PATH) as src:
    potential_raw = src.read(1)
    potential_transform = src.transform
    potential_crs = src.crs
    potential_nodata = src.nodata

    potential_valid = np.isfinite(potential_raw)

    if potential_nodata is not None:
        potential_valid &= potential_raw != potential_nodata

    # Convert valid potential-encroachment cells to 0 or 1.
    potential_binary = (
        (potential_raw > 0) & potential_valid
    ).astype(np.uint8)

    potential_aligned = np.zeros(
        runoff_shape, dtype=np.uint8
    )

    reproject(
        source=potential_binary,
        destination=potential_aligned,
        src_transform=potential_transform,
        src_crs=potential_crs,
        dst_transform=runoff_transform,
        dst_crs=runoff_crs,
        resampling=Resampling.nearest,
        src_nodata=None,
        dst_nodata=0,
    )

potential_mask = potential_aligned > 0

print("\nPotential encroachment raster information")
print("CRS:", potential_crs)
print("Potential cells after alignment:", int(potential_mask.sum()))


# ============================================================
# 6. IDENTIFY OVERLAPPING CELLS
# ============================================================

# Cells must be valid in the runoff raster and classified as
# potential encroachment in the aligned encroachment raster.
overlap = potential_mask & runoff_valid

# Positive means estimated runoff increased from 2017 to 2024.
positive_increase = overlap & (runoff > 0)

# Negative means estimated runoff decreased.
negative_change = overlap & (runoff < 0)

overlap_count = int(overlap.sum())
positive_count = int(positive_increase.sum())
negative_count = int(negative_change.sum())

print("\nSpatial overlap")
print("Potential encroachment cells analysed:", overlap_count)
print("Cells with positive runoff increase:", positive_count)
print("Cells with runoff decrease:", negative_count)

if overlap_count == 0:
    raise ValueError(
        "No overlapping valid cells were found. "
        "Check the raster extent, CRS, NoData, and input paths."
    )


# ============================================================
# 7. CALCULATE AREA AND RUNOFF STATISTICS
# ============================================================

# Raster cell area in square metres, accounting for rotation.
cell_area_m2 = abs(
    runoff_transform.a * runoff_transform.e
    - runoff_transform.b * runoff_transform.d
)

if cell_area_m2 <= 0:
    raise ValueError("Invalid raster cell area.")

overlap_area_m2 = overlap_count * cell_area_m2
overlap_area_ha = overlap_area_m2 / 10000.0

overlap_values = runoff[overlap]
positive_values = runoff[positive_increase]

mean_change_mm = float(np.mean(overlap_values))

# Signed total: positive and negative changes cancel each other.
net_volume_change_m3 = float(
    np.sum(overlap_values) * cell_area_m2 / 1000.0
)

positive_area_m2 = positive_count * cell_area_m2
positive_area_ha = positive_area_m2 / 10000.0

if positive_count > 0:
    mean_positive_mm = float(np.mean(positive_values))
    positive_volume_m3 = float(
        np.sum(positive_values) * cell_area_m2 / 1000.0
    )
else:
    mean_positive_mm = 0.0
    positive_volume_m3 = 0.0

summary = {
    "Potential Encroachment Cells Analysed": overlap_count,
    "Area Analysed (m2)": overlap_area_m2,
    "Area Analysed (ha)": overlap_area_ha,
    "Mean Runoff Change (mm)": mean_change_mm,
    "Net Runoff Volume Change (m3)": net_volume_change_m3,
    "Cells with Positive Runoff Increase": positive_count,
    "Positive Increase Area (ha)": positive_area_ha,
    "Mean Positive Increase (mm)": mean_positive_mm,
    "Positive Runoff Increase Volume (m3)": positive_volume_m3,
    "Interpretation": (
        "Spatial association only; not proof of causation."
    ),
}

pd.DataFrame([summary]).to_csv(SUMMARY_CSV, index=False)

print("\n" + "=" * 65)
print("ENCROACHMENT-RUNOFF SUMMARY")
print("=" * 65)

for key, value in summary.items():
    print(f"{key}: {value}")

print("\nSummary CSV saved:", SUMMARY_CSV)


# ============================================================
# 8. SAVE GEOTIFF OUTPUTS
# ============================================================

output_profile = runoff_profile.copy()
output_profile.update(
    driver="GTiff",
    height=runoff_shape[0],
    width=runoff_shape[1],
    transform=runoff_transform,
    crs=runoff_crs,
    count=1,
    compress="lzw",
    nodata=-9999.0,
    dtype="float32",
)

# 8A. Signed runoff change only within potential encroachment.
overlap_runoff = np.full(
    runoff_shape, -9999.0, dtype=np.float32
)
overlap_runoff[overlap] = runoff[overlap]

with rasterio.open(
    OVERLAP_RUNOFF_PATH, "w", **output_profile
) as dst:
    dst.write(overlap_runoff, 1)

# 8B. Positive runoff increase only within potential encroachment.
positive_runoff = np.full(
    runoff_shape, -9999.0, dtype=np.float32
)
positive_runoff[positive_increase] = runoff[positive_increase]

with rasterio.open(
    POSITIVE_RUNOFF_PATH, "w", **output_profile
) as dst:
    dst.write(positive_runoff, 1)

# 8C. Binary mask: 255 means positive runoff increase
# within potential encroachment; 0 means no positive increase
# inside the analysed overlap; outside overlap is NoData.
mask_profile = output_profile.copy()
mask_profile.update(dtype="uint8", nodata=0)

overlap_binary = np.zeros(
    runoff_shape, dtype=np.uint8
)
overlap_binary[positive_increase] = 255

with rasterio.open(
    OVERLAP_MASK_PATH, "w", **mask_profile
) as dst:
    dst.write(overlap_binary, 1)
    dst.write_mask((overlap * 255).astype(np.uint8))

print("\nGeoTIFF outputs saved:")
print(OVERLAP_RUNOFF_PATH)
print(POSITIVE_RUNOFF_PATH)
print(OVERLAP_MASK_PATH)



# ============================================================
# 9. DISPLAY FULL STUDY AREA AND ENCROACHMENT OVERLAYS
# ============================================================

from matplotlib.colors import TwoSlopeNorm
from matplotlib.patches import Patch


def save_map(fig, filename):
    """Save a figure for the frontend without opening a GUI window."""
    output_path = OUTPUT_DIR / filename
    fig.tight_layout()
    fig.savefig(
        output_path,
        dpi=300,
        bbox_inches="tight",
        facecolor="white",
    )
    print("Display saved:", output_path)
    plt.close(fig)


# ------------------------------------------------------------
# Prepare valid runoff data
# ------------------------------------------------------------

runoff_display = np.where(
    runoff_valid,
    runoff,
    np.nan,
)

max_abs = float(np.nanmax(np.abs(runoff_display)))

if max_abs == 0:
    max_abs = 1.0

runoff_norm = TwoSlopeNorm(
    vmin=-max_abs,
    vcenter=0,
    vmax=max_abs,
)

# Mask potential encroachment cells outside the study area.
potential_display = np.where(
    potential_mask & runoff_valid,
    1.0,
    np.nan,
)

positive_all = runoff_valid & (runoff > 0)

positive_within_encroachment = (
    overlap & (runoff > 0)
)


# ============================================================
# MAP 1: FULL STUDY AREA RUNOFF CHANGE
# ============================================================

fig, ax = plt.subplots(figsize=(12, 8))

image = ax.imshow(
    np.ma.masked_invalid(runoff_display),
    cmap="RdBu_r",
    norm=runoff_norm,
    interpolation="nearest",
)

fig.colorbar(
    image,
    ax=ax,
    label="Runoff change (mm): 2024 minus 2017",
    shrink=0.8,
)

ax.set_title(
    "Full Study Area: Runoff Change (2024 - 2017)"
)
ax.set_xlabel("Raster column")
ax.set_ylabel("Raster row")

save_map(fig, "01_full_study_area_runoff_change.png")


# ============================================================
# MAP 2: POTENTIAL ENCROACHMENT CELLS
# ============================================================

fig, ax = plt.subplots(figsize=(12, 8))

# Show the entire study area as a neutral background.
background = np.where(runoff_valid, 0.0, np.nan)

ax.imshow(
    np.ma.masked_invalid(background),
    cmap="Greys",
    vmin=0,
    vmax=1,
    interpolation="nearest",
)

# Highlight all potential encroachment cells.
encroachment_layer = np.ma.masked_invalid(
    potential_display
)

ax.imshow(
    encroachment_layer,
    cmap="autumn",
    vmin=0,
    vmax=1,
    interpolation="nearest",
    alpha=0.9,
)

ax.set_title(
    "Potential Encroachment Cells Across the Study Area"
)
ax.set_xlabel("Raster column")
ax.set_ylabel("Raster row")

ax.legend(
    handles=[
        Patch(
            facecolor="orange",
            label="Potential encroachment",
        ),
        Patch(
            facecolor="lightgray",
            label="Other valid study area",
        ),
    ],
    loc="upper right",
)

save_map(fig, "02_potential_encroachment_area.png")


# ============================================================
# MAP 3: RUNOFF CHANGE WITH ENCROACHMENT OVERLAY
# ============================================================

fig, ax = plt.subplots(figsize=(12, 8))

image = ax.imshow(
    np.ma.masked_invalid(runoff_display),
    cmap="RdBu_r",
    norm=runoff_norm,
    interpolation="nearest",
)

fig.colorbar(
    image,
    ax=ax,
    label="Runoff change (mm)",
    shrink=0.8,
)

# Highlight potential encroachment cells in yellow.
encroachment_overlay = np.ma.masked_where(
    ~(potential_mask & runoff_valid),
    np.ones(runoff_shape, dtype=np.float32),
)

ax.imshow(
    encroachment_overlay,
    cmap="Wistia",
    vmin=0,
    vmax=1,
    alpha=0.75,
    interpolation="nearest",
)

ax.set_title(
    "Runoff Change with Potential Encroachment Overlay"
)
ax.set_xlabel("Raster column")
ax.set_ylabel("Raster row")

ax.legend(
    handles=[
        Patch(
            facecolor="yellow",
            label="Potential encroachment",
        ),
        Patch(
            facecolor="red",
            label="Positive runoff change (background map)",
        ),
        Patch(
            facecolor="blue",
            label="Negative runoff change (background map)",
        ),
    ],
    loc="upper right",
)

save_map(fig, "03_runoff_change_encroachment_overlay.png")


# ============================================================
# MAP 4: POSITIVE RUNOFF INCREASE ACROSS THE FULL STUDY AREA
# ============================================================

fig, ax = plt.subplots(figsize=(12, 8))

positive_values_all = np.where(
    positive_all,
    runoff,
    np.nan,
)

positive_max = (
    float(np.nanmax(positive_values_all))
    if np.any(positive_all)
    else 1.0
)

image = ax.imshow(
    np.ma.masked_invalid(positive_values_all),
    cmap="YlOrRd",
    vmin=0,
    vmax=max(positive_max, 1e-6),
    interpolation="nearest",
)

fig.colorbar(
    image,
    ax=ax,
    label="Positive runoff increase (mm)",
    shrink=0.8,
)

ax.set_title(
    "Cells with Positive Runoff Increase - Full Study Area"
)
ax.set_xlabel("Raster column")
ax.set_ylabel("Raster row")

save_map(fig, "04_positive_runoff_increase_full_area.png")


# ============================================================
# MAP 5: POSITIVE INCREASE INSIDE POTENTIAL ENCROACHMENT
# ============================================================

fig, ax = plt.subplots(figsize=(12, 8))

# Show potential encroachment cells in a pale background.
ax.imshow(
    np.ma.masked_invalid(potential_display),
    cmap="Greys",
    vmin=0,
    vmax=1,
    interpolation="nearest",
    alpha=0.5,
)

positive_overlap_display = np.where(
    positive_within_encroachment,
    runoff,
    np.nan,
)

if np.any(positive_within_encroachment):
    positive_overlap_max = float(
        np.nanmax(positive_overlap_display)
    )

    image = ax.imshow(
        np.ma.masked_invalid(positive_overlap_display),
        cmap="Reds",
        vmin=0,
        vmax=max(positive_overlap_max, 1e-6),
        interpolation="nearest",
    )

    fig.colorbar(
        image,
        ax=ax,
        label="Positive runoff increase (mm)",
        shrink=0.8,
    )
else:
    ax.text(
        0.5,
        0.5,
        "No positive runoff increase in the overlap",
        transform=ax.transAxes,
        ha="center",
        va="center",
        fontsize=13,
    )

ax.set_title(
    "Positive Runoff Increase Within Potential Encroachment"
)
ax.set_xlabel("Raster column")
ax.set_ylabel("Raster row")

ax.legend(
    handles=[
        Patch(
            facecolor="lightgray",
            label="Potential encroachment",
        ),
        Patch(
            facecolor="red",
            label="Positive runoff increase",
        ),
    ],
    loc="upper right",
)

save_map(fig, "05_positive_increase_within_encroachment.png")


# ============================================================
# DISPLAY SUMMARY
# ============================================================

print("\n" + "=" * 60)
print("DISPLAY SUMMARY")
print("=" * 60)
print("Full valid runoff cells:", int(runoff_valid.sum()))
print("Potential encroachment cells:", int(potential_mask.sum()))
print("Overlapping valid cells:", int(overlap.sum()))
print("Positive runoff cells in full study area:", int(positive_all.sum()))
print(
    "Positive runoff cells within potential encroachment:",
    int(positive_within_encroachment.sum()),
)
print("\nAll five display images saved in:")
print(OUTPUT_DIR)


# ============================================================
# 10. SAVE DISPLAYABLE 3-BAND RGB GEOTIFFS FOR FRONTEND
# ============================================================

from matplotlib import colormaps


def colorize(values, cmap_name, vmin, vmax, valid_mask):
    """Convert a numeric raster into an RGB uint8 array."""
    cmap = colormaps[cmap_name]
    if vmax <= vmin:
        vmax = vmin + 1.0
    normalized = np.clip((values - vmin) / (vmax - vmin), 0, 1)
    rgba = cmap(normalized)
    rgb = (rgba[..., :3] * 255).astype(np.uint8)
    # White background outside the valid study area.
    rgb[~valid_mask] = (255, 255, 255)
    return rgb


def save_rgb_geotiff(path, rgb):
    """Save a georeferenced, three-band RGB GeoTIFF."""
    rgb_profile = runoff_profile.copy()
    rgb_profile.update(
        driver="GTiff",
        count=3,
        dtype="uint8",
        nodata=None,
        compress="lzw",
        photometric="RGB",
        height=runoff_shape[0],
        width=runoff_shape[1],
        transform=runoff_transform,
        crs=runoff_crs,
    )
    with rasterio.open(path, "w", **rgb_profile) as dst:
        dst.write(rgb[:, :, 0], 1)
        dst.write(rgb[:, :, 1], 2)
        dst.write(rgb[:, :, 2], 3)
        dst.set_band_description(1, "Red")
        dst.set_band_description(2, "Green")
        dst.set_band_description(3, "Blue")
        dst.update_tags(
            COLOR_INTERPRETATION="RGB",
            SOURCE="Runoff and potential encroachment analysis",
        )
    print("RGB GeoTIFF saved:", path)


# Use a symmetric scale for positive/negative runoff change.
rgb_max_abs = float(np.nanmax(np.abs(runoff[runoff_valid])))
if not np.isfinite(rgb_max_abs) or rgb_max_abs == 0:
    rgb_max_abs = 1.0

# 1. Full study area runoff change: blue = decrease, red = increase.
rgb_runoff_change = colorize(
    np.nan_to_num(runoff, nan=0.0),
    "RdBu_r",
    -rgb_max_abs,
    rgb_max_abs,
    runoff_valid,
)
save_rgb_geotiff(
    OUTPUT_DIR / "rgb_01_full_study_area_runoff_change.tif",
    rgb_runoff_change,
)

# 2. Potential encroachment: gray study area, orange candidate cells.
rgb_potential = np.full((*runoff_shape, 3), 255, dtype=np.uint8)
rgb_potential[runoff_valid] = (220, 220, 220)
rgb_potential[potential_mask & runoff_valid] = (255, 140, 0)
save_rgb_geotiff(
    OUTPUT_DIR / "rgb_02_potential_encroachment.tif",
    rgb_potential,
)

# 3. Runoff change with potential encroachment highlighted yellow.
rgb_overlay = colorize(
    np.nan_to_num(runoff, nan=0.0),
    "RdBu_r",
    -rgb_max_abs,
    rgb_max_abs,
    runoff_valid,
)
rgb_overlay[potential_mask & runoff_valid] = (255, 230, 0)
save_rgb_geotiff(
    OUTPUT_DIR / "rgb_03_runoff_change_encroachment_overlay.tif",
    rgb_overlay,
)

# 4. Positive runoff increase across the full study area.
positive_values = np.maximum(np.nan_to_num(runoff, nan=0.0), 0.0)
positive_max = float(np.max(positive_values[runoff_valid])) if runoff_valid.any() else 1.0
if positive_max <= 0:
    positive_max = 1.0
rgb_positive = colorize(
    positive_values,
    "YlOrRd",
    0.0,
    positive_max,
    runoff_valid,
)
# Mark cells without an increase in light gray to make them distinguishable.
rgb_positive[runoff_valid & (runoff <= 0)] = (235, 235, 235)
save_rgb_geotiff(
    OUTPUT_DIR / "rgb_04_positive_runoff_increase_full_area.tif",
    rgb_positive,
)

# 5. Positive runoff increase within potential encroachment candidates.
rgb_overlap = np.full((*runoff_shape, 3), 255, dtype=np.uint8)
rgb_overlap[potential_mask & runoff_valid] = (215, 215, 215)
if positive_within_encroachment.any():
    overlap_max = float(np.max(runoff[positive_within_encroachment]))
    if overlap_max <= 0:
        overlap_max = 1.0
    rgb_overlap_values = colorize(
        np.nan_to_num(runoff, nan=0.0),
        "Reds",
        0.0,
        overlap_max,
        positive_within_encroachment,
    )
    rgb_overlap[positive_within_encroachment] = rgb_overlap_values[
        positive_within_encroachment
    ]
save_rgb_geotiff(
    OUTPUT_DIR / "rgb_05_positive_increase_within_encroachment.tif",
    rgb_overlap,
)

print("\\nAll frontend RGB GeoTIFFs saved in:", OUTPUT_DIR)


# ============================================================
# 11. FINISH
# ============================================================

print("\n" + "=" * 65)
print("ANALYSIS COMPLETED")
print("=" * 65)
print("All outputs are in:")
print(OUTPUT_DIR)
print("\nCSV:")
print(SUMMARY_CSV)
print("\nDisplay PNGs:")
print(OUTPUT_DIR / "display_runoff_change.png")
print(OUTPUT_DIR / "display_positive_runoff_increase.png")
print(OUTPUT_DIR / "display_encroachment_runoff_overlap.png")

print(
    "\nNote: These results show spatial association based on the "
    "chosen runoff model and CN assumptions. They do not prove "
    "that potential encroachment caused flooding."
)
