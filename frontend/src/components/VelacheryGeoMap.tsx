import React, { useEffect, useMemo, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  ImageOverlay,
  Rectangle,
  CircleMarker,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import {
  Maximize2,
  Minimize2,
  Crosshair,
  Layers,
  Eye,
  EyeOff,
  Sliders,
  MapPin,
} from 'lucide-react';
import {
  ParsedGeoTiff,
  LegendItem,
  VELACHERY_STUDY_AREA,
  renderGeoTiffToDataUrl,
} from '../utils/geotiffEngine';

interface VelacheryGeoMapProps {
  raster: ParsedGeoTiff | null;
  legend: LegendItem[];
  stepTitle: string;
  outputFilename?: string;
  focusTrigger?: number;
  compact?: boolean;
}

type BaseMapType = 'osm' | 'positron' | 'dark' | 'satellite';

const BASE_MAPS: Record<
  BaseMapType,
  { name: string; url: string; attribution: string }
> = {
  osm: {
    name: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  positron: {
    name: 'Carto Positron',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
  },
  dark: {
    name: 'Carto Dark GIS',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
  },
  satellite: {
    name: 'Esri Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
  },
};

// Verified real geographic reference points inside Velachery, Chennai, Tamil Nadu
const VELACHERY_LANDMARKS = [
  {
    name: 'Velachery Lake Core Basin',
    lat: 12.9801,
    lng: 80.2138,
    zone: 'Primary Perennial Waterbody',
  },
  {
    name: '100 Feet Bypass Shoreline (North-East)',
    lat: 12.9825,
    lng: 80.2189,
    zone: 'High-Pressure Urban Corridor',
  },
  {
    name: 'Ram Nagar South Marsh Fringe',
    lat: 12.9728,
    lng: 80.2175,
    zone: 'Low-Lying Floodplain & Transition',
  },
  {
    name: 'Vijayanagar Western Basin',
    lat: 12.9768,
    lng: 80.2078,
    zone: 'Western Catchment Inflow',
  },
  {
    name: 'Pallikaranai North Drainage Link',
    lat: 12.9698,
    lng: 80.2212,
    zone: 'Southern Marsh Outfall Corridor',
  },
  {
    name: 'Taramani Link Retention Zone',
    lat: 12.9818,
    lng: 80.2268,
    zone: 'Eastern Institutional Sub-Basin',
  },
];

function MapBoundsController({
  bounds,
  focusTrigger,
  isFullscreen,
}: {
  bounds: L.LatLngBoundsExpression;
  focusTrigger: number;
  isFullscreen: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    map.invalidateSize();
    const timer = setTimeout(() => {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16 });
    }, 80);
    return () => clearTimeout(timer);
  }, [map, bounds, focusTrigger, isFullscreen]);

  return null;
}

function RasterPixelInspector({
  raster,
  legend,
  onHoverPixel,
}: {
  raster: ParsedGeoTiff | null;
  legend: LegendItem[];
  onHoverPixel: (info: {
    lat: number;
    lng: number;
    row: number | null;
    col: number | null;
    value: number | null;
    label: string | null;
    color: string | null;
  } | null) => void;
}) {
  useMapEvents({
    mousemove(e) {
      const { lat, lng } = e.latlng;
      if (!raster) {
        onHoverPixel({
          lat,
          lng,
          row: null,
          col: null,
          value: null,
          label: null,
          color: null,
        });
        return;
      }

      const { south, west, north, east } = raster.metadata.wgs84Bounds;
      const { width, height } = raster.metadata;

      if (lat >= south && lat <= north && lng >= west && lng <= east) {
        const col = Math.floor(((lng - west) / (east - west)) * width);
        const row = Math.floor(((north - lat) / (north - south)) * height);
        if (col >= 0 && col < width && row >= 0 && row < height) {
          const val = raster.data[row * width + col];
          if (val === -9999) {
            onHoverPixel({
              lat,
              lng,
              row,
              col,
              value: null,
              label: 'NoData (-9999)',
              color: '#64748b',
            });
            return;
          }
          const matched = legend.find((l) => l.value === val);
          onHoverPixel({
            lat,
            lng,
            row,
            col,
            value: val,
            label: matched ? matched.label : `Raster Value ${val}`,
            color: matched ? matched.color : '#38bdf8',
          });
          return;
        }
      }

      onHoverPixel({
        lat,
        lng,
        row: null,
        col: null,
        value: null,
        label: null,
        color: null,
      });
    },
    mouseout() {
      onHoverPixel(null);
    },
  });

  return null;
}

export const VelacheryGeoMap: React.FC<VelacheryGeoMapProps> = ({
  raster,
  legend,
  stepTitle,
  outputFilename,
  focusTrigger = 0,
  compact = false,
}) => {
  const [baseMap, setBaseMap] = useState<BaseMapType>('osm');
  const [opacity, setOpacity] = useState<number>(0.84);
  const [showRasterLayer, setShowRasterLayer] = useState<boolean>(true);
  const [showBoundaryBox, setShowBoundaryBox] = useState<boolean>(true);
  const [showLandmarks, setShowLandmarks] = useState<boolean>(!compact);
  const [transparentZero, setTransparentZero] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [fitCount, setFitCount] = useState<number>(0);
  const [hoverInfo, setHoverInfo] = useState<{
    lat: number;
    lng: number;
    row: number | null;
    col: number | null;
    value: number | null;
    label: string | null;
    color: string | null;
  } | null>(null);

  // Authoritative geographic bounds from the GeoTIFF metadata (or Velachery default before upload)
  const wgs84Bounds = useMemo(() => {
    if (raster) {
      return raster.metadata.wgs84Bounds;
    }
    return {
      south: 12.967518,
      west: 80.201654,
      north: 12.991096,
      east: 80.231215,
    };
  }, [raster]);

  const leafletBounds = useMemo<L.LatLngBoundsExpression>(
    () => [
      [wgs84Bounds.south, wgs84Bounds.west],
      [wgs84Bounds.north, wgs84Bounds.east],
    ],
    [wgs84Bounds]
  );

  // Render the actual GeoTIFF pixel matrix into a georeferenced RGBA overlay
  const rasterDataUrl = useMemo(() => {
    if (!raster) return null;
    return renderGeoTiffToDataUrl(raster, legend, transparentZero);
  }, [raster, legend, transparentZero]);

  const handleFitStudyArea = () => {
    setFitCount((c) => c + 1);
  };

  return (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 bg-slate-950 flex flex-col'
          : 'relative w-full flex flex-col border border-slate-800 bg-slate-900/70 rounded-lg overflow-hidden'
      }
    >
      {/* Top Map Control Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-slate-900 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex items-center gap-1.5 font-semibold text-slate-100 whitespace-nowrap">
            <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            Velachery, Chennai
          </span>
          <span className="text-slate-600" aria-hidden="true">
            ·
          </span>
          <span className="text-slate-300 font-medium truncate">
            {stepTitle}
          </span>
          {outputFilename && (
            <>
              <span className="text-slate-600 hidden sm:inline" aria-hidden="true">
                ·
              </span>
              <code className="hidden sm:inline font-mono text-cyan-300 text-[11px]">
                {outputFilename}
              </code>
            </>
          )}
        </div>

        {!compact && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Base-map Switcher */}
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded p-0.5">
              {(Object.keys(BASE_MAPS) as BaseMapType[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setBaseMap(key)}
                  className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                    baseMap === key
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {BASE_MAPS[key].name}
                </button>
              ))}
            </div>

            {/* Opacity Slider */}
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded px-2.5 py-1">
              <Sliders className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="text-[11px] text-slate-400 whitespace-nowrap">
                Opacity
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={opacity}
                onChange={(e) => setOpacity(parseFloat(e.target.value))}
                className="w-16 accent-cyan-400 cursor-pointer h-1"
                aria-label="Raster layer opacity"
              />
              <span className="font-mono text-[11px] text-slate-200 tabular-nums w-8 text-right">
                {Math.round(opacity * 100)}%
              </span>
            </div>

            {/* Layer Visibility Controls */}
            <button
              type="button"
              onClick={() => setShowRasterLayer((v) => !v)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded border text-[11px] font-medium transition-colors whitespace-nowrap ${
                showRasterLayer
                  ? 'bg-slate-800 border-slate-700 text-slate-100'
                  : 'bg-slate-950 border-slate-800 text-slate-500'
              }`}
              title="Toggle GeoTIFF Raster Overlay"
            >
              {showRasterLayer ? (
                <Eye className="w-3 h-3 text-cyan-400" />
              ) : (
                <EyeOff className="w-3 h-3" />
              )}
              TIFF Layer
            </button>

            <button
              type="button"
              onClick={() => setTransparentZero((v) => !v)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded border text-[11px] font-medium transition-colors whitespace-nowrap ${
                transparentZero
                  ? 'bg-slate-800 border-slate-700 text-slate-200'
                  : 'bg-slate-950 border-slate-800 text-slate-400'
              }`}
              title="Toggle non-water background transparency to view OpenStreetMap streets underneath"
            >
              <Layers className="w-3 h-3 text-cyan-400" />
              {transparentZero ? 'Streets Visible' : 'Opaque Raster'}
            </button>

            <button
              type="button"
              onClick={() => setShowLandmarks((v) => !v)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded border text-[11px] font-medium transition-colors whitespace-nowrap ${
                showLandmarks
                  ? 'bg-slate-800 border-slate-700 text-slate-200'
                  : 'bg-slate-950 border-slate-800 text-slate-500'
              }`}
              title="Toggle Velachery Hydrological Landmarks"
            >
              Landmarks
            </button>

            {/* Fit to Study Area Button */}
            <button
              type="button"
              onClick={handleFitStudyArea}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/25 text-[11px] font-medium transition-colors whitespace-nowrap"
              title="Zoom map to Velachery GeoTIFF raster extent"
            >
              <Crosshair className="w-3 h-3" />
              Fit to Study Area
            </button>

            {/* Fullscreen Toggle */}
            <button
              type="button"
              onClick={() => setIsFullscreen((f) => !f)}
              className="p-1.5 rounded bg-slate-950 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-colors"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Map'}
            >
              {isFullscreen ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        )}
      </div>

      {/* Main Leaflet Canvas Container */}
      <div
        className={`relative w-full ${
          isFullscreen
            ? 'flex-1'
            : compact
            ? 'h-[250px]'
            : 'h-[460px] lg:h-[520px]'
        }`}
      >
        <MapContainer
          center={[VELACHERY_STUDY_AREA.centerLat, VELACHERY_STUDY_AREA.centerLng]}
          zoom={14}
          scrollWheelZoom={true}
          className="w-full h-full z-0 cursor-crosshair"
        >
          <TileLayer
            key={baseMap}
            url={BASE_MAPS[baseMap].url}
            attribution={BASE_MAPS[baseMap].attribution}
            maxZoom={19}
          />

          <MapBoundsController
            bounds={leafletBounds}
            focusTrigger={focusTrigger + fitCount}
            isFullscreen={isFullscreen}
          />

          <RasterPixelInspector
            raster={raster}
            legend={legend}
            onHoverPixel={setHoverInfo}
          />

          {/* Georeferenced GeoTIFF Raster Overlay */}
          {showRasterLayer && rasterDataUrl && (
            <ImageOverlay
              url={rasterDataUrl}
              bounds={leafletBounds}
              opacity={opacity}
              className="geotiff-raster-layer"
              zIndex={400}
            />
          )}

          {/* Authoritative GeoTIFF Bounding Box Outline */}
          {showBoundaryBox && (
            <Rectangle
              bounds={leafletBounds}
              pathOptions={{
                color: '#22d3ee',
                weight: 1.5,
                dashArray: '6 4',
                fillOpacity: 0,
              }}
            />
          )}

          {/* Velachery Hydrological Reference Markers */}
          {showLandmarks &&
            VELACHERY_LANDMARKS.map((pt) => (
              <CircleMarker
                key={pt.name}
                center={[pt.lat, pt.lng]}
                radius={5}
                pathOptions={{
                  color: '#0f172a',
                  weight: 1.5,
                  fillColor: '#38bdf8',
                  fillOpacity: 0.95,
                }}
              >
                <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                  <div className="text-xs font-sans">
                    <div className="font-semibold text-slate-900">{pt.name}</div>
                    <div className="text-[11px] text-slate-600">
                      {pt.zone} · Velachery, Chennai
                    </div>
                    <div className="font-mono text-[10px] text-slate-500">
                      {pt.lat.toFixed(4)}°N, {pt.lng.toFixed(4)}°E
                    </div>
                  </div>
                </Tooltip>
              </CircleMarker>
            ))}
        </MapContainer>

        {/* Top-Right Study Area Geolocation HUD Badge */}
        <div className="absolute top-3 right-3 z-[450] pointer-events-none bg-slate-950/90 backdrop-blur-md border border-slate-800 rounded px-3 py-2 text-right shadow-lg">
          <div className="text-[11px] font-semibold text-cyan-400 tracking-wide">
            STUDY AREA: VELACHERY, CHENNAI
          </div>
          <div className="text-[11px] text-slate-300">
            Tamil Nadu, India · {raster ? raster.metadata.crs : VELACHERY_STUDY_AREA.crsName}
          </div>
          <div className="font-mono text-[10px] text-slate-400 tabular-nums mt-0.5">
            Bounds: [{wgs84Bounds.south.toFixed(4)}°N, {wgs84Bounds.west.toFixed(4)}°E] to [
            {wgs84Bounds.north.toFixed(4)}°N, {wgs84Bounds.east.toFixed(4)}°E]
          </div>
        </div>

        {/* Bottom-Left Live Pixel Probe Readout */}
        {!compact && (
          <div className="absolute bottom-3 left-3 z-[450] pointer-events-none bg-slate-950/90 backdrop-blur-md border border-slate-800 rounded px-3 py-2 shadow-lg max-w-md">
            {hoverInfo ? (
              <div className="flex flex-col gap-0.5 text-[11px]">
                <div className="flex items-center gap-2 font-mono text-slate-300 tabular-nums">
                  <span>
                    Lat: <strong>{hoverInfo.lat.toFixed(5)}°N</strong>
                  </span>
                  <span>·</span>
                  <span>
                    Lon: <strong>{hoverInfo.lng.toFixed(5)}°E</strong>
                  </span>
                  {hoverInfo.row !== null && hoverInfo.col !== null && (
                    <>
                      <span>·</span>
                      <span className="text-slate-400">
                        Grid [{hoverInfo.col}, {hoverInfo.row}]
                      </span>
                    </>
                  )}
                </div>
                {hoverInfo.label ? (
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className="w-2.5 h-2.5 rounded-xs shrink-0 border border-white/20"
                      style={{ backgroundColor: hoverInfo.color || '#38bdf8' }}
                    />
                    <span className="font-medium text-slate-100">
                      {hoverInfo.label}
                    </span>
                    {hoverInfo.value !== null && (
                      <span className="font-mono text-cyan-400">
                        (DN={hoverInfo.value})
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="text-slate-400">
                    Outside GeoTIFF raster extent (Velachery surrounding map)
                  </div>
                )}
              </div>
            ) : (
              <div className="text-[11px] text-slate-400 font-mono">
                Hover over Velachery map to inspect GeoTIFF pixel coordinates & DN values
              </div>
            )}
          </div>
        )}

        {/* Bottom-Right Map Legend Overlay */}
        {!compact && legend.length > 0 && (
          <div className="absolute bottom-3 right-3 z-[450] bg-slate-950/90 backdrop-blur-md border border-slate-800 rounded p-3 shadow-lg max-w-xs">
            <div className="flex items-center justify-between gap-4 mb-2 border-b border-slate-800 pb-1.5">
              <span className="text-[11px] font-semibold text-slate-200">
                Raster Legend — Velachery
              </span>
              <button
                type="button"
                onClick={() => setShowBoundaryBox((b) => !b)}
                className="text-[10px] font-mono text-cyan-400 hover:underline"
              >
                {showBoundaryBox ? 'Hide Extent Box' : 'Show Extent Box'}
              </button>
            </div>
            <div className="space-y-1.5">
              {legend.map((item) => (
                <div
                  key={item.value}
                  className="flex items-center gap-2 text-[11px]"
                >
                  <span
                    className="w-3 h-3 rounded-xs shrink-0 border border-white/15"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-slate-200 truncate flex-1">
                    {item.label}
                  </span>
                  <span className="font-mono text-[10px] text-slate-400 tabular-nums">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
