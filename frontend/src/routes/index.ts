export interface AppRoute {
  path: string;
  name: string;
  stepId: number;
  description: string;
}

export const APP_ROUTES: AppRoute[] = [
  {
    path: '/',
    name: 'Multi-Year Input',
    stepId: 0,
    description: 'Upload or load historical water masks for Velachery study area',
  },
  {
    path: '/segmentation',
    name: 'Water-Body Segmentation',
    stepId: 1,
    description: 'Segment water bodies in the satellite image series',
  },
  {
    path: '/water-change',
    name: 'Water Change Analysis',
    stepId: 2,
    description: 'Detect water loss, gain, and stable water bodies over time',
  },
  {
    path: '/persistent-encroachment',
    name: 'Persistent Encroachment',
    stepId: 3,
    description: 'Detect persistent water loss and retained urban encroachment',
  },
  {
    path: '/lulc-analysis',
    name: 'LULC Analysis',
    stepId: 4,
    description: 'Land Use Land Cover conversion of dried water bodies',
  },
  {
    path: '/encroachment',
    name: 'Potential Encroachment',
    stepId: 5,
    description: 'Map urban build-up over historical lake footprints',
  },
  {
    path: '/water-flow-impact',
    name: 'Water-Flow Impact',
    stepId: 6,
    description: 'Inspect drainage proximity, terrain flow, and flood screening outputs',
  },
  {
    path: '/summary',
    name: 'Analysis Summary',
    stepId: 7,
    description: 'Comprehensive GeoAI metrics, reports, and downloadable rasters',
  },
];
