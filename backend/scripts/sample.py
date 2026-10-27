import numpy as np
import rasterio
from pathlib import Path

# ==========================================================
# 1. PATHS
# ==========================================================

PROJECT = Path(__file__).resolve().parents[2]

INPUT_RASTER = (
    PROJECT
    /"backend"
    / "data"
    / "gisoutputs"
    / "water_change"
    / "water_objects_2024.tif"
)

OUTPUT_RASTER = (
    PROJECT
    /"backend"
    / "data"
    / "gisoutputs"
    / "water_change"
    / "water_object_display_2024.tif"
)

# ==========================================================
# 2. DISPLAY COLORS (RGB)
# ==========================================================
# Example class mapping:
# 0 = Background
# 1 = Water object retained
# 2 = Water object loss
# 3 = Water object gain

COLORS = {
    0: (0, 0, 0),       # Black - background
    1: (0, 100, 255),   # Blue - retained water
    2: (255, 40, 40),   # Red - water loss
    3: (0, 220, 80),    # Green - water gain
}

# ==========================================================
# 3. READ RASTER AND CREATE RGB DISPLAY
# ==========================================================

if not INPUT_RASTER.exists():
    raise FileNotFoundError(
        f"Input raster not found: {INPUT_RASTER}\n"
        "Check the filename and output folder."
    )

with rasterio.open(INPUT_RASTER) as src:
    object_data = src.read(1)

    profile = src.profile.copy()
    profile.update(
        driver="GTiff",
        count=3,
        dtype="uint8",
        nodata=None,
        compress="lzw"
    )

    rgb = np.zeros(
        (3, src.height, src.width),
        dtype=np.uint8
    )

    for class_id, color in COLORS.items():
        mask = object_data == class_id

        for band in range(3):
            rgb[band][mask] = color[band]

    # Save RGB GeoTIFF
    with rasterio.open(OUTPUT_RASTER, "w", **profile) as dst:
        dst.write(rgb)

print("Water object display created successfully!")
print(f"Output: {OUTPUT_RASTER}")