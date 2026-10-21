import React from 'react';
import { Check, Loader2, AlertTriangle } from 'lucide-react';

interface ProcessingStatusPanelProps {
  stageTitle: string;
  outputFilename: string;
  isProcessing: boolean;
  activeSubStep: number; // 0..5 (5 = Completed)
  error: string | null;
  detail?: string;
}

const SUB_STEPS = [
  'Input loaded',
  'Raster validated',
  'Processing completed',
  'Statistics calculated',
  'GeoTIFF generated',
];

export const ProcessingStatusPanel: React.FC<ProcessingStatusPanelProps> = ({
  stageTitle,
  outputFilename,
  isProcessing,
  activeSubStep,
  error,
  detail,
}) => {
  return (
    <div className="border border-slate-800 bg-slate-900/60 rounded-lg p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          {isProcessing ? (
            <Loader2 className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
          ) : error ? (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-emerald-400 ring-4 ring-emerald-500/20 shrink-0" />
          )}
          <span className="text-sm font-semibold text-slate-100">
            {isProcessing
              ? `Processing ${stageTitle}...`
              : error
              ? `Error in ${stageTitle}`
              : `${stageTitle} — Completed`}
          </span>
        </div>

        <div className="text-xs font-mono text-slate-400">
          Output: <strong className="text-cyan-300">{outputFilename}</strong> · Velachery, Chennai
        </div>
      </div>

      {isProcessing && detail && (
        <p className="mb-3 text-xs font-mono text-cyan-200">{detail}</p>
      )}

      {error ? (
        <div className="text-xs text-rose-300 bg-rose-950/50 border border-rose-800/60 rounded p-3 font-mono">
          {error}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {SUB_STEPS.map((label, idx) => {
            const done = !isProcessing || activeSubStep > idx;
            const current = isProcessing && activeSubStep === idx;
            return (
              <div
                key={label}
                className={`flex items-center gap-2 px-2.5 py-2 rounded border text-xs transition-colors ${
                  done
                    ? 'bg-emerald-950/25 border-emerald-800/50 text-emerald-200'
                    : current
                    ? 'bg-cyan-950/40 border-cyan-500/50 text-cyan-200'
                    : 'bg-slate-950/40 border-slate-800 text-slate-500'
                }`}
              >
                {done ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : current ? (
                  <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin shrink-0" />
                ) : (
                  <span className="w-3.5 h-3.5 rounded-full border border-slate-700 shrink-0" />
                )}
                <span className="truncate font-medium">{label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
