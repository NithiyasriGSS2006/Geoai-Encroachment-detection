import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data', 'gisoutputs');
const MASKS_DIR = path.join(__dirname, 'data', 'water_masks_tif');
const REFERENCE_SATELLITE_DIR = path.join(__dirname, 'data', 'ref_satellite_images');
const PNG_SATELLITE_DIR = path.join(__dirname, 'data', 'png_satellite_images');
const SEGMENTATION_PNG_DIR = path.join(DATA_DIR, 'png_water_masks');
const DRAINAGE_GEOJSON_PATH = path.join(
  __dirname,
  'data',
  'drainage',
  'gcc_velachery_drainages.geojson'
);
let latestLulcReportFilename = 'lulc_persistent_encroachment_report_2017_2024.csv';

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(MASKS_DIR)) {
  fs.mkdirSync(MASKS_DIR, { recursive: true });
}
for (const directory of [
  REFERENCE_SATELLITE_DIR,
  PNG_SATELLITE_DIR,
  SEGMENTATION_PNG_DIR,
]) {
  fs.mkdirSync(directory, { recursive: true });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

export const SUPPORTED_WATER_CHANGE_COMPARISONS = [
  { fromYear: 2017, toYear: 2020, label: '2017 -> 2020' },
  { fromYear: 2017, toYear: 2023, label: '2017 -> 2023' },
  { fromYear: 2017, toYear: 2024, label: '2017 -> 2024' },
  { fromYear: 2017, toYear: 2026, label: '2017 -> 2026' },
];
const REQUIRED_SEGMENTATION_YEARS = [2017, 2020, 2023, 2024, 2026];

let waterChangeProgress = {
  state: 'idle' as 'idle' | 'running' | 'completed' | 'failed',
  completedComparisons: 0,
  totalComparisons: SUPPORTED_WATER_CHANGE_COMPARISONS.length,
  currentComparison: null as string | null,
  message: 'Ready to run water change analysis.',
  currentStage: null as string | null,
  completedStages: 0,
  totalStages: 5,
};
let waterSegmentationRunning = false;
const ANALYSIS_STAGES = [
  { id: 'water-change', title: 'Water change', script: 'water_change.py' },
  { id: 'runoff-comparison', title: 'Runoff comparison', script: 'runoff_comparision.py' },
  { id: 'encroachment-runoff', title: 'Encroachment and runoff analysis', script: 'encroachment_runoff_analysis.py' },
  { id: 'water-flow-impact', title: 'Water-flow impact', script: 'water_flow_impact.py' },
  { id: 'flood-validation', title: 'Historical flood validation', script: 'validation.py' },
] as const;

type PipelineStageResult = {
  id: string;
  title: string;
  summary: string;
  note?: string;
  metrics: Array<{ label: string; value: number | string; unit?: string }>;
  table?: {
    headers: string[];
    rows: Array<Array<string | number>>;
  };
  mapPoints?: Array<{
    lat: number;
    lng: number;
    label: string;
    vulnerabilityClass: string;
  }>;
  layers: Array<{
    label: string;
    filename: string;
    legend: Array<{ value: number; label: string; color: string }>;
  }>;
  outputs: Array<{ label: string; filename: string }>;
};

let waterChangePipelineResults: PipelineStageResult[] = [];

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      fields.push(field);
      field = '';
    } else {
      field += character;
    }
  }

  fields.push(field);
  return fields;
}

function readCsvRow(csvPath: string): Record<string, string> {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Expected analysis summary was not created: ${csvPath}`);
  }

  const lines = fs.readFileSync(csvPath, 'utf-8')
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (lines.length < 2) {
    throw new Error(`Analysis summary is empty: ${csvPath}`);
  }

  const headers = parseCsvLine(lines[0]);
  const values = parseCsvLine(lines[1]);
  return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
}

function numericField(row: Record<string, string>, field: string): number {
  const value = Number(row[field]);
  if (!Number.isFinite(value)) {
    throw new Error(`Analysis summary has an invalid "${field}" value.`);
  }
  return value;
}

function requireAnalysisOutputs(paths: string[]): void {
  const missing = paths.filter((outputPath) => !fs.existsSync(outputPath));
  if (missing.length) {
    throw new Error(`Expected analysis outputs were not created:\n${missing.join('\n')}`);
  }
}

function parseCsvToMap(csvPath: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(csvPath)) return map;
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim() || line.startsWith('Parameter,')) continue;
    const parts = line.split(',');
    if (parts.length >= 2) {
      map.set(parts[0].trim(), parts[1].trim());
    }
  }
  return map;
}

function readWaterChangeComparison(item: { fromYear: number; toYear: number }) {
  const reportPath = path.join(
    DATA_DIR,
    'water_change',
    `water_change_report_${item.fromYear}_${item.toYear}.csv`
  );
  const outputFilename = `water_change_display_${item.fromYear}_${item.toYear}.tif`;
  const rasterPath = path.join(DATA_DIR, 'water_change', outputFilename);
  if (!fs.existsSync(reportPath) || !fs.existsSync(rasterPath)) return null;

  const reportData = parseCsvToMap(reportPath);
  const waterLossHa = Number(reportData.get('Water Loss (ha)')) || 0;
  const waterGainHa = Number(reportData.get('Water Gain (ha)')) || 0;
  const persistentWaterHa = Number(reportData.get('Persistent Water (ha)')) || 0;
  const historicalWaterHa = Number(reportData.get('Historical Water Area (ha)')) || 21.78;
  const currentWaterHa = Number(reportData.get('Current Water Area (ha)')) || 19.5;
  const netChangeHa = Number(reportData.get('Net Water Change (ha)')) || (currentWaterHa - historicalWaterHa);
  const percentageChange = Number(reportData.get('Percentage Change (%)')) || (historicalWaterHa > 0 ? (netChangeHa / historicalWaterHa) * 100 : 0);

  return {
    fromYear: item.fromYear,
    toYear: item.toYear,
    outputFilename,
    rawOutputFilename: `water_change_${item.fromYear}_${item.toYear}.tif`,
    rasterUrl: `/api/raster/${outputFilename}`,
    statistics: {
      fromYear: item.fromYear,
      toYear: item.toYear,
      historicalWaterAreaHa: historicalWaterHa,
      currentWaterAreaHa: currentWaterHa,
      waterLossAreaHa: waterLossHa,
      waterGainAreaHa: waterGainHa,
      persistentWaterAreaHa: persistentWaterHa,
      netChangeAreaHa: netChangeHa,
      percentageChange,
      waterLossPixels: Number(reportData.get('Water Loss Pixels')) || Math.round(waterLossHa * 100),
      waterGainPixels: Number(reportData.get('Water Gain Pixels')) || Math.round(waterGainHa * 100),
      persistentWaterPixels: Number(reportData.get('Persistent Water Pixels')) || Math.round(persistentWaterHa * 100),
    },
  };
}

async function runPythonScript(
  scriptName: string,
  envVars: Record<string, string> = {},
  onOutput?: (text: string) => void
) {
  const scriptPath = path.join(__dirname, 'scripts', scriptName);
  console.log(`Executing GeoAI Python script: ${scriptPath}`);
  const configuredPython = process.env.PYTHON_EXECUTABLE;
  const isWaterSegmentation = scriptName === 'water_body_segmentation.py';
  const segmentationPython = isWaterSegmentation
    ? process.env.WATER_SEGMENTATION_PYTHON_EXECUTABLE
    : undefined;
  const usePython312ForSegmentation =
    isWaterSegmentation &&
    !segmentationPython &&
    process.platform === 'win32';
  const virtualEnvPython = process.env.VIRTUAL_ENV
    ? path.join(
        process.env.VIRTUAL_ENV,
        process.platform === 'win32' ? 'Scripts' : 'bin',
        process.platform === 'win32' ? 'python.exe' : 'python'
      )
    : null;
  const projectVirtualEnvPython = path.resolve(
    __dirname,
    '..',
    '.venv',
    process.platform === 'win32' ? 'Scripts' : 'bin',
    process.platform === 'win32' ? 'python.exe' : 'python'
  );
  const availableVirtualEnvPython = [virtualEnvPython, projectVirtualEnvPython].find(
    (pythonPath): pythonPath is string =>
      pythonPath !== null && fs.existsSync(pythonPath)
  );
  const pythonCommand =
    segmentationPython ||
    (usePython312ForSegmentation
      ? 'py'
      : configuredPython) ||
    availableVirtualEnvPython ||
    (process.platform === 'win32' ? 'py' : 'python');
  const pythonLauncherArgs =
    usePython312ForSegmentation
      ? ['-3.12']
      : pythonCommand === 'py' && process.platform === 'win32'
      ? ['-3.12']
      : [];
  const env = {
    ...process.env,
    WATER_MASK_FOLDER: MASKS_DIR,
    OUTPUT_FOLDER: DATA_DIR,
    WATER_CHANGE_FOLDER: path.join(DATA_DIR, 'water_change'),
    PERSISTENT_FOLDER: path.join(DATA_DIR, 'persistent_check'),
    OUTPUT_DIR: path.join(DATA_DIR, 'lulc_analysis'),
    PNG_SATELLITE_FOLDER: PNG_SATELLITE_DIR,
    PNG_OUTPUT_FOLDER: SEGMENTATION_PNG_DIR,
    REFERENCE_TIF_FOLDER: REFERENCE_SATELLITE_DIR,
    ...envVars,
  };

  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(
      pythonCommand,
      [...pythonLauncherArgs, '-u', scriptPath],
      { cwd: __dirname, env }
    );
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
      onOutput?.(text);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const output = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n');
        const status = signal
          ? `signal ${signal}`
          : `exit code ${code ?? 'unknown'}`;
        reject(new Error(
          `Python script ${scriptName} failed with ${status}.${output ? `\n${output}` : ''}`
        ));
      }
    });
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  // Enable CORS
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    next();
  });

  // Health check endpoint
  app.get('/healthz', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      studyArea: 'Velachery, Chennai, Tamil Nadu, India',
      backendFolders: {
        scripts: path.join(__dirname, 'scripts'),
        data: path.join(__dirname, 'data'),
        referenceSatelliteImages: REFERENCE_SATELLITE_DIR,
        pngSatelliteImages: PNG_SATELLITE_DIR,
        waterMasks: MASKS_DIR,
      },
    });
  });

  app.get('/api/satellite-images', (_req, res) => {
    const images = fs.readdirSync(REFERENCE_SATELLITE_DIR)
      .map((filename) => {
        const match = filename.match(/^Velachery_Preprocessed_RGB_(\d{4})\.tiff?$/i);
        if (!match) return null;
        const year = Number(match[1]);
        const pngFilename = `satellite_${year}.png`;
        if (!fs.existsSync(path.join(PNG_SATELLITE_DIR, pngFilename))) return null;
        return {
          year,
          filename,
          rasterUrl: `/api/satellite-images/${year}`,
          pngUrl: `/api/satellite-png/${year}`,
        };
      })
      .filter((image) => image !== null)
      .sort((a, b) => a.year - b.year);
    return res.json({ images });
  });

  app.get('/api/satellite-images/:year', (req, res) => {
    const year = Number(req.params.year);
    if (!Number.isInteger(year) || year < 1970 || year > 2100) {
      return res.status(400).json({ error: 'A valid satellite-image year is required.' });
    }
    const imagePath = path.join(
      REFERENCE_SATELLITE_DIR,
      `Velachery_Preprocessed_RGB_${year}.tif`
    );
    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({ error: `Satellite GeoTIFF for ${year} was not found.` });
    }
    res.setHeader('Content-Type', 'image/tiff');
    return res.sendFile(imagePath);
  });

  app.get('/api/satellite-png/:year', (req, res) => {
    const year = Number(req.params.year);
    if (!Number.isInteger(year) || year < 1970 || year > 2100) {
      return res.status(400).json({ error: 'A valid satellite-image year is required.' });
    }
    const imagePath = path.join(PNG_SATELLITE_DIR, `satellite_${year}.png`);
    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({ error: `Satellite PNG for ${year} was not found.` });
    }
    res.setHeader('Content-Type', 'image/png');
    return res.sendFile(imagePath);
  });

  // Water Change available comparisons options
  app.get(['/api/water-change/options', '/water-change/options'], (_req, res) => {
    res.json({
      baselineYear: 2017,
      comparisons: SUPPORTED_WATER_CHANGE_COMPARISONS,
    });
  });

  app.get('/api/process/water-change/status', (_req, res) => {
    res.json({ ...waterChangeProgress, pipelineResults: waterChangePipelineResults });
  });

  app.get('/api/water-change/results', (_req, res) => {
    const comparisons = SUPPORTED_WATER_CHANGE_COMPARISONS
      .map(readWaterChangeComparison)
      .filter((comparison) => comparison !== null);
    if (comparisons.length !== SUPPORTED_WATER_CHANGE_COMPARISONS.length) {
      return res.status(404).json({ error: 'Complete water-change outputs are not available yet.' });
    }

    const selected = comparisons.find((item) => item.fromYear === 2017 && item.toYear === 2024)!;
    return res.json({
      status: 'completed',
      step: 'water-change',
      studyArea: 'Velachery, Chennai',
      comparison: { fromYear: selected.fromYear, toYear: selected.toYear },
      outputFilename: selected.outputFilename,
      rawOutputFilename: selected.rawOutputFilename,
      rasterUrl: selected.rasterUrl,
      statistics: selected.statistics,
      comparisons,
    });
  });

  // Serve reference water mask
  app.get(
    ['/api/reference-water-mask/:year?', '/reference-water-mask/:year?'],
    async (req, res) => {
      try {
        const year = Number(req.params.year) || 2024;
        const maskPath = path.join(MASKS_DIR, `water_${year}.tif`);
        if (fs.existsSync(maskPath)) {
          res.setHeader('Content-Type', 'image/tiff');
          res.setHeader('Content-Disposition', `attachment; filename="water_${year}.tif"`);
          return res.sendFile(maskPath);
        }
        res.status(404).json({ error: `Water mask for year ${year} not found.` });
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    }
  );

  // POST /api/upload
  app.post(
    ['/api/upload', '/upload'],
    upload.any(),
    async (req, res) => {
      try {
        const files = (req.files as Express.Multer.File[]) || [];
        if (files.length > 0) {
          const uploaded = [];
          for (let i = 0; i < files.length; i++) {
            const f = files[i];
            const yr = Number((f.originalname.match(/(19\d{2}|20\d{2})/) || [])[1]) || (2017 + i);
            const targetPath = path.join(MASKS_DIR, `water_${yr}.tif`);
            fs.writeFileSync(targetPath, f.buffer);
            uploaded.push({ year: yr, filename: f.originalname });
          }
          return res.json({
            status: 'success',
            studyArea: 'Velachery, Chennai',
            uploaded,
          });
        }
        return res.json({
          status: 'success',
          studyArea: 'Velachery, Chennai',
          message: 'Default GIS water masks ready (2017, 2020, 2023, 2024, 2026).',
        });
      } catch (err) {
        return res.status(400).json({ error: String(err) });
      }
    }
  );

  app.post(
    '/api/process/water-body-segmentation',
    upload.fields([
      { name: 'satelliteTiffs', maxCount: 20 },
      { name: 'satellitePngs', maxCount: 20 },
    ]),
    async (req, res) => {
      if (waterSegmentationRunning) {
        return res.status(409).json({ error: 'Water-body segmentation is already running.' });
      }
      waterSegmentationRunning = true;
      try {
        const files = req.files as Record<string, Express.Multer.File[]> | undefined;
        const tiffFiles = files?.satelliteTiffs || [];
        const pngFiles = files?.satellitePngs || [];
        if (tiffFiles.length < 2 || tiffFiles.length !== pngFiles.length) {
          return res.status(400).json({
            error: 'Upload at least two matching satellite GeoTIFF and PNG images.',
          });
        }

        const tiffsByYear = new Map<number, Express.Multer.File>();
        const pngsByYear = new Map<number, Express.Multer.File>();
        for (const file of tiffFiles) {
          const match = file.originalname.match(
            /^Velachery_Preprocessed_RGB_(\d{4})\.tiff?$/i
          );
          if (!match) {
            return res.status(400).json({
              error: 'Satellite TIFFs must be named Velachery_Preprocessed_RGB_YYYY.tif.',
            });
          }
          const year = Number(match[1]);
          if (year < 1970 || year > 2100) {
            return res.status(400).json({ error: `Invalid satellite TIFF year ${year}.` });
          }
          if (tiffsByYear.has(year)) {
            return res.status(400).json({ error: `Duplicate satellite TIFF year ${year}.` });
          }
          tiffsByYear.set(year, file);
        }
        for (const file of pngFiles) {
          const match = file.originalname.match(/^satellite_(\d{4})\.png$/i);
          if (!match) {
            return res.status(400).json({
              error: 'Satellite PNGs must be named satellite_YYYY.png.',
            });
          }
          const year = Number(match[1]);
          if (year < 1970 || year > 2100) {
            return res.status(400).json({ error: `Invalid satellite PNG year ${year}.` });
          }
          if (pngsByYear.has(year)) {
            return res.status(400).json({ error: `Duplicate satellite PNG year ${year}.` });
          }
          const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
          if (
            file.mimetype !== 'image/png' ||
            file.buffer.length < pngSignature.length ||
            !file.buffer.subarray(0, pngSignature.length).equals(pngSignature)
          ) {
            return res.status(400).json({
              error: `The uploaded image for year ${year} is not a valid PNG file.`,
            });
          }
          pngsByYear.set(year, file);
        }

        const years = Array.from(tiffsByYear.keys()).sort((a, b) => a - b);
        if (years.some((year) => !pngsByYear.has(year)) || years.length !== pngsByYear.size) {
          return res.status(400).json({
            error: 'Every satellite GeoTIFF must have exactly one PNG for the same year.',
          });
        }
        const missingYears = REQUIRED_SEGMENTATION_YEARS.filter((year) => !tiffsByYear.has(year));
        if (missingYears.length > 0) {
          return res.status(400).json({
            error: `The configured water-change pipeline requires satellite images for years ${REQUIRED_SEGMENTATION_YEARS.join(', ')}. Missing: ${missingYears.join(', ')}.`,
          });
        }

        for (const year of years) {
          fs.writeFileSync(
            path.join(REFERENCE_SATELLITE_DIR, `Velachery_Preprocessed_RGB_${year}.tif`),
            tiffsByYear.get(year)!.buffer
          );
          fs.writeFileSync(
            path.join(PNG_SATELLITE_DIR, `satellite_${year}.png`),
            pngsByYear.get(year)!.buffer
          );
        }

        await runPythonScript('water_body_segmentation.py', {
          WATER_SEGMENTATION_YEARS: JSON.stringify(years),
        });

        const resultsPath = path.join(MASKS_DIR, 'segmentation_results.json');
        if (!fs.existsSync(resultsPath)) {
          throw new Error('Segmentation finished without producing its results file.');
        }
        const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8')) as Array<{
          year: number;
          aoi_width: number;
          aoi_height: number;
          water_pixels: number;
          non_water_pixels: number;
          geotiff: string | null;
        }>;
        const outputs = results
          .filter((item) => item.geotiff)
          .map((item) => ({
            year: item.year,
            filename: `water_${item.year}.tif`,
            rasterUrl: `/api/raster/water_${item.year}.tif`,
            width: item.aoi_width,
            height: item.aoi_height,
            waterPixels: item.water_pixels,
            nonWaterPixels: item.non_water_pixels,
          }));
        if (outputs.length !== years.length) {
          throw new Error(
            `Segmentation generated ${outputs.length} masks for ${years.length} uploaded images.`
          );
        }
        return res.json({ status: 'completed', outputs });
      } catch (err) {
        return res.status(500).json({
          error: `Water-body segmentation failed: ${String(err instanceof Error ? err.message : err)}`,
        });
      } finally {
        waterSegmentationRunning = false;
      }
    }
  );

  // 1. Water Change Process Endpoint
  app.post(
    ['/api/process/water-change', '/process/water-change'],
    async (req, res) => {
      if (waterChangeProgress.state === 'running') {
        return res.status(409).json({ error: 'Water change analysis is already running.' });
      }

      try {
        const fromYear = Number(req.body?.fromYear) || 2017;
        const toYear = Number(req.body?.toYear) || 2024;
        const runImpactPipeline = req.body?.runImpactPipeline === true;

        // Verify supported year pair
        const validPair = SUPPORTED_WATER_CHANGE_COMPARISONS.find(
          (c) => c.fromYear === fromYear && c.toYear === toYear
        );
        if (!validPair) {
          return res.status(400).json({
            error: `Unsupported year comparison: ${fromYear} -> ${toYear}. Supported pairs are: 2017->2020, 2017->2023, 2017->2024, 2017->2026`,
          });
        }

        waterChangeProgress = {
          state: 'running',
          completedComparisons: 0,
          totalComparisons: SUPPORTED_WATER_CHANGE_COMPARISONS.length,
          currentComparison: null,
          message: 'Generating water-change maps and statistics.',
          currentStage: ANALYSIS_STAGES[0].id,
          completedStages: 0,
          totalStages: runImpactPipeline ? ANALYSIS_STAGES.length : 1,
        };
        waterChangePipelineResults = [];

        let pendingOutput = '';
        await runPythonScript('water_change.py', {
          OUTPUT_FOLDER: path.join(DATA_DIR, 'water_change'),
        }, (text) => {
          pendingOutput += text;
          const lines = pendingOutput.split(/\r?\n/);
          pendingOutput = lines.pop() || '';

          for (const line of lines) {
            const started = line.match(/WATER CHANGE:\s*(\d+)\s*->\s*(\d+)/);
            if (started) {
              waterChangeProgress.currentComparison = `${started[1]} -> ${started[2]}`;
              waterChangeProgress.message = `Running ${waterChangeProgress.currentComparison}`;
            }

            const completed = line.match(/WATER CHANGE COMPLETE:\s*(\d+)\s*->\s*(\d+)/);
            if (completed) {
              waterChangeProgress.completedComparisons += 1;
              waterChangeProgress.currentComparison = null;
              waterChangeProgress.message = `Completed ${completed[1]} -> ${completed[2]}`;
            }
          }
        });

        const waterChangeComparisons = SUPPORTED_WATER_CHANGE_COMPARISONS
          .map(readWaterChangeComparison);
        if (waterChangeComparisons.some((comparison) => comparison === null)) {
          throw new Error('Water-change analysis did not produce all four raster and report pairs.');
        }
        const comparisons = waterChangeComparisons.map((comparison) => comparison!);
        const selected = comparisons.find(
          (item) => item.fromYear === fromYear && item.toYear === toYear
        )!;
        if (!runImpactPipeline) {
          waterChangeProgress = {
            ...waterChangeProgress,
            state: 'completed',
            currentComparison: null,
            currentStage: null,
            completedStages: 1,
            message: 'Water-change comparisons completed.',
          };
          return res.json({
            status: 'completed',
            step: 'water-change',
            studyArea: 'Velachery, Chennai',
            comparison: { fromYear, toYear },
            outputFilename: selected.outputFilename,
            rawOutputFilename: selected.rawOutputFilename,
            rasterUrl: selected.rasterUrl,
            statistics: selected.statistics,
            comparisons,
          });
        }

        waterChangePipelineResults.push({
          id: 'water-change',
          title: 'Water change',
          summary: 'Compares mapped water extent over four periods from the 2017 baseline.',
          metrics: [
            { label: 'Selected comparison', value: `${selected.fromYear} → ${selected.toYear}` },
            { label: 'Water lost', value: selected.statistics.waterLossAreaHa, unit: 'ha' },
            { label: 'Water gained', value: selected.statistics.waterGainAreaHa, unit: 'ha' },
            { label: 'Persistent water', value: selected.statistics.persistentWaterAreaHa, unit: 'ha' },
          ],
          layers: [
            {
              label: `Water change ${selected.fromYear} → ${selected.toYear}`,
              filename: selected.outputFilename,
              legend: [
                { value: 0, label: 'Unchanged non-water', color: '#1e293b' },
                { value: 85, label: 'Stable core water', color: '#0284c7' },
                { value: 170, label: 'Water loss', color: '#f43f5e' },
                { value: 255, label: 'Water gain', color: '#22d3ee' },
              ],
            },
          ],
          outputs: comparisons.map((comparison) => ({
            label: `Water change ${comparison.fromYear} → ${comparison.toYear}`,
            filename: comparison.outputFilename,
          })),
        });
        waterChangeProgress = {
          ...waterChangeProgress,
          completedStages: 1,
          currentComparison: null,
          currentStage: ANALYSIS_STAGES[1].id,
          message: 'Step 2 of 5: comparing modeled runoff for 2017 and 2024.',
        };

        await runPythonScript(ANALYSIS_STAGES[1].script);
        requireAnalysisOutputs([
          path.join(DATA_DIR, 'runoff_comparison', 'runoff_comparison_summary.csv'),
          path.join(DATA_DIR, 'runoff_comparison', 'display_rgb', 'runoff_before_2017_mm_RGB.tif'),
          path.join(DATA_DIR, 'runoff_comparison', 'display_rgb', 'runoff_after_2024_mm_RGB.tif'),
          path.join(DATA_DIR, 'runoff_comparison', 'display_rgb', 'runoff_change_2024_minus_2017_mm_RGB.tif'),
        ]);
        const runoffSummary = readCsvRow(
          path.join(DATA_DIR, 'runoff_comparison', 'runoff_comparison_summary.csv')
        );
        waterChangePipelineResults.push({
          id: 'runoff-comparison',
          title: 'Runoff comparison',
          summary: 'Estimates how modeled runoff differs between the 2017 and 2024 land-cover maps.',
          note: `Preliminary NRCS Curve Number scenario; assumed soil group ${runoffSummary['Soil Group']}.`,
          metrics: [
            { label: 'Assumed rainfall', value: numericField(runoffSummary, 'Assumed Rainfall (mm)'), unit: 'mm' },
            { label: 'Mean runoff change', value: numericField(runoffSummary, 'Mean Runoff Change (mm)'), unit: 'mm' },
            { label: 'Net runoff volume change', value: numericField(runoffSummary, 'Net Runoff Volume Change (m3)'), unit: 'm³' },
            { label: 'Cells with increased runoff', value: numericField(runoffSummary, 'Pixels with Increased Runoff'), unit: 'cells' },
          ],
          layers: [
            {
              label: 'Runoff before (2017)',
              filename: 'runoff_before_2017_mm_RGB.tif',
              legend: [
                { value: 0, label: 'Lower runoff', color: '#edf8fb' },
                { value: 1, label: 'Moderate runoff', color: '#66c2a4' },
                { value: 2, label: 'Higher runoff', color: '#225ea8' },
              ],
            },
            {
              label: 'Runoff after (2024)',
              filename: 'runoff_after_2024_mm_RGB.tif',
              legend: [
                { value: 0, label: 'Lower runoff', color: '#edf8fb' },
                { value: 1, label: 'Moderate runoff', color: '#66c2a4' },
                { value: 2, label: 'Higher runoff', color: '#225ea8' },
              ],
            },
            {
              label: 'Runoff change (2024 − 2017)',
              filename: 'runoff_change_2024_minus_2017_mm_RGB.tif',
              legend: [
                { value: -1, label: 'Runoff decrease', color: '#3b4cc0' },
                { value: 0, label: 'Little or no change', color: '#f7f7f7' },
                { value: 1, label: 'Runoff increase', color: '#b40426' },
              ],
            },
          ],
          outputs: [
            { label: 'Runoff change raster', filename: 'runoff_change_2024_minus_2017_mm_RGB.tif' },
          ],
        });
        waterChangeProgress = {
          ...waterChangeProgress,
          completedStages: 2,
          currentStage: ANALYSIS_STAGES[2].id,
          message: 'Step 3 of 5: identifying runoff increases within potential encroachment areas.',
        };

        await runPythonScript(ANALYSIS_STAGES[2].script);
        requireAnalysisOutputs([
          path.join(DATA_DIR, 'encroachment_runoff', 'encroachment_runoff_summary.csv'),
          path.join(DATA_DIR, 'encroachment_runoff', 'rgb_01_full_study_area_runoff_change.tif'),
          path.join(DATA_DIR, 'encroachment_runoff', 'rgb_02_potential_encroachment.tif'),
          path.join(DATA_DIR, 'encroachment_runoff', 'rgb_03_runoff_change_encroachment_overlay.tif'),
          path.join(DATA_DIR, 'encroachment_runoff', 'rgb_04_positive_runoff_increase_full_area.tif'),
          path.join(DATA_DIR, 'encroachment_runoff', 'rgb_05_positive_increase_within_encroachment.tif'),
        ]);
        const encroachmentSummary = readCsvRow(
          path.join(DATA_DIR, 'encroachment_runoff', 'encroachment_runoff_summary.csv')
        );
        waterChangePipelineResults.push({
          id: 'encroachment-runoff',
          title: 'Encroachment and runoff',
          summary: 'Measures where potential encroachment overlaps with modeled runoff increases.',
          note: encroachmentSummary.Interpretation,
          metrics: [
            { label: 'Potential encroachment area analysed', value: numericField(encroachmentSummary, 'Area Analysed (ha)'), unit: 'ha' },
            { label: 'Cells with increased runoff', value: numericField(encroachmentSummary, 'Cells with Positive Runoff Increase'), unit: 'cells' },
            { label: 'Positive-increase area', value: numericField(encroachmentSummary, 'Positive Increase Area (ha)'), unit: 'ha' },
            { label: 'Positive runoff increase volume', value: numericField(encroachmentSummary, 'Positive Runoff Increase Volume (m3)'), unit: 'm³' },
          ],
          layers: [
            {
              label: 'Runoff change across study area',
              filename: 'rgb_01_full_study_area_runoff_change.tif',
              legend: [
                { value: -1, label: 'Runoff decrease', color: '#3b4cc0' },
                { value: 0, label: 'Little or no change', color: '#f7f7f7' },
                { value: 1, label: 'Runoff increase', color: '#b40426' },
              ],
            },
            {
              label: 'Potential encroachment',
              filename: 'rgb_02_potential_encroachment.tif',
              legend: [
                { value: 0, label: 'Other valid study area', color: '#dcdcdc' },
                { value: 1, label: 'Potential encroachment', color: '#ff8c00' },
              ],
            },
            {
              label: 'Runoff change with encroachment overlay',
              filename: 'rgb_03_runoff_change_encroachment_overlay.tif',
              legend: [
                { value: -1, label: 'Runoff decrease', color: '#3b4cc0' },
                { value: 0, label: 'Runoff increase', color: '#b40426' },
                { value: 1, label: 'Potential encroachment', color: '#ffe600' },
              ],
            },
            {
              label: 'Positive runoff increase across study area',
              filename: 'rgb_04_positive_runoff_increase_full_area.tif',
              legend: [
                { value: 0, label: 'No increase', color: '#ebebeb' },
                { value: 1, label: 'Positive runoff increase', color: '#e31a1c' },
              ],
            },
            {
              label: 'Positive increase within potential encroachment',
              filename: 'rgb_05_positive_increase_within_encroachment.tif',
              legend: [
                { value: 0, label: 'Potential encroachment without increase', color: '#d7d7d7' },
                { value: 1, label: 'Positive runoff increase', color: '#e31a1c' },
              ],
            },
          ],
          outputs: [
            { label: 'Runoff change within potential encroachment', filename: 'runoff_change_within_potential_encroachment_mm.tif' },
            { label: 'Positive runoff increase within potential encroachment', filename: 'positive_runoff_increase_within_encroachment_mm.tif' },
          ],
        });
        waterChangeProgress = {
          ...waterChangeProgress,
          completedStages: 3,
          currentStage: ANALYSIS_STAGES[3].id,
          message: 'Step 4 of 5: generating overall flood vulnerability from terrain, drainage, and runoff.',
        };

        if (!fs.existsSync(DRAINAGE_GEOJSON_PATH)) {
          await runPythonScript('drainage_map.py');
        }
        if (!fs.existsSync(DRAINAGE_GEOJSON_PATH)) {
          throw new Error(`Drainage map was not created: ${DRAINAGE_GEOJSON_PATH}`);
        }

        const waterFlowOutputDir = path.join(DATA_DIR, 'water_flow_impact');
        await runPythonScript(ANALYSIS_STAGES[3].script, {
          GEOAI_DATA_DIR: path.join(__dirname, 'data'),
          WATER_FLOW_IMPACT_DIR: waterFlowOutputDir,
        });
        const overallScorePath = path.join(
          DATA_DIR,
          'overall_flood_vulnerability',
          'overall_flood_vulnerability_score.tif'
        );
        const overallClassPath = path.join(
          DATA_DIR,
          'overall_flood_vulnerability',
          'overall_flood_vulnerability_class.tif'
        );
        const overallClassRgbPath = path.join(
          DATA_DIR,
          'overall_flood_vulnerability',
          'overall_flood_vulnerability_class_RGB.tif'
        );
        const overallPreviewPath = path.join(
          DATA_DIR,
          'overall_flood_vulnerability',
          'overall_flood_vulnerability_class.png'
        );
        const overallVulnerabilityPath = path.join(
          waterFlowOutputDir,
          'overall_flood_vulnerability.tif'
        );
        const intermediatePreviewPath = path.join(
          waterFlowOutputDir,
          'intermediate_results.png'
        );
        requireAnalysisOutputs([
          overallScorePath,
          overallClassPath,
          overallClassRgbPath,
          overallPreviewPath,
          overallVulnerabilityPath,
          intermediatePreviewPath,
          ...[
            'dem_for_hydrology.tif',
            'gcc_drainage_raster.tif',
            'distance_to_gcc_drain_m.tif',
            'potential_encroachment_near_drain.tif',
            'dem_filled.tif',
            'slope_degrees.tif',
            'flow_direction.tif',
            'flow_accumulation_log_display.tif',
            'terrain_flow_gcc_drain_overlap.tif',
          ].map((filename) => path.join(waterFlowOutputDir, filename)),
        ]);

        waterChangePipelineResults.push({
          id: 'water-flow-impact',
          title: 'Water-flow impact',
          summary: 'Derives terrain flow and combines terrain, drainage proximity, and runoff indicators into overall flood-vulnerability classes.',
          note: 'Preliminary relative screening index, not a flood forecast.',
          metrics: [],
          layers: [
            {
              label: 'Cleaned elevation model',
              filename: 'dem_for_hydrology.tif',
              legend: [],
            },
            {
              label: 'Rasterized GCC drainage',
              filename: 'gcc_drainage_raster.tif',
              legend: [
                { value: 0, label: 'No drainage', color: '#1e293b' },
                { value: 1, label: 'Mapped drainage', color: '#06b6d4' },
              ],
            },
            {
              label: 'Distance to drainage',
              filename: 'distance_to_gcc_drain_m.tif',
              legend: [],
            },
            {
              label: 'Potential encroachment near drains',
              filename: 'potential_encroachment_near_drain.tif',
              legend: [
                { value: 0, label: 'Not flagged', color: '#1e293b' },
                { value: 255, label: 'Near drainage', color: '#f43f5e' },
              ],
            },
            {
              label: 'Depression-filled DEM',
              filename: 'dem_filled.tif',
              legend: [],
            },
            {
              label: 'Terrain slope',
              filename: 'slope_degrees.tif',
              legend: [],
            },
            {
              label: 'D8 flow direction',
              filename: 'flow_direction.tif',
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
              label: 'Log-scaled flow accumulation',
              filename: 'flow_accumulation_log_display.tif',
              legend: [],
            },
            {
              label: 'Terrain-flow and drainage overlap',
              filename: 'terrain_flow_gcc_drain_overlap.tif',
              legend: [
                { value: 0, label: 'No overlap', color: '#1e293b' },
                { value: 255, label: 'Flow / drain overlap', color: '#8b5cf6' },
              ],
            },
            {
              label: 'Overall flood vulnerability',
              filename: 'overall_flood_vulnerability.tif',
              legend: [
                { value: 0, label: 'Outside analysis', color: '#ffffff' },
                { value: 1, label: 'Low', color: '#00aa00' },
                { value: 2, label: 'Moderate', color: '#ffdc00' },
                { value: 3, label: 'High', color: '#dc0000' },
              ],
            },
          ],
          outputs: [
            { label: 'Overall flood vulnerability raster', filename: path.basename(overallVulnerabilityPath) },
          ],
        });

        waterChangeProgress = {
          ...waterChangeProgress,
          completedStages: 4,
          currentStage: ANALYSIS_STAGES[4].id,
          message: 'Step 5 of 5: validating overall vulnerability against historical flood locations.',
        };

        await runPythonScript(ANALYSIS_STAGES[4].script, {
          GEOAI_DATA_DIR: path.join(__dirname, 'data'),
        });
        const validationOverlayPath = path.join(
          DATA_DIR,
          'flood_validation',
          'coverage_analysis',
          'flood_points_vulnerability_overlay.tif'
        );
        const validationSummaryPath = path.join(
          DATA_DIR,
          'flood_validation',
          'coverage_analysis',
          'vulnerability_coverage_summary.csv'
        );
        const validationPointsPath = path.join(
          DATA_DIR,
          'flood_validation',
          'coverage_analysis',
          'flood_points_with_vulnerability.csv'
        );
        requireAnalysisOutputs([
          validationOverlayPath,
          validationSummaryPath,
          validationPointsPath,
        ]);

        const validationLines = fs.readFileSync(validationSummaryPath, 'utf-8')
          .split(/\r?\n/)
          .filter((line) => line.trim());
        const validationHeaders = parseCsvLine(validationLines[0]);
        const validationRows = validationLines.slice(1).map((line) => {
          const values = parseCsvLine(line);
          return Object.fromEntries(
            validationHeaders.map((header, index) => [header, values[index] ?? ''])
          );
        });
        if (validationRows.length === 0) {
          throw new Error('Flood validation summary contains no vulnerability classes.');
        }
        const totalReferencePoints = fs.readFileSync(validationPointsPath, 'utf-8')
          .split(/\r?\n/)
          .filter((line) => line.trim()).length - 1;
        const pointLines = fs.readFileSync(validationPointsPath, 'utf-8')
          .split(/\r?\n/)
          .filter((line) => line.trim());
        const pointHeaders = parseCsvLine(pointLines[0]);
        const pointRows = pointLines.slice(1).map((line) => {
          const values = parseCsvLine(line);
          return Object.fromEntries(
            pointHeaders.map((header, index) => [header, values[index] ?? ''])
          );
        });
        const mapPoints = pointRows.map((row, index) => {
          const lat = numericField(row, 'latitude');
          const lng = numericField(row, 'longitude');
          if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            throw new Error(`Historical flood point ${index + 1} has invalid coordinates.`);
          }
          return {
            lat,
            lng,
            label: row.location || row.Name || `Historical flood point ${index + 1}`,
            vulnerabilityClass: row.predicted_class || 'Unclassified',
          };
        });
        if (mapPoints.length !== totalReferencePoints) {
          throw new Error(
            `Expected coordinates for ${totalReferencePoints} historical flood points, found ${mapPoints.length}.`
          );
        }
        const classRows = validationRows.filter((row) =>
          ['Low', 'Moderate', 'High'].includes(row.vulnerability_class)
        );
        if (classRows.length === 0) {
          throw new Error('Flood validation summary contains no vulnerability classes.');
        }
        const validReferencePoints = classRows.reduce(
          (total, row) => total + numericField(row, 'point_count'),
          0
        );
        const validationTableHeaders = [
          'Vulnerability class',
          'Score range',
          'Historical points',
          'Share of valid points (%)',
        ];
        const validationTableRows = validationRows.map((row) => [
          row.vulnerability_class,
          row.score_range,
          numericField(row, 'point_count'),
          numericField(row, 'percentage_of_valid_points'),
        ]);
        waterChangePipelineResults.push({
          id: 'flood-validation',
          title: 'Historical flood validation',
          summary: 'Samples the overall vulnerability score at historical flood locations and summarizes the number and share of points in each class.',
          note: `Historical locations with valid raster scores: ${validReferencePoints} of ${totalReferencePoints}. Historical points are marked in dark blue on the GeoTIFF overlay.`,
          metrics: [
            { label: 'Historical points', value: totalReferencePoints },
            { label: 'Points with raster scores', value: validReferencePoints },
            ...classRows.map((row) => ({
              label: `${row.vulnerability_class} flood-point coverage`,
              value: numericField(row, 'percentage_of_valid_points'),
              unit: '%',
            })),
          ],
          table: {
            headers: validationTableHeaders,
            rows: validationTableRows,
          },
          mapPoints,
          layers: [
            {
              label: 'Historical flood points over vulnerability classes',
              filename: path.basename(validationOverlayPath),
              legend: [
                { value: 1, label: 'Low vulnerability', color: '#22c55e' },
                { value: 2, label: 'Moderate vulnerability', color: '#eab308' },
                { value: 3, label: 'High vulnerability', color: '#dc2626' },
                { value: 4, label: 'Historical flood points', color: '#14532d' },
              ],
            },
          ],
          outputs: [
            { label: 'Historical flood validation overlay', filename: path.basename(validationOverlayPath) },
          ],
        });

        waterChangeProgress = {
          ...waterChangeProgress,
          state: 'completed',
          currentComparison: null,
          currentStage: null,
          completedStages: ANALYSIS_STAGES.length,
          message: 'All five analysis stages completed, including historical flood validation.',
        };

        res.json({
          status: 'completed',
          step: 'water-change',
          studyArea: 'Velachery, Chennai',
          comparison: { fromYear, toYear },
          outputFilename: selected.outputFilename,
          rawOutputFilename: selected.rawOutputFilename,
          rasterUrl: selected.rasterUrl,
          statistics: selected.statistics,
          comparisons,
          pipelineResults: waterChangePipelineResults,
        });
      } catch (err: any) {
        const failedStage = waterChangeProgress.currentStage;
        waterChangeProgress = {
          ...waterChangeProgress,
          state: 'failed',
          currentComparison: null,
          currentStage: failedStage,
          message: `${ANALYSIS_STAGES.find((stage) => stage.id === failedStage)?.title || 'Analysis'} failed.`,
        };
        res.status(500).json({
          error: `${waterChangeProgress.message} ${String(err?.message || err)}`,
          pipelineResults: waterChangePipelineResults,
        });
      }
    }
  );

  // 2. Persistent Encroachment Process Endpoint (renamed from persistent-water)
  app.post(
    [
      '/api/process/persistent-encroachment',
      '/process/persistent-encroachment',
      '/api/process/persistent-water',
      '/process/persistent-water',
    ],
    async (_req, res) => {
      try {
        await runPythonScript('persistent_check.py', {
          OUTPUT_FOLDER: path.join(DATA_DIR, 'persistent_check'),
        });

        const rasterFilename = 'persistent_encroachment_2017_2023_to_2024.tif';
        const comparisons = [
          {
            earlier: '2017-2020',
            later: '2017-2023',
            suffix: '2017_2020_to_2023',
          },
          {
            earlier: '2017-2023',
            later: '2017-2024',
            suffix: '2017_2023_to_2024',
          },
        ].map((comparison) => {
          const filename = `persistent_encroachment_${comparison.suffix}.tif`;
          const reportFilename = `persistent_report_${comparison.suffix}.csv`;
          const comparisonReport = parseCsvToMap(
            path.join(DATA_DIR, 'persistent_check', reportFilename)
          );
          return {
            label: `${comparison.earlier} compared with ${comparison.later}`,
            outputFilename: filename,
            rasterUrl: `/api/raster/${filename}`,
            statistics: {
              retainedEncroachmentPixels: Number(comparisonReport.get('Persistent Encroachment Pixels')) || 0,
              retainedEncroachmentAreaHa: Number(comparisonReport.get('Persistent Encroachment Area (ha)')) || 0,
            },
          };
        });
        const selectedReport = parseCsvToMap(
          path.join(DATA_DIR, 'persistent_check', 'persistent_report_2017_2023_to_2024.csv')
        );

        res.json({
          status: 'completed',
          step: 'persistent-encroachment',
          studyArea: 'Velachery, Chennai',
          outputFilename: rasterFilename,
          rasterUrl: `/api/raster/${rasterFilename}`,
          comparisons,
          statistics: {
            earlierComparison: selectedReport.get('Earlier Comparison') || '2017-2023',
            laterComparison: selectedReport.get('Later Comparison') || '2017-2024',
            retainedEncroachmentPixels: Number(selectedReport.get('Persistent Encroachment Pixels')) || 0,
            retainedEncroachmentAreaHa: Number(selectedReport.get('Persistent Encroachment Area (ha)')) || 0,
            condition1Pixels: Number(selectedReport.get('Condition 1 Pixels')) || 0,
            condition2Pixels: Number(selectedReport.get('Condition 2 Pixels')) || 0,
            condition3Pixels: Number(selectedReport.get('Condition 3 Pixels')) || 0,
            condition4Pixels: Number(selectedReport.get('Condition 4 Pixels')) || 0,
            condition2AreaHa: Number(selectedReport.get('Condition 2 Area (ha)')) || 0,
          },
        });
      } catch (err: any) {
        res.status(500).json({ error: `Persistent encroachment GIS execution failed: ${String(err?.message || err)}` });
      }
    }
  );

  // 3. LULC Analysis Process Endpoint
  app.post(
    ['/api/process/lulc', '/process/lulc'],
    async (_req, res) => {
      try {
        const reportFilename = 'lulc_persistent_encroachment_report_2017_2024_backend.csv';
        const csvPath = path.join(DATA_DIR, 'lulc_analysis', reportFilename);
        await runPythonScript('lulc_analysis.py', {
          PERSISTENT_PATH: path.join(
            DATA_DIR,
            'persistent_check',
            'persistent_encroachment_2017_2023_to_2024.tif'
          ),
          OUTPUT_DIR: path.join(DATA_DIR, 'lulc_analysis'),
          LULC_REPORT_FILENAME: reportFilename,
        });
        latestLulcReportFilename = reportFilename;

        if (!fs.existsSync(csvPath)) {
          throw new Error(`LULC report not found: ${csvPath}`);
        }
        const lulcRows = fs.readFileSync(csvPath, 'utf-8')
          .split(/\r?\n/)
          .slice(1)
          .filter(Boolean)
          .map((line) => {
            const [classId, className, pixels, areaM2, areaHa, percentage] = line.split(',');
            return {
              classId: Number(classId),
              className,
              pixels: Number(pixels),
              areaM2: Number(areaM2),
              areaHa: Number(areaHa),
              percentage: Number(percentage),
            };
          });
        const classColors: Record<number, string> = {
          0: '#0000ff', 1: '#008000', 2: '#90ee90', 3: '#00ffff',
          4: '#ffff00', 5: '#808000', 6: '#ff0000', 7: '#a52a2a', 8: '#d3d3d3',
        };

        const rasterFilename = 'lulc_persistent_encroachment_2017_2024.tif';
        const visualizationFilename = 'lulc_persistent_encroachment_2017_2024_RGB.tif';
        const classes = lulcRows.map((row) => ({ ...row, color: classColors[row.classId] || '#94a3b8' }));
        const totalPersistentAreaHa = lulcRows.reduce((sum, row) => sum + row.areaHa, 0);
        const totalPersistentPixels = lulcRows.reduce((sum, row) => sum + row.pixels, 0);
        res.json({
          status: 'completed',
          step: 'lulc',
          studyArea: 'Velachery, Chennai',
          outputFilename: rasterFilename,
          rasterUrl: `/api/raster/${rasterFilename}`,
          visualizationFilename,
          visualizationRasterUrl: `/api/raster/${visualizationFilename}`,
          reportFilename,
          reportUrl: '/api/reports/lulc',
          statistics: {
            totalPersistentEncroachmentHa: totalPersistentAreaHa,
            totalPersistentPixels,
            classes,
          },
        });
      } catch (err: any) {
        res.status(500).json({ error: `LULC analysis GIS execution failed: ${String(err?.message || err)}` });
      }
    }
  );

  // 4. Potential Encroachment Process Endpoint
  app.post(
    ['/api/process/encroachment', '/process/encroachment'],
    async (_req, res) => {
      try {
        await runPythonScript('potential_encroachment.py', {
          OUTPUT_FOLDER: path.join(DATA_DIR, 'potential_encroachment'),
        });

        const csvPath = path.join(
          DATA_DIR, 'potential_encroachment', 'potential_encroachment_report.csv'
        );
        const rasterFilename = 'potential_encroachment_display_2017_2024.tif';
        if (!fs.existsSync(csvPath)) {
          throw new Error(`Potential encroachment report not found: ${csvPath}`);
        }
        const potentialRows = fs.readFileSync(csvPath, 'utf-8')
          .split(/\r?\n/)
          .slice(1)
          .filter(Boolean)
          .map((line) => {
            const [fromYear, toYear, pixels, areaM2, areaHa] = line.split(',');
            return {
              fromYear: Number(fromYear),
              toYear: Number(toYear),
              pixels: Number(pixels),
              areaM2: Number(areaM2),
              areaHa: Number(areaHa),
            };
          });
        const comparisons = potentialRows.map((row) => {
          const filename = `potential_encroachment_display_${row.fromYear}_${row.toYear}.tif`;
          return {
            ...row,
            outputFilename: filename,
            rasterUrl: `/api/raster/${filename}`,
          };
        });
        const selected = comparisons.find((row) => row.toYear === 2024);
        if (!selected) throw new Error('Potential encroachment 2017-2024 output is missing.');
        const potentialAreaHa = selected.areaHa;
        const waterReport = parseCsvToMap(
          path.join(DATA_DIR, 'water_change', 'water_change_report_2017_2024.csv')
        );
        const historicalWaterFootprintHa =
          Number(waterReport.get('Historical Water Area (ha)')) || 0;

        res.json({
          status: 'completed',
          step: 'encroachment',
          studyArea: 'Velachery, Chennai',
          outputFilename: selected.outputFilename || rasterFilename,
          rasterUrl: selected.rasterUrl,
          comparisons,
          statistics: {
            potentialEncroachmentAreaHa: potentialAreaHa,
            potentialEncroachmentAreaM2: selected.areaM2,
            potentialEncroachmentPixels: selected.pixels,
            historicalWaterFootprintHa,
            builtUpOverlapPercentage: 100,
            riskLevel: 'HIGH',
            categories: [
              { categoryName: 'Built-up overlap in persistent encroachment', areaHa: potentialAreaHa, severity: 'High', color: '#ff0000' },
            ],
          },
        });
      } catch (err: any) {
        res.status(500).json({ error: `Potential encroachment GIS execution failed: ${String(err?.message || err)}` });
      }
    }
  );

  // Stream GeoTIFF raster file
  app.get(['/api/raster/:filename', '/raster/:filename'], (req, res) => {
    const safeName = path.basename(req.params.filename);
    const candidatePaths = [
      path.join(DATA_DIR, 'water_change', safeName),
      path.join(DATA_DIR, 'persistent_check', safeName),
      path.join(DATA_DIR, 'lulc_analysis', safeName),
      path.join(DATA_DIR, 'potential_encroachment', safeName),
      path.join(DATA_DIR, 'water_flow_impact', safeName),
      path.join(DATA_DIR, 'flood_validation', 'coverage_analysis', safeName),
      path.join(DATA_DIR, 'runoff_comparison', safeName),
      path.join(DATA_DIR, 'runoff_comparison', 'display_rgb', safeName),
      path.join(DATA_DIR, 'encroachment_runoff', safeName),
      path.join(DATA_DIR, 'overall_flood_vulnerability', safeName),
      path.join(DATA_DIR, 'temp_rasters', safeName),
      path.join(DATA_DIR, safeName),
      path.join(MASKS_DIR, safeName),
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        res.setHeader('Content-Type', 'image/tiff');
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
        return res.sendFile(p);
      }
    }
    return res.status(404).json({ error: `Raster file ${safeName} not found on backend.` });
  });

  app.get('/api/analysis-assets/:group/:filename', (req, res) => {
    const assetDirectories: Record<string, string> = {
      'runoff-comparison': path.join(DATA_DIR, 'runoff_comparison', 'display_rgb'),
      'encroachment-runoff': path.join(DATA_DIR, 'encroachment_runoff'),
      'overall-flood-vulnerability': path.join(DATA_DIR, 'overall_flood_vulnerability'),
    };
    const directory = assetDirectories[req.params.group];
    const safeName = path.basename(req.params.filename);
    if (!directory || safeName !== req.params.filename || path.extname(safeName).toLowerCase() !== '.png') {
      return res.status(404).json({ error: 'Analysis preview was not found.' });
    }

    const imagePath = path.join(directory, safeName);
    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({ error: 'Analysis preview was not found.' });
    }
    return res.sendFile(imagePath);
  });

  app.get('/api/reports/lulc', (_req, res) => {
    const reportPath = path.join(
      DATA_DIR,
      'lulc_analysis',
      latestLulcReportFilename
    );
    if (!fs.existsSync(reportPath)) {
      return res.status(404).json({ error: 'LULC report has not been generated yet.' });
    }
    return res.download(reportPath);
  });

  // Serve static assets in production
  const distPath = path.join(__dirname, '..', 'frontend', 'dist');
  const isProduction = process.env.NODE_ENV === 'production' || process.env.npm_lifecycle_event === 'start';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      configFile: path.join(__dirname, '..', 'frontend', 'vite.config.ts'),
      root: path.join(__dirname, '..', 'frontend'),
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`GeoAI Water Encroachment Backend Server listening on http://localhost:${PORT}`);
  });
}

startServer();
