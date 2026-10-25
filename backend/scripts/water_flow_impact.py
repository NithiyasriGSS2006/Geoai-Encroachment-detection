
import os
from pathlib import Path

import geopandas as gpd
import matplotlib
import numpy as np
import rasterio

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from rasterio.features import rasterize
from rasterio.warp import reproject, Resampling
from scipy.ndimage import distance_transform_edt
from whitebox.whitebox_tools import WhiteboxTools


# ==========================================================
# 1. INPUT PATHS
# ==========================================================

PROJECT = Path(__file__).resolve().parents[2]
BACKEND_DATA = Path(
    os.environ.get("GEOAI_DATA_DIR", PROJECT / "backend" / "data")
)

DEM_PATH = PROJECT / "backend" / "data" / "dem" / "Velachery_DEM.tif"

DRAIN_PATH = (
    BACKEND_DATA / "drainage" /
    "gcc_velachery_drainages.geojson"
)

POTENTIAL_PATH = (
    BACKEND_DATA / "gisoutputs" / "potential_encroachment" /
    "potential_encroachment_2017_2024.tif" 
)

OUTPUT_DIR = Path(
    os.environ.get(
        "WATER_FLOW_IMPACT_DIR",
        BACKEND_DATA / "gisoutputs" / "water_flow_impact",
    )
)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Distance threshold for proximity analysis.
# This is an initial screening distance, not a validated
# stormwater-drain impact distance.
DRAIN_BUFFER_METERS = 30.0

wbt = WhiteboxTools()
wbt.set_working_dir(str(OUTPUT_DIR))


# ==========================================================
# 2. CHECK INPUTS
# ==========================================================

for path in [DEM_PATH, DRAIN_PATH, POTENTIAL_PATH]:
    if not path.exists():
        raise FileNotFoundError(f"Input not found: {path}")

print("All input files found.")


# ==========================================================
# 3. READ DEM
# ==========================================================

with rasterio.open(DEM_PATH) as dem_src:
    dem = dem_src.read(1).astype(np.float32)
    profile = dem_src.profile.copy()
    transform = dem_src.transform
    dem_crs = dem_src.crs
    height = dem_src.height
    width = dem_src.width
    dem_nodata = dem_src.nodata

if dem_crs is None:
    raise ValueError("DEM has no CRS.")

if not dem_crs.is_projected:
    raise ValueError(
        "Use a projected DEM with metre units for distance analysis."
    )

# Valid DEM cells
valid_dem = np.isfinite(dem)

if dem_nodata is not None:
    valid_dem &= dem != dem_nodata

if not np.any(valid_dem):
    raise ValueError("DEM contains no valid elevation cells.")

# Save a cleaned DEM for hydrological processing
dem_clean = np.where(valid_dem, dem, -9999.0).astype(np.float32)

dem_profile = profile.copy()
dem_profile.update(
    driver="GTiff",
    dtype="float32",
    count=1,
    nodata=-9999.0,
    compress="lzw"
)

clean_dem_path = OUTPUT_DIR / "dem_for_hydrology.tif"

with rasterio.open(clean_dem_path, "w", **dem_profile) as dst:
    dst.write(dem_clean, 1)

print("DEM loaded:", width, "x", height)


# ==========================================================
# 4. LOAD GCC DRAINAGE NETWORK
# ==========================================================

drains = gpd.read_file(DRAIN_PATH)

if drains.empty:
    raise ValueError(
        "The GCC drainage GeoJSON contains no features."
    )

if drains.crs is None:
    raise ValueError(
        "Drainage layer has no CRS. Assign its correct CRS first."
    )

# Reproject vector lines to DEM CRS
drains = drains.to_crs(dem_crs)

# Keep only drainage lines intersecting the DEM extent
dem_bounds = rasterio.coords.BoundingBox(
    *rasterio.transform.array_bounds(
        height, width, transform
    )
)

from shapely.geometry import box

dem_extent = gpd.GeoDataFrame(
    geometry=[
        box(
            dem_bounds.left,
            dem_bounds.bottom,
            dem_bounds.right,
            dem_bounds.top
        )
    ],
    crs=dem_crs
)

drains = gpd.clip(drains, dem_extent)

if drains.empty:
    raise ValueError(
        "No drainage lines overlap the DEM. Check AOI and CRS."
    )

print("GCC drainage features in DEM extent:", len(drains))


# ==========================================================
# 5. RASTERIZE GCC DRAINAGE NETWORK
# ==========================================================

drain_geometries = [
    geom for geom in drains.geometry
    if geom is not None and not geom.is_empty
]

drain_raster = rasterize(
    [(geom, 1) for geom in drain_geometries],
    out_shape=(height, width),
    transform=transform,
    fill=0,
    all_touched=True,
    dtype="uint8"
)

drain_raster_path = OUTPUT_DIR / "gcc_drainage_raster.tif"

uint8_profile = profile.copy()
uint8_profile.update(
    driver="GTiff",
    dtype="uint8",
    count=1,
    nodata=0,
    compress="lzw"
)

with rasterio.open(drain_raster_path, "w", **uint8_profile) as dst:
    dst.write(drain_raster, 1)

print("GCC drainage raster saved.")


# ==========================================================
# 6. DISTANCE FROM EACH CELL TO GCC DRAINAGE
# ==========================================================

# Pixel dimensions in metres
pixel_x = abs(transform.a)
pixel_y = abs(transform.e)

if pixel_x <= 0 or pixel_y <= 0:
    raise ValueError("Invalid DEM pixel dimensions.")

# Distance transform measures distance to the nearest
# rasterized drainage cell.
distance_to_drain = distance_transform_edt(
    drain_raster == 0,
    sampling=(pixel_y, pixel_x)
).astype(np.float32)

distance_to_drain[~valid_dem] = -9999.0

distance_path = OUTPUT_DIR / "distance_to_gcc_drain_m.tif"

distance_profile = profile.copy()
distance_profile.update(
    driver="GTiff",
    dtype="float32",
    count=1,
    nodata=-9999.0,
    compress="lzw"
)

with rasterio.open(distance_path, "w", **distance_profile) as dst:
    dst.write(distance_to_drain, 1)

print("Distance-to-drain raster saved.")


# ==========================================================
# 7. ALIGN POTENTIAL ENCROACHMENT TO DEM GRID
# ==========================================================

with rasterio.open(POTENTIAL_PATH) as src:
    potential_source = src.read(1)
    potential_profile = src.profile.copy()

potential_aligned = np.zeros(
    (height, width), dtype=np.uint8
)

# Track which DEM cells are actually covered by the
# source potential-encroachment raster.
source_coverage = np.ones(
    potential_source.shape, dtype=np.uint8
)

coverage_aligned = np.zeros(
    (height, width), dtype=np.uint8
)

reproject(
    source=potential_source,
    destination=potential_aligned,
    src_transform=potential_profile["transform"],
    src_crs=potential_profile["crs"],
    src_nodata=potential_profile.get("nodata"),
    dst_transform=transform,
    dst_crs=dem_crs,
    dst_nodata=0,
    resampling=Resampling.nearest
)

reproject(
    source=source_coverage,
    destination=coverage_aligned,
    src_transform=potential_profile["transform"],
    src_crs=potential_profile["crs"],
    dst_transform=transform,
    dst_crs=dem_crs,
    dst_nodata=0,
    resampling=Resampling.nearest
)

potential_mask = potential_aligned > 0
valid_analysis = valid_dem & (coverage_aligned > 0)

# Potential encroachment close to mapped GCC drainage
near_drain = (
    (distance_to_drain <= DRAIN_BUFFER_METERS)
    & valid_analysis
)

potential_near_drain = (
    potential_mask & near_drain & valid_analysis
)

# 0 = no flagged potential encroachment near a drain
# 255 = potential encroachment within the chosen distance
impact = np.zeros((height, width), dtype=np.uint8)
impact[potential_near_drain] = 255
impact[~valid_analysis] = 0

impact_path = OUTPUT_DIR / "potential_encroachment_near_drain.tif"

with rasterio.open(impact_path, "w", **uint8_profile) as dst:
    dst.write(impact, 1)

print("Potential encroachment near drains saved.")


# ==========================================================
# 8. DERIVE TERRAIN FLOW DIRECTION AND ACCUMULATION
# ==========================================================

filled_dem_path = OUTPUT_DIR / "dem_filled.tif"
slope_path = OUTPUT_DIR / "slope_degrees.tif"
flow_direction_path = OUTPUT_DIR / "flow_direction.tif"
flow_accumulation_path = OUTPUT_DIR / "flow_accumulation.tif"

# Fill small DEM depressions for terrain hydrology
wbt.fill_depressions(
    str(clean_dem_path),
    str(filled_dem_path)
)

wbt.slope(
    str(filled_dem_path),
    str(slope_path),
    units="degrees"
)

wbt.d8_pointer(
    str(filled_dem_path),
    str(flow_direction_path)
)

wbt.d8_flow_accumulation(
    str(filled_dem_path),
    str(flow_accumulation_path),
    out_type="cells",
    log=False,
    clip=False
)

for path in [
    filled_dem_path,
    slope_path,
    flow_direction_path,
    flow_accumulation_path
]:
    if not path.exists():
        raise RuntimeError(
            f"Hydrology output was not created: {path}"
        )

print("Terrain flow products created.")


# ==========================================================
# 9. IDENTIFY HIGH-FLOW-ACCUMULATION AREAS
# ==========================================================

with rasterio.open(flow_accumulation_path) as src:
    flow_acc = src.read(1).astype(np.float32)
    flow_nodata = src.nodata

with rasterio.open(slope_path) as src:
    slope = src.read(1).astype(np.float32)
    slope_nodata = src.nodata

# Terrain validity is independent of potential encroachment.
flow_valid = np.isfinite(flow_acc)

if flow_nodata is not None:
    flow_valid &= flow_acc != flow_nodata

flow_valid &= flow_acc >= 0

slope_valid = np.isfinite(slope)

if slope_nodata is not None:
    slope_valid &= slope != slope_nodata

# Distance to drains must also be valid.
distance_valid = np.isfinite(distance_to_drain)

# Combine terrain and drainage validity.
terrain_valid = flow_valid & slope_valid & distance_valid

if not np.any(terrain_valid):
    raise ValueError("No valid terrain cells found.")

# Use the 90th percentile across valid terrain cells.
flow_threshold = np.percentile(
    flow_acc[flow_valid], 90
)

high_flow = (flow_acc >= flow_threshold) & flow_valid

# Keep this overlap output restricted to the study's
# potential-encroachment analysis area.
flow_drain_overlap = (
    high_flow
    & (drain_raster == 1)
    & valid_analysis
)

overlap_path = OUTPUT_DIR / "terrain_flow_gcc_drain_overlap.tif"

overlap_output = np.zeros((height, width), dtype=np.uint8)
overlap_output[flow_drain_overlap] = 255

with rasterio.open(overlap_path, "w", **uint8_profile) as dst:
    dst.write(overlap_output, 1)

print("Terrain-flow and GCC-drain overlap saved.")


# ==========================================================
# 10. COMBINED OVERALL FLOOD VULNERABILITY SCORE
# ==========================================================

# Factors and weights:
# Flow accumulation                  = 20%
# Low slope                          = 15%
# Proximity to GCC drains            = 15%
# Positive runoff change             = 25%
# Encroachment-related runoff increase = 25%
#
# Total = 100%
#
# Classes:
# 0 = NoData
# 1 = Low
# 2 = Moderate
# 3 = High (includes previous High + Very High)


# ----------------------------------------------------------
# A. INPUT PATHS
# ----------------------------------------------------------

RUNOFF_CHANGE_PATH = (
    BACKEND_DATA / "gisoutputs" / "runoff_comparison"
    / "runoff_change_2024_minus_2017_mm.tif"
)

ENCROACHMENT_RUNOFF_PATH = (
    BACKEND_DATA / "gisoutputs" / "encroachment_runoff"
    / "positive_runoff_increase_within_encroachment_mm.tif"
)

COMBINED_OUTPUT_DIR = (
    BACKEND_DATA / "gisoutputs" / "overall_flood_vulnerability"
)
COMBINED_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


# ----------------------------------------------------------
# B. ALIGN INPUT RASTERS TO THE DEM GRID
# ----------------------------------------------------------

def align_to_dem_grid(input_path, resampling=Resampling.bilinear):
    """
    Align a raster to the DEM grid.

    Bilinear: continuous data such as runoff.
    Nearest: categorical data such as masks.
    Uncovered cells are assigned NaN.
    """

    if not input_path.exists():
        raise FileNotFoundError(
            f"Required input raster not found: {input_path}"
        )

    with rasterio.open(input_path) as src:

        if src.crs is None:
            raise ValueError(
                f"Input raster has no CRS: {input_path}"
            )

        source = src.read(1).astype(np.float32)
        source_valid = np.isfinite(source)

        if src.nodata is not None:
            source_valid &= source != src.nodata

        source_clean = np.where(
            source_valid, source, np.nan
        ).astype(np.float32)

        destination = np.full(
            (height, width), np.nan, dtype=np.float32
        )

        reproject(
            source=source_clean,
            destination=destination,
            src_transform=src.transform,
            src_crs=src.crs,
            src_nodata=np.nan,
            dst_transform=transform,
            dst_crs=dem_crs,
            dst_nodata=np.nan,
            resampling=resampling,
            init_dest_nodata=True
        )

    return destination


# ----------------------------------------------------------
# C. LOAD RUNOFF CHANGE AND ENCROACHMENT-RUNOFF RASTERS
# ----------------------------------------------------------

runoff_change = align_to_dem_grid(
    RUNOFF_CHANGE_PATH,
    Resampling.bilinear
)

encroachment_runoff = align_to_dem_grid(
    ENCROACHMENT_RUNOFF_PATH,
    Resampling.bilinear
)

runoff_valid = (
    terrain_valid & np.isfinite(runoff_change)
)

encroachment_runoff_valid = (
    terrain_valid & np.isfinite(encroachment_runoff)
)

# Keep only positive runoff changes.
positive_runoff = np.zeros(
    (height, width), dtype=np.float32
)

positive_runoff[runoff_valid] = np.maximum(
    runoff_change[runoff_valid], 0.0
)

positive_encroachment_runoff = np.zeros(
    (height, width), dtype=np.float32
)

positive_encroachment_runoff[
    encroachment_runoff_valid
] = np.maximum(
    encroachment_runoff[encroachment_runoff_valid],
    0.0
)


# ----------------------------------------------------------
# D. NORMALIZATION FUNCTION
# ----------------------------------------------------------

def normalize_positive(values, valid_mask):
    """
    Normalize non-negative values to 0-1 using the
    95th percentile to limit the influence of outliers.
    """

    result = np.zeros(
        (height, width), dtype=np.float32
    )

    valid = valid_mask & np.isfinite(values)

    if not np.any(valid):
        return result

    values_valid = np.maximum(values[valid], 0.0)
    upper_limit = np.percentile(values_valid, 95)

    if upper_limit > 0:
        result[valid] = np.clip(
            values_valid / upper_limit,
            0.0,
            1.0
        )

    return result


# ----------------------------------------------------------
# E. FACTOR 1: FLOW ACCUMULATION (20%)
# ----------------------------------------------------------

flow_log = np.zeros(
    (height, width), dtype=np.float32
)

flow_log[flow_valid] = np.log1p(
    np.maximum(flow_acc[flow_valid], 0.0)
)

flow_norm = normalize_positive(
    flow_log,
    flow_valid
)


# ----------------------------------------------------------
# F. FACTOR 2: LOW SLOPE (15%)
# ----------------------------------------------------------

slope_norm = np.zeros(
    (height, width), dtype=np.float32
)

slope_min = np.min(slope[slope_valid])
slope_max = np.max(slope[slope_valid])

if slope_max > slope_min:
    slope_norm[slope_valid] = np.clip(
        (slope[slope_valid] - slope_min)
        / (slope_max - slope_min),
        0.0,
        1.0
    )

# Flatter terrain receives a higher screening score.
low_slope_score = 1.0 - slope_norm


# ----------------------------------------------------------
# G. FACTOR 3: PROXIMITY TO GCC DRAINS (15%)
# ----------------------------------------------------------

proximity_score = np.zeros(
    (height, width), dtype=np.float32
)

proximity_score[distance_valid] = np.clip(
    1.0
    - distance_to_drain[distance_valid] / 300.0,
    0.0,
    1.0
)


# ----------------------------------------------------------
# H. FACTOR 4: POSITIVE RUNOFF CHANGE (25%)
# ----------------------------------------------------------

runoff_score = normalize_positive(
    positive_runoff,
    runoff_valid
)


# ----------------------------------------------------------
# I. FACTOR 5: ENCROACHMENT-RELATED RUNOFF INCREASE (25%)
# ----------------------------------------------------------

encroachment_score = normalize_positive(
    positive_encroachment_runoff,
    encroachment_runoff_valid
)


# ----------------------------------------------------------
# J. CALCULATE ONE COMBINED SCORE
# ----------------------------------------------------------

overall_score = (
    0.20 * flow_norm
    + 0.15 * low_slope_score
    + 0.15 * proximity_score
    + 0.25 * runoff_score
    + 0.25 * encroachment_score
)

score_valid = (
    valid_dem
    & flow_valid
    & slope_valid
    & distance_valid
    & np.isfinite(overall_score)
)

overall_score[~score_valid] = np.nan


# ----------------------------------------------------------
# K. SAVE COMBINED CONTINUOUS SCORE
# ----------------------------------------------------------

score_path = (
    COMBINED_OUTPUT_DIR
    / "overall_flood_vulnerability_score.tif"
)

score_profile = profile.copy()
score_profile.update(
    driver="GTiff",
    dtype="float32",
    count=1,
    nodata=-9999.0,
    compress="lzw"
)

score_output = np.where(
    score_valid,
    overall_score,
    -9999.0
).astype(np.float32)

with rasterio.open(score_path, "w", **score_profile) as dst:
    dst.write(score_output, 1)
    dst.set_band_description(
        1, "Combined relative flood vulnerability score (0-1)"
    )

print("Combined score saved:", score_path)



# Three-class exploratory vulnerability classification
# 0 = NoData, 1 = Low, 2 = Moderate, 3 = High

LOW_THRESHOLD = 0.20
HIGH_THRESHOLD = 0.40

vulnerability = np.zeros(
    overall_score.shape,
    dtype=np.uint8
)

vulnerability[
    score_valid & (overall_score < LOW_THRESHOLD)
] = 1

vulnerability[
    score_valid
    & (overall_score >= LOW_THRESHOLD)
    & (overall_score < HIGH_THRESHOLD)
] = 2

vulnerability[
    score_valid & (overall_score >= HIGH_THRESHOLD)
] = 3

# ----------------------------------------------------------
# M. SAVE THREE-CLASS VULNERABILITY RASTER
# ----------------------------------------------------------

class_path = (
    COMBINED_OUTPUT_DIR
    / "overall_flood_vulnerability_class.tif"
)

class_profile = profile.copy()
class_profile.update(
    driver="GTiff",
    dtype="uint8",
    count=1,
    nodata=0,
    compress="lzw"
)

with rasterio.open(class_path, "w", **class_profile) as dst:
    dst.write(vulnerability, 1)
    dst.set_band_description(
        1, "1=Low, 2=Moderate, 3=High"
    )

print("Three-class vulnerability raster saved:", class_path)

overall_vulnerability_path = OUTPUT_DIR / "overall_flood_vulnerability.tif"
with rasterio.open(overall_vulnerability_path, "w", **class_profile) as dst:
    dst.write(vulnerability, 1)
    dst.set_band_description(1, "1=Low, 2=Moderate, 3=High")

print("Overall flood vulnerability raster saved:", overall_vulnerability_path)


# ----------------------------------------------------------
# N. CREATE DISPLAY-READY RGB GEOTIFF
# ----------------------------------------------------------

vulnerability_colors = {
    0: (255, 255, 255),  # NoData - white
    1: (0, 170, 0),      # Low - green
    2: (255, 220, 0),    # Moderate - yellow
    3: (220, 0, 0)       # High - red
}

rgb = np.zeros(
    (3, height, width), dtype=np.uint8
)

for class_value, color in vulnerability_colors.items():
    mask = vulnerability == class_value

    for band in range(3):
        rgb[band][mask] = color[band]

rgb_path = (
    COMBINED_OUTPUT_DIR
    / "overall_flood_vulnerability_class_RGB.tif"
)

rgb_profile = profile.copy()
rgb_profile.update(
    driver="GTiff",
    dtype="uint8",
    count=3,
    nodata=None,
    compress="lzw",
    photometric="RGB"
)

with rasterio.open(rgb_path, "w", **rgb_profile) as dst:
    dst.write(rgb)
    dst.set_band_description(1, "Red")
    dst.set_band_description(2, "Green")
    dst.set_band_description(3, "Blue")

print("RGB vulnerability map saved:", rgb_path)


# ----------------------------------------------------------
# O. CREATE PNG PREVIEW
# ----------------------------------------------------------

from matplotlib.colors import ListedColormap

preview_path = (
    COMBINED_OUTPUT_DIR
    / "overall_flood_vulnerability_class.png"
)

class_cmap = ListedColormap([
    "white",
    "green",
    "yellow",
    "red"
])

fig, ax = plt.subplots(figsize=(12, 7))

display_data = np.ma.masked_where(
    vulnerability == 0,
    vulnerability
)

image = ax.imshow(
    display_data,
    cmap=class_cmap,
    vmin=0.5,
    vmax=3.5,
    interpolation="nearest"
)

colorbar = fig.colorbar(
    image,
    ax=ax,
    ticks=[1, 2, 3]
)

colorbar.ax.set_yticklabels([
    "Low",
    "Moderate",
    "High"
])

ax.set_title(
    "Velachery - Combined Relative Flood Vulnerability"
)
ax.axis("off")

fig.tight_layout()
fig.savefig(
    preview_path,
    dpi=200,
    bbox_inches="tight"
)
plt.close(fig)

print("PNG preview saved:", preview_path)


# ----------------------------------------------------------
# P. SUMMARY
# ----------------------------------------------------------

print("\n========== COMBINED FLOOD VULNERABILITY ==========")
print("Flow accumulation weight:             20%")
print("Low slope weight:                     15%")
print("Drain proximity weight:               15%")
print("Positive runoff change weight:         25%")
print("Encroachment-runoff increase weight:   25%")
print("Total weight:                         100%")
print("Valid output cells:", int(np.count_nonzero(score_valid)))
print("Low class:", int(np.count_nonzero(vulnerability == 1)))
print("Moderate class:", int(np.count_nonzero(vulnerability == 2)))
print("High class:", int(np.count_nonzero(vulnerability == 3)))
print("Combined score:", score_path)
print("Class raster:", class_path)
print("RGB raster:", rgb_path)
print("PNG preview:", preview_path)
print("Output folder:", COMBINED_OUTPUT_DIR.resolve())
print("==================================================")
# ==========================================================
# 11. SUMMARY
# ==========================================================

print("\n========== MODULE 06 SUMMARY ==========")
print("GCC drainage features:", len(drains))
print("DEM pixel size (m):", pixel_x, "x", pixel_y)
print("Drain proximity threshold (m):", DRAIN_BUFFER_METERS)
print("Flow accumulation threshold (cells):", flow_threshold)
print(
    "Potential encroachment pixels near drains:",
    int(np.count_nonzero(potential_near_drain))
)
print(
    "Terrain-flow/GCC-drain overlap pixels:",
    int(np.count_nonzero(flow_drain_overlap))
)
print("Output folder:", OUTPUT_DIR.resolve())
print("========================================")

# ==========================================================
# 12. CREATE DISPLAY-READY GEOTIFF LAYERS
# Original analytical TIFFs remain unchanged.
# ==========================================================

def save_rgb_geotiff(input_path, output_path, color_map):
    """
    Convert a categorical raster into a 3-band RGB GeoTIFF.
    Preserves the original raster CRS, transform and dimensions.
    """
    with rasterio.open(input_path) as src:
        data = src.read(1)
        profile = src.profile.copy()
        nodata = src.nodata

        valid = np.isfinite(data)
        if nodata is not None:
            valid &= data != nodata

        rgb = np.zeros(
            (3, src.height, src.width),
            dtype=np.uint8
        )

        for value, color in color_map.items():
            mask = valid & (data == value)

            for band in range(3):
                rgb[band][mask] = color[band]

        # Keep the same georeferencing and extent.
        profile.update(
            driver="GTiff",
            count=3,
            dtype="uint8",
            nodata=None,
            compress="lzw",
            photometric="RGB"
        )

        with rasterio.open(output_path, "w", **profile) as dst:
            dst.write(rgb)
            dst.set_band_description(1, "Red")
            dst.set_band_description(2, "Green")
            dst.set_band_description(3, "Blue")

    print("Created:", output_path)


# ----------------------------------------------------------
# A. FLOW DIRECTION DISPLAY
# Whitebox D8 direction codes
# ----------------------------------------------------------

flow_direction_colors = {
    1:   (255, 0, 0),       # East
    2:   (255, 165, 0),     # Northeast
    4:   (255, 255, 0),     # North
    8:   (0, 200, 0),       # Northwest
    16:  (0, 200, 255),     # West
    32:  (0, 0, 255),      # Southwest
    64:  (160, 32, 240),   # South
    128: (255, 0, 255)     # Southeast
}

save_rgb_geotiff(
    OUTPUT_DIR / "flow_direction.tif",
    OUTPUT_DIR / "flow_direction_display.tif",
    flow_direction_colors
)


print("\nDisplay-ready flow direction layer created successfully.")


# ==========================================================
# 13. CREATE LOG-SCALED FLOW ACCUMULATION DISPLAY
# Original flow_accumulation.tif remains unchanged.
# ==========================================================

flow_accumulation_path = OUTPUT_DIR / "flow_accumulation.tif"
log_display_path = OUTPUT_DIR / "flow_accumulation_log_display.tif"

with rasterio.open(flow_accumulation_path) as src:
    flow_acc = src.read(1).astype(np.float32)
    flow_profile = src.profile.copy()
    flow_nodata = src.nodata

valid = np.isfinite(flow_acc) & (flow_acc >= 0)
if flow_nodata is not None:
    valid &= flow_acc != flow_nodata

if not np.any(valid):
    raise ValueError("No valid flow accumulation values found.")

log_flow = np.full(flow_acc.shape, -9999.0, dtype=np.float32)
log_flow[valid] = np.log1p(flow_acc[valid])

log_profile = flow_profile.copy()
log_profile.update(
    driver="GTiff",
    dtype="float32",
    count=1,
    nodata=-9999.0,
    compress="lzw",
)

with rasterio.open(log_display_path, "w", **log_profile) as dst:
    dst.write(log_flow, 1)
    dst.set_band_description(1, "log(1 + flow accumulation in cells)")

print("Log-scaled flow accumulation saved:", log_display_path)

preview_path = OUTPUT_DIR / "flow_accumulation_log_preview.png"
with rasterio.open(log_display_path) as src:
    preview_data = src.read(1, masked=True)

fig, ax = plt.subplots(figsize=(12, 7))
image = ax.imshow(preview_data, cmap="terrain")
fig.colorbar(image, ax=ax, label="log(1 + flow accumulation in cells)")
ax.set_title("Velachery - Log-Scaled Flow Accumulation")
ax.axis("off")
fig.tight_layout()
fig.savefig(preview_path, dpi=200, bbox_inches="tight")
plt.close(fig)

print("Flow accumulation preview saved:", preview_path)

# ==========================================================
# 14. DISPLAY INTERMEDIATE RESULTS
# ==========================================================

intermediate_layers = [
    ("Drainage network", drain_raster_path, "Blues"),
    ("Distance to drains (m)", distance_path, "viridis"),
    ("Encroachment near drains", impact_path, "Reds"),
    ("Slope (degrees)", slope_path, "terrain"),
    ("Log flow accumulation", log_display_path, "magma"),
    ("Overall vulnerability class", class_path, "RdYlGn_r"),
]

fig, axes = plt.subplots(2, 3, figsize=(16, 10))

for ax, (title, layer_path, cmap) in zip(axes.flat, intermediate_layers):
    with rasterio.open(layer_path) as src:
        layer = src.read(1, masked=True)

    if title == "Overall vulnerability class":
        layer = np.ma.masked_equal(layer, 0)

    image = ax.imshow(layer, cmap=cmap)
    ax.set_title(title)
    ax.axis("off")
    fig.colorbar(image, ax=ax, shrink=0.75)

fig.tight_layout()
intermediate_preview_path = OUTPUT_DIR / "intermediate_results.png"
fig.savefig(intermediate_preview_path, dpi=200, bbox_inches="tight")
plt.close(fig)
print("Intermediate results preview saved:", intermediate_preview_path)
