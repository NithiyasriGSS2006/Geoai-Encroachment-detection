import type { GeoBoundsWGS84, ParsedGeoTiff } from './geotiffEngine';

export type DynamicFlowSeverity = 'free' | 'moderate' | 'critical' | 'encroached';

export interface DynamicFlowSegment {
  id: string;
  name: string;
  location: string;
  coordinates: [number, number][];
  directionDeg: number;
  cardinalDirection: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
  lengthM: number;
  slopePct: number;
  elevationDropM: number;
  meanAccumulation: number;
  severity: DynamicFlowSeverity;
  drainType: string;
  drainDimensions: string;
  material: string;
  status: string;
}

export interface DynamicSignalOrSink {
  id: string;
  type: 'signal_inlet' | 'signal_junction' | 'accumulation_sump';
  title: string;
  lat: number;
  lng: number;
  elevationM?: number;
  accumulationScore?: number;
  severity: DynamicFlowSeverity;
  details: string;
}

export interface DynamicTraceResult {
  pathCoordinates: [number, number][];
  totalDistanceM: number;
  startElevation?: number;
  endElevation?: number;
  stepsCount: number;
  bottlenecksDetected: number;
}

export const D8_OFFSETS: Record<number, [number, number]> = {
  1: [1, 0],
  2: [1, -1],
  4: [0, -1],
  8: [-1, -1],
  16: [-1, 0],
  32: [-1, 1],
  64: [0, 1],
  128: [1, 1],
};

export function computeBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLon = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function degreesToCardinal(deg: number): DynamicFlowSegment['cardinalDirection'] {
  return (['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const)[Math.round(deg / 45) % 8];
}

export function latLngToGrid(
  lat: number,
  lng: number,
  bounds: GeoBoundsWGS84,
  width: number,
  height: number
): [number, number] {
  return [
    Math.floor(((lng - bounds.west) / (bounds.east - bounds.west)) * width),
    Math.floor(((bounds.north - lat) / (bounds.north - bounds.south)) * height),
  ];
}

export function gridToLatLng(
  col: number,
  row: number,
  bounds: GeoBoundsWGS84,
  width: number,
  height: number
): [number, number] {
  return [
    bounds.north - (row / height) * (bounds.north - bounds.south),
    bounds.west + (col / width) * (bounds.east - bounds.west),
  ];
}

export function sampleRasterAtLatLng(raster: ParsedGeoTiff, lat: number, lng: number): number | null {
  const { wgs84Bounds, width, height, noDataValue } = raster.metadata;
  const [col, row] = latLngToGrid(lat, lng, wgs84Bounds, width, height);
  if (col < 0 || col >= width || row < 0 || row >= height) return null;
  const value = raster.data[row * width + col];
  return Number.isFinite(value) && (noDataValue === null || value !== noDataValue) ? value : null;
}

export function buildDynamicFlowSegments(
  geoJsonData: unknown,
  accumulationRaster: ParsedGeoTiff | null = null
): { segments: DynamicFlowSegment[]; signalsAndSinks: DynamicSignalOrSink[] } {
  if (!geoJsonData || typeof geoJsonData !== 'object' || !Array.isArray((geoJsonData as { features?: unknown[] }).features)) {
    return { segments: [], signalsAndSinks: [] };
  }

  const segments: DynamicFlowSegment[] = [];
  const junctions = new Map<string, { lat: number; lng: number; count: number }>();
  const features = (geoJsonData as { features: Array<{ geometry?: { type?: string; coordinates?: unknown }; properties?: Record<string, unknown> }> }).features;

  features.forEach((feature, featureIndex) => {
    const geometry = feature.geometry;
    if (!geometry || (geometry.type !== 'LineString' && geometry.type !== 'MultiLineString')) return;
    const lines: number[][][] = geometry.type === 'LineString'
      ? [geometry.coordinates as number[][]]
      : (geometry.coordinates as number[][][]);
    const props = feature.properties || {};

    lines.forEach((line, lineIndex) => {
      const coordinates = line
        .filter((coordinate) => coordinate.length >= 2 && coordinate.every(Number.isFinite))
        .map(([lng, lat]) => [lat, lng] as [number, number]);
      if (coordinates.length < 2) return;

      let lengthM = 0;
      for (let i = 1; i < coordinates.length; i += 1) {
        const [lat1, lng1] = coordinates[i - 1];
        const [lat2, lng2] = coordinates[i];
        lengthM += Math.hypot((lat2 - lat1) * 111000, (lng2 - lng1) * 111000 * Math.cos((lat1 * Math.PI) / 180));
      }
      const start = coordinates[0];
      const end = coordinates[coordinates.length - 1];
      const directionDeg = computeBearing(start[0], start[1], end[0], end[1]);
      const accumulationValues = accumulationRaster
        ? coordinates.map(([lat, lng]) => sampleRasterAtLatLng(accumulationRaster, lat, lng)).filter((value): value is number => value !== null)
        : [];
      const meanAccumulation = accumulationValues.length
        ? Math.round(accumulationValues.reduce((sum, value) => sum + value, 0) / accumulationValues.length)
        : 0;
      const status = String(props.status || 'Active');
      const severity: DynamicFlowSeverity =
        status.toLowerCase().includes('chok') || meanAccumulation > 3000
          ? 'critical'
          : meanAccumulation > 1000
            ? 'moderate'
            : 'free';

      segments.push({
        id: `drain-${String(props.objectid || featureIndex)}-${lineIndex}`,
        name: String(props.location || props.drain_type || `Runoff Channel ${featureIndex + 1}`),
        location: String(props.location || 'Catchment Study Area'),
        coordinates,
        directionDeg: Math.round(directionDeg),
        cardinalDirection: degreesToCardinal(directionDeg),
        lengthM: Math.max(1, Math.round(lengthM)),
        slopePct: 0,
        elevationDropM: 0,
        meanAccumulation,
        severity,
        drainType: String(props.drain_type || 'Storm Water Drain'),
        drainDimensions: String(props.drain_size || 'Not specified'),
        material: String(props.swd_mat || props.typ_mat || 'Concrete'),
        status,
      });

      for (const point of [start, end]) {
        const key = `${point[0].toFixed(4)},${point[1].toFixed(4)}`;
        const existing = junctions.get(key);
        junctions.set(key, { lat: point[0], lng: point[1], count: (existing?.count || 0) + 1 });
      }
    });
  });

  const signalsAndSinks = [...junctions.values()]
    .filter((point) => point.count > 1)
    .map((point, index) => ({
      id: `junction-${index}`,
      type: 'signal_junction' as const,
      title: 'Drainage Junction',
      lat: point.lat,
      lng: point.lng,
      severity: 'moderate' as const,
      details: `${point.count} drainage segments meet at this location.`,
    }));

  return { segments, signalsAndSinks };
}

export function extractDynamicStreamlinesFromRaster(
  flowDirectionRaster: ParsedGeoTiff,
  maxLines = 360
): DynamicFlowSegment[] {
  const { width, height, wgs84Bounds, noDataValue } = flowDirectionRaster.metadata;
  const stride = Math.max(1, Math.ceil(Math.max(width, height) / 28));
  const streamlines: DynamicFlowSegment[] = [];

  for (let row = 0; row < height && streamlines.length < maxLines; row += stride) {
    for (let col = 0; col < width && streamlines.length < maxLines; col += stride) {
      const startValue = flowDirectionRaster.data[row * width + col];
      if (
        !Number.isFinite(startValue) ||
        (noDataValue !== null && startValue === noDataValue) ||
        !D8_OFFSETS[startValue]
      ) {
        continue;
      }

      const coordinates: [number, number][] = [];
      const visited = new Set<string>();
      let currentCol = col;
      let currentRow = row;

      for (let step = 0; step < 48; step += 1) {
        if (
          currentCol < 0 ||
          currentCol >= width ||
          currentRow < 0 ||
          currentRow >= height
        ) {
          break;
        }
        const key = `${currentCol},${currentRow}`;
        if (visited.has(key)) break;
        visited.add(key);

        const value = flowDirectionRaster.data[currentRow * width + currentCol];
        const offset = D8_OFFSETS[value];
        if (!Number.isFinite(value) || !offset) break;
        coordinates.push(
          gridToLatLng(currentCol + 0.5, currentRow + 0.5, wgs84Bounds, width, height)
        );
        currentCol += offset[0];
        currentRow += offset[1];
      }

      if (coordinates.length < 2) continue;
      const start = coordinates[0];
      const end = coordinates[coordinates.length - 1];
      const directionDeg = computeBearing(start[0], start[1], end[0], end[1]);
      streamlines.push({
        id: `raster-flow-${row}-${col}`,
        name: 'D8 raster flow path',
        location: 'Flow-direction raster',
        coordinates,
        directionDeg: Math.round(directionDeg),
        cardinalDirection: degreesToCardinal(directionDeg),
        lengthM: Math.max(1, Math.round((coordinates.length - 1) * 25)),
        slopePct: 0,
        elevationDropM: 0,
        meanAccumulation: 0,
        severity: 'free',
        drainType: 'Raster-derived flow',
        drainDimensions: 'Raster cell path',
        material: 'Terrain',
        status: 'Flow direction',
      });
    }
  }

  return streamlines;
}

export function traceDynamicDownhillFlow(
  flowDirectionRaster: ParsedGeoTiff,
  lat: number,
  lng: number,
  maxSteps = 300
): DynamicTraceResult {
  const { wgs84Bounds, width, height } = flowDirectionRaster.metadata;
  let [col, row] = latLngToGrid(lat, lng, wgs84Bounds, width, height);
  const pathCoordinates: [number, number][] = [];
  const visited = new Set<string>();

  for (let step = 0; step < maxSteps; step += 1) {
    if (col < 0 || col >= width || row < 0 || row >= height) break;
    const key = `${col},${row}`;
    if (visited.has(key)) break;
    visited.add(key);
    pathCoordinates.push(gridToLatLng(col + 0.5, row + 0.5, wgs84Bounds, width, height));
    const direction = flowDirectionRaster.data[row * width + col];
    const offset = D8_OFFSETS[direction];
    if (!offset) break;
    col += offset[0];
    row += offset[1];
  }

  let totalDistanceM = 0;
  for (let i = 1; i < pathCoordinates.length; i += 1) {
    const [lat1, lng1] = pathCoordinates[i - 1];
    const [lat2, lng2] = pathCoordinates[i];
    totalDistanceM += Math.hypot((lat2 - lat1) * 111000, (lng2 - lng1) * 111000 * Math.cos((lat1 * Math.PI) / 180));
  }
  return { pathCoordinates, totalDistanceM, stepsCount: pathCoordinates.length, bottlenecksDetected: 0 };
}
