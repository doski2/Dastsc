import { EMA_ALPHA, G_CONSTANT, emaBlend } from './Constants';

export interface PhysicsRawInput {
  Acceleration?: number;
  Curvature?: number;
  FarXT?: number;
  FarXO?: number;
  FarZT?: number;
  FarZO?: number;
}

export interface PhysicsNormalizeResult {
  speedMS: number;
  totalDistance: number;
  acceleration: number;
  gForce: number;
  lateralG: number;
}

const WORLD_TILE_SCALE = 1024;
const MAX_ODOMETER_DT_S = 2;
const SPEED_SPIKE_THRESHOLD_MS = 20;
const SPEED_SPIKE_DT_MAX_S = 0.5;
const MIN_LATERAL_SPEED_MS = 1;
const CURVATURE_EPSILON = 1e-5;
const NO_HEADING = 999;

interface PhysicsState {
  lastSpeedMS: number;
  totalDistance: number;
  emaAcceleration: number;
  gForce: number;
  posX: number;
  posZ: number;
  lastHeading: number;
  emaLateralG: number;
}

export function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function worldFarCoordinate(tile: unknown, offset: unknown): number {
  return asNumber(tile) * WORLD_TILE_SCALE + asNumber(offset);
}

/** Descarta picos de velocidad imposibles entre dos frames. */
export function filterSpeedSpike(speedMS: number, lastSpeedMS: number, dtSim: number): number {
  const speedDelta = Math.abs(speedMS - lastSpeedMS);
  if (lastSpeedMS > 0 && speedDelta > SPEED_SPIKE_THRESHOLD_MS && dtSim < SPEED_SPIKE_DT_MAX_S) {
    return lastSpeedMS;
  }
  return speedMS;
}

export function normalizeAngleDelta(delta: number): number {
  let wrapped = delta;
  while (wrapped > Math.PI) wrapped -= 2 * Math.PI;
  while (wrapped < -Math.PI) wrapped += 2 * Math.PI;
  return wrapped;
}

export function lateralGFromCurvature(speedMS: number, curvature: number): number {
  if (Math.abs(curvature) <= CURVATURE_EPSILON) return 0;
  return (speedMS * speedMS * curvature) / G_CONSTANT;
}

export function lateralGFromHeadingChange(
  speedMS: number,
  deltaHeading: number,
  dtSim: number,
): number {
  if (dtSim <= 0 || speedMS <= MIN_LATERAL_SPEED_MS) return 0;
  return -(speedMS * (deltaHeading / dtSim)) / G_CONSTANT;
}

export function computeInstantLateralG(
  speedMS: number,
  dtSim: number,
  curvature: number,
  currX: number,
  currZ: number,
  prevX: number,
  prevZ: number,
  lastHeading: number,
): { lateralG: number; heading: number; hasHeading: boolean } {
  const fromCurvature = lateralGFromCurvature(speedMS, curvature);
  if (fromCurvature !== 0) {
    return { lateralG: fromCurvature, heading: lastHeading, hasHeading: false };
  }

  let currentHeading = 0;
  let hasHeading = false;
  if (prevX !== 0 && (currX !== prevX || currZ !== prevZ)) {
    currentHeading = Math.atan2(currX - prevX, currZ - prevZ);
    hasHeading = true;
  }

  let lateralG = 0;
  if (hasHeading && lastHeading !== NO_HEADING) {
    const delta = normalizeAngleDelta(currentHeading - lastHeading);
    lateralG = lateralGFromHeadingChange(speedMS, delta, dtSim);
  }

  return {
    lateralG,
    heading: hasHeading ? currentHeading : lastHeading,
    hasHeading,
  };
}

/** Odómetro, filtrado de velocidad, aceleración y G lateral. */
export class PhysicsNormalizer {
  private state: PhysicsState = {
    lastSpeedMS: 0,
    totalDistance: 0,
    emaAcceleration: 0,
    gForce: 0,
    posX: 0,
    posZ: 0,
    lastHeading: NO_HEADING,
    emaLateralG: 0,
  };

  normalize(raw: PhysicsRawInput, dtSim: number, speedMS: number): PhysicsNormalizeResult {
    if (dtSim > 0 && dtSim < MAX_ODOMETER_DT_S) {
      this.state.totalDistance += speedMS * dtSim;
    }

    const finalSpeedMS = filterSpeedSpike(speedMS, this.state.lastSpeedMS, dtSim);
    this.state.lastSpeedMS = finalSpeedMS;

    const rawAcc = asNumber(raw.Acceleration);
    this.state.emaAcceleration = emaBlend(this.state.emaAcceleration, rawAcc, EMA_ALPHA);
    this.state.gForce = this.state.emaAcceleration / G_CONSTANT;

    const currX = worldFarCoordinate(raw.FarXT, raw.FarXO);
    const currZ = worldFarCoordinate(raw.FarZT, raw.FarZO);
    const curvature = asNumber(raw.Curvature);

    const lateral = computeInstantLateralG(
      finalSpeedMS,
      dtSim,
      curvature,
      currX,
      currZ,
      this.state.posX,
      this.state.posZ,
      this.state.lastHeading,
    );

    if (lateral.hasHeading) {
      this.state.lastHeading = lateral.heading;
    }

    this.state.emaLateralG = emaBlend(this.state.emaLateralG, lateral.lateralG, EMA_ALPHA);
    this.state.posX = currX;
    this.state.posZ = currZ;

    return {
      speedMS: finalSpeedMS,
      totalDistance: this.state.totalDistance,
      acceleration: this.state.emaAcceleration,
      gForce: this.state.gForce,
      lateralG: this.state.emaLateralG,
    };
  }
}
