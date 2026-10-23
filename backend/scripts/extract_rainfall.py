
from pathlib import Path

import numpy as np
import pandas as pd
import xarray as xr
from shapely.geometry import box
from pyproj import Transformer


# ==========================================================
# 1. PATHS
# ==========================================================

PROJECT_DIR = Path.cwd()

RAINFALL_DIR = PROJECT_DIR / "backend" /"data" / "rainfall_data"
OUTPUT_DIR = PROJECT_DIR / "backend" / "data" / "rainfall_outputs"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

SUMMARY_CSV = OUTPUT_DIR / "velachery_area_weighted_rainfall.csv"
DETAILS_CSV = OUTPUT_DIR / "velachery_rainfall_grid_cells.csv"


# ==========================================================
# 2. VELACHERY STUDY AREA
# ==========================================================

WEST, SOUTH, EAST, NORTH = 80.1950, 12.9750, 80.2300, 13.0050

# Transform longitude/latitude to projected coordinates in metres.
transformer = Transformer.from_crs(
    "EPSG:4326",
    "EPSG:32644",
    always_xy=True
)

aoi_lonlat = box(WEST, SOUTH, EAST, NORTH)


def project_geometry(geometry):
    """Project a shapely geometry from WGS84 to UTM Zone 44N."""
    from shapely.ops import transform

    return transform(transformer.transform, geometry)


aoi_projected = project_geometry(aoi_lonlat)


# ==========================================================
# 3. FIND RAINFALL FILES
# ==========================================================

files = sorted(RAINFALL_DIR.glob("*.nc4"))

if not files:
    raise FileNotFoundError(
        f"No .nc4 rainfall files found in: {RAINFALL_DIR}"
    )


# ==========================================================
# 4. PROCESS EACH DAILY FILE
# ==========================================================

daily_results = []
grid_results = []

for file in files:
    print(f"\nProcessing: {file.name}")

    with xr.open_dataset(file) as ds:

        rain = ds["precipitation"]

        lon_values = ds["lon"].values
        lat_values = ds["lat"].values

        # Identify the daily date.
        date = pd.to_datetime(ds["time"].values[0]).strftime("%Y-%m-%d")

        # Determine grid spacing from coordinate centres.
        lon_spacing = float(np.median(np.abs(np.diff(lon_values))))
        lat_spacing = float(np.median(np.abs(np.diff(lat_values))))

        weighted_rainfall = 0.0
        total_overlap_area = 0.0
        valid_cells = 0

        # Only examine cells whose geographic boundaries can
        # overlap the study-area bounding box.
        lon_indices = np.where(
            (lon_values + lon_spacing / 2 > WEST)
            & (lon_values - lon_spacing / 2 < EAST)
        )[0]

        lat_indices = np.where(
            (lat_values + lat_spacing / 2 > SOUTH)
            & (lat_values - lat_spacing / 2 < NORTH)
        )[0]

        for lon_idx in lon_indices:
            lon = float(lon_values[lon_idx])

            for lat_idx in lat_indices:
                lat = float(lat_values[lat_idx])

                # Construct the geographic boundary of this
                # GPM grid cell using its centre and grid spacing.
                cell_lonlat = box(
                    lon - lon_spacing / 2,
                    lat - lat_spacing / 2,
                    lon + lon_spacing / 2,
                    lat + lat_spacing / 2
                )

                # Intersect the cell with the study-area bounding box.
                overlap_lonlat = cell_lonlat.intersection(aoi_lonlat)

                if overlap_lonlat.is_empty or overlap_lonlat.area == 0:
                    continue

                overlap_projected = project_geometry(overlap_lonlat)
                overlap_area_m2 = overlap_projected.area

                # Data dimensions are time, lon, lat.
                value = rain.isel(
                    lon=lon_idx,
                    lat=lat_idx
                ).values

                rainfall_mm = float(np.asarray(value).squeeze())

                if not np.isfinite(rainfall_mm):
                    continue

                weighted_rainfall += rainfall_mm * overlap_area_m2
                total_overlap_area += overlap_area_m2
                valid_cells += 1

                grid_results.append({
                    "Date": date,
                    "Grid Longitude": lon,
                    "Grid Latitude": lat,
                    "Rainfall (mm/day)": rainfall_mm,
                    "Overlap Area (m2)": overlap_area_m2
                })

        if total_overlap_area == 0:
            print(f"WARNING: No valid overlapping rainfall cells for {date}")
            continue

        # Area-weighted average rainfall for the study-area bounding box.
        average_rainfall = weighted_rainfall / total_overlap_area

        daily_results.append({
            "Date": date,
            "Area-Weighted Rainfall (mm/day)": average_rainfall,
            "Valid Overlapping Cells": valid_cells,
            "Covered Area (m2)": total_overlap_area
        })

        print(f"Valid overlapping cells: {valid_cells}")
        print(f"Area-weighted rainfall: {average_rainfall:.2f} mm/day")


# ==========================================================
# 5. SAVE RESULTS
# ==========================================================

if not daily_results:
    raise ValueError(
        "No valid rainfall values were extracted. "
        "Check the input files and study-area coordinates."
    )

summary_df = pd.DataFrame(daily_results).sort_values("Date")
grid_df = pd.DataFrame(grid_results).sort_values(
    ["Date", "Grid Latitude", "Grid Longitude"]
)

summary_df.to_csv(SUMMARY_CSV, index=False)
grid_df.to_csv(DETAILS_CSV, index=False)

print("\n" + "=" * 55)
print("AREA-WEIGHTED DAILY RAINFALL")
print("=" * 55)
print(summary_df.to_string(index=False))

# Sum daily estimates; this assumes the daily values are
# comparable daily precipitation amounts.
total_rainfall = summary_df[
    "Area-Weighted Rainfall (mm/day)"
].sum()

print(f"\nSum of daily rainfall estimates: {total_rainfall:.2f} mm")
print(f"\nSummary saved to: {SUMMARY_CSV}")
print(f"Grid-cell details saved to: {DETAILS_CSV}")
