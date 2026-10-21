import React, { useState } from 'react';
import { ChevronDown, ChevronUp, FileSpreadsheet } from 'lucide-react';
import { RasterMetadata } from '../utils/geotiffEngine';

interface RasterMetadataPanelProps {
  metadata: RasterMetadata;
  defaultOpen?: boolean;
  title?: string;
}

export const RasterMetadataPanel: React.FC<RasterMetadataPanelProps> = ({
  metadata,
  defaultOpen = false,
  title = 'Raster Information',
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(defaultOpen);

  const formatFileSize = (bytes: number): string => {
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB (${bytes.toLocaleString()} bytes)`;
    }
    if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(2)} KB (${bytes.toLocaleString()} bytes)`;
    }
    return `${bytes} bytes`;
  };

  const { wgs84Bounds, nativeBounds } = metadata;

  return (
    <div className="border border-slate-800 bg-slate-900/60 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <FileSpreadsheet className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="text-sm font-semibold text-slate-100">{title}</span>
          <span className="text-slate-600" aria-hidden="true">
            ·
          </span>
          <code className="font-mono text-xs text-cyan-300">
            {metadata.filename}
          </code>
          <span className="text-slate-600 hidden sm:inline" aria-hidden="true">
            ·
          </span>
          <span className="hidden sm:inline text-xs font-mono text-slate-400 tabular-nums">
            {metadata.width} × {metadata.height} px ({metadata.pixelWidthMeters.toFixed(1)}m ×{' '}
            {metadata.pixelHeightMeters.toFixed(1)}m)
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span>{isOpen ? 'Hide Metadata' : 'Inspect Metadata'}</span>
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-slate-300" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-300" />
          )}
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-slate-800 p-4 bg-slate-950/60">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div className="border-b border-slate-800/80 pb-2">
              <div className="text-slate-400 mb-0.5">Filename</div>
              <div className="font-mono font-semibold text-slate-100">
                {metadata.filename}
              </div>
            </div>

            <div className="border-b border-slate-800/80 pb-2">
              <div className="text-slate-400 mb-0.5">File Size</div>
              <div className="font-mono font-semibold text-slate-100 tabular-nums">
                {formatFileSize(metadata.fileSizeBytes)}
              </div>
            </div>

            <div className="border-b border-slate-800/80 pb-2">
              <div className="text-slate-400 mb-0.5">Coordinate Reference System (CRS)</div>
              <div className="font-mono font-semibold text-cyan-300">
                {metadata.crs}
              </div>
            </div>

            <div className="border-b border-slate-800/80 pb-2">
              <div className="text-slate-400 mb-0.5">Study Location</div>
              <div className="font-semibold text-slate-100">
                Velachery, Chennai, Tamil Nadu
              </div>
            </div>

            <div className="border-b border-slate-800/80 pb-2">
              <div className="text-slate-400 mb-0.5">Width × Height</div>
              <div className="font-mono font-semibold text-slate-100 tabular-nums">
                {metadata.width} px × {metadata.height} px ({metadata.totalPixels.toLocaleString()}{' '}
                total)
              </div>
            </div>

            <div className="border-b border-slate-800/80 pb-2">
              <div className="text-slate-400 mb-0.5">Number of Bands</div>
              <div className="font-mono font-semibold text-slate-100 tabular-nums">
                {metadata.bands} Band (Int16 GeoTIFF)
              </div>
            </div>

            <div className="border-b border-slate-800/80 pb-2">
              <div className="text-slate-400 mb-0.5">Pixel Size / Resolution</div>
              <div className="font-mono font-semibold text-slate-100 tabular-nums">
                {metadata.pixelWidthMeters.toFixed(2)} m ×{' '}
                {metadata.pixelHeightMeters.toFixed(2)} m ({metadata.pixelAreaM2.toFixed(2)} m²/px)
              </div>
            </div>

            <div className="border-b border-slate-800/80 pb-2">
              <div className="text-slate-400 mb-0.5">NoData Value</div>
              <div className="font-mono font-semibold text-slate-100 tabular-nums">
                {metadata.noDataValue !== null ? metadata.noDataValue : 'None'} (
                {metadata.validPixels.toLocaleString()} valid px)
              </div>
            </div>

            <div className="border-b border-slate-800/80 pb-2">
              <div className="text-slate-400 mb-0.5">Minimum Value</div>
              <div className="font-mono font-semibold text-slate-100 tabular-nums">
                {metadata.minValue}
              </div>
            </div>

            <div className="border-b border-slate-800/80 pb-2">
              <div className="text-slate-400 mb-0.5">Maximum Value</div>
              <div className="font-mono font-semibold text-slate-100 tabular-nums">
                {metadata.maxValue}
              </div>
            </div>

            <div className="sm:col-span-2 border-b border-slate-800/80 pb-2">
              <div className="text-slate-400 mb-0.5">
                Geographic Bounding Box (WGS 84 — Velachery, Chennai)
              </div>
              <div className="font-mono text-slate-200 tabular-nums">
                W: {wgs84Bounds.west.toFixed(6)}°E · S: {wgs84Bounds.south.toFixed(6)}°N · E:{' '}
                {wgs84Bounds.east.toFixed(6)}°E · N: {wgs84Bounds.north.toFixed(6)}°N
              </div>
              <div className="font-mono text-[11px] text-slate-400 tabular-nums mt-0.5">
                Projected UTM 44N Bounds: [{nativeBounds[0].toFixed(1)}m,{' '}
                {nativeBounds[1].toFixed(1)}m] to [{nativeBounds[2].toFixed(1)}m,{' '}
                {nativeBounds[3].toFixed(1)}m]
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
