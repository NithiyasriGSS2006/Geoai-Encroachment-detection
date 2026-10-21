import React, { useRef } from 'react';
import {
  Upload,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  Download,
  Eye,
  RefreshCw,
  Play,
  FileCheck2,
} from 'lucide-react';
import {
  YearlyWaterMaskItem,
  MultiYearValidationResult,
  downloadGeoTiffBuffer,
} from '../utils/geotiffEngine';

interface MultiYearUploadPanelProps {
  items: YearlyWaterMaskItem[];
  validation: MultiYearValidationResult;
  error: string | null;
  previewYearId: string | null;
  onSelectPreview: (id: string) => void;
  onChangeYear: (id: string, year: number | null) => void;
  onUploadFileForRow: (id: string, file: File) => void;
  onUploadPngForRow: (id: string, file: File) => void;
  onRemoveRow: (id: string) => void;
  onAddEmptyRow: () => void;
  onBulkUploadFiles: (files: FileList) => void;
  onReloadReferenceSeries: () => void;
  onStartAnalysis: () => void;
}

const YEAR_OPTIONS = Array.from({ length: 22 }, (_, i) => 2010 + i); // 2010..2031

export const MultiYearUploadPanel: React.FC<MultiYearUploadPanelProps> = ({
  items,
  validation,
  error,
  previewYearId,
  onSelectPreview,
  onChangeYear,
  onUploadFileForRow,
  onUploadPngForRow,
  onRemoveRow,
  onAddEmptyRow,
  onBulkUploadFiles,
  onReloadReferenceSeries,
  onStartAnalysis,
}) => {
  const bulkInputRef = useRef<HTMLInputElement | null>(null);
  const rowFileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const rowPngFileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const activePreviewItem =
    items.find((i) => i.id === previewYearId) ||
    items.find((i) => i.parsed !== null) ||
    null;

  return (
    <div className="border border-slate-800 bg-slate-900/60 rounded-lg p-5 flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="text-xs font-mono text-cyan-400 mb-1">
            MULTI-YEAR SATELLITE INPUT · WATER-BODY SEGMENTATION
          </div>
          <h2 className="text-xl font-bold text-slate-100">
            Upload Multi-Year Satellite Images — Velachery, Chennai
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Study Area:{' '}
            <strong className="text-slate-200">
              Velachery, Chennai, Tamil Nadu, India
            </strong>{' '}
            · For each required year (2017, 2020, 2023, 2024, and 2026), choose a
            georeferenced TIFF and its PNG image. You may select them in either order.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={bulkInputRef}
            type="file"
            accept=".tif,.tiff,image/tiff"
            multiple
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                onBulkUploadFiles(e.target.files);
                e.target.value = '';
              }
            }}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => bulkInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-slate-800 text-slate-100 border border-slate-700 rounded hover:bg-slate-700 transition-colors whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5 text-cyan-400" />
            Bulk Upload .tif Files
          </button>

          <button
            type="button"
            onClick={onReloadReferenceSeries}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-950 text-slate-300 border border-slate-800 rounded hover:border-slate-700 hover:text-white transition-colors whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
            Load Saved Satellite Images
          </button>
        </div>
      </div>

      {/* Multi-Year Table */}
      <div className="overflow-x-auto border border-slate-800 rounded-lg bg-slate-950/60">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/80 text-slate-400">
              <th className="py-3 px-4 w-44">Year</th>
              <th className="py-3 px-4">Satellite GeoTIFF</th>
              <th className="py-3 px-4">Satellite PNG</th>
              <th className="py-3 px-4">Spatial Compatibility &amp; Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {items.map((item) => {
              const statusObj = validation.yearStatuses.find(
                (s) => s.id === item.id
              );
              const isRowPreviewed = activePreviewItem?.id === item.id;

              return (
                <tr
                  key={item.id}
                  className={`transition-colors ${
                    isRowPreviewed ? 'bg-cyan-950/25' : 'hover:bg-slate-900/40'
                  }`}
                >
                  {/* Year Dropdown + Custom Number Input */}
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-1.5">
                      <select
                        value={item.year ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          onChangeYear(item.id, v ? parseInt(v, 10) : null);
                        }}
                        aria-label="Select year"
                        className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono font-semibold text-slate-100 focus:outline-none focus:border-cyan-400"
                      >
                        <option value="">Select Year...</option>
                        {YEAR_OPTIONS.map((yr) => (
                          <option key={yr} value={yr}>
                            {yr}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1970}
                        max={2100}
                        value={item.year ?? ''}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          onChangeYear(
                            item.id,
                            Number.isNaN(val) ? null : val
                          );
                        }}
                        placeholder="YYYY"
                        aria-label="Enter custom year"
                        className="w-20 bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs font-mono text-cyan-300 tabular-nums focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                  </td>

                  {/* Satellite TIFF */}
                  <td className="py-2.5 px-4">
                    <input
                      ref={(el) => {
                        rowFileRefs.current[item.id] = el;
                      }}
                      type="file"
                      accept=".tif,.tiff,image/tiff"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          onUploadFileForRow(item.id, f);
                          e.target.value = '';
                        }
                      }}
                      className="hidden"
                    />
                    <div className="flex items-center gap-2.5">
                      <code className="font-mono text-xs font-semibold text-slate-100 truncate max-w-64">
                        {item.filename || 'No TIFF chosen'}
                      </code>
                      <button
                        type="button"
                        onClick={() => rowFileRefs.current[item.id]?.click()}
                        className="px-2.5 py-1 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded transition-colors whitespace-nowrap"
                      >
                        {item.parsed ? 'Replace TIFF' : 'Choose TIFF'}
                      </button>
                    </div>
                  </td>

                  {/* User-provided satellite PNG */}
                  <td className="py-2.5 px-4">
                    <input
                      ref={(el) => {
                        rowPngFileRefs.current[item.id] = el;
                      }}
                      type="file"
                      accept=".png,image/png"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          onUploadPngForRow(item.id, file);
                          e.target.value = '';
                        }
                      }}
                      className="hidden"
                    />
                    <div className="flex items-center gap-2.5">
                      <code className={`font-mono text-xs truncate max-w-64 ${item.sourcePngFile ? 'text-slate-300' : 'text-amber-300'}`}>
                        {item.sourcePngFile?.name || 'No PNG chosen'}
                      </code>
                      <button
                        type="button"
                        onClick={() => rowPngFileRefs.current[item.id]?.click()}
                        className="px-2.5 py-1 text-[11px] font-medium bg-cyan-900 hover:bg-cyan-800 text-cyan-100 border border-cyan-700 rounded transition-colors whitespace-nowrap"
                      >
                        {item.sourcePngFile ? 'Change PNG' : 'Upload PNG'}
                      </button>
                    </div>
                  </td>

                  {/* Validation Status */}
                  <td className="py-2.5 px-4">
                    {statusObj?.valid ? (
                      <div className="flex items-center gap-1.5 text-emerald-400 font-mono text-[11px]">
                        <Check className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          {item.year} — {statusObj.message}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-rose-400 font-mono text-[11px]">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{statusObj?.message || 'Invalid'}</span>
                      </div>
                    )}
                  </td>

                  {/* Row Actions: Map Preview, Download TIFF, Remove */}
                  <td className="py-2.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {item.parsed && (
                        <>
                          <button
                            type="button"
                            onClick={() => onSelectPreview(item.id)}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium border transition-colors whitespace-nowrap ${
                              isRowPreviewed
                                ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                                : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
                            }`}
                            title="Preview this year's raster on the Velachery map"
                          >
                            <Eye className="w-3 h-3" />
                            {isRowPreviewed ? 'Viewing' : 'Map'}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              downloadGeoTiffBuffer(
                                item.parsed!.rawBuffer,
                                item.filename
                              )
                            }
                            className="p-1.5 rounded bg-slate-900 border border-slate-800 text-cyan-400 hover:bg-slate-800 transition-colors"
                            title={`Download ${item.filename}`}
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => onRemoveRow(item.id)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-950/40 border border-rose-800/50 text-rose-300 hover:bg-rose-900/50 text-[11px] font-medium transition-colors whitespace-nowrap"
                      >
                        <Trash2 className="w-3 h-3" />
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {error && (
        <div role="alert" className="rounded border border-rose-700/70 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {/* Add Year + Validation Summary + Start Analysis Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-950/80 border border-slate-800 rounded-lg p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <button
            type="button"
            onClick={onAddEmptyRow}
            className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4 text-cyan-400" />+ Add Year
          </button>

          <div className="text-xs">
            {validation.isReady ? (
              <div className="flex flex-wrap items-center gap-2 text-emerald-400 font-mono">
                <Check className="w-4 h-4 shrink-0" />
                <strong>{validation.validCount} years loaded</strong>
                <span>·</span>
                <span>All rasters validated (EPSG:32644 · Velachery, Chennai)</span>
                <span>·</span>
                <strong className="text-emerald-300">Ready for analysis</strong>
              </div>
            ) : (
              <div className="flex flex-col gap-1 text-rose-400 font-mono">
                {validation.errors.map((err, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{err}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          disabled={!validation.isReady}
          onClick={onStartAnalysis}
          className={`flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-bold rounded transition-colors whitespace-nowrap shrink-0 ${
            validation.isReady
              ? 'bg-cyan-400 text-slate-950 hover:bg-cyan-300 cursor-pointer'
              : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
          }`}
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          Segment Water Bodies
        </button>
      </div>

      {/* Active Previewed Year 11-Point Metadata Summary */}
      {activePreviewItem && activePreviewItem.parsed && (
        <div className="border-t border-slate-800 pt-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-cyan-400" />
              Inspecting Uploaded Satellite Metadata: Year{' '}
              <strong className="text-cyan-300">
                {activePreviewItem.year ?? 'Unassigned'}
              </strong>{' '}
              (<code>{activePreviewItem.parsed.metadata.filename}</code>)
            </span>
            <span className="text-xs font-mono text-slate-400">
              Study Area: Velachery, Chennai, Tamil Nadu
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
            <div className="p-2.5 rounded bg-slate-950/70 border border-slate-800/80">
              <div className="text-slate-400 text-[11px]">Filename</div>
              <div className="font-mono font-semibold text-cyan-300 truncate mt-0.5">
                {activePreviewItem.parsed.metadata.filename}
              </div>
            </div>
            <div className="p-2.5 rounded bg-slate-950/70 border border-slate-800/80">
              <div className="text-slate-400 text-[11px]">File Size</div>
              <div className="font-mono font-semibold text-slate-100 tabular-nums mt-0.5">
                {(activePreviewItem.parsed.metadata.fileSizeBytes / 1024).toFixed(1)} KB
              </div>
            </div>
            <div className="p-2.5 rounded bg-slate-950/70 border border-slate-800/80">
              <div className="text-slate-400 text-[11px]">Dimensions &amp; Bands</div>
              <div className="font-mono font-semibold text-slate-100 tabular-nums mt-0.5">
                {activePreviewItem.parsed.metadata.width}×
                {activePreviewItem.parsed.metadata.height} ·{' '}
                {activePreviewItem.parsed.metadata.bands} Band
              </div>
            </div>
            <div className="p-2.5 rounded bg-slate-950/70 border border-slate-800/80">
              <div className="text-slate-400 text-[11px]">CRS</div>
              <div className="font-mono font-semibold text-cyan-300 truncate mt-0.5">
                EPSG:{activePreviewItem.parsed.metadata.crsCode} (UTM 44N)
              </div>
            </div>
            <div className="p-2.5 rounded bg-slate-950/70 border border-slate-800/80">
              <div className="text-slate-400 text-[11px]">Resolution &amp; NoData</div>
              <div className="font-mono font-semibold text-slate-100 tabular-nums mt-0.5">
                {activePreviewItem.parsed.metadata.pixelWidthMeters.toFixed(0)}m ×{' '}
                {activePreviewItem.parsed.metadata.pixelHeightMeters.toFixed(0)}m · NoData:{' '}
                {activePreviewItem.parsed.metadata.noDataValue ?? 'None'}
              </div>
            </div>
            <div className="p-2.5 rounded bg-slate-950/70 border border-slate-800/80">
              <div className="text-slate-400 text-[11px]">Min / Max Value</div>
              <div className="font-mono font-semibold text-slate-100 tabular-nums mt-0.5">
                Min: {activePreviewItem.parsed.metadata.minValue} · Max:{' '}
                {activePreviewItem.parsed.metadata.maxValue}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
