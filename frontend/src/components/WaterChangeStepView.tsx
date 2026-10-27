import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  Download,
  Eye,
  Play,
  Calendar,
} from 'lucide-react';
import {
  MultiYearWaterChangeResult,
  PairwiseWaterChangeComparison,
  IntermediateRasterItem,
  WATER_CHANGE_LEGEND,
  buildIntermediateSubRaster,
  renderGeoTiffToDataUrl,
  downloadGeoTiffBuffer,
} from '../utils/geotiffEngine';
import { VelacheryGeoMap } from './VelacheryGeoMap';
import { RasterMetadataPanel } from './RasterMetadataPanel';
import { ProcessingStatusPanel } from './ProcessingStatusPanel';
import { IntermediateResultsGrid } from './IntermediateResultsGrid';

interface WaterChangeStepViewProps {
  availableYears: number[];
  waterChangeResult: MultiYearWaterChangeResult;
  isProcessing: boolean;
  processingSubStep: number;
  processingDetail: string;
  errorMsg: string | null;
  mapFocusCounter: number;
  onRunCustomPair: (fromYear: number, toYear: number) => void;
  onSelectBackToInput: () => void;
  onProceedToStep3: () => void;
  onFocusMap: () => void;
}

export const WaterChangeStepView: React.FC<WaterChangeStepViewProps> = ({
  availableYears,
  waterChangeResult,
  isProcessing,
  processingSubStep,
  processingDetail,
  errorMsg,
  mapFocusCounter,
  onRunCustomPair,
  onSelectBackToInput,
  onProceedToStep3,
  onFocusMap,
}) => {
  const sortedYears = [...availableYears].sort((a, b) => a - b);
  const [fromYear, setFromYear] = useState<number>(
    waterChangeResult.selectedComparison.fromYear || sortedYears[0] || 2019
  );
  const [toYear, setToYear] = useState<number>(
    waterChangeResult.selectedComparison.toYear ||
      sortedYears[sortedYears.length - 1] ||
      2024
  );

  const [intermediateCards, setIntermediateCards] = useState<
    IntermediateRasterItem[]
  >([]);
  const [activeSubRaster, setActiveSubRaster] =
    useState<IntermediateRasterItem | null>(null);

  const activeComp: PairwiseWaterChangeComparison =
    waterChangeResult.selectedComparison;

  useEffect(() => {
    let cancelled = false;
    setActiveSubRaster(null);

    async function generateSubRasters() {
      const lossItem = await buildIntermediateSubRaster({
        id: 'wc-loss',
        title: `Result 1: Water Loss / Recession (${activeComp.fromYear} → ${activeComp.toYear})`,
        subtitle: 'Historical water surface lost between epochs',
        filename: `water_loss_${activeComp.fromYear}_${activeComp.toYear}.tif`,
        source: activeComp.parsed,
        targetValues: [170],
        legend: WATER_CHANGE_LEGEND,
      });

      const gainItem = await buildIntermediateSubRaster({
        id: 'wc-gain',
        title: `Result 2: Water Gain / Expansion (${activeComp.fromYear} → ${activeComp.toYear})`,
        subtitle: 'Newly inundated / seasonal expansion water pixels',
        filename: `water_gain_${activeComp.fromYear}_${activeComp.toYear}.tif`,
        source: activeComp.parsed,
        targetValues: [255],
        legend: WATER_CHANGE_LEGEND,
      });

      const stableItem = await buildIntermediateSubRaster({
        id: 'wc-stable',
        title: `Result 3: Stable Core Water (${activeComp.fromYear} → ${activeComp.toYear})`,
        subtitle: 'Water present in both observation years',
        filename: `stable_water_${activeComp.fromYear}_${activeComp.toYear}.tif`,
        source: activeComp.parsed,
        targetValues: [85],
        legend: WATER_CHANGE_LEGEND,
      });

      if (!cancelled) {
        setIntermediateCards([lossItem, gainItem, stableItem]);
      }
    }

    generateSubRasters();
    return () => {
      cancelled = true;
    };
  }, [activeComp]);

  const handleSelectComparisonCard = (comp: PairwiseWaterChangeComparison) => {
    setFromYear(comp.fromYear);
    setToYear(comp.toYear);
    setActiveSubRaster(null);
    onRunCustomPair(comp.fromYear, comp.toYear);
  };

  const displayedRaster = activeSubRaster
    ? activeSubRaster.parsed
    : activeComp.parsed;
  const displayedTitle = activeSubRaster
    ? activeSubRaster.title
    : `STEP 2: Water Change (${activeComp.fromYear} → ${activeComp.toYear})`;
  const displayedFilename = activeSubRaster
    ? activeSubRaster.filename
    : 'water_change.tif';

  return (
    <div className="flex flex-col gap-6">
      {/* Top Step Header & Temporal Controls */}
      <div className="border border-slate-800 bg-slate-900/60 rounded-lg p-5 flex flex-col gap-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="text-xs font-mono text-cyan-400">
              STEP 2 · MULTI-YEAR TEMPORAL WATER CHANGE
            </div>
            <h2 className="text-xl font-bold text-slate-100 mt-0.5">
              Water Change Analysis — Velachery, Chennai ({activeComp.fromYear}{' '}
              → {activeComp.toYear})
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Comparing{' '}
              <code className="text-slate-200">
                water_mask_{activeComp.fromYear}.tif
              </code>{' '}
              →{' '}
              <code className="text-slate-200">
                water_mask_{activeComp.toYear}.tif
              </code>{' '}
              · Output: <code className="text-cyan-300">water_change.tif</code>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onSelectBackToInput}
              className="flex items-center gap-1 px-3 py-2 text-xs font-medium bg-slate-900 text-slate-300 border border-slate-800 rounded hover:bg-slate-800 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Multi-Year Input
            </button>
            <button
              type="button"
              onClick={onFocusMap}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-800 text-slate-100 border border-slate-700 rounded hover:bg-slate-700 transition-colors whitespace-nowrap"
            >
              <Eye className="w-3.5 h-3.5 text-cyan-400" />
              View on Map
            </button>
            <button
              type="button"
              onClick={() =>
                downloadGeoTiffBuffer(
                  activeComp.parsed.rawBuffer,
                  'water_change.tif'
                )
              }
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-slate-950 text-cyan-300 border border-cyan-500/40 rounded hover:bg-cyan-500/10 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Download TIFF
            </button>
            <button
              type="button"
              onClick={onProceedToStep3}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-cyan-400 text-slate-950 rounded hover:bg-cyan-300 transition-colors whitespace-nowrap"
            >
              Step 3: Persistent Encroachment
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 2017 Baseline Year Comparison Selector */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center bg-slate-950/75 border border-slate-800 rounded-lg p-4">
          <div className="lg:col-span-12 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-cyan-400 shrink-0" />
              <label className="text-xs font-medium text-slate-300 whitespace-nowrap">
                Water Change Comparison (2017 Baseline):
              </label>
              <select
                value={`${fromYear}_${toYear}`}
                disabled={isProcessing}
                onChange={(e) => {
                  const [f, t] = e.target.value.split('_').map(Number);
                  setFromYear(f);
                  setToYear(t);
                  onRunCustomPair(f, t);
                }}
                className="bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs font-mono font-semibold text-cyan-300 focus:outline-none focus:border-cyan-400 cursor-pointer"
              >
                <option value="2017_2020">2017 → 2020</option>
                <option value="2017_2023">2017 → 2023</option>
                <option value="2017_2024">2017 → 2024</option>
                <option value="2017_2026">2017 → 2026</option>
              </select>
            </div>

            <button
              type="button"
              disabled={isProcessing}
              onClick={() => onRunCustomPair(fromYear, toYear)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded bg-cyan-400 text-slate-950 hover:bg-cyan-300 transition-colors whitespace-nowrap cursor-pointer ml-auto disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-3 h-3 fill-current" />
              Run Water Change
            </button>
          </div>

          <div className="lg:col-span-7 flex flex-wrap items-center justify-start lg:justify-end gap-1.5 text-xs font-mono">
            <span className="text-slate-400 mr-1">Timeline:</span>
            {sortedYears.map((yr, idx) => (
              <React.Fragment key={yr}>
                <span
                  className={`px-2 py-1 rounded border ${
                    yr === activeComp.fromYear || yr === activeComp.toYear
                      ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-300'
                  }`}
                >
                  {yr}
                </span>
                {idx < sortedYears.length - 1 && (
                  <span className="text-slate-500">→</span>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Processing Status */}
      <ProcessingStatusPanel
        stageTitle={`Water Change (${activeComp.fromYear} → ${activeComp.toYear})`}
        outputFilename="water_change.tif"
        isProcessing={isProcessing}
        activeSubStep={processingSubStep}
        error={errorMsg}
        detail={processingDetail}
      />

      {/* Main Interactive Leaflet Map */}
      <VelacheryGeoMap
        raster={displayedRaster}
        legend={WATER_CHANGE_LEGEND}
        stepTitle={displayedTitle}
        outputFilename={displayedFilename}
        focusTrigger={mapFocusCounter}
      />

      {/* Intermediate Results Grid 1: 3 Component Sub-Rasters (Loss / Gain / Stable) Below Main Map */}
      <IntermediateResultsGrid
        sectionTitle={`Intermediate Results — Water Change Components (${activeComp.fromYear} → ${activeComp.toYear})`}
        sectionSubtitle="Three decomposed GeoTIFF rasters extracted from the temporal water-change analysis over Velachery, Chennai."
        items={intermediateCards}
        activeMapItemId={activeSubRaster?.id || null}
        onSelectForMap={(item) => {
          setActiveSubRaster(item);
          onFocusMap();
        }}
      />

      {/* Intermediate Results Grid 2: Year-by-Year Temporal Raster Preview Cards */}
      <div className="border border-slate-800 bg-slate-900/60 rounded-lg p-5">
        <div className="text-sm font-semibold text-slate-100 mb-1">
          Year-by-Year Intermediate Water Change Rasters — Velachery, Chennai
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Each yearly transition produces a georeferenced GeoTIFF raster. Click
          any period to load its raster on the main Leaflet map.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            ...waterChangeResult.yearlyTransitions,
            waterChangeResult.overallComparison,
          ].map((comp) => {
            const isSelected =
              !activeSubRaster &&
              activeComp.fromYear === comp.fromYear &&
              activeComp.toYear === comp.toYear;
            const thumbUrl = renderGeoTiffToDataUrl(
              comp.parsed,
              WATER_CHANGE_LEGEND,
              false
            );

            return (
              <div
                key={`${comp.key}-${comp.isOverall ? 'overall' : 'step'}`}
                className={`rounded-lg border overflow-hidden flex flex-col justify-between transition-colors ${
                  isSelected
                    ? 'bg-cyan-950/35 border-cyan-400'
                    : 'bg-slate-950/85 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="px-3.5 py-2.5 border-b border-slate-800/90 flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-cyan-300">
                      {comp.fromYear} → {comp.toYear}{' '}
                      {comp.isOverall ? '(Overall)' : ''}
                    </span>
                    <code className="text-[10px] font-mono text-slate-400">
                      {comp.parsed.metadata.filename}
                    </code>
                  </div>

                  <div
                    onClick={() => handleSelectComparisonCard(comp)}
                    className="relative w-full h-36 bg-slate-900 flex items-center justify-center overflow-hidden cursor-pointer border-b border-slate-800/80"
                  >
                    <img
                      src={thumbUrl}
                      alt={`Water change ${comp.fromYear} to ${comp.toYear} in Velachery`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-contain p-2 geotiff-raster-layer"
                    />
                  </div>

                  <div className="p-3 grid grid-cols-2 gap-2 text-xs font-mono tabular-nums">
                    <div>
                      <div className="text-[11px] font-sans text-slate-400">
                        Water Change
                      </div>
                      <div className="text-sm font-bold text-slate-100">
                        {comp.stats.changedAreaHa.toFixed(2)} ha
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] font-sans text-slate-400">
                        Loss / Gain
                      </div>
                      <div className="text-[11px] text-rose-400">
                        -{comp.stats.decreaseAreaHa.toFixed(2)} / +
                        {comp.stats.increaseAreaHa.toFixed(2)} ha
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-3 pb-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectComparisonCard(comp)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                      isSelected
                        ? 'bg-cyan-400 text-slate-950'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    {isSelected ? 'Viewing on Map' : 'View on Map'}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      downloadGeoTiffBuffer(
                        comp.parsed.rawBuffer,
                        comp.parsed.metadata.filename
                      )
                    }
                    className="px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-800 text-xs font-medium"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detailed Statistics */}
      <div className="border border-slate-800 bg-slate-900/60 rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h3 className="text-sm font-semibold text-slate-100">
            Water Change Statistics ({activeComp.fromYear} → {activeComp.toYear}
            ) — Velachery, Chennai
          </h3>
          <span className="text-xs font-mono text-slate-400">
            Output: <strong className="text-cyan-300">water_change.tif</strong>
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3.5 rounded bg-slate-950/80 border border-slate-800">
            <div className="text-xs text-slate-400">Changed Area</div>
            <div className="text-lg font-mono font-bold text-slate-100 tabular-nums mt-1">
              {activeComp.stats.changedAreaHa.toFixed(2)} ha
            </div>
          </div>

          <div className="p-3.5 rounded bg-slate-950/80 border border-slate-800">
            <div className="text-xs text-slate-400">Changed Pixels</div>
            <div className="text-lg font-mono font-bold text-cyan-300 tabular-nums mt-1">
              {activeComp.stats.changedPixels.toLocaleString()}
            </div>
          </div>

          <div className="p-3.5 rounded bg-slate-950/80 border border-slate-800">
            <div className="text-xs text-slate-400">Increase Water Area</div>
            <div className="text-lg font-mono font-bold text-cyan-400 tabular-nums mt-1">
              {activeComp.stats.increaseAreaHa.toFixed(2)} ha
            </div>
          </div>

          <div className="p-3.5 rounded bg-slate-950/80 border border-slate-800">
            <div className="text-xs text-slate-400">Decreased Water Area</div>
            <div className="text-lg font-mono font-bold text-rose-400 tabular-nums mt-1">
              {activeComp.stats.decreaseAreaHa.toFixed(2)} ha
            </div>
          </div>

          <div className="p-3.5 rounded bg-slate-950/80 border border-slate-800">
            <div className="text-xs text-slate-400">Percentage Change</div>
            <div className="text-lg font-mono font-bold text-amber-400 tabular-nums mt-1">
              {activeComp.stats.percentageChange.toFixed(2)}%
            </div>
          </div>
        </div>
      </div>

      <RasterMetadataPanel
        metadata={activeComp.parsed.metadata}
        defaultOpen={true}
        title={`Raster Information — water_change.tif (${activeComp.fromYear} → ${activeComp.toYear})`}
      />
    </div>
  );
};
