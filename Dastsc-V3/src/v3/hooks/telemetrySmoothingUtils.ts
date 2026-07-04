import type { TelemetryData } from '../core/TelemetryContext';
import { finiteNumber } from './smoothValueUtils';

/** Por debajo de ~7 km/h: factores más altos para reducir lag en maniobras. */
export const MANEUVER_SPEED_MS = 2;

export const SMOOTH_FACTOR_DEFAULTS = {
  speedCruise: 0.45,
  speedManeuver: 0.7,
  distCruise: 0.6,
  distManeuver: 0.8,
  brake: 0.25,
  mainRes: 0.15,
  amperage: 0.3,
  gradient: 0.1,
  gForce: 0.1,
  tail: 0.7,
} as const;

export interface SmoothTelemetry {
  speed: number;
  speedDisplay: number;
  brakeCylinder: number;
  brakePipe: number;
  mainRes: number;
  amperage: number;
  signalDistance: number;
  nextLimitDistance: number;
  gradient: number;
  stationDistance: number;
  lateralG: number;
  gForce: number;
  tailSeconds: number;
  tailDistance: number;
}

export const SMOOTH_TELEMETRY_KEYS = [
  'speed',
  'speedDisplay',
  'brakeCylinder',
  'brakePipe',
  'mainRes',
  'amperage',
  'signalDistance',
  'nextLimitDistance',
  'gradient',
  'stationDistance',
  'lateralG',
  'gForce',
  'tailSeconds',
  'tailDistance',
] as const satisfies readonly (keyof SmoothTelemetry)[];

export type SmoothTelemetryKey = (typeof SMOOTH_TELEMETRY_KEYS)[number];

export function resolveSmoothingFactors(speedMs: number): {
  isManeuvering: boolean;
  speedFactor: number;
  distFactor: number;
} {
  const isManeuvering = finiteNumber(speedMs) < MANEUVER_SPEED_MS;
  return {
    isManeuvering,
    speedFactor: isManeuvering
      ? SMOOTH_FACTOR_DEFAULTS.speedManeuver
      : SMOOTH_FACTOR_DEFAULTS.speedCruise,
    distFactor: isManeuvering
      ? SMOOTH_FACTOR_DEFAULTS.distManeuver
      : SMOOTH_FACTOR_DEFAULTS.distCruise,
  };
}

export function buildSmoothTargets(data: TelemetryData): SmoothTelemetry {
  return {
    speed: data.Speed,
    speedDisplay: data.SpeedDisplay,
    brakeCylinder: data.BrakeCylinderPressure,
    brakePipe: data.BrakePipePressure,
    mainRes: data.MainResPressure,
    amperage: data.Amperage,
    signalDistance: data.DistToNextSignal,
    nextLimitDistance: data.DistToNextSpeedLimit,
    gradient: data.Gradient,
    stationDistance: data.StationDistance,
    lateralG: data.LateralG,
    gForce: data.GForce,
    tailSeconds: data.TailSecondsRemaining,
    tailDistance: data.TailDistanceRemaining,
  };
}

export function buildSmoothFactors(
  speedFactor: number,
  distFactor: number,
): Record<SmoothTelemetryKey, number> {
  const d = SMOOTH_FACTOR_DEFAULTS;
  return {
    speed: speedFactor,
    speedDisplay: speedFactor,
    brakeCylinder: d.brake,
    brakePipe: d.brake,
    mainRes: d.mainRes,
    amperage: d.amperage,
    signalDistance: distFactor,
    nextLimitDistance: distFactor,
    gradient: d.gradient,
    stationDistance: distFactor,
    lateralG: d.gradient,
    gForce: d.gForce,
    tailSeconds: d.tail,
    tailDistance: d.tail,
  };
}
