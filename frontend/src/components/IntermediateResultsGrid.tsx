import React, { useMemo } from 'react';
import { Eye, Download, RotateCcw, Layers } from 'lucide-react';
import {
  IntermediateRasterItem,
  renderGeoTiffToDataUrl,
  downloadGeoTiffBuffer,
} from '../utils/geotiffEngine';

interface IntermediateResultsGridProps {
  sectionTitle?: string;
  sectionSubtitle?: string;
  items: IntermediateRasterItem[];
  activeMapItemId: string | null;
  onSelectForMap: (item: IntermediateRasterItem | null) => void;
}

const IntermediateCard: React.FC<{
  item: IntermediateRasterItem;
  isActiveOnMap: boolean;
  onSelect: () => void;
}> = ({ item, isActiveOnMap, onSelect }) => {
  const previewUrl = useMemo(
    () => renderGeoTiffToDataUrl(item.parsed, item.legend, false),
    [item.parsed, item.legend]
  );

  return (
    <div
      className={`rounded-lg border overflow-hidden flex flex-col justify-between transition-colors ${
        isActiveOnMap
          ? 'bg-cyan-950/35 border-cyan-400'
          : 'bg-slate-950/85 border-slate-800 hover:border-slate-700'
      }`}
    >
      <div>
        {/* Card Header: Result Name & Filename */}
        <div className="px-3.5 py-2.5 border-b border-slate-800/90 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-100 truncate">
              {item.title}
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              {item.subtitle}
            </div>
          </div>
          <code className="font-mono text-[10px] text-cyan-300 shrink-0">
            {item.filename}
          </code>
        </div>

        {/* Actual GeoTIFF Raster Image Preview */}
        <div
          onClick={onSelect}
          className="relative w-full h-40 bg-slate-900 flex items-center justify-center overflow-hidden cursor-pointer group border-b border-slate-800/80"
          title="Click to view this GeoTIFF raster on the main Velachery Leaflet map"
        >
          {previewUrl && (
            <img
              src={previewUrl}
              alt={`${item.title} GeoTIFF raster preview for Velachery, Chennai`}
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain p-2 geotiff-raster-layer"
            />
          )}
          <div className="absolute top-2 left-2 bg-slate-950/85 border border-slate-800 rounded px-2 py-0.5 text-[10px] font-mono text-slate-300">
            Velachery, Chennai · EPSG:{item.parsed.metadata.crsCode}
          </div>
          {isActiveOnMap && (
            <div className="absolute top-2 right-2 bg-cyan-400 text-slate-950 font-semibold rounded px-2 py-0.5 text-[10px]">
              Active on Map
            </div>
          )}
        </div>

        {/* Calculated Area & Pixel Metrics */}
        <div className="p-3.5 grid grid-cols-2 gap-2 text-xs">
          <div>
            <div className="text-[11px] text-slate-400">Calculated Area</div>
            <div className="text-sm font-mono font-bold text-cyan-300 tabular-nums mt-0.5">
              {item.areaKm2.toFixed(3)} km²
            </div>
            <div className="text-[11px] font-mono text-slate-400 tabular-nums">
              {item.areaHa.toFixed(2)} ha · {Math.round(item.areaM2).toLocaleString()} m²
            </div>
          </div>

          <div className="text-right">
            <div className="text-[11px] text-slate-400">Pixels &amp; Share</div>
            <div className="text-sm font-mono font-bold text-slate-100 tabular-nums mt-0.5">
              {item.pixels.toLocaleString()} px
            </div>
            <div className="text-[11px] font-mono text-emerald-400 tabular-nums">
              {item.percentage.toFixed(2)}% of study area
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons: View on Map + Download TIFF */}
      <div className="px-3.5 pb-3.5 pt-1 flex items-center gap-2">
        <button
          type="button"
          onClick={onSelect}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors whitespace-nowrap ${
            isActiveOnMap
              ? 'bg-cyan-400 text-slate-950'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          {isActiveOnMap ? 'Viewing on Map' : 'View on Map'}
        </button>

        <button
          type="button"
          onClick={() =>
            downloadGeoTiffBuffer(item.parsed.rawBuffer, item.filename)
          }
          className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-800 text-xs font-medium transition-colors whitespace-nowrap"
          title={`Download ${item.filename}`}
        >
          <Download className="w-3.5 h-3.5" />
          TIFF
        </button>
      </div>
    </div>
  );
};

export const IntermediateResultsGrid: React.FC<IntermediateResultsGridProps> = ({
  sectionTitle = 'Intermediate Results — Velachery, Chennai',
  sectionSubtitle = 'Rendered directly from the generated GeoTIFF rasters. Click "View on Map" on any card to inspect that layer on the main Leaflet map above.',
  items,
  activeMapItemId,
  onSelectForMap,
}) => {
  if (items.length === 0) return null;

  return (
    <div className="border border-slate-800 bg-slate-900/60 rounded-lg p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400 shrink-0" />
            <h3 className="text-sm font-semibold text-slate-100">
              {sectionTitle}
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{sectionSubtitle}</p>
        </div>

        {activeMapItemId !== null && (
          <button
            type="button"
            onClick={() => onSelectForMap(null)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/25 text-xs font-semibold transition-colors whitespace-nowrap self-start sm:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Show Full Composite Raster on Map
          </button>
        )}
      </div>

      <div
        className={`grid grid-cols-1 sm:grid-cols-2 ${
          items.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-3'
        } gap-4`}
      >
        {items.map((item) => (
          <IntermediateCard
            key={item.id}
            item={item}
            isActiveOnMap={activeMapItemId === item.id}
            onSelect={() =>
              onSelectForMap(activeMapItemId === item.id ? null : item)
            }
          />
        ))}
      </div>
    </div>
  );
};
