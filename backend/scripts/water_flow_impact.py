
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


# # ==========================================================
# # 9. IDENTIFY HIGH-FLOW-ACCUMULATION AREAS
# # ==========================================================

# with rasterio.open(flow_accumulation_path) as src:
#     flow_acc = src.read(1).astype(np.float32)
#     flow_nodata = src.nodata

# with rasterio.open(slope_path) as src:
#     slope = src.read(1).astype(np.float32)
#     slope_nodata = src.nodata

# flow_valid = valid_analysis & np.isfinite(flow_acc)
# if flow_nodata is not None:
#     flow_valid &= flow_acc != flow_nodata

# flow_valid &= flow_acc >= 0

# if not np.any(flow_valid):
#     raise ValueError("No valid flow accumulation cells found.")

# # Use the 90th percentile as an initial screening threshold
# flow_threshold = np.percentile(flow_acc[flow_valid], 90)

# high_flow = (flow_acc >= flow_threshold) & flow_valid

# # Terrain flow paths that overlap mapped drainage raster
# flow_drain_overlap = high_flow & (drain_raster == 1)

# overlap_path = OUTPUT_DIR / "terrain_flow_gcc_drain_overlap.tif"

# overlap_output = np.zeros((height, width), dtype=np.uint8)
# overlap_output[flow_drain_overlap] = 255
# overlap_output[~valid_analysis] = 0

# with rasterio.open(overlap_path, "w", **uint8_profile) as dst:
#     dst.write(overlap_output, 1)

# print("Terrain-flow and GCC-drain overlap saved.")


# # ==========================================================
# # 10. CREATE A PRELIMINARY RELATIVE FLOOD SCREENING MAP
# # ==========================================================

# # Normalize log flow accumulation
# flow_values = np.log1p(np.maximum(flow_acc, 0))
# valid_flow_values = flow_values[flow_valid]

# flow_min = valid_flow_values.min()
# flow_max = valid_flow_values.max()

# if flow_max > flow_min:
#     flow_norm = (flow_values - flow_min) / (flow_max - flow_min)
# else:
#     flow_norm = np.zeros_like(flow_values)

# # Normalize slope: flatter terrain receives a higher
# # screening score, but flatness alone does not prove flooding.
# slope_valid = valid_analysis & np.isfinite(slope)

# if slope_nodata is not None:
#     slope_valid &= slope != slope_nodata

# if not np.any(slope_valid):
#     raise ValueError("No valid slope cells found.")

# slope_min = np.min(slope[slope_valid])
# slope_max = np.max(slope[slope_valid])

# if slope_max > slope_min:
#     slope_norm = (slope - slope_min) / (slope_max - slope_min)
# else:
#     slope_norm = np.zeros_like(slope)

# # Combine terrain indicators and proximity to mapped drainage.
# # These weights are provisional and must be validated.
# proximity_score = np.clip(
#     1.0 - distance_to_drain / 300.0,
#     0.0,
#     1.0
# )

# score = (
#     0.40 * flow_norm
#     + 0.30 * (1.0 - slope_norm)
#     + 0.30 * proximity_score
# )

# score_valid = (
#     valid_analysis
#     & flow_valid
#     & slope_valid
#     & np.isfinite(score)
# )

# # 0 = NoData/outside valid analysis
# # 1 = Low, 2 = Moderate, 3 = High, 4 = Very high
# vulnerability = np.zeros(
#     (height, width), dtype=np.uint8
# )

# vulnerability[score_valid & (score < 0.25)] = 1
# vulnerability[
#     score_valid & (score >= 0.25) & (score < 0.50)
# ] = 2
# vulnerability[
#     score_valid & (score >= 0.50) & (score < 0.75)
# ] = 3
# vulnerability[score_valid & (score >= 0.75)] = 4

# vulnerability_path = OUTPUT_DIR / "relative_flood_vulnerability.tif"

# with rasterio.open(vulnerability_path, "w", **uint8_profile) as dst:
#     dst.write(vulnerability, 1)


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
# 10. CREATE A PRELIMINARY RELATIVE FLOOD SCREENING MAP
# ==========================================================

# Normalize log flow accumulation using valid terrain cells.
flow_values = np.full_like(flow_acc, np.nan, dtype=np.float32)
flow_values[flow_valid] = np.log1p(
    np.maximum(flow_acc[flow_valid], 0)
)

valid_flow_values = flow_values[flow_valid]
flow_min = valid_flow_values.min()
flow_max = valid_flow_values.max()

flow_norm = np.zeros_like(flow_acc, dtype=np.float32)

if flow_max > flow_min:
    flow_norm[flow_valid] = (
        (flow_values[flow_valid] - flow_min)
        / (flow_max - flow_min)
    )

# Normalize slope using valid slope cells only.
slope_norm = np.zeros_like(slope, dtype=np.float32)

slope_min = np.min(slope[slope_valid])
slope_max = np.max(slope[slope_valid])

if slope_max > slope_min:
    slope_norm[slope_valid] = (
        (slope[slope_valid] - slope_min)
        / (slope_max - slope_min)
    )

# Proximity to mapped stormwater drains.
proximity_score = np.zeros_like(
    distance_to_drain, dtype=np.float32
)

proximity_score[distance_valid] = np.clip(
    1.0 - distance_to_drain[distance_valid] / 300.0,
    0.0,
    1.0
)

# Calculate the existing weighted screening score.
score = (
    0.40 * flow_norm
    + 0.30 * (1.0 - slope_norm)
    + 0.30 * proximity_score
)

# IMPORTANT:
# Do not include valid_analysis here.
# This creates a terrain-based map across valid terrain,
# rather than restricting it to encroachment coverage.
score_valid = (
    terrain_valid
    & np.isfinite(score)
)

# 0 = NoData/outside valid terrain
# 1 = Low, 2 = Moderate, 3 = High, 4 = Very high
vulnerability = np.zeros(
    (height, width), dtype=np.uint8
)

vulnerability[score_valid & (score < 0.25)] = 1

vulnerability[
    score_valid
    & (score >= 0.25)
    & (score < 0.50)
] = 2

vulnerability[
    score_valid
    & (score >= 0.50)
    & (score < 0.75)
] = 3

vulnerability[score_valid & (score >= 0.75)] = 4

vulnerability_path = (
    OUTPUT_DIR / "relative_flood_vulnerability.tif"
)

with rasterio.open(vulnerability_path, "w", **uint8_profile) as dst:
    dst.write(vulnerability, 1)

print("Full terrain-based relative flood screening map saved.")

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


# ----------------------------------------------------------
# B. RELATIVE FLOOD VULNERABILITY DISPLAY
# 0 = outside analysis, 1-4 = vulnerability classes
# ----------------------------------------------------------

vulnerability_colors = {
    0: (255, 255, 255),    # White background
    1: (0, 170, 0),        # Low - green
    2: (255, 220, 0),      # Moderate - yellow
    3: (255, 130, 0),      # High - orange
    4: (220, 0, 0)          # Very high - red
}

save_rgb_geotiff(
    OUTPUT_DIR / "relative_flood_vulnerability.tif",
    OUTPUT_DIR / "relative_flood_vulnerability_display.tif",
    vulnerability_colors
)

print("\nDisplay-ready GeoTIFF layers created successfully.")


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
