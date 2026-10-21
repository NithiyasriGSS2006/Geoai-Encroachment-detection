# Velachery GeoAI Water Encroachment Monitor

An end-to-end geospatial monitoring and AI analysis system for tracking water body recedes, Land Use Land Cover (LULC) changes, and urban encroachment over time in Velachery, Chennai.

---

## 📁 Directory Architecture

The project is cleanly separated into dedicated **`frontend`** and **`backend`** directories:

```
velachery-geoai-water-monitor/
├── 🌐 frontend/                      # FRONTEND FOLDER
│   ├── src/                         # Application UI source code
│   │   ├── components/              # Interactive GIS map, upload panels, metadata views
│   │   │   ├── VelacheryGeoMap.tsx
│   │   │   ├── WaterChangeStepView.tsx
│   │   │   ├── MultiYearUploadPanel.tsx
│   │   │   ├── IntermediateResultsGrid.tsx
│   │   │   ├── ProcessingStatusPanel.tsx
│   │   │   └── RasterMetadataPanel.tsx
│   │   ├── routes/                  # Application routing & navigation config
│   │   │   └── index.ts
│   │   ├── utils/                   # GeoTIFF processing & client utilities
│   │   │   └── geotiffEngine.ts
│   │   ├── App.tsx                  # Main React workflow coordinator
│   │   ├── main.tsx                 # Client entry point
│   │   └── index.css                # Global Tailwind CSS & Leaflet map styling
│   ├── index.html                   # HTML entry page
│   ├── vite.config.ts               # Vite configuration (proxies /api to backend port 3000)
│   ├── tsconfig.json                # TypeScript compiler config
│   └── package.json                 # Frontend package manifest
│
├── ⚙️ backend/                       # BACKEND FOLDER
│   ├── scripts/                     # GeoAI Python Scripts
│   │   ├── water_change.py          # Historical water change detection
│   │   ├── water_body_segmentation.py # Satellite image water-mask generation
│   │   ├── persistent_check.py      # Permanent vs. seasonal recedes check
│   │   ├── lulc_analysis.py         # Urban land conversion analysis
│   │   ├── potential_encroachment.py# Multi-layer potential encroachment mapping
│   │   ├── Velachery_LULC_2024.tif  # LULC reference raster (2024)
│   │   └── Velachery_LULC_2026.tif  # LULC reference raster (2026)
│   ├── data/                        # GIS Storage & Raster Datasets
│   │   ├── ref_satellite_images/   # Uploaded georeferenced satellite GeoTIFFs
│   │   ├── png_satellite_images/   # User-provided PNG inputs for U-Net
│   │   ├── water_masks_tif/        # Segmented water masks consumed by later stages
│   │   └── gisoutputs/              # Processed output GeoTIFF rasters & CSV reports
│   ├── server.ts                    # Node/Express API server & GeoAI Python process runner
│   ├── requirements.txt             # Python backend dependencies (rasterio, numpy, geopandas, etc.)
│   └── package.json                 # Backend package manifest
│
├── README.md                        # Project documentation (this file)
└── package.json                     # Root project runner & workspace manifest
```

---

## 🚀 Running the Project

The pipeline expects georeferenced satellite GeoTIFFs for 2017, 2020, 2023,
2024, and 2026 on the same pixel grid. Select a PNG for every GeoTIFF; PNGs
may be selected before or after their TIFFs, and the segmentation script resizes
them to the reference raster dimensions. The backend stores the TIFFs in
`backend/data/ref_satellite_images/` and PNGs in
`backend/data/png_satellite_images/`, then runs water-body segmentation before
water-change analysis and writes the masks to `backend/data/water_masks_tif/`.

### 1. Install Dependencies
```bash
# Install Node dependencies
npm install --legacy-peer-deps

# Install Python backend dependencies
pip install -r backend/requirements.txt
```
The segmentation script looks for `IR_UNet_improved.keras` under
`~/Downloads/GeoAI-UNET/notebooks/` and then `backend/models/`. If your model is
elsewhere, set `WATER_SEGMENTATION_MODEL_PATH` before starting the backend.
On Windows, Python scripts run through `py -3.12` by default because the
TensorFlow/model combination is validated with Python 3.12. Set
`PYTHON_EXECUTABLE` to a specific compatible interpreter path to override that
default.

### 2. Start Backend Server
```bash
# Start Express API server (Port 3000)
npm run dev:backend
```

### 3. Start Frontend Client
```bash
# Start Vite frontend dev server (Port 5173)
npm run dev:frontend
```

### 4. Run GeoAI Python Scripts Directly
You can run the Python GeoAI scripts individually or via npm commands:
```bash
npm run py:water-change
npm run py:water-segmentation
npm run py:persistent
npm run py:lulc
npm run py:encroachment
```

---

## 📡 API Endpoints

- `GET /healthz` - Backend service health & study area status
- `GET /api/satellite-images` - List saved satellite GeoTIFF/PNG pairs
- `POST /api/process/water-body-segmentation` - Upload yearly satellite TIFF/PNG pairs and create georeferenced water masks
- `POST /api/process/water-change` - Calculate water loss/gain rasters
- `POST /api/process/persistent-water` - Calculate persistent water recedes
- `POST /api/process/lulc` - Land Use Land Cover conversion calculation
- `POST /api/process/encroachment` - Potential encroachment raster mapping
- `POST /api/python/run-all` - Triggers full GeoAI Python script pipeline
- `GET /api/raster/:filename` - Download output GeoTIFF files
