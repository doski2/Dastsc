import { useMemo } from 'react';
import { useTelemetry, type ProfileSummary, type TelemetryData } from '../core/TelemetryContext';
import { useMultiSmoothValue } from './useSmoothValue';
import {
  buildSmoothFactors,
  buildSmoothTargets,
  resolveSmoothingFactors,
  SMOOTH_TELEMETRY_KEYS,
  type SmoothTelemetry,
} from './telemetrySmoothingUtils';

export type { SmoothTelemetry } from './telemetrySmoothingUtils';

export interface TelemetrySmoothingResult {
  raw: TelemetryData;
  isManeuvering: boolean;
  smooth: SmoothTelemetry;
  isConnected: boolean;
  activeProfile: ProfileSummary | null;
}

/**
 * Extrae y suaviza los valores de telemetría principales (un rAF para todos los canales).
 */
export function useTelemetrySmoothing(): TelemetrySmoothingResult {
  const { data, isConnected, activeProfile } = useTelemetry();
  const { isManeuvering, speedFactor, distFactor } = resolveSmoothingFactors(data.Speed);

  const factors = useMemo(
    () => buildSmoothFactors(speedFactor, distFactor),
    [speedFactor, distFactor],
  );

  const targets = buildSmoothTargets(data);
  const smooth = useMultiSmoothValue(SMOOTH_TELEMETRY_KEYS, targets, factors) as SmoothTelemetry;

  return {
    raw: data,
    isManeuvering,
    smooth,
    isConnected,
    activeProfile,
  };
}
