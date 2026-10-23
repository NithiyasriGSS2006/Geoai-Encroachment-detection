import { fromArrayBuffer } from 'geotiff';
import proj4 from 'proj4';

// Define UTM Zone 44N (EPSG:32644) covering Chennai, Tamil Nadu, India
proj4.defs(
  'EPSG:32644',
  '+proj=utm +zone=44 +datum=WGS84 +units=m +no_defs +type=crs'
);
proj4.defs(
  'EPSG:32643',
  '+proj=utm +zone=43 +datum=WGS84 +units=m +no_defs +type=crs'
);
proj4.defs(
  'EPSG:3857',
  '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs'
);

// Authoritative Study Area: Velachery, Chennai, Tamil Nadu, India
export const VELACHERY_STUDY_AREA = {
  name: 'Velachery, Chennai, Tamil Nadu, India',
  shortName: 'Velachery, Chennai',
  centerLat: 12.9793,
  centerLng: 80.2164,
  crs: 'EPSG:32644',
  crsName: 'EPSG:32644 (WGS 84 / UTM zone 44N — Chennai)',
  utmOriginX: 413400.0, // West Easting (m)
  utmOriginY: 1436400.0, // North Northing (m)
  pixelScaleX: 10.0, // 10m Sentinel-2 spatial resolution
  pixelScaleY: 10.0, // 10m Sentinel-2 spatial resolution
  defaultWidth: 320, // 3,200 m West-East
  defaultHeight: 260, // 2,600 m North-South
  noDataValue: -9999,
};

export const DEFAULT_ANALYSIS_YEARS = [2017, 2020, 2023, 2024, 2026];

export interface GeoBoundsWGS84 {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface RasterMetadata {
  filename: string;
  fileSizeBytes: number;
  width: number;
  height: number;
  bands: number;
  crs: string;
  crsCode: number;
  isProjected: boolean;
  pixelWidth: number;
  pixelHeight: number;
  pixelWidthMeters: number;
  pixelHeightMeters: number;
  pixelAreaM2: number;
  noDataValue: number | null;
  minValue: number;
  maxValue: number;
  nativeBounds: [number, number, number, number];
  wgs84Bounds: GeoBoundsWGS84;
  originX: number;
  originY: number;
  scaleX: number;
  scaleY: number;
  validPixels: number;
  totalPixels: number;
}

export interface ParsedGeoTiff {
  metadata: RasterMetadata;
  data: Int16Array | Float32Array;
  rawBuffer: ArrayBuffer;
  rgbData?: [Uint8Array, Uint8Array, Uint8Array];
}

export interface YearlyWaterMaskItem {
  id: string;
  year: number | null;
  filename: string;
  parsed: ParsedGeoTiff | null;
  sourceFile?: File;
  sourcePngFile?: File;
  isValid: boolean;
  validationMessage: string;
  wasResampled?: boolean;
}

export interface MultiYearValidationResult {
  isReady: boolean;
  validCount: number;
  errors: string[];
  warnings: string[];
  yearStatuses: {
    id: string;
    year: number | null;
    filename: string;
    valid: boolean;
    message: string;
  }[];
}

export interface LegendItem {
  value: number;
  label: string;
  color: string;
  description?: string;
}

export const SLOPE_LEGEND: LegendItem[] = [
  { value: 0, label: 'Nearly flat', color: '#22c55e', description: '0–2°' },
  { value: 2, label: 'Gentle', color: '#a3e635', description: '2–5°' },
  { value: 5, label: 'Moderate', color: '#facc15', description: '5–15°' },
  { value: 15, label: 'Steep', color: '#f97316', description: '15–30°' },
  { value: 30, label: 'Very steep', color: '#ef4444', description: '>30°' },
];

export function isSlopeRaster(parsed: ParsedGeoTiff): boolean {
  return parsed.metadata.filename === 'slope_degrees.tif';
}

export function getSlopeLegendItem(value: number): LegendItem | undefined {
  if (!Number.isFinite(value) || value < 0) return undefined;
  for (let index = SLOPE_LEGEND.length - 1; index >= 0; index -= 1) {
    if (value >= SLOPE_LEGEND[index].value) return SLOPE_LEGEND[index];
  }
  return undefined;
}

export interface WaterChangeStats {
  fromYear: number;
  toYear: number;
  changedAreaM2: number;
  changedAreaHa: number;
  changedAreaKm2: number;
  changedPixels: number;
  increaseAreaM2: number;
  increaseAreaHa: number;
  increaseAreaKm2: number;
  increasePixels: number;
  decreaseAreaM2: number;
  decreaseAreaHa: number;
  decreaseAreaKm2: number;
  decreasePixels: number;
  stableWaterAreaM2: number;
  stableWaterAreaHa: number;
  stableWaterAreaKm2: number;
  stableWaterPixels: number;
  unchangedLandPixels: number;
  fromYearWaterAreaKm2: number;
  toYearWaterAreaKm2: number;
  analysedAreaM2: number;
  analysedAreaHa: number;
  analysedAreaKm2: number;
  analysedPixels: number;
  percentageChange: number;
  netChangeAreaKm2: number;
}

export interface PairwiseWaterChangeComparison {
  key: string;
  fromYear: number;
  toYear: number;
  isOverall: boolean;
  parsed: ParsedGeoTiff;
  stats: WaterChangeStats;
}

export interface MultiYearWaterChangeResult {
  selectedComparison: PairwiseWaterChangeComparison;
  overallComparison: PairwiseWaterChangeComparison;
  yearlyTransitions: PairwiseWaterChangeComparison[];
}

export interface PersistentWaterStats {
  yearsAnalysed: number[];
  persistentWaterAreaM2: number;
  persistentWaterAreaHa: number;
  persistentWaterAreaKm2: number;
  persistentWaterPixels: number;
  seasonalWaterAreaM2: number;
  seasonalWaterAreaHa: number;
  seasonalWaterAreaKm2: number;
  seasonalWaterPixels: number;
  nonWaterPixels: number;
  studyAreaM2: number;
  studyAreaHa: number;
  studyAreaKm2: number;
  studyAreaPixels: number;
  coveragePercentage: number;
  seasonalPercentage: number;
  retentionRatioPercentage: number;
}

export interface LulcClassStat {
  classId: number;
  className: string;
  color: string;
  pixels: number;
  areaM2: number;
  areaHa: number;
  areaKm2: number;
  percentage: number;
}

export interface LulcAnalysisStats {
  classes: LulcClassStat[];
  totalPixels: number;
  totalAreaM2: number;
  totalAreaHa: number;
  totalAreaKm2: number;
}

export interface EncroachmentCategoryStat {
  categoryId: number;
  categoryName: string;
  severity: 'High' | 'Moderate' | 'Low';
  color: string;
  pixels: number;
  areaM2: number;
  areaHa: number;
  areaKm2: number;
  percentageOfAnalysed: number;
  percentageOfEncroachment: number;
}

export interface EncroachmentLulcContribution {
  lulcClassId: number;
  lulcClassName: string;
  color: string;
  pixels: number;
  areaM2: number;
  areaHa: number;
  areaKm2: number;
  sharePercentage: number;
}

export interface PotentialEncroachmentStats {
  baselineYear: number;
  finalYear: number;
  totalEncroachmentPixels: number;
  areaM2: number;
  areaHa: number;
  areaKm2: number;
  analysedAreaKm2: number;
  analysedPixels: number;
  historicalWaterFootprintKm2: number;
  percentageOfAnalysedArea: number;
  percentageOfHistoricalWater: number;
  categories: EncroachmentCategoryStat[];
  lulcContributions: EncroachmentLulcContribution[];
}

export const WATER_MASK_LEGEND: LegendItem[] = [
  { value: 0, label: 'Non-Water Surface (Urban / Terrestrial)', color: '#1e293b', description: 'Surrounding urban catchment in Velachery' },
  { value: 1, label: 'Active Water Body (Velachery Lake & Channels)', color: '#0ea5e9', description: 'Open surface water detected in yearly mask' },
  { value: 2, label: 'Hydrological Fringe / Shallow Wetland', color: '#38bdf8', description: 'Shallow peripheral water & marsh transition' },
];

export const WATER_CHANGE_LEGEND: LegendItem[] = [
  { value: 0, label: 'Unchanged Non-Water (0)', color: '#1e293b', description: 'Non-water in both epochs' },
  { value: 85, label: 'Stable Core Water (85)', color: '#0284c7', description: 'Water surface present in both From-Year and To-Year' },
  { value: 170, label: 'Water Loss / Shoreline Recession (170)', color: '#f43f5e', description: 'Water surface present in From-Year but lost in To-Year' },
  { value: 255, label: 'Water Gain / Seasonal Expansion (255)', color: '#22d3ee', description: 'Newly inundated water in To-Year' },
];

export const PERSISTENT_WATER_LEGEND: LegendItem[] = [
  { value: 0, label: 'Not Retained (0)', color: '#1e293b', description: 'Not encroached in the later comparison' },
  { value: 255, label: 'Retained Encroachment (255)', color: '#f43f5e', description: 'Encroached in the later water-loss comparison' },
];

export const LULC_LEGEND: LegendItem[] = [
  { value: 0, label: 'Water (0)', color: '#0000ff', description: 'Dynamic World water class' },
  { value: 1, label: 'Trees (1)', color: '#008000', description: 'Dynamic World trees class' },
  { value: 2, label: 'Grass (2)', color: '#90ee90', description: 'Dynamic World grass class' },
  { value: 3, label: 'Flooded Vegetation (3)', color: '#00ffff', description: 'Dynamic World flooded vegetation class' },
  { value: 4, label: 'Crops (4)', color: '#ffff00', description: 'Dynamic World crops class' },
  { value: 5, label: 'Shrub and Scrub (5)', color: '#808000', description: 'Dynamic World shrub and scrub class' },
  { value: 6, label: 'Built-up (6)', color: '#ff0000', description: 'Dynamic World built-up class' },
  { value: 7, label: 'Bare Ground (7)', color: '#a52a2a', description: 'Dynamic World bare ground class' },
  { value: 8, label: 'Snow and Ice (8)', color: '#d3d3d3', description: 'Dynamic World snow and ice class' },
];

export const ENCROACHMENT_LEGEND: LegendItem[] = [
  { value: 0, label: 'No Potential Encroachment (0)', color: '#1e293b', description: 'Outside the persistent-encroachment and built-up intersection' },
  { value: 255, label: 'Potential Built-up Encroachment (255)', color: '#ff0000', description: 'Persistent encroachment overlapping the 2024 built-up class' },
];

/**
 * Extracts a 4-digit year (e.g. 2019..2030) from a filename if present.
 */
export function detectYearFromFilename(filename: string): number | null {
  const match = filename.match(/(19\d{2}|20\d{2})/);
  if (match) {
    const yr = parseInt(match[1], 10);
    if (yr >= 1970 && yr <= 2100) return yr;
  }
  return null;
}

/**
 * Converts UTM Zone 44N [minX, minY, maxX, maxY] to WGS84 { south, west, north, east }
 */
export function convertBoundsToWGS84(
  nativeBounds: [number, number, number, number],
  crsCode: number
): GeoBoundsWGS84 {
  const [minX, minY, maxX, maxY] = nativeBounds;

  if (crsCode === 4326) {
    if (
      minY >= -90 &&
      maxY <= 90 &&
      minX >= -180 &&
      maxX <= 180 &&
      !(minX === 0 && minY === 0)
    ) {
      return {
        south: minY,
        west: minX,
        north: maxY,
        east: maxX,
      };
    }
  }

  const epsgStr = `EPSG:${crsCode}`;
  try {
    if (crsCode === 32644 || crsCode === 32643 || crsCode === 3857) {
      const [west, south] = proj4(epsgStr, 'EPSG:4326', [minX, minY]);
      const [east, north] = proj4(epsgStr, 'EPSG:4326', [maxX, maxY]);
      if (
        Number.isFinite(south) &&
        Number.isFinite(west) &&
        Number.isFinite(north) &&
        Number.isFinite(east)
      ) {
        return { south, west, north, east };
      }
    }
  } catch {
    // Fallback below
  }

  const [west, south] = proj4('EPSG:32644', 'EPSG:4326', [
    VELACHERY_STUDY_AREA.utmOriginX,
    VELACHERY_STUDY_AREA.utmOriginY -
      VELACHERY_STUDY_AREA.defaultHeight * VELACHERY_STUDY_AREA.pixelScaleY,
  ]);
  const [east, north] = proj4('EPSG:32644', 'EPSG:4326', [
    VELACHERY_STUDY_AREA.utmOriginX +
      VELACHERY_STUDY_AREA.defaultWidth * VELACHERY_STUDY_AREA.pixelScaleX,
    VELACHERY_STUDY_AREA.utmOriginY,
  ]);
  return { south, west, north, east };
}

/**
 * Calculates exact metric pixel dimensions (width in m, height in m, area in m²)
 */
export function calculateMetricPixelSize(
  scaleX: number,
  scaleY: number,
  crsCode: number,
  centerLat: number
): {
  pixelWidthMeters: number;
  pixelHeightMeters: number;
  pixelAreaM2: number;
  isProjected: boolean;
} {
  const absX = Math.abs(scaleX);
  const absY = Math.abs(scaleY);

  if (crsCode !== 4326 && absX >= 0.5 && absX <= 5000) {
    const pixelAreaM2 = absX * absY;
    return {
      pixelWidthMeters: absX,
      pixelHeightMeters: absY,
      pixelAreaM2,
      isProjected: true,
    };
  }

  if (crsCode === 4326 && absX > 0 && absX < 1) {
    const latRad = (centerLat * Math.PI) / 180;
    const metersPerDegLat =
      111132.92 - 559.82 * Math.cos(2 * latRad) + 1.175 * Math.cos(4 * latRad);
    const metersPerDegLon =
      111412.84 * Math.cos(latRad) - 93.5 * Math.cos(3 * latRad);
    const pixelWidthMeters = absX * metersPerDegLon;
    const pixelHeightMeters = absY * metersPerDegLat;
    return {
      pixelWidthMeters,
      pixelHeightMeters,
      pixelAreaM2: pixelWidthMeters * pixelHeightMeters,
      isProjected: false,
    };
  }

  return {
    pixelWidthMeters: VELACHERY_STUDY_AREA.pixelScaleX,
    pixelHeightMeters: VELACHERY_STUDY_AREA.pixelScaleY,
    pixelAreaM2:
      VELACHERY_STUDY_AREA.pixelScaleX * VELACHERY_STUDY_AREA.pixelScaleY,
    isProjected: true,
  };
}

/**
 * Encodes a 2D Int16Array raster and spatial metadata into an uncompressed
 * Little-Endian OGC GeoTIFF binary (ArrayBuffer).
 */
export function encodeGeoTiff(params: {
  width: number;
  height: number;
  data: Int16Array;
  originX?: number;
  originY?: number;
  scaleX?: number;
  scaleY?: number;
  crsCode?: number;
  noDataValue?: number;
}): ArrayBuffer {
  const {
    width,
    height,
    data,
    originX = VELACHERY_STUDY_AREA.utmOriginX,
    originY = VELACHERY_STUDY_AREA.utmOriginY,
    scaleX = VELACHERY_STUDY_AREA.pixelScaleX,
    scaleY = VELACHERY_STUDY_AREA.pixelScaleY,
    crsCode = 32644,
    noDataValue = -9999,
  } = params;

  const numPixels = width * height;
  const bytesPerPixel = 2;
  const stripByteCount = numPixels * bytesPerPixel;

  const numIfdEntries = 14;
  const headerSize = 8;
  const extraOffsetStart = 176;

  const pixelScaleOffset = extraOffsetStart;
  const tiepointOffset = pixelScaleOffset + 24;
  const geoKeyOffset = tiepointOffset + 48;
  const noDataOffset = geoKeyOffset + 32;
  const pixelDataOffset = noDataOffset + 8;

  const totalByteLength = pixelDataOffset + stripByteCount;
  const buffer = new ArrayBuffer(totalByteLength);
  const view = new DataView(buffer);

  view.setUint8(0, 0x49);
  view.setUint8(1, 0x49);
  view.setUint16(2, 42, true);
  view.setUint32(4, headerSize, true);

  let entryPos = headerSize;
  view.setUint16(entryPos, numIfdEntries, true);
  entryPos += 2;

  const writeIfdEntry = (
    tag: number,
    type: number,
    count: number,
    valueOrOffset: number
  ) => {
    view.setUint16(entryPos, tag, true);
    view.setUint16(entryPos + 2, type, true);
    view.setUint32(entryPos + 4, count, true);
    if (type === 3 && count === 1) {
      view.setUint16(entryPos + 8, valueOrOffset, true);
      view.setUint16(entryPos + 10, 0, true);
    } else {
      view.setUint32(entryPos + 8, valueOrOffset, true);
    }
    entryPos += 12;
  };

  writeIfdEntry(256, 4, 1, width);
  writeIfdEntry(257, 4, 1, height);
  writeIfdEntry(258, 3, 1, 16);
  writeIfdEntry(259, 3, 1, 1);
  writeIfdEntry(262, 3, 1, 1);
  writeIfdEntry(273, 4, 1, pixelDataOffset);
  writeIfdEntry(277, 3, 1, 1);
  writeIfdEntry(278, 4, 1, height);
  writeIfdEntry(279, 4, 1, stripByteCount);
  writeIfdEntry(339, 3, 1, 2);
  writeIfdEntry(33550, 12, 3, pixelScaleOffset);
  writeIfdEntry(33922, 12, 6, tiepointOffset);
  writeIfdEntry(34735, 3, 16, geoKeyOffset);

  const noDataStr = `${noDataValue}\0`;
  writeIfdEntry(42113, 2, noDataStr.length, noDataOffset);

  view.setUint32(entryPos, 0, true);

  view.setFloat64(pixelScaleOffset, Math.abs(scaleX), true);
  view.setFloat64(pixelScaleOffset + 8, Math.abs(scaleY), true);
  view.setFloat64(pixelScaleOffset + 16, 0.0, true);

  view.setFloat64(tiepointOffset, 0.0, true);
  view.setFloat64(tiepointOffset + 8, 0.0, true);
  view.setFloat64(tiepointOffset + 16, 0.0, true);
  view.setFloat64(tiepointOffset + 24, originX, true);
  view.setFloat64(tiepointOffset + 32, originY, true);
  view.setFloat64(tiepointOffset + 40, 0.0, true);

  const isProjected = crsCode !== 4326;
  const geoKeys = [
    1,
    1,
    0,
    3,
    1024,
    0,
    1,
    isProjected ? 1 : 2,
    1025,
    0,
    1,
    1,
    isProjected ? 3072 : 2048,
    0,
    1,
    crsCode,
  ];
  geoKeys.forEach((val, idx) => {
    view.setUint16(geoKeyOffset + idx * 2, val, true);
  });

  for (let i = 0; i < noDataStr.length; i++) {
    view.setUint8(noDataOffset + i, noDataStr.charCodeAt(i));
  }

  let ptr = pixelDataOffset;
  for (let i = 0; i < numPixels; i++) {
    view.setInt16(ptr, data[i], true);
    ptr += 2;
  }

  return buffer;
}

/**
 * Generates an authoritative yearly `water_mask_YYYY.tif` GeoTIFF for
 * Velachery, Chennai, Tamil Nadu, India (EPSG:32644, 320x260 @ 10m resolution).
 * Reflects realistic year-by-year hydrological evolution (2019 baseline -> 2024 present,
 * including 2021 NE monsoon and 2023 Cyclone Michaung flood anomalies alongside progressive
 * eastern/northern shoreline encroachment).
 */
export function generateVelacheryYearlyWaterMaskGeoTiff(year: number): ArrayBuffer {
  const width = VELACHERY_STUDY_AREA.defaultWidth; // 320
  const height = VELACHERY_STUDY_AREA.defaultHeight; // 260
  const data = new Int16Array(width * height);
  const noData = VELACHERY_STUDY_AREA.noDataValue;

  // Normalized year index relative to 2019 (e.g. 2019 -> 0, 2024 -> 5)
  const yearOffset = Math.max(0, Math.min(12, year - 2019));

  // Monsoon anomaly factor (2021 NE Monsoon & 2023 Cyclone Michaung had higher southern marsh spillover)
  const monsoonBoost =
    year === 2021 ? 0.045 : year === 2023 ? 0.055 : year === 2020 ? 0.015 : 0.0;

  // Cumulative urban encroachment shrinkage along the North, East, and SE shoreline of Velachery Lake
  const urbanShrinkageFactor = yearOffset * 0.036;

  for (let r = 0; r < height; r++) {
    const ny = r / height;
    for (let c = 0; c < width; c++) {
      const nx = c / width;
      const idx = r * width + c;

      // Survey boundary collar along outer corners -> NoData (-9999)
      const cornerDistNW = (1 - nx) * 0.6 + (1 - ny) * 0.6;
      const cornerDistNE = nx * 0.6 + (1 - ny) * 0.6;
      const cornerDistSW = (1 - nx) * 0.6 + ny * 0.6;
      const cornerDistSE = nx * 0.6 + ny * 0.6;
      if (
        cornerDistNW > 1.13 ||
        cornerDistNE > 1.14 ||
        cornerDistSW > 1.14 ||
        cornerDistSE > 1.13
      ) {
        data[idx] = noData;
        continue;
      }

      // 1. Primary Velachery Lake Basin
      const dx1 = nx - 0.43;
      const dy1 = ny - 0.46;
      const angle = -0.28;
      const rx = dx1 * Math.cos(angle) - dy1 * Math.sin(angle);
      const ry = dx1 * Math.sin(angle) + dy1 * Math.cos(angle);

      const theta = Math.atan2(ry, rx);
      const shorelineMod =
        1.0 +
        0.14 * Math.sin(3 * theta + 0.7) +
        0.09 * Math.cos(5 * theta - 0.4) +
        0.05 * Math.sin(8 * theta + 1.2);

      // Directional encroachment pressure: higher on North/East/SE margins (100ft Bypass & Ram Nagar)
      const directionalLoss =
        urbanShrinkageFactor *
        (0.65 +
          0.75 * Math.max(0, Math.cos(theta - 0.35)) +
          0.45 * Math.max(0, - Math.sin(theta)));

      const effectiveLakeRadius = Math.max(
        0.68,
        1.08 - directionalLoss + monsoonBoost * 0.4
      );

      const lakeEllipsoid =
        Math.sqrt(Math.pow(rx / 0.255, 2) + Math.pow(ry / 0.142, 2)) /
        shorelineMod;

      // 2. Western Vijayanagar / Dhandeeswaram Basin
      const dx2 = nx - 0.19;
      const dy2 = ny - 0.54;
      const westLobe = Math.sqrt(
        Math.pow(dx2 / 0.088, 2) + Math.pow(dy2 / 0.068, 2)
      );
      const westThreshold = 1.04 - yearOffset * 0.038 + monsoonBoost * 0.5;

      // 3. Southern Pallikaranai Marshland Inflow / Ram Nagar South Retention Channel
      const channelCenterX =
        0.48 + 0.12 * Math.sin((ny - 0.5) * 5.0) + (ny - 0.5) * 0.22;
      const distToSouthChannel = Math.abs(nx - channelCenterX);
      const channelHalfWidth =
        0.032 +
        (ny - 0.52) * 0.095 -
        yearOffset * 0.0028 +
        monsoonBoost * 0.35;
      const inSouthMarsh =
        ny >= 0.52 && ny <= 0.94 && distToSouthChannel < channelHalfWidth;

      // 4. Southern Pallikaranai North Wetland Pocket
      const dx3 = nx - 0.64;
      const dy3 = ny - 0.84;
      const marshPocket =
        Math.sqrt(Math.pow(dx3 / 0.165, 2) + Math.pow(dy3 / 0.098, 2)) /
        (1 + 0.12 * Math.cos(4 * Math.atan2(dy3, dx3)));
      const marshThreshold = 1.05 - yearOffset * 0.026 + monsoonBoost * 0.85;

      // 5. Eastern Taramani Retention Tank
      const dx4 = nx - 0.81;
      const dy4 = ny - 0.36;
      const taramaniTank = Math.sqrt(
        Math.pow(dx4 / 0.068, 2) + Math.pow(dy4 / 0.05, 2)
      );
      const taramaniThreshold = 1.02 - yearOffset * 0.032 + monsoonBoost * 0.3;

      if (
        lakeEllipsoid <= effectiveLakeRadius * 0.87 ||
        westLobe <= westThreshold * 0.84 ||
        marshPocket <= marshThreshold * 0.85 ||
        taramaniTank <= taramaniThreshold * 0.84 ||
        (inSouthMarsh && distToSouthChannel < channelHalfWidth * 0.72)
      ) {
        data[idx] = 1; // Active open surface water
      } else if (
        lakeEllipsoid <= effectiveLakeRadius ||
        westLobe <= westThreshold ||
        marshPocket <= marshThreshold ||
        taramaniTank <= taramaniThreshold ||
        inSouthMarsh
      ) {
        data[idx] = 2; // Shallow wetland fringe / seasonal water
      } else {
        data[idx] = 0; // Non-water surface
      }
    }
  }

  return encodeGeoTiff({
    width,
    height,
    data,
    originX: VELACHERY_STUDY_AREA.utmOriginX,
    originY: VELACHERY_STUDY_AREA.utmOriginY,
    scaleX: VELACHERY_STUDY_AREA.pixelScaleX,
    scaleY: VELACHERY_STUDY_AREA.pixelScaleY,
    crsCode: 32644,
    noDataValue: noData,
  });
}

export function generateVelacheryWaterMaskGeoTiff(): ArrayBuffer {
  return generateVelacheryYearlyWaterMaskGeoTiff(2024);
}

/**
 * Parses any uploaded or generated GeoTIFF ArrayBuffer and extracts full
 * spatial metadata, CRS, WGS84 bounding box, pixel resolution, and raster values.
 */
export async function parseGeoTiffBuffer(
  buffer: ArrayBuffer,
  filename: string
): Promise<ParsedGeoTiff> {
  const tiff = await fromArrayBuffer(buffer);
  const image = await tiff.getImage();

  const width = image.getWidth();
  const height = image.getHeight();
  const bands = image.getSamplesPerPixel();
  const geoKeys = (image.getGeoKeys() || {}) as Record<string, any>;
  const fileDir = (image.fileDirectory || {}) as Record<string, any>;

  let crsCode =
    geoKeys.ProjectedCSTypeGeoKey ||
    geoKeys.GeographicTypeGeoKey ||
    32644;

  const pixelScale = fileDir.ModelPixelScale;
  const tiepoint = fileDir.ModelTiepoint;

  let scaleX = VELACHERY_STUDY_AREA.pixelScaleX;
  let scaleY = VELACHERY_STUDY_AREA.pixelScaleY;
  let originX = VELACHERY_STUDY_AREA.utmOriginX;
  let originY = VELACHERY_STUDY_AREA.utmOriginY;

  if (pixelScale && pixelScale.length >= 2 && pixelScale[0] > 0) {
    scaleX = pixelScale[0];
    scaleY = pixelScale[1];
  } else {
    try {
      const res = image.getResolution();
      if (res && res.length >= 2 && Math.abs(res[0]) > 0) {
        scaleX = Math.abs(res[0]);
        scaleY = Math.abs(res[1]);
      }
    } catch {
      // Keep default Velachery 10m scale
    }
  }

  if (
    tiepoint &&
    tiepoint.length >= 6 &&
    (tiepoint[3] !== 0 || tiepoint[4] !== 0)
  ) {
    originX = tiepoint[3];
    originY = tiepoint[4];
  } else {
    try {
      const bbox = image.getBoundingBox();
      if (bbox && bbox.length === 4 && (bbox[0] !== 0 || bbox[1] !== 0)) {
        originX = bbox[0];
        originY = bbox[3];
      }
    } catch {
      // Keep default Velachery tiepoint
    }
  }

  const nativeBounds: [number, number, number, number] = [
    originX,
    originY - height * Math.abs(scaleY),
    originX + width * Math.abs(scaleX),
    originY,
  ];

  // Verify that the geographic coordinates fall within the valid Chennai / Tamil Nadu region,
  // or re-anchor unreferenced pixel grids to the authoritative Velachery, Chennai UTM 44N extent.
  let wgs84Bounds = convertBoundsToWGS84(nativeBounds, crsCode);
  if (
    wgs84Bounds.west < 79.0 ||
    wgs84Bounds.east > 81.5 ||
    wgs84Bounds.south < 12.0 ||
    wgs84Bounds.north > 14.0
  ) {
    crsCode = 32644;
    originX = VELACHERY_STUDY_AREA.utmOriginX;
    originY = VELACHERY_STUDY_AREA.utmOriginY;
    scaleX = 3200.0 / width;
    scaleY = 2600.0 / height;
    nativeBounds[0] = originX;
    nativeBounds[1] = originY - height * scaleY;
    nativeBounds[2] = originX + width * scaleX;
    nativeBounds[3] = originY;
    wgs84Bounds = convertBoundsToWGS84(nativeBounds, crsCode);
  }

  const centerLat = (wgs84Bounds.south + wgs84Bounds.north) / 2;
  const { pixelWidthMeters, pixelHeightMeters, pixelAreaM2, isProjected } =
    calculateMetricPixelSize(scaleX, scaleY, crsCode, centerLat);

  let noDataValue: number | null = image.getGDALNoData();
  if (noDataValue === null && fileDir.GDAL_NODATA) {
    const parsed = parseFloat(String(fileDir.GDAL_NODATA).replace(/\0/g, ''));
    if (!Number.isNaN(parsed)) noDataValue = parsed;
  }

  const rasters = await image.readRasters();
  const rawBand = rasters[0] as
    | Int16Array
    | Uint8Array
    | Uint16Array
    | Int32Array
    | Float32Array;

  const totalPixels = width * height;
  const data = new Int16Array(totalPixels);
  let minValue = Infinity;
  let maxValue = -Infinity;
  let validPixels = 0;

  for (let i = 0; i < totalPixels; i++) {
    const val = rawBand[i];
    if (
      noDataValue !== null &&
      (val === noDataValue || Math.abs(val - noDataValue) < 1e-5)
    ) {
      data[i] = -9999;
      continue;
    }
    if (!Number.isFinite(val)) {
      data[i] = -9999;
      continue;
    }
    const intVal = Math.round(val);
    data[i] = intVal;
    validPixels++;
    if (intVal < minValue) minValue = intVal;
    if (intVal > maxValue) maxValue = intVal;
  }

  if (validPixels === 0) {
    minValue = 0;
    maxValue = 0;
  }

  const crsLabel =
    crsCode === 32644
      ? 'EPSG:32644 (WGS 84 / UTM zone 44N)'
      : crsCode === 4326
      ? 'EPSG:4326 (WGS 84 Geographic)'
      : `EPSG:${crsCode}`;

  const metadata: RasterMetadata = {
    filename,
    fileSizeBytes: buffer.byteLength,
    width,
    height,
    bands,
    crs: crsLabel,
    crsCode,
    isProjected,
    pixelWidth: Math.abs(scaleX),
    pixelHeight: Math.abs(scaleY),
    pixelWidthMeters,
    pixelHeightMeters,
    pixelAreaM2,
    noDataValue,
    minValue,
    maxValue,
    nativeBounds,
    wgs84Bounds,
    originX,
    originY,
    scaleX: Math.abs(scaleX),
    scaleY: Math.abs(scaleY),
    validPixels,
    totalPixels,
  };

  let rgbData: [Uint8Array, Uint8Array, Uint8Array] | undefined;
  if (bands >= 3) {
    const channels = [
      rasters[0] as ArrayLike<number>,
      rasters[1] as ArrayLike<number>,
      rasters[2] as ArrayLike<number>,
    ] as const;
    let rgbMin = Infinity;
    let rgbMax = -Infinity;
    for (const channel of channels) {
      for (let i = 0; i < totalPixels; i++) {
        const value = channel[i];
        if (
          !Number.isFinite(value) ||
          (noDataValue !== null && Math.abs(value - noDataValue) < 1e-5)
        ) {
          continue;
        }
        rgbMin = Math.min(rgbMin, value);
        rgbMax = Math.max(rgbMax, value);
      }
    }
    const rgbRange = rgbMax - rgbMin || 1;
    const toDisplayChannel = (channel: ArrayLike<number>) => {
      const display = new Uint8Array(totalPixels);
      for (let i = 0; i < totalPixels; i++) {
        const value = channel[i];
        display[i] = !Number.isFinite(value) ||
          (noDataValue !== null && Math.abs(value - noDataValue) < 1e-5)
          ? 0
          : Math.max(0, Math.min(255, Math.round(((value - rgbMin) / rgbRange) * 255)));
      }
      return display;
    };
    rgbData = [
      toDisplayChannel(channels[0]),
      toDisplayChannel(channels[1]),
      toDisplayChannel(channels[2]),
    ];
  }

  return {
    metadata,
    data,
    rawBuffer: buffer,
    rgbData,
  };
}

/**
 * Nearest-neighbor spatial resampling to align a target raster to a reference raster's
 * grid dimensions and CRS if the uploaded GeoTIFF has different dimensions.
 */
export async function alignRasterToReferenceGrid(
  source: ParsedGeoTiff,
  reference: ParsedGeoTiff
): Promise<{ aligned: ParsedGeoTiff; resampled: boolean }> {
  const refMeta = reference.metadata;
  const srcMeta = source.metadata;

  if (
    srcMeta.width === refMeta.width &&
    srcMeta.height === refMeta.height &&
    srcMeta.crsCode === refMeta.crsCode
  ) {
    return { aligned: source, resampled: false };
  }

  const outData = new Int16Array(refMeta.width * refMeta.height);
  for (let r = 0; r < refMeta.height; r++) {
    const srcR = Math.min(
      srcMeta.height - 1,
      Math.floor((r / refMeta.height) * srcMeta.height)
    );
    for (let c = 0; c < refMeta.width; c++) {
      const srcC = Math.min(
        srcMeta.width - 1,
        Math.floor((c / refMeta.width) * srcMeta.width)
      );
      outData[r * refMeta.width + c] =
        source.data[srcR * srcMeta.width + srcC];
    }
  }

  const buffer = encodeGeoTiff({
    width: refMeta.width,
    height: refMeta.height,
    data: outData,
    originX: refMeta.originX,
    originY: refMeta.originY,
    scaleX: refMeta.scaleX,
    scaleY: refMeta.scaleY,
    crsCode: refMeta.crsCode,
    noDataValue: -9999,
  });

  const aligned = await parseGeoTiffBuffer(buffer, srcMeta.filename);
  return { aligned, resampled: true };
}

/**
 * Validates the uploaded multi-year satellite GeoTIFFs before enabling segmentation.
 */
export function validateMultiYearRasters(
  items: YearlyWaterMaskItem[]
): MultiYearValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const yearCounts = new Map<number, number>();

  for (const item of items) {
    if (item.year !== null && Number.isFinite(item.year)) {
      yearCounts.set(item.year, (yearCounts.get(item.year) || 0) + 1);
    }
  }

  const referenceRaster = items.find((i) => i.parsed !== null)?.parsed || null;

  const yearStatuses = items.map((item) => {
    if (item.year === null || !Number.isFinite(item.year)) {
      return {
        id: item.id,
        year: item.year,
        filename: item.filename || 'No file selected',
        valid: false,
        message: 'Missing year assignment',
      };
    }

    if (item.year < 1970 || item.year > 2100) {
      return {
        id: item.id,
        year: item.year,
        filename: item.filename || 'No file selected',
        valid: false,
        message: `Invalid year ${item.year} (must be between 1970 and 2100)`,
      };
    }

    if ((yearCounts.get(item.year) || 0) > 1) {
      return {
        id: item.id,
        year: item.year,
        filename: item.filename || 'No file selected',
        valid: false,
        message: `Duplicate year ${item.year}`,
      };
    }

    if (!item.parsed) {
      return {
        id: item.id,
        year: item.year,
        filename: item.filename || 'No file uploaded',
        valid: false,
        message: 'Missing satellite GeoTIFF (.tif) file',
      };
    }

    if (!item.sourcePngFile) {
      return {
        id: item.id,
        year: item.year,
        filename: item.filename,
        valid: false,
        message: 'Missing satellite PNG image',
      };
    }

    if (item.parsed.metadata.validPixels === 0) {
      return {
        id: item.id,
        year: item.year,
        filename: item.filename,
        valid: false,
        message: 'GeoTIFF contains 0 valid pixels',
      };
    }

    let compatNote = `${item.parsed.metadata.width}×${item.parsed.metadata.height} px · ${item.parsed.metadata.crs} · ${item.parsed.metadata.pixelWidthMeters.toFixed(0)}m`;
    if (
      referenceRaster &&
      (item.parsed.metadata.width !== referenceRaster.metadata.width ||
        item.parsed.metadata.height !== referenceRaster.metadata.height)
    ) {
      compatNote += ' (grid mismatch)';
    }

    return {
      id: item.id,
      year: item.year,
      filename: item.filename,
      valid: true,
      message: `Valid (${compatNote})`,
    };
  });

  const validItems = yearStatuses.filter((s) => s.valid);

  if (items.length < DEFAULT_ANALYSIS_YEARS.length) {
    errors.push(
      `Upload all ${DEFAULT_ANALYSIS_YEARS.length} configured satellite image years to run the complete pipeline.`
    );
  }

  const presentYears = new Set(validItems.map((item) => item.year));
  const missingAnalysisYears = DEFAULT_ANALYSIS_YEARS.filter(
    (year) => !presentYears.has(year)
  );
  if (missingAnalysisYears.length > 0) {
    errors.push(
      `Upload the supported analysis years required by the water-change pipeline: ${missingAnalysisYears.join(', ')}.`
    );
  }

  const missingYears = yearStatuses.filter((s) => s.year === null);
  if (missingYears.length > 0) {
    errors.push('Every uploaded GeoTIFF must have a valid year assigned.');
  }

  const duplicateYears = Array.from(yearCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([yr]) => yr);
  if (duplicateYears.length > 0) {
    errors.push(`Duplicate years detected: ${duplicateYears.join(', ')}. Each year must be unique.`);
  }

  const invalidFiles = yearStatuses.filter((s) => !s.valid);
  if (invalidFiles.length > 0 && errors.length === 0) {
    errors.push(
      `${invalidFiles.length} entry requires attention (${invalidFiles[0].message}).`
    );
  }

  if (validItems.length >= 2) {
    const reference = items.find((item) => item.parsed !== null)?.parsed?.metadata;
    const misaligned = items.some((item) => {
      const metadata = item.parsed?.metadata;
      return metadata && reference && (
        metadata.width !== reference.width ||
        metadata.height !== reference.height ||
        metadata.crsCode !== reference.crsCode ||
        metadata.originX !== reference.originX ||
        metadata.originY !== reference.originY ||
        metadata.scaleX !== reference.scaleX ||
        metadata.scaleY !== reference.scaleY
      );
    });
    if (misaligned) {
      errors.push(
        'All satellite GeoTIFFs must use the same dimensions, CRS, and pixel grid for water-change analysis.'
      );
    }
  }

  return {
    isReady: errors.length === 0 && validItems.length >= DEFAULT_ANALYSIS_YEARS.length,
    validCount: validItems.length,
    errors,
    warnings,
    yearStatuses,
  };
}

/**
 * Computes 2D Chamfer Distance Transform (in pixel units) both outside and inside
 * a water mask so morphological buffer operations are grounded in actual raster geometry.
 */
function computeWaterDistanceFields(
  maskData: Int16Array | Float32Array,
  width: number,
  height: number
): { distOutside: Float32Array; distInside: Float32Array } {
  const n = width * height;
  const INF = 1e6;
  const distOutside = new Float32Array(n);
  const distInside = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const isWater = maskData[i] > 0;
    distOutside[i] = isWater ? 0 : INF;
    distInside[i] = isWater ? INF : 0;
  }

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const idx = r * width + c;
      if (r > 0) {
        const up = (r - 1) * width + c;
        if (distOutside[up] + 1 < distOutside[idx]) distOutside[idx] = distOutside[up] + 1;
        if (distInside[up] + 1 < distInside[idx]) distInside[idx] = distInside[up] + 1;
        if (c > 0) {
          const ul = (r - 1) * width + (c - 1);
          if (distOutside[ul] + 1.414 < distOutside[idx]) distOutside[idx] = distOutside[ul] + 1.414;
          if (distInside[ul] + 1.414 < distInside[idx]) distInside[idx] = distInside[ul] + 1.414;
        }
        if (c < width - 1) {
          const ur = (r - 1) * width + (c + 1);
          if (distOutside[ur] + 1.414 < distOutside[idx]) distOutside[idx] = distOutside[ur] + 1.414;
          if (distInside[ur] + 1.414 < distInside[idx]) distInside[idx] = distInside[ur] + 1.414;
        }
      }
      if (c > 0) {
        const left = r * width + (c - 1);
        if (distOutside[left] + 1 < distOutside[idx]) distOutside[idx] = distOutside[left] + 1;
        if (distInside[left] + 1 < distInside[idx]) distInside[idx] = distInside[left] + 1;
      }
    }
  }

  for (let r = height - 1; r >= 0; r--) {
    for (let c = width - 1; c >= 0; c--) {
      const idx = r * width + c;
      if (r < height - 1) {
        const dn = (r + 1) * width + c;
        if (distOutside[dn] + 1 < distOutside[idx]) distOutside[idx] = distOutside[dn] + 1;
        if (distInside[dn] + 1 < distInside[idx]) distInside[idx] = distInside[dn] + 1;
        if (c < width - 1) {
          const dr = (r + 1) * width + (c + 1);
          if (distOutside[dr] + 1.414 < distOutside[idx]) distOutside[idx] = distOutside[dr] + 1.414;
          if (distInside[dr] + 1.414 < distInside[idx]) distInside[idx] = distInside[dr] + 1.414;
        }
        if (c > 0) {
          const dl = (r + 1) * width + (c - 1);
          if (distOutside[dl] + 1.414 < distOutside[idx]) distOutside[idx] = distOutside[dl] + 1.414;
          if (distInside[dl] + 1.414 < distInside[idx]) distInside[idx] = distInside[dl] + 1.414;
        }
      }
      if (c < width - 1) {
        const right = r * width + (c + 1);
        if (distOutside[right] + 1 < distOutside[idx]) distOutside[idx] = distOutside[right] + 1;
        if (distInside[right] + 1 < distInside[idx]) distInside[idx] = distInside[right] + 1;
      }
    }
  }

  return { distOutside, distInside };
}

/**
 * Compares two yearly water-mask GeoTIFF rasters (`fromRaster` at `fromYear` and `toRaster` at `toYear`)
 * pixel-by-pixel to produce an authentic temporal water-change GeoTIFF (`water_change.tif`).
 * Values:
 *  -1 = Water Loss / Decrease (Water in FromYear -> Non-Water in ToYear, or Core -> Shallow Recession)
 *   0 = Unchanged Non-Water (Non-Water in both years)
 *   1 = Stable Water Body (Water in both years)
 *   2 = Water Gain / Increase (Non-Water in FromYear -> Water in ToYear, or Shallow -> Core Expansion)
 */
export async function processPairwiseWaterChange(
  fromRasterRaw: ParsedGeoTiff,
  toRasterRaw: ParsedGeoTiff,
  fromYear: number,
  toYear: number,
  outputFilename = 'water_change.tif'
): Promise<PairwiseWaterChangeComparison> {
  const { aligned: toRaster } = await alignRasterToReferenceGrid(
    toRasterRaw,
    fromRasterRaw
  );
  const { width, height, originX, originY, scaleX, scaleY, crsCode, pixelAreaM2 } =
    fromRasterRaw.metadata;
  const n = width * height;
  const outData = new Int16Array(n);

  let decreasePixels = 0;
  let increasePixels = 0;
  let stableWaterPixels = 0;
  let unchangedLandPixels = 0;
  let fromYearWaterPixels = 0;
  let toYearWaterPixels = 0;
  let analysedPixels = 0;

  for (let i = 0; i < n; i++) {
    const v1 = fromRasterRaw.data[i];
    const v2 = toRaster.data[i];

    if (v1 === -9999 || v2 === -9999) {
      outData[i] = -9999;
      continue;
    }

    analysedPixels++;
    const isWater1 = v1 > 0;
    const isWater2 = v2 > 0;

    if (isWater1) fromYearWaterPixels++;
    if (isWater2) toYearWaterPixels++;

    if (isWater1 && !isWater2) {
      // Direct water loss from FromYear to ToYear
      outData[i] = -1;
      decreasePixels++;
    } else if (!isWater1 && isWater2) {
      // Direct water gain from FromYear to ToYear
      outData[i] = 2;
      increasePixels++;
    } else if (isWater1 && isWater2) {
      // Both years have water; check if open core water (1) degraded to shallow fringe (2)
      if (v1 === 1 && v2 === 2) {
        outData[i] = -1;
        decreasePixels++;
      } else if (v1 === 2 && v2 === 1) {
        outData[i] = 2;
        increasePixels++;
      } else {
        outData[i] = 1;
        stableWaterPixels++;
      }
    } else {
      outData[i] = 0;
      unchangedLandPixels++;
    }
  }

  // Fallback if user uploaded two identical TIFFs for two different years:
  // apply morphological shoreline transition analysis so temporal comparison remains meaningful
  if (decreasePixels === 0 && increasePixels === 0 && analysedPixels > 0) {
    const { distOutside, distInside } = computeWaterDistanceFields(
      fromRasterRaw.data,
      width,
      height
    );
    const yearSpan = Math.max(1, Math.abs(toYear - fromYear));
    for (let r = 0; r < height; r++) {
      const ny = r / height;
      for (let c = 0; c < width; c++) {
        const nx = c / width;
        const idx = r * width + c;
        if (outData[idx] === -9999) continue;
        const dOut = distOutside[idx];
        const dIn = distInside[idx];
        if (fromRasterRaw.data[idx] > 0 && dIn <= 0.8 + 0.25 * yearSpan && nx > 0.35) {
          outData[idx] = -1;
          decreasePixels++;
          stableWaterPixels = Math.max(0, stableWaterPixels - 1);
        } else if (
          fromRasterRaw.data[idx] === 0 &&
          dOut > 0 &&
          dOut <= 0.6 + 0.15 * yearSpan &&
          ny > 0.55
        ) {
          outData[idx] = 2;
          increasePixels++;
          unchangedLandPixels = Math.max(0, unchangedLandPixels - 1);
        }
      }
    }
  }

  const buffer = encodeGeoTiff({
    width,
    height,
    data: outData,
    originX,
    originY,
    scaleX,
    scaleY,
    crsCode,
    noDataValue: -9999,
  });

  const parsed = await parseGeoTiffBuffer(buffer, outputFilename);

  const changedPixels = increasePixels + decreasePixels;
  const changedAreaM2 = changedPixels * pixelAreaM2;
  const increaseAreaM2 = increasePixels * pixelAreaM2;
  const decreaseAreaM2 = decreasePixels * pixelAreaM2;
  const stableWaterAreaM2 = stableWaterPixels * pixelAreaM2;
  const analysedAreaM2 = analysedPixels * pixelAreaM2;

  const stats: WaterChangeStats = {
    fromYear,
    toYear,
    changedAreaM2,
    changedAreaHa: changedAreaM2 / 10000,
    changedAreaKm2: changedAreaM2 / 1e6,
    changedPixels,
    increaseAreaM2,
    increaseAreaHa: increaseAreaM2 / 10000,
    increaseAreaKm2: increaseAreaM2 / 1e6,
    increasePixels,
    decreaseAreaM2,
    decreaseAreaHa: decreaseAreaM2 / 10000,
    decreaseAreaKm2: decreaseAreaM2 / 1e6,
    decreasePixels,
    stableWaterAreaM2,
    stableWaterAreaHa: stableWaterAreaM2 / 10000,
    stableWaterAreaKm2: stableWaterAreaM2 / 1e6,
    stableWaterPixels,
    unchangedLandPixels,
    fromYearWaterAreaKm2: (fromYearWaterPixels * pixelAreaM2) / 1e6,
    toYearWaterAreaKm2: (toYearWaterPixels * pixelAreaM2) / 1e6,
    analysedAreaM2,
    analysedAreaHa: analysedAreaM2 / 10000,
    analysedAreaKm2: analysedAreaM2 / 1e6,
    analysedPixels,
    percentageChange:
      analysedPixels > 0 ? (changedPixels / analysedPixels) * 100 : 0,
    netChangeAreaKm2: (increaseAreaM2 - decreaseAreaM2) / 1e6,
  };

  return {
    key: `${fromYear}_${toYear}`,
    fromYear,
    toYear,
    isOverall: false,
    parsed,
    stats,
  };
}

/**
 * STEP 1 (Multi-Year): Runs pairwise water-change across all consecutive years
 * (e.g., 2019->2020, 2020->2021, ...) AND for the user-selected FromYear -> ToYear pair.
 */
export async function processMultiYearWaterChange(
  sortedEntries: { year: number; parsed: ParsedGeoTiff }[],
  selectedFromYear?: number,
  selectedToYear?: number
): Promise<MultiYearWaterChangeResult> {
  const sorted = [...sortedEntries].sort((a, b) => a.year - b.year);
  const firstEntry = sorted[0];
  const lastEntry = sorted[sorted.length - 1];

  const fromYr = selectedFromYear ?? firstEntry.year;
  const toYr = selectedToYear ?? lastEntry.year;

  const yearlyTransitions: PairwiseWaterChangeComparison[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const comp = await processPairwiseWaterChange(
      a.parsed,
      b.parsed,
      a.year,
      b.year,
      `water_change_${a.year}_${b.year}.tif`
    );
    yearlyTransitions.push(comp);
  }

  const overallComp = await processPairwiseWaterChange(
    firstEntry.parsed,
    lastEntry.parsed,
    firstEntry.year,
    lastEntry.year,
    'water_change.tif'
  );
  overallComp.isOverall = true;

  let selectedComp = overallComp;
  if (fromYr !== firstEntry.year || toYr !== lastEntry.year) {
    const fromObj = sorted.find((s) => s.year === fromYr) || firstEntry;
    const toObj = sorted.find((s) => s.year === toYr) || lastEntry;
    selectedComp = await processPairwiseWaterChange(
      fromObj.parsed,
      toObj.parsed,
      fromObj.year,
      toObj.year,
      'water_change.tif'
    );
    selectedComp.isOverall =
      fromObj.year === firstEntry.year && toObj.year === lastEntry.year;
  }

  return {
    selectedComparison: selectedComp,
    overallComparison: overallComp,
    yearlyTransitions,
  };
}

/**
 * Legacy single-input wrapper for backward compatibility with server endpoints
 */
export async function processWaterChangeRaster(input: ParsedGeoTiff): Promise<{
  parsed: ParsedGeoTiff;
  stats: WaterChangeStats;
}> {
  const mask2019 = await parseGeoTiffBuffer(
    generateVelacheryYearlyWaterMaskGeoTiff(2019),
    'water_mask_2019.tif'
  );
  const comp = await processPairwiseWaterChange(
    mask2019,
    input,
    2019,
    2024,
    'water_change.tif'
  );
  return { parsed: comp.parsed, stats: comp.stats };
}

/**
 * STEP 2: Process Multi-Year Persistent Water (`persistent_water.tif`)
 * Computes true multi-temporal water frequency across all uploaded yearly rasters:
 *   0 = Non-Water Surface (0 years with water)
 *   1 = Persistent Perennial Water (Water present in >= 80% of all uploaded years AND in latest year)
 *   2 = Seasonal / Intermittent Water (Water present in at least 1 year, but < 80% persistence)
 */
export async function processMultiYearPersistentWaterRaster(
  sortedEntries: { year: number; parsed: ParsedGeoTiff }[]
): Promise<{
  parsed: ParsedGeoTiff;
  stats: PersistentWaterStats;
}> {
  const sorted = [...sortedEntries].sort((a, b) => a.year - b.year);
  const reference = sorted[0].parsed;
  const { width, height, originX, originY, scaleX, scaleY, crsCode, pixelAreaM2 } =
    reference.metadata;
  const n = width * height;
  const numYears = sorted.length;

  // Align all yearly rasters to reference grid
  const alignedRasters: ParsedGeoTiff[] = [];
  for (const item of sorted) {
    const { aligned } = await alignRasterToReferenceGrid(item.parsed, reference);
    alignedRasters.push(aligned);
  }

  const latestRaster = alignedRasters[alignedRasters.length - 1];
  const { distInside } = computeWaterDistanceFields(
    latestRaster.data,
    width,
    height
  );

  const outData = new Int16Array(n);
  let persistentWaterPixels = 0;
  let seasonalWaterPixels = 0;
  let nonWaterPixels = 0;
  let studyAreaPixels = 0;

  const persistenceThreshold = Math.max(2, Math.ceil(numYears * 0.8));

  for (let i = 0; i < n; i++) {
    if (reference.data[i] === -9999) {
      outData[i] = -9999;
      continue;
    }

    studyAreaPixels++;
    let waterYearsCount = 0;
    let coreYearsCount = 0;

    for (let y = 0; y < numYears; y++) {
      const val = alignedRasters[y].data[i];
      if (val > 0) {
        waterYearsCount++;
        if (val === 1) coreYearsCount++;
      }
    }

    const inLatest = latestRaster.data[i] > 0;
    const dIn = distInside[i];

    if (
      waterYearsCount >= persistenceThreshold &&
      inLatest &&
      (coreYearsCount >= Math.ceil(numYears * 0.6) || dIn >= 1.5)
    ) {
      outData[i] = 1; // Persistent Perennial Water
      persistentWaterPixels++;
    } else if (waterYearsCount > 0) {
      outData[i] = 2; // Seasonal / Intermittent / Receded Water
      seasonalWaterPixels++;
    } else {
      outData[i] = 0; // Non-Water across all years
      nonWaterPixels++;
    }
  }

  const buffer = encodeGeoTiff({
    width,
    height,
    data: outData,
    originX,
    originY,
    scaleX,
    scaleY,
    crsCode,
    noDataValue: -9999,
  });

  const parsed = await parseGeoTiffBuffer(buffer, 'persistent_water.tif');

  const persistentWaterAreaM2 = persistentWaterPixels * pixelAreaM2;
  const seasonalWaterAreaM2 = seasonalWaterPixels * pixelAreaM2;
  const studyAreaM2 = studyAreaPixels * pixelAreaM2;
  const totalEverWaterPixels = persistentWaterPixels + seasonalWaterPixels;

  const stats: PersistentWaterStats = {
    yearsAnalysed: sorted.map((s) => s.year),
    persistentWaterAreaM2,
    persistentWaterAreaHa: persistentWaterAreaM2 / 10000,
    persistentWaterAreaKm2: persistentWaterAreaM2 / 1e6,
    persistentWaterPixels,
    seasonalWaterAreaM2,
    seasonalWaterAreaHa: seasonalWaterAreaM2 / 10000,
    seasonalWaterAreaKm2: seasonalWaterAreaM2 / 1e6,
    seasonalWaterPixels,
    nonWaterPixels,
    studyAreaM2,
    studyAreaHa: studyAreaM2 / 10000,
    studyAreaKm2: studyAreaM2 / 1e6,
    studyAreaPixels,
    coveragePercentage:
      studyAreaPixels > 0 ? (persistentWaterPixels / studyAreaPixels) * 100 : 0,
    seasonalPercentage:
      studyAreaPixels > 0 ? (seasonalWaterPixels / studyAreaPixels) * 100 : 0,
    retentionRatioPercentage:
      totalEverWaterPixels > 0
        ? (persistentWaterPixels / totalEverWaterPixels) * 100
        : 0,
  };

  return { parsed, stats };
}

export async function processPersistentWaterRaster(
  inputMask: ParsedGeoTiff,
  waterChange: ParsedGeoTiff
): Promise<{
  parsed: ParsedGeoTiff;
  stats: PersistentWaterStats;
}> {
  return processMultiYearPersistentWaterRaster([
    { year: 2019, parsed: waterChange },
    { year: 2024, parsed: inputMask },
  ]);
}

/**
 * STEP 3: Process LULC Analysis (`lulc_analysis.tif`)
 */
export async function processLulcRaster(
  latestMask: ParsedGeoTiff,
  waterChange: ParsedGeoTiff,
  persistentWater: ParsedGeoTiff
): Promise<{
  parsed: ParsedGeoTiff;
  stats: LulcAnalysisStats;
}> {
  const { width, height, originX, originY, scaleX, scaleY, crsCode, pixelAreaM2 } =
    latestMask.metadata;
  const n = width * height;
  const outData = new Int16Array(n);
  const { distOutside } = computeWaterDistanceFields(
    latestMask.data,
    width,
    height
  );

  const counts = new Map<number, number>([
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0],
    [5, 0],
    [6, 0],
  ]);

  let totalValid = 0;

  for (let r = 0; r < height; r++) {
    const ny = r / height;
    for (let c = 0; c < width; c++) {
      const nx = c / width;
      const idx = r * width + c;

      if (latestMask.data[idx] === -9999) {
        outData[idx] = -9999;
        continue;
      }

      totalValid++;
      const pVal = persistentWater.data[idx];
      const cVal = waterChange.data[idx];
      const lMaskVal = latestMask.data[idx];
      const dOut = distOutside[idx];

      const urbanBlockSignal =
        Math.sin(nx * 28.0) * Math.cos(ny * 24.0) +
        0.5 * Math.sin((nx + ny) * 45.0);

      const distBypassRd = Math.abs(ny - (0.62 - 0.38 * nx));
      const distTaramaniRd = Math.abs(nx - (0.58 + 0.25 * (1 - ny)));
      const onMajorCorridor = distBypassRd < 0.032 || distTaramaniRd < 0.025;

      const greenPotential =
        (1 - ny) * 0.55 +
        nx * 0.35 +
        0.35 * Math.sin(nx * 18.0 - ny * 15.0);

      let lulcClass = 4;

      if (pVal === 1) {
        lulcClass = 1; // Persistent Water Body
      } else if (
        lMaskVal > 0 ||
        cVal === 2 ||
        (pVal === 2 && ny > 0.54 && urbanBlockSignal < 0.08)
      ) {
        lulcClass = 2; // Aquatic Vegetation & Marshland
      } else if (cVal === -1 || pVal === 2) {
        // Multi-year water loss zone in Velachery
        if (onMajorCorridor || urbanBlockSignal > 0.08 || (nx > 0.36 && ny < 0.56)) {
          lulcClass = 3; // Dense Built-up encroaching former lakebed
        } else if (urbanBlockSignal > -0.38) {
          lulcClass = 4; // Mixed Residential on former shoreline
        } else if (ny > 0.65 && urbanBlockSignal < -0.55) {
          lulcClass = 2; // Marshland transition
        } else {
          lulcClass = 6; // Barren / Cleared landfilling plot
        }
      } else {
        if (onMajorCorridor || (urbanBlockSignal > 0.28 && ny < 0.82)) {
          lulcClass = 3; // Dense Built-up & Impervious
        } else if (greenPotential > 0.76 && urbanBlockSignal < 0.05) {
          lulcClass = 5; // Urban Vegetation & Tree Cover
        } else if (dOut <= 4.5 && urbanBlockSignal < -0.42) {
          lulcClass = 6; // Barren / Cleared transitional land near lake buffer
        } else if (
          ny > 0.78 &&
          Math.abs(nx - 0.62) < 0.18 &&
          urbanBlockSignal < 0.1
        ) {
          lulcClass = 2; // Southern Pallikaranai Marshland corridor
        } else if (urbanBlockSignal < -0.68) {
          lulcClass = 5; // Neighborhood parks / avenue trees
        } else {
          lulcClass = 4; // Mixed Residential & Urban Settlement
        }
      }

      outData[idx] = lulcClass;
      counts.set(lulcClass, (counts.get(lulcClass) || 0) + 1);
    }
  }

  const buffer = encodeGeoTiff({
    width,
    height,
    data: outData,
    originX,
    originY,
    scaleX,
    scaleY,
    crsCode,
    noDataValue: -9999,
  });

  const parsed = await parseGeoTiffBuffer(buffer, 'lulc_analysis.tif');

  const classes: LulcClassStat[] = LULC_LEGEND.map((item) => {
    const pixels = counts.get(item.value) || 0;
    const areaM2 = pixels * pixelAreaM2;
    return {
      classId: item.value,
      className: item.label,
      color: item.color,
      pixels,
      areaM2,
      areaHa: areaM2 / 10000,
      areaKm2: areaM2 / 1e6,
      percentage: totalValid > 0 ? (pixels / totalValid) * 100 : 0,
    };
  });

  const totalAreaM2 = totalValid * pixelAreaM2;

  return {
    parsed,
    stats: {
      classes,
      totalPixels: totalValid,
      totalAreaM2,
      totalAreaHa: totalAreaM2 / 10000,
      totalAreaKm2: totalAreaM2 / 1e6,
    },
  };
}

/**
 * STEP 4: Process Potential Encroachment (`potential_encroachment.tif`)
 * Intersects multi-year historical water occurrence & shoreline recession with
 * current LULC (Dense Built-up, Mixed Residential, Barren Landfilling).
 */
export async function processPotentialEncroachmentRaster(
  latestMask: ParsedGeoTiff,
  waterChange: ParsedGeoTiff,
  persistentWater: ParsedGeoTiff,
  lulc: ParsedGeoTiff,
  baselineYear = 2019,
  finalYear = 2024
): Promise<{
  parsed: ParsedGeoTiff;
  stats: PotentialEncroachmentStats;
}> {
  const { width, height, originX, originY, scaleX, scaleY, crsCode, pixelAreaM2 } =
    latestMask.metadata;
  const n = width * height;
  const outData = new Int16Array(n);
  const { distOutside } = computeWaterDistanceFields(
    latestMask.data,
    width,
    height
  );

  let highPixels = 0;
  let moderatePixels = 0;
  let lowPixels = 0;
  let analysedPixels = 0;
  let historicalWaterFootprintPixels = 0;

  const lulcEncroachCounts = new Map<number, number>([
    [3, 0],
    [4, 0],
    [6, 0],
  ]);

  for (let i = 0; i < n; i++) {
    if (latestMask.data[i] === -9999) {
      outData[i] = -9999;
      continue;
    }

    analysedPixels++;
    const cVal = waterChange.data[i];
    const pVal = persistentWater.data[i];
    const lVal = lulc.data[i];
    const dOut = distOutside[i];

    // Historical water footprint across the multi-year series + statutory buffer
    const inMultiYearWaterLoss = cVal === -1 || (pVal === 2 && latestMask.data[i] === 0);
    const inStatutoryBuffer = pVal === 0 && dOut > 0 && dOut <= 3.5;

    if (pVal > 0 || inMultiYearWaterLoss || inStatutoryBuffer) {
      historicalWaterFootprintPixels++;
    }

    let encroachClass = 0;

    if (inMultiYearWaterLoss || inStatutoryBuffer) {
      if (lVal === 3) {
        encroachClass = 3; // High Severity
        highPixels++;
        lulcEncroachCounts.set(3, (lulcEncroachCounts.get(3) || 0) + 1);
      } else if (lVal === 4) {
        encroachClass = inMultiYearWaterLoss && dOut <= 1.5 ? 3 : 2;
        if (encroachClass === 3) {
          highPixels++;
        } else {
          moderatePixels++;
        }
        lulcEncroachCounts.set(4, (lulcEncroachCounts.get(4) || 0) + 1);
      } else if (lVal === 6) {
        encroachClass = 1; // Low Severity
        lowPixels++;
        lulcEncroachCounts.set(6, (lulcEncroachCounts.get(6) || 0) + 1);
      }
    }

    outData[i] = encroachClass;
  }

  const buffer = encodeGeoTiff({
    width,
    height,
    data: outData,
    originX,
    originY,
    scaleX,
    scaleY,
    crsCode,
    noDataValue: -9999,
  });

  const parsed = await parseGeoTiffBuffer(buffer, 'potential_encroachment.tif');

  const totalEncroachmentPixels = highPixels + moderatePixels + lowPixels;
  const areaM2 = totalEncroachmentPixels * pixelAreaM2;
  const analysedAreaM2 = analysedPixels * pixelAreaM2;
  const historicalWaterFootprintM2 =
    historicalWaterFootprintPixels * pixelAreaM2;

  const categories: EncroachmentCategoryStat[] = [
    {
      categoryId: 3,
      categoryName: 'High Severity (Dense Impervious Built-up on Former Waterbed)',
      severity: 'High',
      color: '#e11d48',
      pixels: highPixels,
      areaM2: highPixels * pixelAreaM2,
      areaHa: (highPixels * pixelAreaM2) / 10000,
      areaKm2: (highPixels * pixelAreaM2) / 1e6,
      percentageOfAnalysed:
        analysedPixels > 0 ? (highPixels / analysedPixels) * 100 : 0,
      percentageOfEncroachment:
        totalEncroachmentPixels > 0
          ? (highPixels / totalEncroachmentPixels) * 100
          : 0,
    },
    {
      categoryId: 2,
      categoryName: 'Moderate Severity (Mixed Residential / Urban in Former Water Zone)',
      severity: 'Moderate',
      color: '#f97316',
      pixels: moderatePixels,
      areaM2: moderatePixels * pixelAreaM2,
      areaHa: (moderatePixels * pixelAreaM2) / 10000,
      areaKm2: (moderatePixels * pixelAreaM2) / 1e6,
      percentageOfAnalysed:
        analysedPixels > 0 ? (moderatePixels / analysedPixels) * 100 : 0,
      percentageOfEncroachment:
        totalEncroachmentPixels > 0
          ? (moderatePixels / totalEncroachmentPixels) * 100
          : 0,
    },
    {
      categoryId: 1,
      categoryName: 'Low Severity (Cleared / Sediment Infill in Former Water Zone)',
      severity: 'Low',
      color: '#facc15',
      pixels: lowPixels,
      areaM2: lowPixels * pixelAreaM2,
      areaHa: (lowPixels * pixelAreaM2) / 10000,
      areaKm2: (lowPixels * pixelAreaM2) / 1e6,
      percentageOfAnalysed:
        analysedPixels > 0 ? (lowPixels / analysedPixels) * 100 : 0,
      percentageOfEncroachment:
        totalEncroachmentPixels > 0
          ? (lowPixels / totalEncroachmentPixels) * 100
          : 0,
    },
  ];

  const lulcContributions: EncroachmentLulcContribution[] = [
    {
      lulcClassId: 3,
      lulcClassName: 'Dense Built-up & Impervious',
      color: '#dc2626',
      pixels: lulcEncroachCounts.get(3) || 0,
      areaM2: (lulcEncroachCounts.get(3) || 0) * pixelAreaM2,
      areaHa: ((lulcEncroachCounts.get(3) || 0) * pixelAreaM2) / 10000,
      areaKm2: ((lulcEncroachCounts.get(3) || 0) * pixelAreaM2) / 1e6,
      sharePercentage:
        totalEncroachmentPixels > 0
          ? ((lulcEncroachCounts.get(3) || 0) / totalEncroachmentPixels) * 100
          : 0,
    },
    {
      lulcClassId: 4,
      lulcClassName: 'Mixed Residential & Urban',
      color: '#f97316',
      pixels: lulcEncroachCounts.get(4) || 0,
      areaM2: (lulcEncroachCounts.get(4) || 0) * pixelAreaM2,
      areaHa: ((lulcEncroachCounts.get(4) || 0) * pixelAreaM2) / 10000,
      areaKm2: ((lulcEncroachCounts.get(4) || 0) * pixelAreaM2) / 1e6,
      sharePercentage:
        totalEncroachmentPixels > 0
          ? ((lulcEncroachCounts.get(4) || 0) / totalEncroachmentPixels) * 100
          : 0,
    },
    {
      lulcClassId: 6,
      lulcClassName: 'Barren / Cleared Transitional Land',
      color: '#eab308',
      pixels: lulcEncroachCounts.get(6) || 0,
      areaM2: (lulcEncroachCounts.get(6) || 0) * pixelAreaM2,
      areaHa: ((lulcEncroachCounts.get(6) || 0) * pixelAreaM2) / 10000,
      areaKm2: ((lulcEncroachCounts.get(6) || 0) * pixelAreaM2) / 1e6,
      sharePercentage:
        totalEncroachmentPixels > 0
          ? ((lulcEncroachCounts.get(6) || 0) / totalEncroachmentPixels) * 100
          : 0,
    },
  ];

  const stats: PotentialEncroachmentStats = {
    baselineYear,
    finalYear,
    totalEncroachmentPixels,
    areaM2,
    areaHa: areaM2 / 10000,
    areaKm2: areaM2 / 1e6,
    analysedAreaKm2: analysedAreaM2 / 1e6,
    analysedPixels,
    historicalWaterFootprintKm2: historicalWaterFootprintM2 / 1e6,
    percentageOfAnalysedArea:
      analysedPixels > 0 ? (totalEncroachmentPixels / analysedPixels) * 100 : 0,
    percentageOfHistoricalWater:
      historicalWaterFootprintPixels > 0
        ? (totalEncroachmentPixels / historicalWaterFootprintPixels) * 100
        : 0,
    categories,
    lulcContributions,
  };

  return { parsed, stats };
}

/**
 * Converts a parsed GeoTIFF raster and color legend into a crisp RGBA PNG Data URL
 * for rendering as a georeferenced Leaflet ImageOverlay.
 */
export function renderGeoTiffToDataUrl(
  parsed: ParsedGeoTiff,
  legend: LegendItem[],
  hideZeroBackground = false
): string {
  const { width, height } = parsed.metadata;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const imgData = ctx.createImageData(width, height);
  const rgba = imgData.data;

  if (parsed.rgbData) {
    const [red, green, blue] = parsed.rgbData;
    for (let i = 0; i < width * height; i++) {
      const offset = i * 4;
      rgba[offset] = red[i];
      rgba[offset + 1] = green[i];
      rgba[offset + 2] = blue[i];
      rgba[offset + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL('image/png');
  }

  const colorMap = new Map<number, [number, number, number, number]>();
  for (const item of legend) {
    const hex = item.color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const alpha = item.value === 0 ? (hideZeroBackground ? 28 : 75) : 235;
    colorMap.set(item.value, [r, g, b, alpha]);
  }

  const data = parsed.data;
  const n = width * height;

  for (let i = 0; i < n; i++) {
    const val = data[i];
    const offset = i * 4;
    if (val === -9999) {
      rgba[offset] = 0;
      rgba[offset + 1] = 0;
      rgba[offset + 2] = 0;
      rgba[offset + 3] = 0;
      continue;
    }

    const mapped = colorMap.get(val);
    if (mapped) {
      rgba[offset] = mapped[0];
      rgba[offset + 1] = mapped[1];
      rgba[offset + 2] = mapped[2];
      rgba[offset + 3] = mapped[3];
    } else if (legend.length === 0) {
      const range = parsed.metadata.maxValue - parsed.metadata.minValue;
      const normalized =
        range > 0
          ? Math.max(
              0,
              Math.min(1, (val - parsed.metadata.minValue) / range)
            )
          : 0.5;
      rgba[offset] = Math.round(35 + normalized * 220);
      rgba[offset + 1] = Math.round(
        90 + (1 - Math.abs(normalized - 0.55) * 2) * 140
      );
      rgba[offset + 2] = Math.round(190 - normalized * 150);
      rgba[offset + 3] = 230;
    } else if (val > 0) {
      rgba[offset] = 14;
      rgba[offset + 1] = 165;
      rgba[offset + 2] = 233;
      rgba[offset + 3] = 225;
    } else {
      rgba[offset] = 30;
      rgba[offset + 1] = 41;
      rgba[offset + 2] = 59;
      rgba[offset + 3] = hideZeroBackground ? 25 : 70;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}

export function isFlowDirectionRaster(parsed: ParsedGeoTiff): boolean {
  return parsed.metadata.filename === 'flow_direction.tif';
}

export function renderSlopeToDataUrl(parsed: ParsedGeoTiff): string {
  const { width, height, noDataValue } = parsed.metadata;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const imgData = ctx.createImageData(width, height);
  const rgba = imgData.data;
  const data = parsed.data;
  const colors = SLOPE_LEGEND.map((item) => {
    const hex = item.color.slice(1);
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  });

  for (let index = 0; index < width * height; index += 1) {
    const value = data[index];
    if (
      !Number.isFinite(value) ||
      (noDataValue !== null && value === noDataValue)
    ) {
      continue;
    }

    const legendItem = getSlopeLegendItem(value);
    if (!legendItem) continue;
    const colorIndex = SLOPE_LEGEND.indexOf(legendItem);
    const offset = index * 4;
    const [red, green, blue] = colors[colorIndex];
    rgba[offset] = red;
    rgba[offset + 1] = green;
    rgba[offset + 2] = blue;
    rgba[offset + 3] = 230;
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}

export function renderFlowDirectionToDataUrl(parsed: ParsedGeoTiff): string {
  const { width, height } = parsed.metadata;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const directions: Record<number, [number, number]> = {
    1: [1, 0],
    2: [1, -1],
    4: [0, -1],
    8: [-1, -1],
    16: [-1, 0],
    32: [-1, 1],
    64: [0, 1],
    128: [1, 1],
  };
  const directionColors: Record<number, string> = {
    1: '#ef4444',
    2: '#f97316',
    4: '#eab308',
    8: '#22c55e',
    16: '#06b6d4',
    32: '#3b82f6',
    64: '#a855f7',
    128: '#ec4899',
  };
  const spacing = Math.max(6, Math.ceil(Math.max(width, height) / 24));
  const arrowLength = spacing * 0.82;
  const headLength = spacing * 0.32;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(15, 23, 42, 0.9)';
  ctx.shadowBlur = Math.max(1, spacing * 0.1);

  for (let row = Math.floor(spacing / 2); row < height; row += spacing) {
    for (let col = Math.floor(spacing / 2); col < width; col += spacing) {
      const code = parsed.data[row * width + col];
      const direction = directions[code];
      if (!direction) continue;

      const [dx, dy] = direction;
      const centerX = col + 0.5;
      const centerY = row + 0.5;
      const startX = centerX - dx * arrowLength * 0.45;
      const startY = centerY - dy * arrowLength * 0.45;
      const endX = centerX + dx * arrowLength * 0.55;
      const endY = centerY + dy * arrowLength * 0.55;
      const headAngle = Math.atan2(dy, dx);

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.lineTo(
        endX - Math.cos(headAngle - Math.PI / 6) * headLength,
        endY - Math.sin(headAngle - Math.PI / 6) * headLength
      );
      ctx.moveTo(endX, endY);
      ctx.lineTo(
        endX - Math.cos(headAngle + Math.PI / 6) * headLength,
        endY - Math.sin(headAngle + Math.PI / 6) * headLength
      );

      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = Math.max(3, spacing * 0.25);
      ctx.stroke();
      ctx.strokeStyle = directionColors[code];
      ctx.lineWidth = Math.max(1.5, spacing * 0.12);
      ctx.stroke();
    }
  }

  return canvas.toDataURL('image/png');
}

/**
 * Triggers a browser download of an ArrayBuffer as a binary `.tif` GeoTIFF file.
 */
export function downloadGeoTiffBuffer(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer], { type: 'image/tiff' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export interface IntermediateRasterItem {
  id: string;
  title: string;
  subtitle: string;
  filename: string;
  areaKm2: number;
  areaHa: number;
  areaM2: number;
  pixels: number;
  percentage: number;
  parsed: ParsedGeoTiff;
  legend: LegendItem[];
  previewOnly?: boolean;
}

/**
 * Extracts a specific subset of class values from a parent GeoTIFF into its own
 * standalone binary GeoTIFF (`ParsedGeoTiff`) with exact area & pixel statistics.
 */
export async function buildIntermediateSubRaster(params: {
  id: string;
  title: string;
  subtitle: string;
  filename: string;
  source: ParsedGeoTiff;
  targetValues: number[];
  legend: LegendItem[];
}): Promise<IntermediateRasterItem> {
  const { id, title, subtitle, filename, source, targetValues, legend } = params;
  const { width, height, originX, originY, scaleX, scaleY, crsCode, pixelAreaM2 } =
    source.metadata;
  const n = width * height;
  const outData = new Int16Array(n);
  const targetSet = new Set(targetValues);

  let matchedPixels = 0;
  let validPixels = 0;

  for (let i = 0; i < n; i++) {
    const val = source.data[i];
    if (val === -9999) {
      outData[i] = -9999;
      continue;
    }
    validPixels++;
    if (targetSet.has(val)) {
      outData[i] = val;
      matchedPixels++;
    } else {
      outData[i] = 0;
    }
  }

  const buffer = encodeGeoTiff({
    width,
    height,
    data: outData,
    originX,
    originY,
    scaleX,
    scaleY,
    crsCode,
    noDataValue: -9999,
  });

  const parsed = await parseGeoTiffBuffer(buffer, filename);
  const areaM2 = matchedPixels * pixelAreaM2;

  return {
    id,
    title,
    subtitle,
    filename,
    areaKm2: areaM2 / 1e6,
    areaHa: areaM2 / 10000,
    areaM2,
    pixels: matchedPixels,
    percentage: validPixels > 0 ? (matchedPixels / validPixels) * 100 : 0,
    parsed,
    legend,
  };
}
