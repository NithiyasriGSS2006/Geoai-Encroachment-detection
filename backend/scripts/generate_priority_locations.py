
from pathlib import Path

import numpy as np
import pandas as pd
import geopandas as gpd
import rasterio

from rasterio.features import shapes
from rasterio.warp import reproject, Resampling
from shapely.geometry import shape


# ============================================================
# 1. INPUT PATHS
# ============================================================

PROJECT = Path(__file__).resolve().parents[2]
DATA = PROJECT / "backend" / "data"
GIS = DATA / "gisoutputs"

POTENTIAL_PATH = (
    GIS / "potential_encroachment"
    / "potential_encroachment_2017_2024.tif"
)

VULNERABILITY_PATH = (
    GIS / "water_flow_impact"
    / "relative_flood_vulnerability.tif"
)

RUNOFF_PATH = (
    GIS / "runoff_comparison"
    / "runoff_change_2024_minus_2017_mm.tif"
)

DRAIN_DISTANCE_PATH = (
    GIS / "water_flow_impact"
    / "distance_to_gcc_drain_m.tif"
)

OUTPUT_DIR = GIS / "priority_locations"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

for path in [
    POTENTIAL_PATH,
    VULNERABILITY_PATH,
    RUNOFF_PATH,
    DRAIN_DISTANCE_PATH,
]:
    if not path.exists():
        raise FileNotFoundError(
            f"Required input not found:\n{path}\n"
            "Update the path to match your actual output file."
        )


# ============================================================
# 2. READ THE POTENTIAL ENCROACHMENT RASTER
# ============================================================

with rasterio.open(POTENTIAL_PATH) as src:
    potential_raw = src.read(1)
    profile = src.profile.copy()
    transform = src.transform
    crs = src.crs
    height, width = potential_raw.shape
    nodata = src.nodata

    valid_potential = np.isfinite(potential_raw)

    if nodata is not None:
        valid_potential &= potential_raw != nodata

    potential = (potential_raw > 0) & valid_potential


# ============================================================
# 3. ALIGN OTHER RASTERS TO THE POTENTIAL RASTER
# ============================================================

def align_raster(path, reference_shape, reference_transform,
                 reference_crs, resampling=Resampling.nearest):

    with rasterio.open(path) as src:
        source = src.read(1)
        source_nodata = src.nodata

        aligned = np.full(
            reference_shape,
            np.nan,
            dtype=np.float32,
        )

        reproject(
            source=source.astype(np.float32),
            destination=aligned,
            src_transform=src.transform,
            src_crs=src.crs,
            src_nodata=source_nodata,
            dst_transform=reference_transform,
            dst_crs=reference_crs,
            dst_nodata=np.nan,
            resampling=resampling,
        )

    return aligned


vulnerability = align_raster(
    VULNERABILITY_PATH,
    (height, width),
    transform,
    crs,
)

runoff_change = align_raster(
    RUNOFF_PATH,
    (height, width),
    transform,
    crs,
    resampling=Resampling.bilinear,
)

drain_distance = align_raster(
    DRAIN_DISTANCE_PATH,
    (height, width),
    transform,
    crs,
)


# ============================================================
# 4. DEFINE VALID CANDIDATE CELLS
# ============================================================

# Vulnerability classes are assumed to be:
# 1 = Low, 2 = Moderate, 3 = High, 4 = Very high.
# Check the classification in your existing Module 06 script.

valid = (
    potential
    & np.isfinite(vulnerability)
    & np.isfinite(runoff_change)
    & np.isfinite(drain_distance)
)

if not valid.any():
    raise ValueError(
        "No valid candidate cells remain after aligning the inputs. "
        "Check the paths, CRS, NoData, and raster coverage."
    )

# Drain proximity score:
# 1 near the drain, gradually decreasing to 0 at 300 m.
proximity_score = np.clip(
    1.0 - drain_distance / 300.0,
    0.0,
    1.0,
)

# Terrain vulnerability class score from 0 to 1.
terrain_score = np.clip(
    (vulnerability - 1.0) / 3.0,
    0.0,
    1.0,
)

# Runoff increase is supporting evidence.
# Only positive changes contribute to this component.
positive_runoff = np.maximum(runoff_change, 0.0)

runoff_max = float(np.max(positive_runoff[valid]))

if runoff_max > 0:
    runoff_score = np.clip(
        positive_runoff / runoff_max,
        0.0,
        1.0,
    )
else:
    runoff_score = np.zeros(
        (height, width),
        dtype=np.float32,
    )

# Transparent screening score; not a calibrated probability.
priority_score = (
    0.40 * terrain_score
    + 0.30 * proximity_score
    + 0.30 * runoff_score
)

priority_score[~valid] = np.nan


# ============================================================
# 5. CLASSIFY CANDIDATE PRIORITY
# ============================================================

priority_class = np.zeros(
    (height, width),
    dtype=np.uint8,
)

priority_class[valid & (priority_score < 0.25)] = 1
priority_class[valid & (priority_score >= 0.25)
               & (priority_score < 0.50)] = 2
priority_class[valid & (priority_score >= 0.50)
               & (priority_score < 0.75)] = 3
priority_class[valid & (priority_score >= 0.75)] = 4

priority_names = {
    1: "Low",
    2: "Moderate",
    3: "High",
    4: "Very High",
}


# ============================================================
# 6. SAVE PRIORITY RASTER
# ============================================================

priority_profile = profile.copy()
priority_profile.update(
    driver="GTiff",
    count=1,
    dtype="uint8",
    nodata=0,
    compress="lzw",
)

priority_raster_path = (
    OUTPUT_DIR / "encroachment_priority_class.tif"
)

with rasterio.open(
    priority_raster_path,
    "w",
    **priority_profile,
) as dst:
    dst.write(priority_class, 1)


# ============================================================
# 7. CONVERT PRIORITY CELLS INTO POLYGONS
# ============================================================

records = []

for geom, value in shapes(
    priority_class,
    mask=priority_class > 0,
    transform=transform,
):
    class_value = int(value)
    geometry = shape(geom)

    records.append({
        "priority_class": class_value,
        "priority": priority_names[class_value],
        "geometry": geometry,
    })

if not records:
    raise ValueError(
        "No priority polygons were created. Check the candidate mask."
    )

polygons = gpd.GeoDataFrame(
    records,
    geometry="geometry",
    crs=crs,
)

# Calculate polygon areas in the projected coordinate system.
polygons["area_m2"] = polygons.geometry.area
polygons["area_ha"] = polygons["area_m2"] / 10000.0

# Rank polygons from highest to lowest priority class.
polygons = polygons.sort_values(
    ["priority_class", "area_m2"],
    ascending=[False, False],
).reset_index(drop=True)

polygons.insert(
    0,
    "candidate_id",
    [f"VEL-{i:04d}" for i in range(1, len(polygons) + 1)],
)

# Explain the intended meaning of the output.
polygons["interpretation"] = (
    "Screening candidate only; field verification required."
)


# ============================================================
# 8. SAVE GEOJSON AND CSV
# ============================================================

geojson_path = OUTPUT_DIR / "priority_inspection_locations.geojson"
csv_path = OUTPUT_DIR / "priority_inspection_locations.csv"

polygons.to_file(
    geojson_path,
    driver="GeoJSON",
)

polygons.drop(
    columns="geometry"
).to_csv(csv_path, index=False)


# ============================================================
# 9. PRINT SUMMARY
# ============================================================

print("\n" + "=" * 60)
print("PRIORITY LOCATION ANALYSIS COMPLETE")
print("=" * 60)

print("Valid potential encroachment cells:", int(valid.sum()))
print("Candidate polygons:", len(polygons))

print("\nArea by priority class:")

summary = (
    polygons.groupby(["priority_class", "priority"], as_index=False)
    .agg(
        polygon_count=("candidate_id", "count"),
        total_area_ha=("area_ha", "sum"),
    )
)

print(summary.to_string(index=False))

print("\nPriority raster:", priority_raster_path)
print("GeoJSON:", geojson_path)
print("CSV:", csv_path)

print(
    "\nCAUTION: The priority score is a preliminary screening index. "
    
)
