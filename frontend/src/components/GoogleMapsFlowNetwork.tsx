import React, { useEffect, useState } from 'react';
import { Polyline, Tooltip, useMapEvents } from 'react-leaflet';
import type { ParsedGeoTiff } from '../utils/geotiffEngine';
import {
  extractDynamicStreamlinesFromRaster,
  traceDynamicDownhillFlow,
  type DynamicFlowSegment,
} from '../utils/dynamicFlowEngine';

interface GoogleMapsFlowNetworkProps {
  visible: boolean;
  flowDirectionRaster: ParsedGeoTiff | null;
  flowAccumulationRaster?: ParsedGeoTiff | null;
}

function FlowTrace({ raster, enabled, onTrace }: { raster: ParsedGeoTiff | null; enabled: boolean; onTrace: (path: [number, number][]) => void }) {
  useMapEvents({
    click(event) {
      if (!enabled || !raster) return;
      onTrace(traceDynamicDownhillFlow(raster, event.latlng.lat, event.latlng.lng).pathCoordinates);
    },
  });
  return null;
}

export const GoogleMapsFlowNetwork: React.FC<GoogleMapsFlowNetworkProps> = ({
  visible,
  flowDirectionRaster,
}) => {
  const [rasterFlowSegments, setRasterFlowSegments] = useState<DynamicFlowSegment[]>([]);
  const [trace, setTrace] = useState<[number, number][]>([]);
  const [traceEnabled, setTraceEnabled] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setRasterFlowSegments(
      flowDirectionRaster
        ? extractDynamicStreamlinesFromRaster(flowDirectionRaster)
        : []
    );
  }, [visible, flowDirectionRaster]);

  if (!visible) return null;

  return (
    <>
      <FlowTrace raster={flowDirectionRaster} enabled={traceEnabled} onTrace={setTrace} />
      {rasterFlowSegments.map((segment) => (
        <React.Fragment key={segment.id}>
          <Polyline
            positions={segment.coordinates}
            pathOptions={{
              color: '#082f49',
              weight: 8,
              opacity: 0.75,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
          <Polyline
            positions={segment.coordinates}
            pathOptions={{
              color: '#67e8f9',
              weight: 4,
              opacity: 1,
              dashArray: '5 14',
              className: 'leaflet-animated-flow-stream',
            }}
          >
            <Tooltip>Raster flow direction · {segment.cardinalDirection}</Tooltip>
          </Polyline>
        </React.Fragment>
      ))}
      {trace.length > 1 && <Polyline positions={trace} pathOptions={{ color: '#facc15', weight: 4, dashArray: '8 6' }} />}
      <div className="leaflet-control leaflet-bar absolute top-2 left-2 z-[500]">
        <button type="button" className="bg-slate-950 text-cyan-300 px-2 py-1 text-[11px]" onClick={() => setTraceEnabled((enabled) => !enabled)}>
          {traceEnabled ? 'Stop flow trace' : 'Trace downhill flow'}
        </button>
      </div>
    </>
  );
};
