import React from 'react';
import { Check, Circle, Download, LoaderCircle } from 'lucide-react';
import {
  IntermediateRasterItem,
  LegendItem,
} from '../utils/geotiffEngine';
import { IntermediateResultsGrid } from './IntermediateResultsGrid';

export interface AnalysisPipelineMetric {
  label: string;
  value: number | string;
  unit?: string;
}

export interface AnalysisPipelineLayer {
  label: string;
  filename: string;
  legend: LegendItem[];
}

export interface AnalysisPipelineMapPoint {
  lat: number;
  lng: number;
  label: string;
  vulnerabilityClass: string;
}

export interface AnalysisPipelineOutput {
  label: string;
  filename: string;
}

export interface AnalysisPipelineStageResult {
  id: string;
  title: string;
  summary: string;
  note?: string;
  metrics: AnalysisPipelineMetric[];
  table?: {
    headers: string[];
    rows: Array<Array<string | number>>;
  };
  mapPoints?: AnalysisPipelineMapPoint[];
  layers: AnalysisPipelineLayer[];
  outputs: AnalysisPipelineOutput[];
}

export interface AnalysisPipelineProgress {
  state: 'idle' | 'running' | 'completed' | 'failed';
  currentStage: string | null;
  completedStages: number;
  totalStages: number;
  message: string;
}

const PIPELINE_STAGES = [
  { id: 'water-change', title: 'Water change' },
  { id: 'runoff-comparison', title: 'Runoff comparison' },
  { id: 'encroachment-runoff', title: 'Encroachment and runoff' },
  { id: 'water-flow-impact', title: 'Water-flow impact' },
  { id: 'flood-validation', title: 'Historical validation' },
];

function formatMetric(value: number | string): string {
  if (typeof value !== 'number') return value;
  return Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

interface AnalysisPipelinePanelProps {
  progress: AnalysisPipelineProgress;
  results: AnalysisPipelineStageResult[];
  intermediateItems: IntermediateRasterItem[];
  activeMapItemId: string | null;
  onSelectForMap: (item: IntermediateRasterItem | null) => void;
}

export const AnalysisPipelinePanel: React.FC<AnalysisPipelinePanelProps> = ({
  progress,
  results,
  intermediateItems,
  activeMapItemId,
  onSelectForMap,
}) => {
  if (progress.state === 'idle' && results.length === 0) return null;

  const resultById = new Map(results.map((stage) => [stage.id, stage]));

  return (
    <section className="border border-slate-800 bg-slate-900/70 rounded-lg p-5">
      <div className="mb-4">
        <div className="text-xs font-mono text-cyan-400">AUTOMATED ANALYSIS PIPELINE</div>
        <h3 className="text-base font-semibold text-slate-100 mt-1">
          Water change → runoff comparison → encroachment runoff → water-flow impact → validation
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          Each step starts after the previous script completes. Intermediate outputs are grouped under their generating stage.
        </p>
      </div>

      <ol className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2 mb-5">
        {PIPELINE_STAGES.map((stage, index) => {
          const isComplete = index < progress.completedStages ||
            progress.state === 'completed';
          const isCurrent = progress.currentStage === stage.id &&
            progress.state === 'running';
          const isFailed = progress.currentStage === stage.id &&
            progress.state === 'failed';
          const stateText = isComplete
            ? 'Complete'
            : isFailed
              ? 'Failed'
              : isCurrent
                ? 'Running'
                : 'Waiting';

          return (
            <li
              key={stage.id}
              className={`rounded-md border px-3 py-2.5 ${
                isFailed
                  ? 'border-rose-500/50 bg-rose-950/20'
                  : isCurrent
                    ? 'border-cyan-500/50 bg-cyan-950/25'
                    : isComplete
                      ? 'border-emerald-700/60 bg-emerald-950/20'
                      : 'border-slate-800 bg-slate-950/50'
              }`}
            >
              <div className="flex items-center gap-2">
                {isCurrent ? (
                  <LoaderCircle className="w-4 h-4 text-cyan-300 animate-spin" />
                ) : isComplete ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Circle className={`w-4 h-4 ${isFailed ? 'text-rose-400' : 'text-slate-600'}`} />
                )}
                <span className="text-xs font-semibold text-slate-100">{stage.title}</span>
              </div>
              <div className={`text-[11px] mt-1 ml-6 ${
                isFailed ? 'text-rose-300' : isCurrent ? 'text-cyan-300' : 'text-slate-400'
              }`}>
                {stateText}
              </div>
            </li>
          );
        })}
      </ol>

      <p className={`text-xs mb-5 ${
        progress.state === 'failed' ? 'text-rose-300' : 'text-slate-300'
      }`} role={progress.state === 'failed' ? 'alert' : undefined}>
        {progress.message}
      </p>

      {results.length > 0 && (
        <div className="flex flex-col gap-4">
          {PIPELINE_STAGES.map((stage) => {
            const result = resultById.get(stage.id);
            if (!result) return null;
            const stageItems = intermediateItems.filter(
              (item) => item.stageId === stage.id
            );

            return (
              <article key={result.id} className="rounded-lg border border-slate-800 bg-slate-950/60 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800">
                  <h4 className="text-sm font-semibold text-slate-100">{result.title}</h4>
                  <p className="text-xs leading-relaxed text-slate-400 mt-1">{result.summary}</p>
                </div>

                <div className="p-4">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                    {result.metrics.map((metric) => (
                      <div key={metric.label}>
                        <dt className="text-[11px] text-slate-400">{metric.label}</dt>
                        <dd className="text-sm font-mono font-semibold text-cyan-200 mt-0.5">
                          {formatMetric(metric.value)}{metric.unit ? ` ${metric.unit}` : ''}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  {result.table && (
                    <div className="overflow-x-auto mt-4 rounded border border-slate-800">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-900 text-slate-300">
                          <tr>
                            {result.table.headers.map((header) => (
                              <th
                                key={header}
                                scope="col"
                                className="px-3 py-2 font-semibold whitespace-nowrap"
                              >
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 text-slate-200">
                          {result.table.rows.map((row, rowIndex) => (
                            <tr key={`${result.id}-row-${rowIndex}`}>
                              {row.map((value, columnIndex) => (
                                <td
                                  key={`${result.id}-${rowIndex}-${columnIndex}`}
                                  className="px-3 py-2 whitespace-nowrap"
                                >
                                  {typeof value === 'number'
                                    ? columnIndex === 2
                                      ? `${value.toFixed(2)}%`
                                      : formatMetric(value)
                                    : value}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {result.outputs.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-4">
                      {result.outputs.map((output) => (
                        <a
                          key={output.filename}
                          href={`/api/raster/${encodeURIComponent(output.filename)}`}
                          className="inline-flex items-center gap-1.5 text-[11px] text-cyan-200 hover:text-cyan-100 bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5"
                          download={output.filename}
                        >
                          <Download className="w-3.5 h-3.5" />
                          {output.label}
                        </a>
                      ))}
                    </div>
                  )}

                  {result.note && (
                    <p className="text-[11px] leading-relaxed text-amber-200/90 bg-amber-950/20 border border-amber-900/50 rounded p-2.5 mt-4">
                      {result.note}
                    </p>
                  )}

                  {stageItems.length > 0 && (
                    <IntermediateResultsGrid
                      sectionTitle={`${result.title} — Intermediate Results`}
                      sectionSubtitle="Generated outputs for this pipeline stage. Select a raster to view it on the map."
                      items={stageItems}
                      activeMapItemId={activeMapItemId}
                      onSelectForMap={onSelectForMap}
                    />
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
