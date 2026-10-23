import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Check,
  ArrowRight,
  ArrowLeft,
  MapPin,
  Activity,
  Droplets,
  AlertOctagon,
  BarChart3,
  FileDown,
  Eye,
  Lock,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Cell,
  PieChart,
  Pie,
  Legend as RechartsLegend,
} from 'recharts';
import {
  VELACHERY_STUDY_AREA,
  ParsedGeoTiff,
  LegendItem,
  YearlyWaterMaskItem,
  MultiYearWaterChangeResult,
  PairwiseWaterChangeComparison,
  PersistentWaterStats,
  LulcAnalysisStats,
  PotentialEncroachmentStats,
  WATER_MASK_LEGEND,
  WATER_CHANGE_LEGEND,
  PERSISTENT_WATER_LEGEND,
  LULC_LEGEND,
  ENCROACHMENT_LEGEND,
  SLOPE_LEGEND,
  parseGeoTiffBuffer,
  detectYearFromFilename,
  validateMultiYearRasters,
  downloadGeoTiffBuffer,
  IntermediateRasterItem,
} from './utils/geotiffEngine';
import { VelacheryGeoMap } from './components/VelacheryGeoMap';
import { RasterMetadataPanel } from './components/RasterMetadataPanel';
import { ProcessingStatusPanel } from './components/ProcessingStatusPanel';
import { MultiYearUploadPanel } from './components/MultiYearUploadPanel';
import { WaterChangeStepView } from './components/WaterChangeStepView';
import {
  AnalysisPipelinePanel,
  AnalysisPipelineProgress,
  AnalysisPipelineStageResult,
} from './components/AnalysisPipelinePanel';
import { IntermediateResultsGrid } from './components/IntermediateResultsGrid';
import { TamilNaduEmblem } from './components/TamilNaduEmblem';
import { CmdaBuildingBanner } from './components/CmdaBuildingBanner';
import { CmdaGovFooter } from './components/CmdaGovFooter';

type WorkflowStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

const WORKFLOW_STEPS: {
  id: WorkflowStep;
  numberLabel: string;
  title: string;
  shortTitle: string;
  filename: string;
}[] = [
  {
    id: 0,
    numberLabel: '①',
    title: 'Satellite Image Input',
    shortTitle: 'Satellite Input',
    filename: 'satellite_YYYY.tif',
  },
  {
    id: 1,
    numberLabel: '②',
    title: 'Step 1: Water-Body Segmentation',
    shortTitle: 'Water Segmentation',
    filename: 'water_YYYY.tif',
  },
  {
    id: 2,
    numberLabel: '③',
    title: 'Step 2: Water Change',
    shortTitle: 'Water Change',
    filename: 'water_change_display_2017_2024.tif',
  },
  {
    id: 3,
    numberLabel: '④',
    title: 'Step 3: Persistent Encroachment',
    shortTitle: 'Persistent Encroachment',
    filename: 'persistent_encroachment_2017_2023_to_2024.tif',
  },
  {
    id: 4,
    numberLabel: '⑤',
    title: 'Step 4: LULC Analysis',
    shortTitle: 'LULC Analysis',
    filename: 'lulc_persistent_encroachment_2017_2024.tif',
  },
  {
    id: 5,
    numberLabel: '⑥',
    title: 'Step 5: Potential Encroachment',
    shortTitle: 'Potential Encroachment',
    filename: 'potential_encroachment_display_2017_2024.tif',
  },
  {
    id: 6,
    numberLabel: '⑦',
    title: 'Step 6: Water-Flow Impact',
    shortTitle: 'Water-Flow Impact',
    filename: 'relative_flood_vulnerability.tif',
  },
  {
    id: 7,
    numberLabel: '✓',
    title: 'Analysis Complete',
    shortTitle: 'Summary',
    filename: 'All Outputs',
  },
];

const WATER_FLOW_RASTER_CONFIG: {
  filename: string;
  title: string;
  subtitle: string;
  legend: LegendItem[];
}[] = [
  {
    filename: 'dem_for_hydrology.tif',
    title: 'Cleaned Elevation Model',
    subtitle: 'Elevation raster prepared for hydrological processing.',
    legend: [],
  },
  {
    filename: 'gcc_drainage_raster.tif',
    title: 'Rasterized GCC Drainage',
    subtitle: 'Storm-water drainage features aligned to the DEM grid.',
    legend: [
      { value: 0, label: 'No drainage', color: '#1e293b' },
      { value: 1, label: 'Mapped drainage', color: '#06b6d4' },
    ],
  },
  {
    filename: 'distance_to_gcc_drain_m.tif',
    title: 'Distance to Drainage',
    subtitle: 'Distance from each DEM cell to the nearest mapped drain (metres).',
    legend: [],
  },
  {
    filename: 'potential_encroachment_near_drain.tif',
    title: 'Potential Encroachment Near Drains',
    subtitle: 'Potential encroachment within the 30 m drainage screening distance.',
    legend: [
      { value: 0, label: 'Not flagged', color: '#1e293b' },
      { value: 255, label: 'Near drainage', color: '#f43f5e' },
    ],
  },
  {
    filename: 'dem_filled.tif',
    title: 'Depression-Filled DEM',
    subtitle: 'Elevation model prepared for terrain-flow derivation.',
    legend: [],
  },
  {
    filename: 'slope_degrees.tif',
    title: 'Terrain Slope',
    subtitle: 'Slope angle classes: green is flatter terrain; orange and red are steeper.',
    legend: SLOPE_LEGEND,
  },
  {
    filename: 'flow_direction.tif',
    title: 'D8 Flow Direction',
    subtitle: 'Arrows show the terrain-derived direction water flows from each sampled cell.',
    legend: [
      { value: 1, label: 'East', color: '#ef4444' },
      { value: 2, label: 'Northeast', color: '#f97316' },
      { value: 4, label: 'North', color: '#eab308' },
      { value: 8, label: 'Northwest', color: '#22c55e' },
      { value: 16, label: 'West', color: '#06b6d4' },
      { value: 32, label: 'Southwest', color: '#3b82f6' },
      { value: 64, label: 'South', color: '#a855f7' },
      { value: 128, label: 'Southeast', color: '#ec4899' },
    ],
  },
  {
    filename: 'flow_accumulation_log_display.tif',
    title: 'Log-Scaled Flow Accumulation',
    subtitle: 'Log(1 + upstream contributing cell count); highlights low and high flow accumulation.',
    legend: [],
  },
  {
    filename: 'terrain_flow_gcc_drain_overlap.tif',
    title: 'Terrain-Flow / Drainage Overlap',
    subtitle: 'High-flow-accumulation cells overlapping mapped drainage.',
    legend: [
      { value: 0, label: 'No overlap', color: '#1e293b' },
      { value: 255, label: 'Flow / drain overlap', color: '#8b5cf6' },
    ],
  },
  {
    filename: 'relative_flood_vulnerability.tif',
    title: 'Relative Flood Vulnerability',
    subtitle: 'Preliminary terrain-and-drainage screening classes (1–4).',
    legend: [
      { value: 0, label: 'Outside analysis', color: '#ffffff' },
      { value: 1, label: 'Low', color: '#00aa00' },
      { value: 2, label: 'Moderate', color: '#ffdc00' },
      { value: 3, label: 'High', color: '#ff8200' },
      { value: 4, label: 'Very high', color: '#dc0000' },
    ],
  },
];

async function parseWaterChangeResults(
  data: any
): Promise<MultiYearWaterChangeResult> {
  if (!Array.isArray(data.comparisons) || data.comparisons.length !== 4) {
    throw new Error('The backend did not return all four water-change comparisons.');
  }

  const comparisons: PairwiseWaterChangeComparison[] = await Promise.all(
    data.comparisons.map(async (comparison: any) => {
      const rasterRes = await fetch(comparison.rasterUrl);
      if (!rasterRes.ok) {
        const errorData = await rasterRes.json().catch(() => null);
        throw new Error(errorData?.error || `Raster download failed (${rasterRes.status}).`);
      }
      const rasterBuf = await rasterRes.arrayBuffer();
      const parsed = await parseGeoTiffBuffer(rasterBuf, comparison.outputFilename);
      const stats = comparison.statistics;
      const changedAreaHa = stats.waterLossAreaHa + stats.waterGainAreaHa;

      return {
        key: `${comparison.fromYear}_${comparison.toYear}`,
        fromYear: comparison.fromYear,
        toYear: comparison.toYear,
        isOverall: false,
        parsed,
        stats: {
          fromYear: comparison.fromYear,
          toYear: comparison.toYear,
          changedAreaM2: changedAreaHa * 10000,
          changedAreaHa,
          changedAreaKm2: changedAreaHa / 100,
          changedPixels: stats.waterLossPixels + stats.waterGainPixels,
          increaseAreaM2: stats.waterGainAreaHa * 10000,
          increaseAreaHa: stats.waterGainAreaHa,
          increaseAreaKm2: stats.waterGainAreaHa / 100,
          increasePixels: stats.waterGainPixels,
          decreaseAreaM2: stats.waterLossAreaHa * 10000,
          decreaseAreaHa: stats.waterLossAreaHa,
          decreaseAreaKm2: stats.waterLossAreaHa / 100,
          decreasePixels: stats.waterLossPixels,
          stableWaterAreaM2: stats.persistentWaterAreaHa * 10000,
          stableWaterAreaHa: stats.persistentWaterAreaHa,
          stableWaterAreaKm2: stats.persistentWaterAreaHa / 100,
          stableWaterPixels: stats.persistentWaterPixels,
          unchangedLandPixels: 16114,
          fromYearWaterAreaKm2: stats.historicalWaterAreaHa / 100,
          toYearWaterAreaKm2: stats.currentWaterAreaHa / 100,
          analysedAreaM2: 1831200,
          analysedAreaHa: 183.12,
          analysedAreaKm2: 1.8312,
          analysedPixels: 18312,
          percentageChange: stats.percentageChange,
          netChangeAreaKm2: stats.netChangeAreaHa / 100,
        },
      };
    })
  );

  const selectedComparison = comparisons.find(
    (comparison) =>
      comparison.fromYear === data.comparison?.fromYear &&
      comparison.toYear === data.comparison?.toYear
  );
  if (!selectedComparison) {
    throw new Error('The selected comparison was not returned by the backend.');
  }

  return {
    selectedComparison,
    overallComparison: { ...selectedComparison, isOverall: true },
    yearlyTransitions: comparisons.filter(
      (comparison) => comparison.key !== selectedComparison.key
    ),
  };
}

function makeBackendRasterCard(
  parsed: ParsedGeoTiff,
  title: string,
  subtitle: string,
  pixels: number,
  areaM2: number,
  legend: typeof PERSISTENT_WATER_LEGEND
): IntermediateRasterItem {
  return {
    id: parsed.metadata.filename,
    title,
    subtitle,
    filename: parsed.metadata.filename,
    areaKm2: areaM2 / 1_000_000,
    areaHa: areaM2 / 10_000,
    areaM2,
    pixels,
    percentage: parsed.metadata.totalPixels > 0
      ? (pixels / parsed.metadata.totalPixels) * 100
      : 0,
    parsed,
    legend,
  };
}

export default function App() {
  const [activeStep, setActiveStep] = useState<WorkflowStep>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingSubStep, setProcessingSubStep] = useState<number>(5);
  const [processingDetail, setProcessingDetail] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mapFocusCounter, setMapFocusCounter] = useState<number>(1);

  // Multi-year water mask items (default 2019..2024 Velachery series)
  const [yearlyItems, setYearlyItems] = useState<YearlyWaterMaskItem[]>([]);
  const [previewYearId, setPreviewYearId] = useState<string | null>(null);

  // Sequential pipeline outputs
  const [segmentationMasks, setSegmentationMasks] = useState<
    Array<{ year: number; parsed: ParsedGeoTiff; waterPixels: number; nonWaterPixels: number }>
  >([]);
  const [segmentationPreviewYear, setSegmentationPreviewYear] = useState<number | null>(null);
  const [waterChange, setWaterChange] =
    useState<MultiYearWaterChangeResult | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisPipelineProgress>({
    state: 'idle',
    currentStage: null,
    completedStages: 0,
    totalStages: 4,
    message: 'Ready to run the complete water-impact analysis.',
  });
  const [analysisResults, setAnalysisResults] = useState<AnalysisPipelineStageResult[]>([]);
  const [analysisMapItems, setAnalysisMapItems] = useState<IntermediateRasterItem[]>([]);
  const analysisLayerFilesRef = useRef<Set<string>>(new Set());
  const [persistentWater, setPersistentWater] = useState<{
    parsed: ParsedGeoTiff;
    stats: PersistentWaterStats;
  } | null>(null);
  const [lulcAnalysis, setLulcAnalysis] = useState<{
    parsed: ParsedGeoTiff;
    visualization: ParsedGeoTiff;
    stats: LulcAnalysisStats;
  } | null>(null);
  const [encroachment, setEncroachment] = useState<{
    parsed: ParsedGeoTiff;
    stats: PotentialEncroachmentStats;
  } | null>(null);
  const [waterFlowImpact, setWaterFlowImpact] = useState<{
    items: IntermediateRasterItem[];
    primary: IntermediateRasterItem;
  } | null>(null);

  // Intermediate sub-rasters for each stage
  const [step2SubRasters, setStep2SubRasters] = useState<
    IntermediateRasterItem[]
  >([]);
  const [activeStep2SubRaster, setActiveStep2SubRaster] =
    useState<IntermediateRasterItem | null>(null);
  const [step4SubRasters, setStep4SubRasters] = useState<
    IntermediateRasterItem[]
  >([]);
  const [activeStep4SubRaster, setActiveStep4SubRaster] =
    useState<IntermediateRasterItem | null>(null);
  const [activeWaterFlowRaster, setActiveWaterFlowRaster] =
    useState<IntermediateRasterItem | null>(null);

  const mapSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const initialize = async () => {
      await loadSavedSatelliteImages();
    };
    void initialize();
  }, []);

  const validation = useMemo(
    () => validateMultiYearRasters(yearlyItems),
    [yearlyItems]
  );

  const sortedValidEntries = useMemo(() => {
    return yearlyItems
      .filter(
        (item): item is YearlyWaterMaskItem & { year: number; parsed: ParsedGeoTiff } =>
          item.year !== null &&
          Number.isFinite(item.year) &&
          item.parsed !== null
      )
      .map((item) => ({ year: item.year, parsed: item.parsed }))
      .sort((a, b) => a.year - b.year);
  }, [yearlyItems]);

  const resetDownstreamOutputs = (
    clearPipelineProgress = true,
    clearPipelineResults = true
  ) => {
    setSegmentationMasks([]);
    setSegmentationPreviewYear(null);
    setWaterChange(null);
    if (clearPipelineResults) {
      setAnalysisResults([]);
      setAnalysisMapItems([]);
      analysisLayerFilesRef.current.clear();
    }
    if (clearPipelineProgress) {
      setAnalysisProgress({
        state: 'idle',
        currentStage: null,
        completedStages: 0,
        totalStages: 4,
        message: 'Ready to run the complete water-impact analysis.',
      });
    }
    setPersistentWater(null);
    setLulcAnalysis(null);
    setEncroachment(null);
    setWaterFlowImpact(null);
    setActiveWaterFlowRaster(null);
  };

  const handleUploadPngForRow = async (id: string, file: File) => {
    try {
      const bitmap = await createImageBitmap(file);
      bitmap.close();

      setErrorMsg(null);
      setYearlyItems((previous) =>
        previous.map((entry) =>
          entry.id === id ? { ...entry, sourcePngFile: file } : entry
        )
      );
      resetDownstreamOutputs();
    } catch (err) {
      setErrorMsg(
        `Failed to use PNG ${file.name}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  const animateProcessingChecklist = async () => {
    setIsProcessing(true);
    setErrorMsg(null);
    for (let i = 0; i <= 4; i++) {
      setProcessingSubStep(i);
      await new Promise((r) => setTimeout(r, 85));
    }
    setProcessingSubStep(5);
    setIsProcessing(false);
  };

  const loadSavedSatelliteImages = async () => {
    try {
      setErrorMsg(null);
      const loaded: YearlyWaterMaskItem[] = [];
      const listResponse = await fetch('/api/satellite-images');
      if (!listResponse.ok) {
        throw new Error(`Could not load saved satellite images (${listResponse.status}).`);
      }
      const { images } = await listResponse.json();
      for (const image of images as Array<{
        year: number;
        filename: string;
        rasterUrl: string;
        pngUrl: string;
      }>) {
        const response = await fetch(image.rasterUrl);
        if (!response.ok) {
          throw new Error(`Could not load the ${image.year} satellite GeoTIFF.`);
        }
        const pngResponse = await fetch(image.pngUrl);
        if (!pngResponse.ok) {
          throw new Error(`Could not load the saved ${image.year} satellite PNG.`);
        }
        const buffer = await response.arrayBuffer();
        const pngBlob = await pngResponse.blob();
        const parsed = await parseGeoTiffBuffer(buffer, image.filename);
        loaded.push({
          id: `satellite-${image.year}-${Math.random().toString(36).slice(2, 7)}`,
          year: image.year,
          filename: image.filename,
          parsed,
          sourceFile: new File([buffer], image.filename, { type: 'image/tiff' }),
          sourcePngFile: new File([pngBlob], `satellite_${image.year}.png`, {
            type: 'image/png',
          }),
          isValid: true,
          validationMessage: 'Valid',
        });
      }
      setYearlyItems(loaded);
      setPreviewYearId(loaded[loaded.length - 1]?.id || null);
      resetDownstreamOutputs();
      setActiveStep(0);
      setMapFocusCounter((c) => c + 1);
    } catch (err) {
      resetDownstreamOutputs();
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const handleChangeYear = (id: string, year: number | null) => {
    setYearlyItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, year } : item))
    );
    resetDownstreamOutputs();
  };

  const handleUploadFileForRow = async (id: string, file: File) => {
    try {
      setErrorMsg(null);
      const buf = await file.arrayBuffer();
      const parsed = await parseGeoTiffBuffer(buf, file.name);
      const detectedYr = detectYearFromFilename(file.name);

      setYearlyItems((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          return {
            ...item,
            year: item.year ?? detectedYr,
            filename: file.name,
            parsed,
            sourceFile: file,
            isValid: true,
            validationMessage: 'Valid',
          };
        })
      );
      setPreviewYearId(id);
      resetDownstreamOutputs();
      setMapFocusCounter((c) => c + 1);
    } catch (err) {
      setErrorMsg(
        `Failed to read GeoTIFF ${file.name}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  };

  const handleRemoveRow = (id: string) => {
    setYearlyItems((prev) => {
      const next = prev.filter((item) => item.id !== id);
      if (previewYearId === id) {
        setPreviewYearId(next[0]?.id || null);
      }
      return next;
    });
    resetDownstreamOutputs();
  };

  const handleAddEmptyRow = () => {
    const existingYears = new Set(
      yearlyItems.map((i) => i.year).filter((y): y is number => y !== null)
    );
    let suggestedYear = 2025;
    for (let y = 2019; y <= 2030; y++) {
      if (!existingYears.has(y)) {
        suggestedYear = y;
        break;
      }
    }

    const newId = `yr-custom-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    setYearlyItems((prev) => [
      ...prev,
      {
        id: newId,
        year: suggestedYear,
        filename: '',
        parsed: null,
        isValid: false,
        validationMessage: 'Missing satellite GeoTIFF (.tif) raster file',
      },
    ]);
    resetDownstreamOutputs();
  };

  const handleBulkUploadFiles = async (files: FileList) => {
    try {
      setErrorMsg(null);
      const newEntries: YearlyWaterMaskItem[] = [];
      const usedYears = new Set(
        yearlyItems.map((i) => i.year).filter((y): y is number => y !== null)
      );

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (
          !f.name.toLowerCase().endsWith('.tif') &&
          !f.name.toLowerCase().endsWith('.tiff')
        ) {
          continue;
        }
        const buf = await f.arrayBuffer();
        const parsed = await parseGeoTiffBuffer(buf, f.name);
        let yr = detectYearFromFilename(f.name);
        if (yr === null) {
          for (let candidate = 2019; candidate <= 2035; candidate++) {
            if (!usedYears.has(candidate)) {
              yr = candidate;
              break;
            }
          }
        }
        if (yr !== null) usedYears.add(yr);

        newEntries.push({
          id: `yr-bulk-${Date.now()}-${i}`,
          year: yr,
          filename: f.name,
          parsed,
          sourceFile: f,
          isValid: true,
          validationMessage: 'Valid',
        });
      }

      if (newEntries.length > 0) {
        setYearlyItems((prev) => {
          const byYear = new Map<number | string, YearlyWaterMaskItem>();
          for (const item of prev) {
            if (item.parsed) {
              byYear.set(item.year ?? item.id, item);
            }
          }
          for (const item of newEntries) {
            byYear.set(item.year ?? item.id, item);
          }
          return Array.from(byYear.values()).sort(
            (a, b) => (a.year ?? 9999) - (b.year ?? 9999)
          );
        });
        setPreviewYearId(newEntries[0].id);
        resetDownstreamOutputs();
        setMapFocusCounter((c) => c + 1);
      }
    } catch (err) {
      setErrorMsg(
        `Bulk GeoTIFF upload error: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  };

  const handleRunWaterBodySegmentation = async () => {
    if (isProcessing) return;
    const entries = yearlyItems
      .filter(
        (item): item is YearlyWaterMaskItem & {
          year: number;
          parsed: ParsedGeoTiff;
          sourceFile: File;
          sourcePngFile: File;
        } =>
          item.year !== null &&
          item.parsed !== null &&
          item.sourceFile !== undefined &&
          item.sourcePngFile !== undefined
      )
      .sort((a, b) => a.year - b.year);
    if (!validation.isReady || entries.length < 5) {
      setErrorMsg(
        validation.errors.join(' ') ||
          'Each required satellite year must have both a GeoTIFF and matching PNG.'
      );
      return;
    }

    setActiveStep(1);
    setIsProcessing(true);
    setErrorMsg(null);
    setProcessingSubStep(1);
    setProcessingDetail('Uploading satellite GeoTIFF and user-provided PNG images...');
    resetDownstreamOutputs();

    try {
      const formData = new FormData();
      for (const item of entries) {
        formData.append(
          'satelliteTiffs',
          item.sourceFile,
          `Velachery_Preprocessed_RGB_${item.year}.tif`
        );
        formData.append(
          'satellitePngs',
          item.sourcePngFile,
          `satellite_${item.year}.png`
        );
      }

      setProcessingSubStep(2);
      setProcessingDetail('Running water-body segmentation for each uploaded year...');
      const response = await fetch('/api/process/water-body-segmentation', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || `Water-body segmentation failed (${response.status}).`);
      }
      if (!Array.isArray(data.outputs) || data.outputs.length !== entries.length) {
        throw new Error('The backend did not return a water mask for every satellite image.');
      }

      const masks = await Promise.all(
        data.outputs.map(async (output: {
          year: number;
          filename: string;
          rasterUrl: string;
          waterPixels: number;
          nonWaterPixels: number;
        }) => {
          const rasterResponse = await fetch(output.rasterUrl);
          if (!rasterResponse.ok) {
            throw new Error(`Could not load the generated ${output.year} water mask.`);
          }
          const parsed = await parseGeoTiffBuffer(
            await rasterResponse.arrayBuffer(),
            output.filename
          );
          return {
            year: output.year,
            parsed,
            waterPixels: output.waterPixels,
            nonWaterPixels: output.nonWaterPixels,
          };
        })
      );
      setSegmentationMasks(masks.sort((a, b) => a.year - b.year));
      setSegmentationPreviewYear(masks[0]?.year ?? null);
      setProcessingSubStep(5);
      setProcessingDetail(`Created and loaded ${masks.length} georeferenced water masks.`);
      setMapFocusCounter((counter) => counter + 1);
    } catch (err) {
      setSegmentationMasks([]);
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setIsProcessing(false);
    }
  };

  const showWaterChangeFromActiveRun = async () => {
    setActiveStep(2);
    setErrorMsg(null);
    setProcessingDetail('Waiting for the current run to finish its water-change maps...');

    while (true) {
      const statusResponse = await fetch('/api/process/water-change/status');
      if (!statusResponse.ok) {
        throw new Error(`Could not check water-change progress (${statusResponse.status}).`);
      }
      const status = await statusResponse.json();
      if (status.state === 'failed') {
        throw new Error(status.message || 'The current water-impact analysis failed.');
      }
      const waterChangeReady =
        status.currentStage !== 'water-flow-impact' &&
        (status.completedStages >= 1 ||
        status.completedComparisons >= status.totalComparisons ||
        status.state === 'completed');

      setProcessingDetail(
        status.currentComparison
          ? `Water Change is running as part of Water-Flow Impact. Completed ${status.completedComparisons}/${status.totalComparisons} comparisons; currently running ${status.currentComparison}.`
          : status.message
      );

      if (waterChangeReady) {
        const resultsResponse = await fetch('/api/water-change/results');
        if (resultsResponse.ok) {
          const resultsData = await resultsResponse.json();
          const result = await parseWaterChangeResults(resultsData);
          setWaterChange(result);
          setMapFocusCounter((counter) => counter + 1);
          return;
        }

        if (status.state !== 'running') {
          const errorData = await resultsResponse.json().catch(() => null);
          throw new Error(
            errorData?.error ||
              status.message ||
              'Water-change outputs are not available from the current run.'
          );
        }
      }

      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 1000);
      });
    }
  };

  // STEP 2 Execution: Multi-Year Water Change
  const handleRunStep2WaterChange = async (
    customFromYear: number = 2017,
    customToYear: number = 2024
  ) => {
    const wasAlreadyProcessing = isProcessing;
    try {
      const statusResponse = await fetch('/api/process/water-change/status');
      if (statusResponse.ok) {
        const status = await statusResponse.json();
        if (status.state === 'running') {
          await showWaterChangeFromActiveRun();
          return;
        }
      }
    } catch (err) {
      setActiveStep(2);
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Could not read the current water-change analysis status.'
      );
      return;
    }

    let progressTimer: number | undefined;
    try {
      setActiveStep(2);
      setIsProcessing(true);
      setErrorMsg(null);
      setProcessingSubStep(1);
      setProcessingDetail('Generating water-change maps and statistics.');
      const refreshProgress = async () => {
        try {
          const statusRes = await fetch('/api/process/water-change/status');
          if (!statusRes.ok) return;
          const status = await statusRes.json();
          setProcessingDetail(
            status.currentComparison
              ? `${status.message} Current water comparison: ${status.currentComparison}.`
              : status.message
          );
        } catch {
          // The analysis request remains authoritative if status polling briefly fails.
        }
      };
      progressTimer = window.setInterval(() => void refreshProgress(), 1000);
      void refreshProgress();
      const apiRes = await fetch('/api/process/water-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromYear: customFromYear, toYear: customToYear }),
      });
      if (!apiRes.ok) {
        const errorData = await apiRes.json().catch(() => null);
        if (apiRes.status === 409) {
          await showWaterChangeFromActiveRun();
          if (!wasAlreadyProcessing) setIsProcessing(false);
          return;
        }
        throw new Error(errorData?.error || `Water change analysis failed (${apiRes.status}).`);
      }
      setProcessingSubStep(3);
      const data = await apiRes.json();
      const res = await parseWaterChangeResults(data);

      setWaterChange(res);
      setMapFocusCounter((c) => c + 1);
      setProcessingSubStep(5);
      setProcessingDetail('Water-change comparisons completed.');
      setIsProcessing(false);
    } catch (err) {
      setIsProcessing(false);
      resetDownstreamOutputs(false, false);
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      if (progressTimer !== undefined) window.clearInterval(progressTimer);
    }
  };

  // STEP 3 Execution: Persistent Encroachment
  const handleRunStep3PersistentWater = async () => {
    try {
      setActiveStep(3);
      await animateProcessingChecklist();
      const apiRes = await fetch('/api/process/persistent-encroachment', { method: 'POST' });
      if (!apiRes.ok) {
        throw new Error('Backend unavailable. Please start the backend and try again.');
      }
      const data = await apiRes.json();
      const rasterRes = await fetch(data.rasterUrl);
      if (!rasterRes.ok) {
        throw new Error('Backend unavailable. Please start the backend and try again.');
      }
      const rasterBuf = await rasterRes.arrayBuffer();
      const parsed = await parseGeoTiffBuffer(rasterBuf, data.outputFilename);
      const outputCards: IntermediateRasterItem[] = await Promise.all(
        data.comparisons.map(async (comparison: any) => {
          const comparisonResponse = await fetch(comparison.rasterUrl);
          if (!comparisonResponse.ok) {
            throw new Error(`Could not load ${comparison.outputFilename}.`);
          }
          const comparisonBuffer = await comparisonResponse.arrayBuffer();
          const comparisonRaster = await parseGeoTiffBuffer(
            comparisonBuffer,
            comparison.outputFilename
          );
          return makeBackendRasterCard(
            comparisonRaster,
            comparison.label,
            'Persistent encroachment raster generated by Persistent Check',
            comparison.statistics.retainedEncroachmentPixels,
            comparison.statistics.retainedEncroachmentAreaHa * 10000,
            PERSISTENT_WATER_LEGEND
          );
        })
      );
      setStep2SubRasters(outputCards);

      const stats = {
        yearsAnalysed: [2017, 2020, 2023, 2024],
        persistentWaterAreaM2: data.statistics.retainedEncroachmentAreaHa * 10000,
        persistentWaterAreaHa: data.statistics.retainedEncroachmentAreaHa,
        persistentWaterAreaKm2: data.statistics.retainedEncroachmentAreaHa / 100,
        persistentWaterPixels: data.statistics.retainedEncroachmentPixels,
        seasonalWaterAreaM2: 0,
        seasonalWaterAreaHa: 0,
        seasonalWaterAreaKm2: 0,
        seasonalWaterPixels: data.statistics.condition2Pixels,
        nonWaterPixels: data.statistics.condition4Pixels,
        studyAreaM2: 1831200,
        studyAreaHa: 183.12,
        studyAreaKm2: 1.8312,
        studyAreaPixels: 18312,
        coveragePercentage: (data.statistics.retainedEncroachmentAreaHa / 183.12) * 100,
        seasonalPercentage: 0,
        retentionRatioPercentage: data.statistics.retainedEncroachmentPixels > 0
          ? (data.statistics.condition1Pixels / data.statistics.retainedEncroachmentPixels) * 100
          : 0,
      };

      setPersistentWater({ parsed, stats });
      setMapFocusCounter((c) => c + 1);
    } catch (err) {
      setIsProcessing(false);
      setPersistentWater(null);
      setErrorMsg('Backend unavailable. Please start the backend and try again.');
    }
  };

  // STEP 4 Execution: LULC Analysis
  const handleRunStep4Lulc = async () => {
    try {
      setActiveStep(4);
      await animateProcessingChecklist();
      const apiRes = await fetch('/api/process/lulc', { method: 'POST' });
      if (!apiRes.ok) {
        throw new Error('Backend unavailable. Please start the backend and try again.');
      }
      const data = await apiRes.json();
      const rasterRes = await fetch(data.rasterUrl);
      if (!rasterRes.ok) {
        throw new Error('Backend unavailable. Please start the backend and try again.');
      }
      const rasterBuf = await rasterRes.arrayBuffer();
      const parsed = await parseGeoTiffBuffer(rasterBuf, data.outputFilename);
      const visualizationResponse = await fetch(data.visualizationRasterUrl);
      if (!visualizationResponse.ok) {
        throw new Error('Could not load the backend LULC RGB visualization.');
      }
      const visualizationBuffer = await visualizationResponse.arrayBuffer();
      const visualization = await parseGeoTiffBuffer(
        visualizationBuffer,
        data.visualizationFilename
      );

      const stats: LulcAnalysisStats = {
        classes: data.statistics.classes.map((c: any) => ({
          classId: c.classId,
          className: c.className,
          color: c.color,
          pixels: c.pixels,
          areaM2: c.areaM2,
          areaHa: c.areaHa,
          areaKm2: c.areaHa / 100,
          percentage: c.percentage,
        })),
        totalPixels: data.statistics.totalPersistentPixels,
        totalAreaM2: data.statistics.totalPersistentEncroachmentHa * 10000,
        totalAreaHa: data.statistics.totalPersistentEncroachmentHa,
        totalAreaKm2: data.statistics.totalPersistentEncroachmentHa / 100,
      };

      setLulcAnalysis({ parsed, visualization, stats });
      setMapFocusCounter((c) => c + 1);
    } catch (err) {
      setIsProcessing(false);
      setLulcAnalysis(null);
      setErrorMsg('Backend unavailable. Please start the backend and try again.');
    }
  };

  // STEP 5 Execution: Potential Encroachment
  const handleRunStep5Encroachment = async () => {
    try {
      setActiveStep(5);
      await animateProcessingChecklist();
      const apiRes = await fetch('/api/process/encroachment', { method: 'POST' });
      if (!apiRes.ok) {
        throw new Error('Backend unavailable. Please start the backend and try again.');
      }
      const data = await apiRes.json();
      const rasterRes = await fetch(data.rasterUrl);
      if (!rasterRes.ok) {
        throw new Error('Backend unavailable. Please start the backend and try again.');
      }
      const rasterBuf = await rasterRes.arrayBuffer();
      const parsed = await parseGeoTiffBuffer(rasterBuf, data.outputFilename);
      const outputCards: IntermediateRasterItem[] = await Promise.all(
        data.comparisons.map(async (comparison: any) => {
          const comparisonResponse = await fetch(comparison.rasterUrl);
          if (!comparisonResponse.ok) {
            throw new Error(`Could not load ${comparison.outputFilename}.`);
          }
          const comparisonBuffer = await comparisonResponse.arrayBuffer();
          const comparisonRaster = await parseGeoTiffBuffer(
            comparisonBuffer,
            comparison.outputFilename
          );
          return makeBackendRasterCard(
            comparisonRaster,
            `Potential encroachment ${comparison.fromYear} → ${comparison.toYear}`,
            'Backend binary mask: retained encroachment overlapping built-up land',
            comparison.pixels,
            comparison.areaM2,
            ENCROACHMENT_LEGEND
          );
        })
      );
      setStep4SubRasters(outputCards);

      const stats: PotentialEncroachmentStats = {
        baselineYear: 2017,
        finalYear: 2024,
        totalEncroachmentPixels: data.statistics.potentialEncroachmentPixels,
        areaM2: data.statistics.potentialEncroachmentAreaM2,
        areaHa: data.statistics.potentialEncroachmentAreaHa,
        areaKm2: data.statistics.potentialEncroachmentAreaHa / 100,
        analysedAreaKm2: 1.8312,
        analysedPixels: 18312,
        historicalWaterFootprintKm2: data.statistics.historicalWaterFootprintHa / 100,
        percentageOfAnalysedArea: (data.statistics.potentialEncroachmentAreaHa / 183.12) * 100,
        percentageOfHistoricalWater: data.statistics.historicalWaterFootprintHa > 0
          ? (data.statistics.potentialEncroachmentAreaHa / data.statistics.historicalWaterFootprintHa) * 100
          : 0,
        categories: data.statistics.categories.map((c: any, idx: number) => ({
          categoryId: idx + 1,
          categoryName: c.categoryName,
          severity: c.severity,
          color: c.color,
          pixels: data.statistics.potentialEncroachmentPixels,
          areaM2: data.statistics.potentialEncroachmentAreaM2,
          areaHa: c.areaHa,
          areaKm2: c.areaHa / 100,
          percentageOfAnalysed: (c.areaHa / 183.12) * 100,
          percentageOfEncroachment: 100,
        })),
        lulcContributions: [
          {
            lulcClassId: 6,
            lulcClassName: 'Built-up',
            color: '#ff0000',
            pixels: data.statistics.potentialEncroachmentPixels,
            areaM2: data.statistics.potentialEncroachmentAreaM2,
            areaHa: data.statistics.potentialEncroachmentAreaHa,
            areaKm2: data.statistics.potentialEncroachmentAreaHa / 100,
            sharePercentage: 100,
          },
        ],
      };

      setEncroachment({ parsed, stats });
      setMapFocusCounter((c) => c + 1);
    } catch (err) {
      setIsProcessing(false);
      setEncroachment(null);
      setErrorMsg('Backend unavailable. Please start the backend and try again.');
    }
  };

  const handleRunStep6WaterFlowImpact = async () => {
    if (isProcessing) return;
    setActiveStep(6);
    setIsProcessing(true);
    setProcessingSubStep(0);
    setErrorMsg(null);
    setAnalysisResults([]);
    setAnalysisMapItems([]);
    analysisLayerFilesRef.current.clear();
    setAnalysisProgress({
      state: 'running',
      currentStage: null,
      completedStages: 0,
      totalStages: 4,
      message: 'Preparing drainage and terrain-flow layers.',
    });
    try {
      const apiRes = await fetch('/api/process/water-flow-impact', {
        method: 'POST',
      });
      const data = await apiRes.json();
      if (!apiRes.ok) {
        throw new Error(data.error || 'Water-flow impact processing failed.');
      }

      const outputsByFilename = new Map<string, string>(
        data.outputs.map((output: { outputFilename: string; rasterUrl: string }) => [
          output.outputFilename,
          output.rasterUrl,
        ])
      );
      const items = await Promise.all(
        WATER_FLOW_RASTER_CONFIG.map(async (config) => {
          const rasterUrl = outputsByFilename.get(config.filename);
          if (!rasterUrl) {
            throw new Error(`Backend did not return ${config.filename}.`);
          }
          const response = await fetch(rasterUrl);
          if (!response.ok) {
            throw new Error(`Could not load ${config.filename}.`);
          }
          const parsed = await parseGeoTiffBuffer(
            await response.arrayBuffer(),
            config.filename
          );
          const validPixels = parsed.metadata.validPixels;
          const areaM2 = validPixels * parsed.metadata.pixelAreaM2;
          return makeBackendRasterCard(
            parsed,
            config.title,
            config.subtitle,
            validPixels,
            areaM2,
            config.legend
          );
        })
      );
      const primary = items.find(
        (item) => item.filename === 'relative_flood_vulnerability.tif'
      );
      if (!primary) {
        throw new Error('Relative flood vulnerability raster was not returned.');
      }
      setWaterFlowImpact({ items, primary });
      setActiveWaterFlowRaster(null);
      setMapFocusCounter((counter) => counter + 1);

      setProcessingDetail('Water-flow layers ready. Starting the four-stage water-impact analysis.');
      let pipelineTimer: number | undefined;
      const loadPipelineLayers = async (
        stageResults: AnalysisPipelineStageResult[]
      ) => {
        const newLayers = stageResults.flatMap((stage) =>
          stage.layers.map((layer) => ({ ...layer, stageTitle: stage.title }))
        ).filter((layer) => !analysisLayerFilesRef.current.has(layer.filename));
        newLayers.forEach((layer) => analysisLayerFilesRef.current.add(layer.filename));

        const settledLayers = await Promise.allSettled(newLayers.map(async (layer) => {
            const response = await fetch(`/api/raster/${encodeURIComponent(layer.filename)}`);
            if (!response.ok) {
              throw new Error(`Could not load RGB GeoTIFF ${layer.filename}.`);
            }
            const parsed = await parseGeoTiffBuffer(
              await response.arrayBuffer(),
              layer.filename
            );
            return {
              ...makeBackendRasterCard(
                parsed,
                layer.label,
                `${layer.stageTitle} · RGB GeoTIFF display layer`,
                0,
                0,
                layer.legend
              ),
              previewOnly: true,
            };
          }));
        const loadedLayers = settledLayers.flatMap((result) =>
          result.status === 'fulfilled' ? [result.value] : []
        );
        const failedIndexes = settledLayers.flatMap((result, index) =>
          result.status === 'rejected' ? [index] : []
        );
        failedIndexes.forEach((index) => {
          analysisLayerFilesRef.current.delete(newLayers[index].filename);
        });
        if (loadedLayers.length > 0) {
          setAnalysisMapItems((previous) => [
            ...previous,
            ...loadedLayers.filter(
              (loaded) => !previous.some((item) => item.filename === loaded.filename)
            ),
          ]);
        }
        if (failedIndexes.length > 0) {
          const reason = settledLayers[failedIndexes[0]];
          throw reason.status === 'rejected'
            ? reason.reason
            : new Error('An RGB GeoTIFF layer could not be loaded.');
        }
      };

      const refreshPipelineProgress = async () => {
        try {
          const response = await fetch('/api/process/water-change/status');
          if (!response.ok) return;
          const status = await response.json();
          setAnalysisProgress({
            state: status.state,
            currentStage: status.currentStage,
            completedStages: status.completedStages,
            totalStages: status.totalStages,
            message: status.message,
          });
          if (Array.isArray(status.pipelineResults)) {
            setAnalysisResults(status.pipelineResults);
            await loadPipelineLayers(status.pipelineResults);
          }
          setProcessingDetail(status.message);
        } catch (progressError) {
          // The pipeline request remains authoritative if progress polling briefly fails.
          setErrorMsg(progressError instanceof Error
            ? progressError.message
            : String(progressError));
        }
      };

      try {
        pipelineTimer = window.setInterval(() => void refreshPipelineProgress(), 1000);
        const pipelineResponse = await fetch('/api/process/water-change', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fromYear: waterChange?.selectedComparison.fromYear || 2017,
            toYear: waterChange?.selectedComparison.toYear || 2024,
            runImpactPipeline: true,
          }),
        });
        const pipelineData = await pipelineResponse.json();
        if (!pipelineResponse.ok) {
          if (Array.isArray(pipelineData.pipelineResults)) {
            setAnalysisResults(pipelineData.pipelineResults);
          }
          throw new Error(pipelineData.error || 'Water-impact analysis failed.');
        }
        if (!Array.isArray(pipelineData.pipelineResults) || pipelineData.pipelineResults.length !== 4) {
          throw new Error('The backend did not return results for all four analysis stages.');
        }
        setAnalysisResults(pipelineData.pipelineResults);
        await loadPipelineLayers(pipelineData.pipelineResults);
        setAnalysisProgress({
          state: 'completed',
          currentStage: null,
          completedStages: 4,
          totalStages: 4,
          message: 'All four water-impact analysis stages completed successfully.',
        });
        setProcessingDetail('Water-flow, runoff, encroachment impact, and vulnerability results are ready.');
      } catch (pipelineError) {
        setAnalysisProgress((previous) => ({
          ...previous,
          state: 'failed',
          message: pipelineError instanceof Error
            ? pipelineError.message
            : String(pipelineError),
        }));
        setErrorMsg(pipelineError instanceof Error
          ? pipelineError.message
          : String(pipelineError));
      } finally {
        if (pipelineTimer !== undefined) window.clearInterval(pipelineTimer);
      }
    } catch (err) {
      setWaterFlowImpact(null);
      setAnalysisProgress((previous) => ({
        ...previous,
        state: 'failed',
        message: err instanceof Error ? err.message : String(err),
      }));
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Water-flow impact processing failed.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const isStepUnlocked = (stepId: WorkflowStep): boolean => {
    if (stepId === 0) return true;
    if (stepId === 1) return validation.isReady;
    if (stepId === 2) return segmentationMasks.length > 0;
    if (stepId === 3) return !!waterChange;
    if (stepId === 4) return !!(waterChange && persistentWater);
    if (stepId === 5) return !!(waterChange && persistentWater && lulcAnalysis);
    if (stepId === 6) return !!encroachment;
    if (stepId === 7)
      return !!(
        waterChange &&
        persistentWater &&
        lulcAnalysis &&
        encroachment &&
        waterFlowImpact &&
        analysisProgress.state === 'completed'
      );
    return false;
  };

  const isStepCompleted = (stepId: WorkflowStep): boolean => {
    if (stepId === 0) return validation.isReady;
    if (stepId === 1) return segmentationMasks.length > 0;
    if (stepId === 2) return !!waterChange;
    if (stepId === 3) return !!persistentWater;
    if (stepId === 4) return !!lulcAnalysis;
    if (stepId === 5) return !!encroachment;
    if (stepId === 6) return !!waterFlowImpact;
    if (stepId === 7)
      return !!(
        waterChange &&
        persistentWater &&
        lulcAnalysis &&
        encroachment &&
        waterFlowImpact &&
        analysisProgress.state === 'completed'
      );
    return false;
  };

  const handleSelectStep = async (step: WorkflowStep) => {
    if (!isStepUnlocked(step)) return;

    if (step === 0) {
      setActiveStep(0);
      setMapFocusCounter((c) => c + 1);
      return;
    }
    if (step === 1) {
      if (segmentationMasks.length > 0) {
        setActiveStep(1);
        setMapFocusCounter((c) => c + 1);
      } else {
        await handleRunWaterBodySegmentation();
      }
      return;
    }
    if (step === 2) {
      if (waterChange) {
        setActiveStep(2);
        setMapFocusCounter((c) => c + 1);
      } else {
        await handleRunStep2WaterChange();
      }
      return;
    }
    if (step === 3) {
      if (persistentWater) {
        setActiveStep(3);
        setMapFocusCounter((c) => c + 1);
      } else {
        await handleRunStep3PersistentWater();
      }
      return;
    }
    if (step === 4) {
      if (lulcAnalysis) {
        setActiveStep(4);
        setMapFocusCounter((c) => c + 1);
      } else {
        await handleRunStep4Lulc();
      }
      return;
    }
    if (step === 5) {
      if (encroachment) {
        setActiveStep(5);
        setMapFocusCounter((c) => c + 1);
      } else {
        await handleRunStep5Encroachment();
      }
      return;
    }
    if (step === 6) {
      if (waterFlowImpact && analysisProgress.state === 'completed') {
        setActiveStep(6);
        setMapFocusCounter((c) => c + 1);
      } else {
        await handleRunStep6WaterFlowImpact();
      }
      return;
    }
    if (step === 7) {
      setActiveStep(7);
      setMapFocusCounter((c) => c + 1);
    }
  };

  const handleFocusMap = () => {
    setMapFocusCounter((c) => c + 1);
    mapSectionRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  };

  const handleDownloadLulcCsv = async () => {
    const response = await fetch('/api/reports/lulc');
    if (!response.ok) {
      setErrorMsg('The backend LULC CSV report is not available.');
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'lulc_persistent_encroachment_report_2017_2024_backend.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadStatisticsJson = () => {
    const payload = {
      application: 'GeoAI Water Encroachment Analysis',
      studyArea: VELACHERY_STUDY_AREA.name,
      generatedAt: new Date().toISOString(),
      yearsAnalysed: sortedValidEntries.map((e) => ({
        year: e.year,
        filename: e.parsed.metadata.filename,
        crs: e.parsed.metadata.crs,
        width: e.parsed.metadata.width,
        height: e.parsed.metadata.height,
      })),
      step1_waterBodySegmentation: segmentationMasks.map((item) => ({
        year: item.year,
        outputFile: item.parsed.metadata.filename,
        waterPixels: item.waterPixels,
        nonWaterPixels: item.nonWaterPixels,
      })),
      step2_waterChange: waterChange
        ? {
            outputFile: waterChange.selectedComparison.parsed.metadata.filename,
            selectedComparison: waterChange.selectedComparison.stats,
            overallComparison: waterChange.overallComparison.stats,
            yearlyTransitions: waterChange.yearlyTransitions.map(
              (t) => t.stats
            ),
          }
        : null,
      step3_persistentWater: persistentWater
        ? {
            outputFile: persistentWater.parsed.metadata.filename,
            metadata: persistentWater.parsed.metadata,
            statistics: persistentWater.stats,
          }
        : null,
      step4_lulcAnalysis: lulcAnalysis
        ? {
            outputFile: lulcAnalysis.parsed.metadata.filename,
            visualizationFile: lulcAnalysis.visualization.metadata.filename,
            metadata: lulcAnalysis.parsed.metadata,
            statistics: lulcAnalysis.stats,
          }
        : null,
      step5_potentialEncroachment: encroachment
        ? {
            outputFile: encroachment.parsed.metadata.filename,
            metadata: encroachment.parsed.metadata,
            statistics: encroachment.stats,
          }
        : null,
      step6_waterFlowImpact: waterFlowImpact
        ? {
            primaryOutputFile: waterFlowImpact.primary.filename,
            outputFiles: waterFlowImpact.items.map((item) => item.filename),
          }
        : null,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'velachery_geoai_statistics.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const activePreviewItem =
    yearlyItems.find((i) => i.id === previewYearId) ||
    yearlyItems.find((i) => i.parsed !== null) ||
    null;
  const activeSegmentationMask = segmentationMasks.find(
    (item) => item.year === segmentationPreviewYear
  ) || segmentationMasks[0] || null;

  const yearlyInputCards = useMemo<IntermediateRasterItem[]>(() => {
    return yearlyItems
      .filter((item) => item.parsed !== null)
      .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999))
      .map((item) => {
        const parsed = item.parsed!;
        const areaM2 = parsed.metadata.totalPixels * parsed.metadata.pixelAreaM2;
        return {
          id: item.id,
          title: `Year ${item.year ?? 'Unassigned'} Satellite Image`,
          subtitle: `${parsed.metadata.bands}-band satellite imagery`,
          filename: item.filename || `satellite_${item.year ?? 'YYYY'}.tif`,
          areaKm2: areaM2 / 1e6,
          areaHa: areaM2 / 10000,
          areaM2,
          pixels: parsed.metadata.totalPixels,
          percentage: parsed.metadata.validPixels > 0 ? 100 : 0,
          parsed,
          legend: [],
        };
      });
  }, [yearlyItems]);
  const segmentationCards = useMemo<IntermediateRasterItem[]>(
    () => segmentationMasks.map((item) =>
      makeBackendRasterCard(
        item.parsed,
        `Year ${item.year} Water Body Mask`,
        'U-Net water segmentation output',
        item.waterPixels,
        item.waterPixels * item.parsed.metadata.pixelAreaM2,
        WATER_MASK_LEGEND
      )
    ),
    [segmentationMasks]
  );

  return (
    <div className="app-theme min-h-screen bg-[#edf4fa] text-slate-800 flex flex-col font-sans">
      {/* Top Navigation Header with Tamil Nadu Govt & CMDA Emblem */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-2.5 bg-[#dfeaf4] border-b border-amber-500/30 sticky top-0 z-40 backdrop-blur-md shadow-md">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveStep(0);
          }}
          className="flex items-center gap-3 text-slate-100 group"
        >
          <TamilNaduEmblem size={34} className="w-8 h-8 flex-shrink-0 group-hover:scale-105 transition-transform" />
          <div className="flex flex-col">
            <span className="text-xs font-bold text-amber-400 tracking-wider uppercase leading-none">
              CMDA • Govt of Tamil Nadu
            </span>
            <span className="text-sm sm:text-base font-extrabold tracking-tight text-slate-100 group-hover:text-amber-300 transition-colors">
              Velachery GeoAI Water & Encroachment Monitor
            </span>
          </div>
        </a>

        <nav className="hidden xl:flex items-center gap-5 text-xs font-medium text-slate-400">
          {WORKFLOW_STEPS.map((s) => {
            const unlocked = isStepUnlocked(s.id);
            return (
              <button
                key={s.id}
                type="button"
                disabled={!unlocked}
                onClick={() => handleSelectStep(s.id)}
                className={`transition-colors whitespace-nowrap py-1 flex items-center gap-1 ${
                  activeStep === s.id
                    ? 'text-amber-600 underline underline-offset-4 decoration-amber-500/80 font-bold'
                    : unlocked
                    ? 'hover:text-slate-900 cursor-pointer'
                    : 'text-slate-500 cursor-not-allowed'
                }`}
              >
                {!unlocked && <Lock className="w-3 h-3" />}
                <span>{s.shortTitle}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setActiveStep(0)}
            className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 border border-slate-700 rounded hover:bg-slate-700 transition-colors whitespace-nowrap"
          >
            Satellite Input ({validation.validCount} yrs)
          </button>
          <button
            type="button"
            disabled={!validation.isReady || isProcessing}
            onClick={() => handleRunWaterBodySegmentation()}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
              validation.isReady && !isProcessing
                ? 'text-slate-950 bg-cyan-400 hover:bg-cyan-300 cursor-pointer'
                : 'text-slate-500 bg-slate-800 cursor-not-allowed'
            }`}
          >
            Segment Water
          </button>
        </div>
      </header>

      {/* Official Government of Tamil Nadu CMDA Hero Banner */}
      <CmdaBuildingBanner />

      {/* Study Area Subtitle Banner */}
      <div className="bg-white/75 border-b border-slate-200/90 px-6 py-3 shadow-sm">
        <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div>
            <h1 className="text-sm sm:text-base font-semibold text-slate-900">
              Velachery, Chennai — Water Change, Encroachment &amp; Water-Flow
              Impact Analysis
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mt-0.5">
              <span>Study Area: Velachery, Chennai, Tamil Nadu, India</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-cyan-400">
                {VELACHERY_STUDY_AREA.crsName}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                Satellite series:{' '}
                {sortedValidEntries.map((e) => e.year).join(' → ') ||
                  'Upload satellite GeoTIFFs'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-slate-600">
            <span>Sequential Lock:</span>
            <span className="text-slate-700">
              Satellite Input → Segmentation → Water Change → Persistent → LULC → Encroachment → Water-Flow Impact
            </span>
          </div>
        </div>
      </div>

      {/* Main Split GIS Console */}
      <div className="flex-1 max-w-[1600px] w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 p-4 sm:p-6">
        {/* Left Column: Sequential Stepper with Step Locking */}
        <aside className="lg:col-span-3 flex flex-col gap-5">
          <div className="border border-slate-200 bg-white/80 rounded-lg p-4 shadow-sm">
            <div className="text-xs font-semibold text-slate-600 mb-3 flex items-center justify-between">
              <span>SEQUENTIAL GEOAI WORKFLOW</span>
              <span className="font-mono text-cyan-700">Velachery</span>
            </div>

            <div className="space-y-1.5">
              {WORKFLOW_STEPS.map((step, index) => {
                const completed = isStepCompleted(step.id);
                const unlocked = isStepUnlocked(step.id);
                const isCurrent = activeStep === step.id;

                return (
                  <React.Fragment key={step.id}>
                    <button
                      type="button"
                      disabled={!unlocked}
                      onClick={() => handleSelectStep(step.id)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md border text-left transition-colors ${
                        isCurrent
                          ? 'bg-cyan-100/90 border-cyan-400/60 text-slate-900'
                          : completed
                          ? 'bg-emerald-50 border-emerald-200 text-slate-800 hover:border-emerald-300 cursor-pointer'
                          : unlocked
                          ? 'bg-slate-50/90 border-slate-200 text-slate-700 hover:border-slate-300 cursor-pointer'
                          : 'bg-slate-100/80 border-slate-200 text-slate-500 cursor-not-allowed opacity-70'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-6 h-6 rounded flex items-center justify-center text-xs font-mono font-bold shrink-0 ${
                            isCurrent
                              ? 'bg-cyan-400 text-slate-950'
                              : completed
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : unlocked
                              ? 'bg-slate-800 text-slate-300'
                              : 'bg-slate-900 text-slate-600'
                          }`}
                        >
                          {completed && !isCurrent ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : !unlocked ? (
                            <Lock className="w-3 h-3" />
                          ) : (
                            step.numberLabel
                          )}
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate">
                            {step.shortTitle}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400 truncate">
                            {step.filename}
                          </div>
                        </div>
                      </div>

                      <span className="text-[11px] font-mono ml-2 shrink-0">
                        {isCurrent ? (
                          <span className="text-cyan-300 font-semibold">
                            Active
                          </span>
                        ) : completed ? (
                          <span className="text-emerald-400">✓ Done</span>
                        ) : unlocked ? (
                          <span className="text-cyan-400">Ready</span>
                        ) : (
                          <span className="text-slate-600">Locked</span>
                        )}
                      </span>
                    </button>

                    {index < WORKFLOW_STEPS.length - 1 && (
                      <div className="flex justify-center py-0.5 text-slate-700 text-xs font-mono select-none">
                        ↓
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Intermediate GeoTIFF Outputs Quick Access */}
          <div className="border border-slate-800 bg-slate-900/60 rounded-lg p-4">
            <div className="text-xs font-semibold text-slate-300 mb-2">
              Generated GeoTIFF Outputs
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Each stage unlocks after the preceding stage completes on the{' '}
              <span className="text-slate-200">Velachery, Chennai</span> series.
            </p>

            <div className="space-y-2 text-xs font-mono">
              {[
                {
                  name: waterChange?.selectedComparison.parsed.metadata.filename || '',
                  step: 2 as WorkflowStep,
                  data: waterChange?.selectedComparison.parsed || null,
                },
                {
                  name: persistentWater?.parsed.metadata.filename || '',
                  step: 3 as WorkflowStep,
                  data: persistentWater?.parsed || null,
                },
                {
                  name: lulcAnalysis?.parsed.metadata.filename || '',
                  step: 4 as WorkflowStep,
                  data: lulcAnalysis?.parsed || null,
                },
                {
                  name: encroachment?.parsed.metadata.filename || '',
                  step: 5 as WorkflowStep,
                  data: encroachment?.parsed || null,
                },
                {
                  name: lulcAnalysis?.visualization.metadata.filename || '',
                  step: 4 as WorkflowStep,
                  data: lulcAnalysis?.visualization || null,
                },
                ...(waterFlowImpact?.items.map((item) => ({
                  name: item.filename,
                  step: 6 as WorkflowStep,
                  data: item.parsed,
                })) || []),
              ].filter((item) => item.data && item.name).map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between px-2.5 py-2 rounded bg-slate-950/70 border border-slate-800/80"
                >
                  <button
                    type="button"
                    disabled={!item.data}
                    onClick={() => handleSelectStep(item.step)}
                    className={`flex items-center gap-2 text-left truncate ${
                      item.data
                        ? 'hover:text-cyan-300 text-slate-200 cursor-pointer'
                        : 'text-slate-600 cursor-not-allowed'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        item.data ? 'bg-emerald-400' : 'bg-slate-700'
                      }`}
                    />
                    <span className="truncate">{item.name}</span>
                  </button>

                  {item.data ? (
                    <button
                      type="button"
                      onClick={() =>
                        downloadGeoTiffBuffer(item.data!.rawBuffer, item.name)
                      }
                      className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 text-[11px] shrink-0 ml-2"
                    >
                      <Download className="w-3 h-3" />
                      TIFF
                    </button>
                  ) : (
                    <span className="text-[10px] text-slate-600 flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5" />
                      Locked
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Right Column: Active Stage Workspace */}
        <main className="lg:col-span-9 flex flex-col gap-6" ref={mapSectionRef}>
          {/* STAGE 0: MULTI-YEAR INPUT */}
          {activeStep === 0 && (
            <div className="flex flex-col gap-6">
              <MultiYearUploadPanel
                items={yearlyItems}
                validation={validation}
                error={errorMsg}
                previewYearId={previewYearId}
                onSelectPreview={(id) => {
                  setPreviewYearId(id);
                  setMapFocusCounter((c) => c + 1);
                }}
                onChangeYear={handleChangeYear}
                onUploadFileForRow={handleUploadFileForRow}
                onUploadPngForRow={handleUploadPngForRow}
                onRemoveRow={handleRemoveRow}
                onAddEmptyRow={handleAddEmptyRow}
                onBulkUploadFiles={handleBulkUploadFiles}
                onReloadReferenceSeries={loadSavedSatelliteImages}
                onStartAnalysis={() => handleRunWaterBodySegmentation()}
              />

              <VelacheryGeoMap
                raster={activePreviewItem?.parsed || null}
                legend={WATER_MASK_LEGEND}
                stepTitle={
                  activePreviewItem
                    ? `Satellite Image (${activePreviewItem.year ?? 'Unassigned'}) — Velachery, Chennai`
                    : 'Velachery, Chennai Study Area'
                }
                outputFilename={
                  activePreviewItem?.filename || 'satellite_YYYY.tif'
                }
                focusTrigger={mapFocusCounter}
              />

              <IntermediateResultsGrid
                sectionTitle="Uploaded Satellite Images — Velachery, Chennai"
                sectionSubtitle="Select the matching user-provided PNG for each georeferenced satellite GeoTIFF; both originals are uploaded for water-body segmentation."
                items={yearlyInputCards}
                activeMapItemId={activePreviewItem?.id || null}
                onSelectForMap={(item) => {
                  if (item) {
                    setPreviewYearId(item.id);
                    handleFocusMap();
                  }
                }}
              />
            </div>
          )}

          {/* STAGE 1: WATER-BODY SEGMENTATION */}
          {activeStep === 1 && segmentationMasks.length === 0 && (
            <ProcessingStatusPanel
              stageTitle="Water-Body Segmentation"
              outputFilename="water_YYYY.tif"
              isProcessing={isProcessing}
              activeSubStep={processingSubStep}
              error={errorMsg}
              detail={processingDetail}
            />
          )}
          {activeStep === 1 && segmentationMasks.length > 0 && activeSegmentationMask && (
            <div className="flex flex-col gap-6">
              <div className="border border-slate-800 bg-slate-900/60 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-mono text-cyan-400">
                    STEP 1 · WATER-BODY SEGMENTATION
                  </div>
                  <h2 className="text-xl font-bold text-slate-100 mt-0.5">
                    Satellite-Derived Water Masks — Velachery, Chennai
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Generated {segmentationMasks.length} georeferenced masks from the uploaded satellite images.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRunStep2WaterChange()}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-cyan-400 text-slate-950 rounded hover:bg-cyan-300 transition-colors whitespace-nowrap"
                >
                  Step 2: Water Change
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <VelacheryGeoMap
                raster={activeSegmentationMask.parsed}
                legend={WATER_MASK_LEGEND}
                stepTitle={`STEP 1: Water Mask (${activeSegmentationMask.year})`}
                outputFilename={activeSegmentationMask.parsed.metadata.filename}
                focusTrigger={mapFocusCounter}
              />
              <IntermediateResultsGrid
                sectionTitle="Water-Body Segmentation Results"
                sectionSubtitle="Generated water masks are stored as GeoTIFFs in the backend water_masks_tif folder. Select a year to display its mask on the map."
                items={segmentationCards}
                activeMapItemId={activeSegmentationMask.parsed.metadata.filename}
                onSelectForMap={(item) => {
                  if (item) {
                    const selected = segmentationMasks.find(
                      (mask) => mask.parsed.metadata.filename === item.filename
                    );
                    if (selected) setSegmentationPreviewYear(selected.year);
                    handleFocusMap();
                  }
                }}
              />
              <RasterMetadataPanel
                metadata={activeSegmentationMask.parsed.metadata}
                defaultOpen={false}
                title={`Water Mask Metadata — ${activeSegmentationMask.year}`}
              />
            </div>
          )}

          {/* STAGE 2: STEP 2 — WATER CHANGE */}
          {activeStep === 2 && !waterChange && (
            <ProcessingStatusPanel
              stageTitle="Water Change"
              outputFilename="water_change_display_2017_2024.tif"
              isProcessing={isProcessing}
              activeSubStep={processingSubStep}
              error={errorMsg}
              detail={processingDetail}
            />
          )}
          {activeStep === 2 && waterChange && (
            <WaterChangeStepView
              availableYears={sortedValidEntries.map((e) => e.year)}
              waterChangeResult={waterChange}
              isProcessing={isProcessing}
              processingSubStep={processingSubStep}
              processingDetail={processingDetail}
              errorMsg={errorMsg}
              mapFocusCounter={mapFocusCounter}
              onRunCustomPair={(fromYr, toYr) => {
                const loadedComparisons = waterChange
                  ? Array.from(
                      new Map(
                        [
                          waterChange.selectedComparison,
                          ...waterChange.yearlyTransitions,
                          waterChange.overallComparison,
                        ].map((comparison) => [comparison.key, comparison])
                      ).values()
                    )
                  : [];
                const cachedComparison = loadedComparisons.find(
                  (comparison) =>
                    comparison.fromYear === fromYr && comparison.toYear === toYr
                );

                if (cachedComparison && waterChange) {
                  setWaterChange({
                    ...waterChange,
                    selectedComparison: cachedComparison,
                    overallComparison: { ...cachedComparison, isOverall: true },
                    yearlyTransitions: loadedComparisons.filter(
                      (comparison) => comparison.key !== cachedComparison.key
                    ),
                  });
                  setMapFocusCounter((counter) => counter + 1);
                  return;
                }

                void handleRunStep2WaterChange(fromYr, toYr);
              }}
              onSelectBackToInput={() => setActiveStep(0)}
              onProceedToStep3={handleRunStep3PersistentWater}
              onFocusMap={handleFocusMap}
            />
          )}

          {/* STAGE 3: STEP 3 — PERSISTENT WATER */}
          {activeStep === 3 && persistentWater && (
            <div className="flex flex-col gap-6">
              <div className="border border-slate-800 bg-slate-900/60 rounded-lg p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-mono text-cyan-400">
                      STEP 3 · PERSISTENT ENCROACHMENT CHECK
                    </div>
                    <h2 className="text-xl font-bold text-slate-100 mt-0.5">
                      Persistent Encroachment — Velachery, Chennai (2017–2024)
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Backend comparison outputs ·{' '}
                      <code className="text-cyan-300">{persistentWater.parsed.metadata.filename}</code>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleSelectStep(2)}
                      className="flex items-center gap-1 px-3 py-2 text-xs font-medium bg-slate-900 text-slate-300 border border-slate-800 rounded hover:bg-slate-800 transition-colors"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Step 2
                    </button>
                    <button
                      type="button"
                      onClick={handleFocusMap}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-800 text-slate-100 border border-slate-700 rounded hover:bg-slate-700 transition-colors whitespace-nowrap"
                    >
                      <Eye className="w-3.5 h-3.5 text-cyan-400" />
                      View on Map
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        downloadGeoTiffBuffer(
                          persistentWater.parsed.rawBuffer,
                          persistentWater.parsed.metadata.filename
                        )
                      }
                      className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-slate-950 text-cyan-300 border border-cyan-500/40 rounded hover:bg-cyan-500/10 transition-colors whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download TIFF
                    </button>
                    <button
                      type="button"
                      onClick={handleRunStep4Lulc}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-cyan-400 text-slate-950 rounded hover:bg-cyan-300 transition-colors whitespace-nowrap"
                    >
                      Step 4: LULC Analysis
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              <ProcessingStatusPanel
                stageTitle="Persistent Water"
                outputFilename={persistentWater.parsed.metadata.filename}
                isProcessing={isProcessing}
                activeSubStep={processingSubStep}
                error={errorMsg}
              />

              <VelacheryGeoMap
                raster={
                  activeStep2SubRaster
                    ? activeStep2SubRaster.parsed
                    : persistentWater.parsed
                }
                legend={PERSISTENT_WATER_LEGEND}
                stepTitle={
                  activeStep2SubRaster
                    ? activeStep2SubRaster.title
                    : 'STEP 3: Persistent Encroachment'
                }
                outputFilename={
                  activeStep2SubRaster
                    ? activeStep2SubRaster.filename
                    : persistentWater.parsed.metadata.filename
                }
                focusTrigger={mapFocusCounter}
              />

              <IntermediateResultsGrid
                sectionTitle="Intermediate Results — Persistent Water Components (Velachery, Chennai)"
                sectionSubtitle="Three standalone GeoTIFF rasters decomposed from multi-year hydrological persistence analysis. Click 'View on Map' on any card to inspect that layer on the main Leaflet map."
                items={step2SubRasters}
                activeMapItemId={activeStep2SubRaster?.id || null}
                onSelectForMap={(item) => {
                  setActiveStep2SubRaster(item);
                  handleFocusMap();
                }}
              />

              <div className="border border-slate-800 bg-slate-900/60 rounded-lg p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-100">
                    Persistent Encroachment Calculations — Velachery, Chennai
                  </h3>
                  <span className="text-xs font-mono text-slate-400">
                    Output:{' '}
                    <strong className="text-cyan-300">
                      {persistentWater.parsed.metadata.filename}
                    </strong>
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-4 rounded bg-slate-950/80 border border-slate-800">
                    <div className="text-xs text-slate-400">
                      Persistent Encroachment Area
                    </div>
                    <div className="text-2xl font-mono font-bold text-cyan-300 tabular-nums mt-1">
                      {persistentWater.stats.persistentWaterAreaKm2.toFixed(3)}{' '}
                      <span className="text-xs font-normal text-slate-400">
                        km²
                      </span>
                    </div>
                    <div className="text-xs font-mono text-slate-400 tabular-nums mt-1">
                      {persistentWater.stats.persistentWaterAreaHa.toFixed(2)}{' '}
                      ha ·{' '}
                      {Math.round(
                        persistentWater.stats.persistentWaterAreaM2
                      ).toLocaleString()}{' '}
                      m²
                    </div>
                  </div>

                  <div className="p-4 rounded bg-slate-950/80 border border-slate-800">
                    <div className="text-xs text-slate-400">
                      Persistent-Encroachment Pixels
                    </div>
                    <div className="text-2xl font-mono font-bold text-slate-100 tabular-nums mt-1">
                      {persistentWater.stats.persistentWaterPixels.toLocaleString()}
                    </div>
                    <div className="text-xs font-mono text-slate-400 tabular-nums mt-1">
                      Newly retained in later comparison:{' '}
                      {persistentWater.stats.seasonalWaterPixels.toLocaleString()}{' '}
                      px
                    </div>
                  </div>

                  <div className="p-4 rounded bg-slate-950/80 border border-slate-800">
                    <div className="text-xs text-slate-400">
                      Study Area (Velachery)
                    </div>
                    <div className="text-2xl font-mono font-bold text-slate-100 tabular-nums mt-1">
                      {persistentWater.stats.studyAreaKm2.toFixed(2)}{' '}
                      <span className="text-xs font-normal text-slate-400">
                        km²
                      </span>
                    </div>
                    <div className="text-xs font-mono text-slate-400 tabular-nums mt-1">
                      {persistentWater.stats.studyAreaHa.toFixed(2)} ha ·{' '}
                      {persistentWater.stats.studyAreaPixels.toLocaleString()}{' '}
                      px
                    </div>
                  </div>

                  <div className="p-4 rounded bg-slate-950/80 border border-slate-800">
                    <div className="text-xs text-slate-400">
                      Percentage Coverage
                    </div>
                    <div className="text-2xl font-mono font-bold text-emerald-400 tabular-nums mt-1">
                      {persistentWater.stats.coveragePercentage.toFixed(2)}%
                    </div>
                    <div className="text-xs font-mono text-slate-400 tabular-nums mt-1">
                      Core Retention Ratio:{' '}
                      {persistentWater.stats.retentionRatioPercentage.toFixed(1)}
                      %
                    </div>
                  </div>
                </div>
              </div>

              <RasterMetadataPanel
                metadata={persistentWater.parsed.metadata}
                defaultOpen={true}
                title={`Raster Information — ${persistentWater.parsed.metadata.filename}`}
              />
            </div>
          )}

          {/* STAGE 4: STEP 4 — LULC ANALYSIS */}
          {activeStep === 4 && lulcAnalysis && (
            <div className="flex flex-col gap-6">
              <div className="border border-slate-800 bg-slate-900/60 rounded-lg p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-mono text-cyan-400">
                      STEP 4 · LAND USE &amp; LAND COVER CLASSIFICATION
                    </div>
                    <h2 className="text-xl font-bold text-slate-100 mt-0.5">
                      LULC Analysis — Velachery, Chennai
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Analytical output:{' '}
                      <code className="text-cyan-300">{lulcAnalysis.parsed.metadata.filename}</code> ·
                      RGB visualization:{' '}
                      <code className="text-cyan-300">{lulcAnalysis.visualization.metadata.filename}</code> ·
                      Pixel-level land-cover classification across Velachery
                      Lake, Ram Nagar, Vijayanagar &amp; Pallikaranai corridor.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSelectStep(3)}
                      className="flex items-center gap-1 px-3 py-2 text-xs font-medium bg-slate-900 text-slate-300 border border-slate-800 rounded hover:bg-slate-800 transition-colors"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Step 3
                    </button>
                    <button
                      type="button"
                      onClick={handleFocusMap}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-800 text-slate-100 border border-slate-700 rounded hover:bg-slate-700 transition-colors whitespace-nowrap"
                    >
                      <Eye className="w-3.5 h-3.5 text-cyan-400" />
                      View on Map
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        downloadGeoTiffBuffer(
                          lulcAnalysis.parsed.rawBuffer,
                          lulcAnalysis.parsed.metadata.filename
                        )
                      }
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-950 text-cyan-300 border border-cyan-500/40 rounded hover:bg-cyan-500/10 transition-colors whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download TIFF
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        downloadGeoTiffBuffer(
                          lulcAnalysis.visualization.rawBuffer,
                          lulcAnalysis.visualization.metadata.filename
                        )
                      }
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-950 text-emerald-300 border border-emerald-500/40 rounded hover:bg-emerald-500/10 transition-colors whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download RGB TIFF
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadLulcCsv}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-950 text-emerald-300 border border-emerald-500/40 rounded hover:bg-emerald-500/10 transition-colors whitespace-nowrap"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                      Download CSV
                    </button>
                    <button
                      type="button"
                      onClick={handleRunStep5Encroachment}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-cyan-400 text-slate-950 rounded hover:bg-cyan-300 transition-colors whitespace-nowrap"
                    >
                      Step 5: Potential Encroachment
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              <ProcessingStatusPanel
                stageTitle="LULC Analysis"
                outputFilename={lulcAnalysis.parsed.metadata.filename}
                isProcessing={isProcessing}
                activeSubStep={processingSubStep}
                error={errorMsg}
              />

              <VelacheryGeoMap
                raster={lulcAnalysis.visualization}
                legend={LULC_LEGEND}
                stepTitle="STEP 4: LULC RGB Visualization"
                outputFilename={lulcAnalysis.visualization.metadata.filename}
                focusTrigger={mapFocusCounter}
              />

              {/* LULC Table */}
              <div className="border border-slate-800 bg-slate-900/60 rounded-lg overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-100">
                    LULC Class Area Quantification — Velachery, Chennai
                  </h3>
                  <span className="text-xs font-mono text-slate-400">
                    Pixel Area:{' '}
                    {lulcAnalysis.parsed.metadata.pixelAreaM2.toFixed(1)} m²/px
                    · {lulcAnalysis.parsed.metadata.crs}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-medium">
                        <th className="py-3 px-4">LULC Class</th>
                        <th className="py-3 px-4 text-right">Pixels</th>
                        <th className="py-3 px-4 text-right">Area (m²)</th>
                        <th className="py-3 px-4 text-right">Area (ha)</th>
                        <th className="py-3 px-4 text-right">Area (km²)</th>
                        <th className="py-3 px-4 text-right">Percentage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
                      {lulcAnalysis.stats.classes.map((cls) => (
                        <tr
                          key={cls.classId}
                          className="hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-3 px-4 font-sans font-medium text-slate-100">
                            <div className="flex items-center gap-2.5">
                              <span
                                className="w-3 h-3 rounded-xs shrink-0 border border-white/20"
                                style={{ backgroundColor: cls.color }}
                              />
                              <span>{cls.className}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right text-slate-200">
                            {cls.pixels.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right text-slate-300">
                            {Math.round(cls.areaM2).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right text-slate-300">
                            {cls.areaHa.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right text-cyan-300 font-semibold">
                            {cls.areaKm2.toFixed(4)}
                          </td>
                          <td className="py-3 px-4 text-right text-slate-100 font-semibold">
                            {cls.percentage.toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-700 bg-slate-950/90 font-mono font-bold text-slate-100 tabular-nums">
                        <td className="py-3 px-4 font-sans">
                          Total Analysed Extent (Velachery, Chennai)
                        </td>
                        <td className="py-3 px-4 text-right">
                          {lulcAnalysis.stats.totalPixels.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {Math.round(
                            lulcAnalysis.stats.totalAreaM2
                          ).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {lulcAnalysis.stats.totalAreaHa.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right text-cyan-300">
                          {lulcAnalysis.stats.totalAreaKm2.toFixed(4)}
                        </td>
                        <td className="py-3 px-4 text-right">100.00%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Recharts Bar + Donut Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="border border-slate-800 bg-slate-900/60 rounded-lg p-5">
                  <h4 className="text-sm font-semibold text-slate-100 mb-1">
                    LULC Area Distribution — Velachery (Area in Hectares)
                  </h4>
                  <p className="text-xs text-slate-400 mb-4">
                    Calculated from{' '}
                    <code className="text-cyan-300">{lulcAnalysis.parsed.metadata.filename}</code>{' '}
                    pixel counts and 10m UTM Zone 44N spatial resolution.
                  </p>
                  <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={lulcAnalysis.stats.classes}
                        layout="vertical"
                        margin={{ top: 5, right: 24, left: 20, bottom: 5 }}
                      >
                        <XAxis
                          type="number"
                          stroke="#64748b"
                          fontSize={11}
                          tickFormatter={(v) => `${v} ha`}
                        />
                        <YAxis
                          type="category"
                          dataKey="className"
                          stroke="#94a3b8"
                          fontSize={11}
                          width={155}
                        />
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: '#0f172a',
                            borderColor: '#1e293b',
                            fontSize: '12px',
                            color: '#f8fafc',
                          }}
                          formatter={(value: any, _name: any, props: any) => [
                            `${Number(value).toFixed(2)} ha (${Number(
                              props?.payload?.areaKm2 || 0
                            ).toFixed(3)} km² · ${Number(
                              props?.payload?.percentage || 0
                            ).toFixed(2)}%)`,
                            'Area',
                          ]}
                        />
                        <Bar dataKey="areaHa" radius={[0, 4, 4, 0]}>
                          {lulcAnalysis.stats.classes.map((entry) => (
                            <Cell key={entry.classId} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="border border-slate-800 bg-slate-900/60 rounded-lg p-5">
                  <h4 className="text-sm font-semibold text-slate-100 mb-1">
                    LULC Proportional Composition — Velachery (%)
                  </h4>
                  <p className="text-xs text-slate-400 mb-4">
                    Percentage distribution across all Dynamic World LULC classes in
                    Velachery, Chennai.
                  </p>
                  <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={lulcAnalysis.stats.classes}
                          dataKey="percentage"
                          nameKey="className"
                          cx="50%"
                          cy="46%"
                          innerRadius={55}
                          outerRadius={88}
                          paddingAngle={2}
                        >
                          {lulcAnalysis.stats.classes.map((entry) => (
                            <Cell key={entry.classId} fill={entry.color} />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: '#0f172a',
                            borderColor: '#1e293b',
                            fontSize: '12px',
                            color: '#f8fafc',
                          }}
                          formatter={(value: any, _name: any, props: any) => [
                            `${Number(value).toFixed(2)}% (${Number(
                              props?.payload?.pixels || 0
                            ).toLocaleString()} px · ${Number(
                              props?.payload?.areaKm2 || 0
                            ).toFixed(3)} km²)`,
                            String(props?.payload?.className || 'Class'),
                          ]}
                        />
                        <RechartsLegend
                          wrapperStyle={{ fontSize: '11px', color: '#cbd5e1' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <RasterMetadataPanel
                metadata={lulcAnalysis.parsed.metadata}
                defaultOpen={false}
                title={`Raster Information — ${lulcAnalysis.parsed.metadata.filename}`}
              />
            </div>
          )}

          {/* STAGE 5: STEP 5 — POTENTIAL ENCROACHMENT */}
          {activeStep === 5 && encroachment && (
            <div className="flex flex-col gap-6">
              <div className="border border-slate-800 bg-slate-900/60 rounded-lg p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-mono text-rose-400">
                      STEP 5 · FINAL HYDRO-URBAN ENCROACHMENT DETECTION (
                      {encroachment.stats.baselineYear} →{' '}
                      {encroachment.stats.finalYear})
                    </div>
                    <h2 className="text-xl font-bold text-slate-100 mt-0.5">
                      Potential Encroachment — Velachery, Chennai
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Output:{' '}
                      <code className="text-cyan-300">
                        {encroachment.parsed.metadata.filename}
                      </code>{' '}
                      · Persistent encroachment intersected with Dynamic World built-up pixels (
                      {encroachment.stats.baselineYear}–
                      {encroachment.stats.finalYear}) in Velachery.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleSelectStep(4)}
                      className="flex items-center gap-1 px-3 py-2 text-xs font-medium bg-slate-900 text-slate-300 border border-slate-800 rounded hover:bg-slate-800 transition-colors"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Step 4
                    </button>
                    <button
                      type="button"
                      onClick={handleFocusMap}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-800 text-slate-100 border border-slate-700 rounded hover:bg-slate-700 transition-colors whitespace-nowrap"
                    >
                      <Eye className="w-3.5 h-3.5 text-cyan-400" />
                      View on Map
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        downloadGeoTiffBuffer(
                          encroachment.parsed.rawBuffer,
                          encroachment.parsed.metadata.filename
                        )
                      }
                      className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-slate-950 text-cyan-300 border border-cyan-500/40 rounded hover:bg-cyan-500/10 transition-colors whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download TIFF
                    </button>
                    <button
                      type="button"
                      onClick={handleRunStep6WaterFlowImpact}
                      disabled={isProcessing}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-400 text-slate-950 rounded hover:bg-emerald-300 transition-colors whitespace-nowrap"
                    >
                      Step 6: Water-Flow Impact
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              <ProcessingStatusPanel
                stageTitle="Potential Encroachment"
                outputFilename={encroachment.parsed.metadata.filename}
                isProcessing={isProcessing}
                activeSubStep={processingSubStep}
                error={errorMsg}
              />

              <VelacheryGeoMap
                raster={
                  activeStep4SubRaster
                    ? activeStep4SubRaster.parsed
                    : encroachment.parsed
                }
                legend={ENCROACHMENT_LEGEND}
                stepTitle={
                  activeStep4SubRaster
                    ? activeStep4SubRaster.title
                    : 'STEP 5: Potential Encroachment'
                }
                outputFilename={
                  activeStep4SubRaster
                    ? activeStep4SubRaster.filename
                    : encroachment.parsed.metadata.filename
                }
                focusTrigger={mapFocusCounter}
              />

              <IntermediateResultsGrid
                sectionTitle="Potential Encroachment Comparison Outputs — Velachery, Chennai"
                sectionSubtitle="Actual binary GeoTIFF comparison outputs returned by the backend."
                items={step4SubRasters}
                activeMapItemId={activeStep4SubRaster?.id || null}
                onSelectForMap={(item) => {
                  setActiveStep4SubRaster(item);
                  handleFocusMap();
                }}
              />

              <div className="border border-slate-800 bg-slate-900/60 rounded-lg p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-100">
                    Potential Encroachment Area &amp; Metrics — Velachery,
                    Chennai
                  </h3>
                  <span className="text-xs font-mono text-slate-400">
                    Output:{' '}
                    <strong className="text-cyan-300">
                      {encroachment.parsed.metadata.filename}
                    </strong>
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div className="p-3.5 rounded bg-slate-950/80 border border-slate-800">
                    <div className="text-xs text-slate-400">
                      Total Area (km²)
                    </div>
                    <div className="text-lg font-mono font-bold text-rose-400 tabular-nums mt-1">
                      {encroachment.stats.areaKm2.toFixed(3)}{' '}
                      <span className="text-xs font-normal text-slate-400">
                        km²
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded bg-slate-950/80 border border-slate-800">
                    <div className="text-xs text-slate-400">
                      Area in Hectares
                    </div>
                    <div className="text-lg font-mono font-bold text-slate-100 tabular-nums mt-1">
                      {encroachment.stats.areaHa.toFixed(2)}{' '}
                      <span className="text-xs font-normal text-slate-400">
                        ha
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded bg-slate-950/80 border border-slate-800">
                    <div className="text-xs text-slate-400">Area in m²</div>
                    <div className="text-lg font-mono font-bold text-slate-100 tabular-nums mt-1">
                      {Math.round(encroachment.stats.areaM2).toLocaleString()}{' '}
                      <span className="text-xs font-normal text-slate-400">
                        m²
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded bg-slate-950/80 border border-slate-800">
                    <div className="text-xs text-slate-400">
                      Encroached Pixels
                    </div>
                    <div className="text-lg font-mono font-bold text-amber-400 tabular-nums mt-1">
                      {encroachment.stats.totalEncroachmentPixels.toLocaleString()}
                    </div>
                  </div>

                  <div className="p-3.5 rounded bg-slate-950/80 border border-slate-800">
                    <div className="text-xs text-slate-400">
                      % of Analysed Area
                    </div>
                    <div className="text-lg font-mono font-bold text-rose-400 tabular-nums mt-1">
                      {encroachment.stats.percentageOfAnalysedArea.toFixed(2)}%
                    </div>
                  </div>

                  <div className="p-3.5 rounded bg-slate-950/80 border border-slate-800">
                    <div className="text-xs text-slate-400">
                      % of Historical Lake Zone
                    </div>
                    <div className="text-lg font-mono font-bold text-amber-300 tabular-nums mt-1">
                      {encroachment.stats.percentageOfHistoricalWater.toFixed(
                        2
                      )}
                      %
                    </div>
                  </div>
                </div>
              </div>

              {/* Backend Mask and LULC Overlap Tables */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="border border-slate-800 bg-slate-900/60 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-800">
                    <h4 className="text-xs font-semibold text-slate-200">
                      Potential Encroachment Mask Class
                    </h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400">
                          <th className="py-2.5 px-3">Output Class</th>
                          <th className="py-2.5 px-3 text-right">Pixels</th>
                          <th className="py-2.5 px-3 text-right">Area (ha)</th>
                          <th className="py-2.5 px-3 text-right">Area (km²)</th>
                          <th className="py-2.5 px-3 text-right">Share</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
                        {encroachment.stats.categories.map((cat) => (
                          <tr key={cat.categoryId}>
                            <td className="py-2.5 px-3 font-sans font-medium text-slate-100">
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-2.5 h-2.5 rounded-xs shrink-0"
                                  style={{ backgroundColor: cat.color }}
                                />
                                <span>{cat.categoryName}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right text-slate-200">
                              {cat.pixels.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 text-right text-slate-300">
                              {cat.areaHa.toFixed(2)}
                            </td>
                            <td className="py-2.5 px-3 text-right text-rose-300 font-semibold">
                              {cat.areaKm2.toFixed(4)}
                            </td>
                            <td className="py-2.5 px-3 text-right text-slate-100">
                              {cat.percentageOfEncroachment.toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="border border-slate-800 bg-slate-900/60 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-800">
                    <h4 className="text-xs font-semibold text-slate-200">
                      Relevant LULC Classes Driving Encroachment in Velachery
                    </h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400">
                          <th className="py-2.5 px-3">LULC Class</th>
                          <th className="py-2.5 px-3 text-right">Pixels</th>
                          <th className="py-2.5 px-3 text-right">Area (m²)</th>
                          <th className="py-2.5 px-3 text-right">Area (km²)</th>
                          <th className="py-2.5 px-3 text-right">Share</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
                        {encroachment.stats.lulcContributions.map((item) => (
                          <tr key={item.lulcClassId}>
                            <td className="py-3 px-3 font-sans font-medium text-slate-100">
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-2.5 h-2.5 rounded-xs shrink-0"
                                  style={{ backgroundColor: item.color }}
                                />
                                <span>{item.lulcClassName}</span>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right text-slate-200">
                              {item.pixels.toLocaleString()}
                            </td>
                            <td className="py-3 px-3 text-right text-slate-300">
                              {Math.round(item.areaM2).toLocaleString()}
                            </td>
                            <td className="py-3 px-3 text-right text-cyan-300 font-semibold">
                              {item.areaKm2.toFixed(4)}
                            </td>
                            <td className="py-3 px-3 text-right text-slate-100 font-semibold">
                              {item.sharePercentage.toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <RasterMetadataPanel
                metadata={encroachment.parsed.metadata}
                defaultOpen={true}
                title={`Raster Information — ${encroachment.parsed.metadata.filename}`}
              />
            </div>
          )}

          {/* STAGE 6: WATER-FLOW IMPACT AND DRAINAGE */}
          {activeStep === 6 && (
            <div className="flex flex-col gap-6">
              <div className="border border-cyan-800/60 bg-slate-900/80 rounded-lg p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-mono text-cyan-300">
                      STEP 6 · DRAINAGE AND TERRAIN-FLOW SCREENING
                    </div>
                    <h2 className="text-xl font-bold text-slate-100 mt-0.5">
                      Water-Flow Impact — Velachery, Chennai
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Drainage proximity, terrain flow, and preliminary relative
                      flood-vulnerability outputs. These screening layers are
                      indicators for review, not validated flood predictions.
                    </p>
                    <p className="text-xs text-cyan-200 mt-2">
                      Running Water-Flow Impact also runs water change, runoff comparison,
                      encroachment-runoff analysis, and overall flood vulnerability in sequence.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleSelectStep(5)}
                      className="flex items-center gap-1 px-3 py-2 text-xs font-medium bg-slate-900 text-slate-300 border border-slate-800 rounded hover:bg-slate-800 transition-colors"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Step 5
                    </button>
                    {waterFlowImpact && analysisProgress.state === 'completed' && (
                      <>
                        <button
                          type="button"
                          onClick={handleFocusMap}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-800 text-slate-100 border border-slate-700 rounded hover:bg-slate-700 transition-colors whitespace-nowrap"
                        >
                          <Eye className="w-3.5 h-3.5 text-cyan-400" />
                          View on Map
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectStep(7)}
                          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-400 text-slate-950 rounded hover:bg-emerald-300 transition-colors whitespace-nowrap"
                        >
                          Final Analysis Summary
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <ProcessingStatusPanel
                stageTitle="Water-Flow Impact"
                outputFilename={
                  waterFlowImpact?.primary.filename ||
                  'relative_flood_vulnerability.tif'
                }
                isProcessing={isProcessing}
                activeSubStep={processingSubStep}
                error={errorMsg}
                detail={processingDetail}
              />

              {waterFlowImpact ? (
                <>
                  <VelacheryGeoMap
                    raster={activeWaterFlowRaster?.parsed || waterFlowImpact.primary.parsed}
                    legend={activeWaterFlowRaster?.legend || waterFlowImpact.primary.legend}
                    stepTitle={activeWaterFlowRaster?.title || waterFlowImpact.primary.title}
                    outputFilename={
                      activeWaterFlowRaster?.filename || waterFlowImpact.primary.filename
                    }
                    focusTrigger={mapFocusCounter}
                  />

                  <IntermediateResultsGrid
                    sectionTitle="Water-Flow and Drainage Intermediate Outputs — Velachery, Chennai"
                    sectionSubtitle="All analytical and display-ready GeoTIFFs generated by the drainage and water-flow workflow. Select any result to view it on the map or download it."
                    items={waterFlowImpact.items}
                    activeMapItemId={activeWaterFlowRaster?.id || null}
                    onSelectForMap={(item) => {
                      setActiveWaterFlowRaster(item);
                      handleFocusMap();
                    }}
                  />

                  <IntermediateResultsGrid
                    sectionTitle="Runoff and Vulnerability RGB Map Layers"
                    sectionSubtitle="RGB GeoTIFF outputs from runoff comparison, encroachment-runoff analysis, and overall flood vulnerability. Select a layer to display its map and legend above."
                    items={analysisMapItems}
                    activeMapItemId={activeWaterFlowRaster?.id || null}
                    onSelectForMap={(item) => {
                      setActiveWaterFlowRaster(item);
                      handleFocusMap();
                    }}
                  />

                  <RasterMetadataPanel
                    metadata={
                      (activeWaterFlowRaster || waterFlowImpact.primary).parsed.metadata
                    }
                    defaultOpen={false}
                    title={`Raster Information — ${
                      (activeWaterFlowRaster || waterFlowImpact.primary).filename
                    }`}
                  />
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleRunStep6WaterFlowImpact}
                  disabled={isProcessing}
                  className="self-start flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-cyan-400 text-slate-950 rounded hover:bg-cyan-300 disabled:opacity-50 transition-colors"
                >
                  Retry Water-Flow Analysis
                </button>
              )}

              <AnalysisPipelinePanel
                progress={analysisProgress}
                results={analysisResults}
              />
            </div>
          )}

          {/* STAGE 7: FINAL ANALYSIS SUMMARY */}
          {activeStep === 7 &&
            waterChange &&
            persistentWater &&
            lulcAnalysis &&
            encroachment &&
            waterFlowImpact &&
            analysisProgress.state === 'completed' && (
              <div className="flex flex-col gap-6">
                <div className="border border-emerald-800/60 bg-slate-900/80 rounded-lg p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
                        <Check className="w-4 h-4" />
                        <span>
                          MULTI-YEAR PIPELINE COMPLETE ·{' '}
                          {sortedValidEntries.map((e) => e.year).join(' → ')}
                        </span>
                      </div>
                      <h2 className="text-2xl font-bold text-slate-100 mt-1">
                        Analysis Complete — Velachery, Chennai
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Study Area: Velachery, Chennai, Tamil Nadu, India ·{' '}
                        {VELACHERY_STUDY_AREA.crsName}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={handleDownloadLulcCsv}
                        className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-slate-950 text-emerald-300 border border-emerald-500/40 rounded hover:bg-emerald-500/10 transition-colors whitespace-nowrap"
                      >
                        <FileDown className="w-3.5 h-3.5" />
                        Download LULC CSV
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadStatisticsJson}
                        className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-cyan-400 text-slate-950 rounded hover:bg-cyan-300 transition-colors whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download Statistics JSON
                      </button>
                    </div>
                  </div>

                  {/* 5 Summary Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-5">
                    <div className="p-4 rounded bg-slate-950/90 border border-slate-800">
                      <div className="text-xs text-slate-400 flex items-center justify-between">
                        <span>Study Area</span>
                        <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                      </div>
                      <div className="text-xl font-mono font-bold text-slate-100 tabular-nums mt-1.5">
                        {waterChange.overallComparison.stats.analysedAreaKm2.toFixed(
                          2
                        )}{' '}
                        <span className="text-xs font-normal text-slate-400">
                          km²
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 mt-1">
                        Velachery, Chennai
                      </div>
                    </div>

                    <div className="p-4 rounded bg-slate-950/90 border border-slate-800">
                      <div className="text-xs text-slate-400 flex items-center justify-between">
                        <span>
                          Water Change (
                          {waterChange.overallComparison.fromYear}→
                          {waterChange.overallComparison.toYear})
                        </span>
                        <Activity className="w-3.5 h-3.5 text-amber-400" />
                      </div>
                      <div className="text-xl font-mono font-bold text-amber-300 tabular-nums mt-1.5">
                        {waterChange.overallComparison.stats.changedAreaKm2.toFixed(
                          3
                        )}{' '}
                        <span className="text-xs font-normal text-slate-400">
                          km²
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 mt-1">
                        {waterChange.overallComparison.stats.percentageChange.toFixed(
                          2
                        )}
                        % overall change
                      </div>
                    </div>

                    <div className="p-4 rounded bg-slate-950/90 border border-slate-800">
                      <div className="text-xs text-slate-400 flex items-center justify-between">
                        <span>Persistent Water</span>
                        <Droplets className="w-3.5 h-3.5 text-sky-400" />
                      </div>
                      <div className="text-xl font-mono font-bold text-sky-300 tabular-nums mt-1.5">
                        {persistentWater.stats.persistentWaterAreaKm2.toFixed(
                          3
                        )}{' '}
                        <span className="text-xs font-normal text-slate-400">
                          km²
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 mt-1">
                        {persistentWater.stats.coveragePercentage.toFixed(2)}%
                        perennial coverage
                      </div>
                    </div>

                    <div className="p-4 rounded bg-slate-950/90 border border-slate-800">
                      <div className="text-xs text-slate-400 flex items-center justify-between">
                        <span>LULC Classes</span>
                        <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
                      </div>
                      <div className="text-xl font-mono font-bold text-emerald-300 tabular-nums mt-1.5">
                        {lulcAnalysis.stats.classes.length}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 mt-1">
                        Classes from backend report
                      </div>
                    </div>

                    <div className="p-4 rounded bg-slate-950/90 border border-slate-800 col-span-2 sm:col-span-1">
                      <div className="text-xs text-slate-400 flex items-center justify-between">
                        <span>Potential Encroachment</span>
                        <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
                      </div>
                      <div className="text-xl font-mono font-bold text-rose-400 tabular-nums mt-1.5">
                        {encroachment.stats.areaKm2.toFixed(3)}{' '}
                        <span className="text-xs font-normal text-slate-400">
                          km²
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 mt-1">
                        {encroachment.stats.areaHa.toFixed(2)} ha (
                        {encroachment.stats.percentageOfAnalysedArea.toFixed(2)}
                        %)
                      </div>
                    </div>
                  </div>
                </div>

                {/* Interactive Map Previews */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {[
                    {
                      title: `2. Water Change (${waterChange.overallComparison.fromYear} → ${waterChange.overallComparison.toYear})`,
                      file: waterChange.overallComparison.parsed.metadata.filename,
                      raster: waterChange.overallComparison.parsed,
                      legend: WATER_CHANGE_LEGEND,
                      step: 2 as WorkflowStep,
                    },
                    {
                      title: '3. Persistent Encroachment Check',
                      file: persistentWater.parsed.metadata.filename,
                      raster: persistentWater.parsed,
                      legend: PERSISTENT_WATER_LEGEND,
                      step: 3 as WorkflowStep,
                    },
                    {
                      title: '4. LULC Analysis',
                      file: lulcAnalysis.visualization.metadata.filename,
                      raster: lulcAnalysis.visualization,
                      legend: LULC_LEGEND,
                      step: 4 as WorkflowStep,
                    },
                    {
                      title: '5. Potential Encroachment',
                      file: encroachment.parsed.metadata.filename,
                      raster: encroachment.parsed,
                      legend: ENCROACHMENT_LEGEND,
                      step: 5 as WorkflowStep,
                    },
                    {
                      title: '6. Relative Flood Vulnerability',
                      file: waterFlowImpact.primary.filename,
                      raster: waterFlowImpact.primary.parsed,
                      legend: waterFlowImpact.primary.legend,
                      step: 6 as WorkflowStep,
                    },
                  ].map((card) => (
                    <div
                      key={card.file}
                      className="border border-slate-800 bg-slate-900/60 rounded-lg p-4 flex flex-col gap-3"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-100">
                            {card.title}
                          </h3>
                          <p className="text-xs font-mono text-slate-400">
                            {card.file} · Velachery, Chennai
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSelectStep(card.step)}
                          className="px-3 py-1.5 text-xs font-semibold bg-slate-800 text-cyan-300 border border-slate-700 rounded hover:bg-slate-700 transition-colors whitespace-nowrap"
                        >
                          Open Full Map
                        </button>
                      </div>
                      <VelacheryGeoMap
                        raster={card.raster}
                        legend={card.legend}
                        stepTitle={card.title}
                        outputFilename={card.file}
                        compact={true}
                      />
                    </div>
                  ))}
                </div>

                {/* Download All Generated GeoTIFFs */}
                <div className="border border-slate-800 bg-slate-900/60 rounded-lg p-5">
                  <h3 className="text-base font-semibold text-slate-100 mb-3">
                    Generated GeoTIFFs — Velachery, Chennai
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      [waterChange.selectedComparison, ...waterChange.yearlyTransitions].map((item) => ({
                        filename: item.parsed.metadata.filename,
                        parsed: item.parsed,
                      })),
                      step2SubRasters.map((item) => ({
                        filename: item.parsed.metadata.filename,
                        parsed: item.parsed,
                      })),
                      [lulcAnalysis.parsed, lulcAnalysis.visualization].map((parsed) => ({
                        filename: parsed.metadata.filename,
                        parsed,
                      })),
                      step4SubRasters.map((item) => ({
                        filename: item.parsed.metadata.filename,
                        parsed: item.parsed,
                      })),
                      waterFlowImpact.items.map((item) => ({
                        filename: item.filename,
                        parsed: item.parsed,
                      })),
                    ].flat().map((item) => (
                      <div
                        key={item.filename}
                        className="p-3.5 rounded bg-slate-950/90 border border-slate-800 flex flex-col justify-between gap-3"
                      >
                        <div className="flex items-center gap-2 text-xs font-mono font-semibold text-emerald-400">
                          <Check className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{item.filename}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            downloadGeoTiffBuffer(
                              item.parsed.rawBuffer,
                              item.filename
                            )
                          }
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-800 hover:bg-cyan-400 hover:text-slate-950 text-slate-100 rounded transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
        </main>
      </div>

      {/* Official Government Footer */}
      <CmdaGovFooter />
    </div>
  );
}
