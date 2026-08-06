import { TelemetryData } from './telemetryTypes';
import { G_CONSTANT } from './normalizers/Constants';
import { BrakeNormalizeResult, BrakeProfileInput, BrakeRawInput } from './normalizers/BrakeNormalizer';
import { asNumber, PhysicsRawInput, worldFarCoordinate } from './normalizers/PhysicsNormalizer';
import { SignalingNormalizeResult, SignalingRawInput } from './normalizers/SignalingNormalizer';

export type SimUnit = 'MPH' | 'KPH';
export type DisplayUnit = 'MPH' | 'KPH';

export interface NormalizerProfile extends BrakeProfileInput {
  visuals?: {
    unit?: string;
    pressure_unit?: 'PSI' | 'BAR';
  };
  physics_config?: {
    max_braking_kn?: number;
    max_braking_decel?: number;
    brake_fill_time_s?: number;
    /** uk_consist (default): cabina 1/2 UK. driver: sin tabla cab UK (EMU alemán). */
    gradient_mode?: 'uk_consist' | 'driver';
    /** Invierte el signo tras resolver cabina (p. ej. GetGradient DTG alemán). */
    gradient_sign_flip?: boolean;
  };
}

export type SimulatorRawInput = BrakeRawInput &
  PhysicsRawInput &
  SignalingRawInput & {
  SimulationTime?: number;
  TrainLength?: number;
  Length?: number;
  ActiveCab?: number;
  WheelSpeedMS?: number;
  TrackMPH?: number;
  SpeedoType?: number;
  CabSpeed?: number;
  CurrentSpeed?: number;
  Speed?: number;
  Reversal?: number;
  Reverser?: number;
  Mass?: number;
  Throttle?: number;
  Regulator?: number;
  SimpleThrottle?: number;
  TrainBrake?: number;
  TrainBrakeControl?: number;
  VirtualBrake?: number;
  Combined?: number;
  ThrottleAndBrake?: number;
  Gradient?: number;
  GradientPct?: number;
  TrackLimit?: number;
  SignalLimit?: number;
  TimeOfDay?: number;
  StationDistance?: number;
  StationAnchorM?: number;
  StationTraveledM?: number;
  StationDriftM?: number;
  StationNearCorrected?: number;
  StationName?: string;
  PlatformLength?: number;
  StationLength?: number;
  TailDistance?: number;
  TripDistance?: number;
  TailSeconds?: number;
  TailActive?: number;
  RVNumber?: string;
  RvNumber?: string;
  RouteID?: string;
  RouteId?: string;
  ScenarioPath?: string;
  EmergencyBrake?: number;
  AWS?: number;
  AWSState?: number;
  AWSReset?: number;
  AWSResetButton?: number;
  AWSWarning?: number;
  AWSWarnAudio?: number;
  AWSWarnCount?: number;
  DSD?: number;
  VigilAlarm?: number;
  Vigilance?: number;
  DVDAlarm?: number;
  DRA?: number;
  Sander?: number;
  DoorL?: number;
  DoorR?: number;
  LocoName?: string;
  StationNameOCR?: string;
  StationETA?: string;
  StationScheduled?: string;
};

export interface UnitContext {
  simUnit: SimUnit;
  displayUnit: DisplayUnit;
  simToMS: number;
  displayFromMS: number;
}

export interface SpeedLimitMarker {
  speed: number;
  distance: number;
}

const KPH_TO_MS = 1 / 3.6;
const MPH_TO_MS = 0.44704;
const MS_TO_KPH = 3.6;
const MS_TO_MPH = 2.23694;
const PSI_TO_BAR = 14.5038;
const MAX_SANE_LIMIT = 450;
const DEFAULT_TRAIN_LENGTH_M = 100;
export const MIN_DT_SIM_S = 0.01;
export const MAX_DT_SIM_S = 2.0;
const MAX_SIM_DT_S = 1.0;
const MAX_REAL_DT_S = 0.2;
export const MIN_SPEED_FOR_CAB_INFER_MS = 0.5;
const MIN_LIMIT_DISTANCE_M = 2;
const MAX_UPCOMING_LIMITS = 3;
export const PROJECTION_HORIZON_S = 5;
const DEFAULT_DECEL_MS2 = 0.7;
const MIN_EFFECTIVE_DECEL_MS2 = 0.05;
const BC_MAX_BAR = 5.0;
const BC_MAX_PSI = 72.5;
const BC_PERCENT_CAP = 1.1;
const DEFAULT_MAX_BRAKING_KN = 200;
const DYNAMIC_BRAKE_KN_FACTOR = 0.5;

export function resolveUnitContext(raw: SimulatorRawInput, profile?: NormalizerProfile | null): UnitContext {
  const simUnit: SimUnit = asNumber(raw.SpeedoType) === 2 ? 'KPH' : 'MPH';
  const profileUnit = profile?.visuals?.unit;
  const displayUnit: DisplayUnit =
    profileUnit === 'KPH' || profileUnit === 'MPH' ? profileUnit : simUnit;

  return {
    simUnit,
    displayUnit,
    simToMS: simUnit === 'KPH' ? KPH_TO_MS : MPH_TO_MS,
    displayFromMS: displayUnit === 'KPH' ? MS_TO_KPH : MS_TO_MPH,
  };
}

export function resolveTrainLength(raw: SimulatorRawInput): number {
  const length = asNumber(raw.TrainLength ?? raw.Length, DEFAULT_TRAIN_LENGTH_M);
  return length > 0 ? length : DEFAULT_TRAIN_LENGTH_M;
}

export function computeSimDelta(
  rawSimTime: number,
  hasSimulationTime: boolean,
  lastSimTime: number,
  lastRealTime: number,
  now: number,
): number {
  if (lastSimTime <= 0) return 0;
  if (rawSimTime > lastSimTime) return Math.min(MAX_SIM_DT_S, rawSimTime - lastSimTime);
  if (!hasSimulationTime && lastRealTime > 0) return Math.min(MAX_REAL_DT_S, now - lastRealTime);
  return 0;
}

export function resolveSpeedMS(raw: SimulatorRawInput, simToMS: number): number {
  if (raw.CabSpeed !== undefined && raw.CabSpeed !== 0) {
    return asNumber(raw.CabSpeed) * simToMS;
  }
  let speedMS = Math.abs(asNumber(raw.CurrentSpeed ?? raw.Speed));
  if (raw.Speed !== undefined && raw.CurrentSpeed === undefined) {
    speedMS *= simToMS;
  }
  return speedMS;
}

export function inferActiveCab(
  reportedCab: number,
  reversal: number,
  speedMS: number,
  wheelSpeedMS?: number,
  trackMPH?: number,
  latchedCab = 0,
): number {
  if (reportedCab === 2) return 2;

  const motionCab = inferCabFromMotion(reversal, speedMS, wheelSpeedMS, trackMPH);
  if (motionCab !== null) return motionCab;

  if (latchedCab === 1 || latchedCab === 2) return latchedCab;
  return reportedCab;
}

function inferCabFromMotion(
  reversal: number,
  speedMS: number,
  wheelSpeedMS?: number,
  trackMPH?: number,
): number | null {
  if (speedMS <= MIN_SPEED_FOR_CAB_INFER_MS) return null;

  const forward = reversal > 0.05;
  const reverse = reversal < -0.05;
  if (wheelSpeedMS !== undefined) {
    if (forward && wheelSpeedMS < -0.15) return 2;
    if (reverse && wheelSpeedMS > 0.15) return 2;
    if (forward && wheelSpeedMS > 0.15) return 1;
    if (reverse && wheelSpeedMS < -0.15) return 1;
  }
  if (trackMPH !== undefined) {
    if (forward && trackMPH < -0.3) return 2;
    if (reverse && trackMPH > 0.3) return 2;
    if (forward && trackMPH > 0.3) return 1;
    if (reverse && trackMPH < -0.3) return 1;
  }
  return null;
}

export function updateLatchedCab(
  latchedCab: number,
  reversal: number,
  speedMS: number,
  wheelSpeedMS?: number,
  trackMPH?: number,
): number {
  const motionCab = inferCabFromMotion(reversal, speedMS, wheelSpeedMS, trackMPH);
  return motionCab ?? latchedCab;
}

export function normalizeWheelSpeedMS(
  wheelSpeedMS: number | undefined,
  speedMS: number,
): number | undefined {
  if (wheelSpeedMS === undefined || wheelSpeedMS === null) return undefined;
  if (speedMS > MIN_SPEED_FOR_CAB_INFER_MS && Math.abs(wheelSpeedMS) < 0.05) {
    return undefined;
  }
  return wheelSpeedMS;
}

/** Pendiente de ruta en ‰ (GradientPct % × 10, o campo Gradient del Lua). */
export function routeGradientPermille(raw: SimulatorRawInput): number {
  if (raw.GradientPct !== undefined && raw.GradientPct !== null) {
    return asNumber(raw.GradientPct) * 10;
  }
  return asNumber(raw.Gradient);
}

/**
 * Signo para EMU alemán / referencia marcha: solo rueda + reverser, sin cab 1/2 UK.
 */
export function resolveGradientSignDriver(
  reversal: number,
  wheelSpeedMS: number | undefined,
  speedMS: number,
): number {
  if (speedMS > MIN_SPEED_FOR_CAB_INFER_MS && wheelSpeedMS !== undefined) {
    const forward = reversal > 0.05;
    const reverse = reversal < -0.05;
    if (forward && wheelSpeedMS < -0.15) return -1;
    if (reverse && wheelSpeedMS > 0.15) return -1;
    if (forward && wheelSpeedMS > 0.15) return 1;
    if (reverse && wheelSpeedMS < -0.15) return 1;
  }
  return 1;
}

export function resolveGradientSignForProfile(
  activeCab: number,
  reversal: number,
  wheelSpeedMS: number | undefined,
  speedMS: number,
  profile?: NormalizerProfile | null,
): number {
  const wheel = normalizeWheelSpeedMS(wheelSpeedMS, speedMS);
  const mode = profile?.physics_config?.gradient_mode ?? 'uk_consist';
  let sign = mode === 'driver'
    ? resolveGradientSignDriver(reversal, wheel, speedMS)
    : resolveGradientSign(activeCab, reversal, wheel, speedMS);
  if (profile?.physics_config?.gradient_sign_flip) sign *= -1;
  return sign;
}

/**
 * Signo del gradiente respecto a la marcha actual.
 * `GetGradient` TSC es % en el frente del consist (característica de ruta).
 * Hay que invertir cuando conduces contra el eje nominal del consist.
 */
export function resolveGradientSign(
  activeCab: number,
  reversal: number,
  wheelSpeedMS?: number,
  speedMS?: number,
): number {
  const wheel = speedMS !== undefined
    ? normalizeWheelSpeedMS(wheelSpeedMS, speedMS)
    : wheelSpeedMS;

  if (speedMS !== undefined && speedMS > MIN_SPEED_FOR_CAB_INFER_MS && wheel !== undefined) {
    const forward = reversal > 0.05;
    const reverse = reversal < -0.05;
    if (forward && wheel < -0.15) return -1;
    if (reverse && wheel > 0.15) return -1;
    if (forward && wheel > 0.15) return 1;
    if (reverse && wheel < -0.15) return 1;
  }

  const forward = reversal > 0.05;
  const reverse = reversal < -0.05;
  if (!forward && !reverse) return 1;

  const fromLeadingCab = activeCab === 1;
  const alongConsistForward = (fromLeadingCab && forward) || (!fromLeadingCab && reverse);
  return alongConsistForward ? 1 : -1;
}

export function resolvePressureUnit(
  raw: SimulatorRawInput,
  profile?: NormalizerProfile | null,
): 'PSI' | 'BAR' {
  const interpretedAsPsi = asNumber(raw.BC) > 15 || asNumber(raw.BP) > 15 || asNumber(raw.MR) > 20;
  const trainUnit = interpretedAsPsi ? 'PSI' : 'BAR';
  return profile?.visuals?.pressure_unit ?? trainUnit;
}

export function brakeCylinderPercent(bc: number, pressureUnit: 'PSI' | 'BAR'): number {
  const maxBC = pressureUnit === 'PSI' ? BC_MAX_PSI : BC_MAX_BAR;
  return Math.min(BC_PERCENT_CAP, bc / maxBC);
}

export function computeTotalBrakingEffort(
  bcPercent: number,
  brake: BrakeNormalizeResult,
  profile?: NormalizerProfile | null,
): number {
  const baseKn = bcPercent * (profile?.physics_config?.max_braking_kn ?? DEFAULT_MAX_BRAKING_KN);
  const pneumatic = baseKn * brake.brakeEfficiency;
  const dynamic = brake.amperage < 0 ? Math.abs(brake.amperage) * DYNAMIC_BRAKE_KN_FACTOR : 0;
  return pneumatic + dynamic;
}

export function saneSpeedLimit(value: number, fallback: number): number {
  return !Number.isFinite(value) || value <= 0 || value > MAX_SANE_LIMIT ? fallback : value;
}

export function buildUpcomingLimits(
  sig: SignalingNormalizeResult,
  simToMS: number,
  displayFromMS: number,
): SpeedLimitMarker[] {
  const fallback = sig.currentLimitConverted;
  const rawUpcoming: SpeedLimitMarker[] = [];

  if (sig.rawNextLimitDistFromLua > 0) {
    rawUpcoming.push({
      speed: saneSpeedLimit(sig.rawNextLimitSpeed, fallback) * simToMS * displayFromMS,
      distance: sig.rawNextLimitDistFromLua,
    });
  }
  if (sig.rawNextLimit2DistFromLua > 0) {
    rawUpcoming.push({
      speed: saneSpeedLimit(sig.rawNextLimit2Speed, fallback) * simToMS * displayFromMS,
      distance: sig.rawNextLimit2DistFromLua,
    });
  }

  const upcoming: SpeedLimitMarker[] = [];
  let lastRefSpeedMS = NaN;

  for (const limit of rawUpcoming) {
    if (limit.distance <= MIN_LIMIT_DISTANCE_M) continue;
    const limitSpeedMS = limit.speed / displayFromMS;
    if (Number.isNaN(lastRefSpeedMS) || Math.abs(limitSpeedMS - lastRefSpeedMS) > 0.1) {
      upcoming.push(limit);
      lastRefSpeedMS = limitSpeedMS;
      if (upcoming.length >= MAX_UPCOMING_LIMITS) break;
    }
  }

  return upcoming;
}

export function formatTimeOfDay(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function resolveCombinedControl(
  raw: SimulatorRawInput,
  throttle: number,
  brake: number,
): number {
  if (raw.ThrottleAndBrake !== undefined && raw.ThrottleAndBrake !== null) {
    return asNumber(raw.ThrottleAndBrake);
  }
  // Lua emite Combined:0 aunque no exista ThrottleAndBrake (p. ej. ICE T split).
  // No usar ese 0 como mando combinado real — calcular Regulator − freno.
  if (
    raw.Combined !== undefined
    && raw.Combined !== null
    && Math.abs(asNumber(raw.Combined)) > 0.001
  ) {
    return asNumber(raw.Combined);
  }
  return throttle - brake;
}

/** Umbral de salto OCR (m) — ignora lecturas que suben bruscamente. */
const STATION_OCR_JUMP_THRESHOLD_M = 40;

export function stickyStationDistance(raw: SimulatorRawInput, prev: TelemetryData): number {
  const incoming = raw.StationDistance !== undefined ? asNumber(raw.StationDistance) : -1;
  const trip = asNumber(raw.TripDistance, prev.TripDistance ?? 0);
  const prevDist = prev.StationDistance ?? -1;
  const prevTrip = prev.TripDistance ?? 0;

  if (prevDist >= 0 && trip > prevTrip) {
    const estimated = Math.max(0, prevDist - (trip - prevTrip));
    if (incoming < 0) {
      return parseFloat(estimated.toFixed(1));
    }
    if (incoming > estimated + STATION_OCR_JUMP_THRESHOLD_M || incoming > prevDist + 5) {
      return parseFloat(estimated.toFixed(1));
    }
    return incoming;
  }

  if (incoming >= 0) return incoming;
  return prevDist >= 0 ? prevDist : -1;
}

export function stickyOcrField(
  incoming: string | undefined,
  previous: string,
): string {
  if (incoming !== undefined) return incoming || '';
  return previous || '';
}

export function computeProjectedBrakingDistance(
  speedMS: number,
  massTonnes: number,
  totalBrakingEffortKn: number,
  gradient: number,
): number {
  if (speedMS < MIN_SPEED_FOR_CAB_INFER_MS) return 0;

  const decelMS2 = totalBrakingEffortKn > 0 && massTonnes > 0
    ? totalBrakingEffortKn / massTonnes
    : DEFAULT_DECEL_MS2;

  const gravComponent = (gradient / 1000) * G_CONSTANT;
  const effectiveDecel = Math.max(MIN_EFFECTIVE_DECEL_MS2, decelMS2 + gravComponent);
  return Math.round((speedMS * speedMS) / (2 * effectiveDecel));
}

export function toDisplaySpeed(speedMS: number, displayFromMS: number): number {
  return speedMS * displayFromMS;
}

export function pressureScale(unit: 'PSI' | 'BAR'): number {
  return unit === 'PSI' ? PSI_TO_BAR : 1;
}

export function speedUnitLabel(displayUnit: DisplayUnit): TelemetryData['SpeedUnit'] {
  return displayUnit === 'KPH' ? 'km/h' : 'MPH';
}

export { worldFarCoordinate };
