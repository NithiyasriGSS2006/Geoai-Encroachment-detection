
import requests
import geopandas as gpd
from pathlib import Path

# GCC Storm Water Drain layer
URL = (
    "https://gisgcc.chennaicorporation.gov.in/server/rest/"
    "services/GCCDepts/GCC_COLLABORATION_LAYER/MapServer/8/query"
)

# Velachery AOI: xmin, ymin, xmax, ymax
xmin, ymin, xmax, ymax = 80.2020,12.9845,80.2220,12.9920

# Save output inside the project
PROJECT = Path(__file__).resolve().parents[2]
OUTPUT = PROJECT / "backend" / "data" / "drainage" / "gcc_velachery_drainages.geojson"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)

all_features = []
offset = 0
page_size = 2000

while True:
    params = {
        "where": "1=1",
        "geometry": f"{xmin},{ymin},{xmax},{ymax}",
        "geometryType": "esriGeometryEnvelope",
        "inSR": 4326,
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "*",
        "returnGeometry": "true",
        "outSR": 4326,
        "f": "geojson",
        "resultOffset": offset,
        "resultRecordCount": page_size
    }

    response = requests.get(URL, params=params, timeout=60)
    response.raise_for_status()
    data = response.json()

    if "error" in data:
        raise RuntimeError(data["error"])

    features = data.get("features", [])
    all_features.extend(features)

    print(f"Downloaded {len(all_features)} drainage features...")

    if len(features) < page_size:
        break

    offset += page_size

if not all_features:
    print("No drainage features found in this AOI.")
else:
    # Convert downloaded GeoJSON features into a GeoDataFrame
    gdf = gpd.GeoDataFrame.from_features(
        all_features,
        crs="EPSG:4326"
    )

    gdf = gdf[gdf.geometry.notna()]
    gdf.to_file(OUTPUT, driver="GeoJSON")

    print("\nDownload completed!")
    print("Feature count:", len(gdf))
    print("Saved to:", OUTPUT.resolve())
    print("CRS:", gdf.crs)
