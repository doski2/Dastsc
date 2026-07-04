import React, { useCallback, useMemo } from 'react';
import { CanvasLayer } from './CanvasLayer';
import { useTelemetrySmoothing } from '../../hooks/useTelemetrySmoothing';
import { drawTrackProfile } from './trackProfileUtils';

/** Visualización de perfil de vía: gradiente, señales, límites y estación. */
export const TrackProfile: React.FC = () => {
  const { smooth, raw, isConnected } = useTelemetrySmoothing();

  const stationName = useMemo(
    () => raw.StationNameOCR || raw.StationName || 'STATION',
    [raw.StationNameOCR, raw.StationName],
  );

  const drawTrack = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      if (!isConnected) return;
      drawTrackProfile(ctx, {
        width,
        height,
        gradient: smooth.gradient,
        lateralG: smooth.lateralG,
        speedUnit: raw.SpeedUnit,
        stationDistance: smooth.stationDistance,
        stationName,
        signalDistance: smooth.signalDistance,
        signalAspect: raw.NextSignalAspect,
        upcomingLimits: raw.UpcomingLimits,
      });
    },
    [
      isConnected,
      smooth.gradient,
      smooth.lateralG,
      smooth.stationDistance,
      smooth.signalDistance,
      raw.SpeedUnit,
      raw.NextSignalAspect,
      raw.UpcomingLimits,
      stationName,
    ],
  );

  return (
    <div className="relative w-full h-[300px] bg-gradient-to-t from-black/40 to-transparent overflow-hidden">
      <CanvasLayer render={drawTrack} />
      <div className={`absolute top-4 left-6 py-1 px-3 border text-[10px] font-bold uppercase rounded ${
        isConnected
          ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'
          : 'bg-white/5 border-white/10 text-white/30'
      }`}>
        TRACK MONITORING: {isConnected ? 'ACTIVE' : 'OFFLINE'}
      </div>
    </div>
  );
};
