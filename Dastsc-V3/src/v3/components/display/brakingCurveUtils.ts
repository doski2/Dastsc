import { TelemetryData } from '../../core/TelemetryContext';

export const API_BASE = 'http://localhost:8000';
export const METERS_PER_MILE = 1609.34;
export const METERS_TO_MILES = 0.000621371;
export const TYPE_LAG_MAP: Record<number, number> = { 0: 1.4, 1: 1.0, 2: 1.1, 3: 0.8 };
export const APPLY_NOW_MARGIN_M = 150;
export const MIN_LEARNED_SAMPLES = 3;
export const DEFAULT_MAX_BRAKE_DECEL = 0.8;
export const DEFAULT_HUD_MAX_BRAKE_DECEL = 1.0;

export type CurveMode = 'DYNAMIC' | 'SIGNAL' | 'LIMIT';

export interface BrakeNotch {
  label: string;
  value: number;
}

export interface TrainProfile {
  id?: string;
  name?: string;
  physics_config?: {
    max_braking_decel?: number;
    brake_fill_time_s?: number;
  };
  specs?: {
    max_speed?: number;
    notches_throttle_brake?: BrakeNotch[];
  };
}

export interface BrakeStatsEntry {
  avg_decel: number;
  samples: number;
}

export type BrakeStatsByNotch = Record<string, BrakeStatsEntry>;

export interface BrakeEvent {
  start_speed_ms?: number;
  end_speed_ms?: number;
  notch?: string;
  avg_decel_ms2?: number;
  max_decel_ms2?: number;
  duration_s?: number;
  distance_m?: number;
  gradient?: number;
  train_mass?: number;
  loco?: string;
}

export interface TargetInfo {
  label: string;
  dist: number | null | undefined;
  val: string;
  isRealTarget: boolean;
}

export interface BrakeStep {
  notch: string;
  fraction: number;
  phase: string;
  distStart: number;
  distNeeded: number;
  usingLearned: boolean;
  samples: number;
}

export interface BrakeParams {
  dist: number;
  needed: number;
  notch: string;
  steps: BrakeStep[];
  isRealTarget: boolean;
}

export function profileId(profile: TrainProfile | null | undefined): string {
  return profile?.id ?? profile?.name ?? '';
}

export function brakeApiUrl(path: string, profile?: string | null): string {
  const base = `${API_BASE}${path}`;
  if (!profile) return base;
  const sep = path.includes('?') ? '&' : '?';
  return `${base}${sep}profile=${encodeURIComponent(profile)}`;
}

export function formatDistance(m: number, speedUnit: TelemetryData['SpeedUnit']): string {
  if (speedUnit === 'MPH') {
    return `${(m * METERS_TO_MILES).toFixed(2)}mi`;
  }
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
}

export function formatTripDistance(m: number, speedUnit: TelemetryData['SpeedUnit']): string {
  if (speedUnit === 'MPH') {
    return `${(m * METERS_TO_MILES).toFixed(2)} mi`;
  }
  return `${(m / 1000).toFixed(2)} km`;
}

export function displaySpeedToMs(speed: number, speedUnit: TelemetryData['SpeedUnit']): number {
  return speed * (speedUnit === 'MPH' ? 0.44704 : 0.27778);
}

export function getEffectiveDistance(
  mode: CurveMode,
  raw: Pick<TelemetryData, 'StationDistance' | 'DistToNextSignal' | 'DistToNextSpeedLimit'>,
  customMiles: string,
): number | null {
  if (mode === 'DYNAMIC') {
    if (customMiles) {
      const miles = parseFloat(customMiles);
      return Number.isFinite(miles) ? miles * METERS_PER_MILE : null;
    }
    return raw.StationDistance >= 0 ? raw.StationDistance : null;
  }
  if (mode === 'SIGNAL') return raw.DistToNextSignal;
  return raw.DistToNextSpeedLimit;
}

export function getTargetInfo(
  mode: CurveMode,
  raw: TelemetryData,
  effectiveDist: number | null,
  customMiles: string,
): TargetInfo {
  switch (mode) {
    case 'SIGNAL':
      return {
        label: 'Next Signal',
        dist: raw.DistToNextSignal,
        val: raw.NextSignalAspect,
        isRealTarget: true,
      };
    case 'LIMIT':
      return {
        label: 'Next Limit',
        dist: raw.DistToNextSpeedLimit,
        val: `${raw.NextSpeedLimit} ${raw.SpeedUnit}`,
        isRealTarget: true,
      };
    default:
      if (customMiles && effectiveDist !== null) {
        return { label: 'Manual Stop', dist: effectiveDist, val: `${customMiles} mi`, isRealTarget: true };
      }
      if (raw.StationNameOCR && effectiveDist !== null) {
        return { label: `Station: ${raw.StationNameOCR}`, dist: effectiveDist, val: 'OCR', isRealTarget: true };
      }
      if (raw.StationName && effectiveDist !== null) {
        return { label: `Station: ${raw.StationName}`, dist: effectiveDist, val: 'GAME', isRealTarget: true };
      }
      if (effectiveDist !== null && effectiveDist > 0) {
        return { label: 'Next Station', dist: effectiveDist, val: 'DETECTOR', isRealTarget: true };
      }
      return {
        label: 'Optimal Stop',
        dist: raw.ProjectedBrakingDistance,
        val: 'Dynamic',
        isRealTarget: false,
      };
  }
}

export function gravityAcceleration(gradientPercent: number): number {
  return 9.80665 * (gradientPercent / 100);
}

export function computeRecommendedBrake(
  currentSpeedMS: number,
  targetSpeedMS: number,
  targetDist: number,
  raw: Pick<TelemetryData, 'TrainMass' | 'TrainLength' | 'TrainType' | 'Gradient'>,
  maxServiceDecel: number,
): number {
  if (currentSpeedMS <= targetSpeedMS || targetDist <= 5) return 0;

  const requiredAcc = (targetSpeedMS ** 2 - currentSpeedMS ** 2) / (2 * targetDist);
  const requiredDecel = Math.abs(requiredAcc);

  const massFactor = raw.TrainMass > 0 ? raw.TrainMass / 500 : 1;
  const lengthFactor = raw.TrainLength > 0 ? 1 + (raw.TrainLength / 1000) * 0.1 : 1;
  const lagFactor = TYPE_LAG_MAP[raw.TrainType ?? 1] ?? 1.0;

  let effectiveMax = maxServiceDecel / (massFactor * lengthFactor * lagFactor);
  const totalDecelNeeded = requiredDecel - gravityAcceleration(raw.Gradient || 0);

  return Math.min(100, Math.max(0, (totalDecelNeeded / effectiveMax) * 100));
}

export function findRecommendedNotch(
  recommendedBrake: number,
  notches: BrakeNotch[] | undefined,
): string {
  if (!notches?.length) return '';

  const targetVal = -(recommendedBrake / 100);
  const brakeNotches = notches
    .filter(n => n.value <= 0)
    .sort((a, b) => b.value - a.value);

  for (const notch of brakeNotches) {
    if (targetVal >= notch.value) return notch.label;
  }
  return brakeNotches.length > 0 ? brakeNotches[brakeNotches.length - 1].label : '';
}

export function computeBrakeParams(
  mode: CurveMode,
  raw: TelemetryData,
  info: TargetInfo,
  activeProfile: TrainProfile | null | undefined,
  brakeStats: BrakeStatsByNotch,
): BrakeParams | null {
  const targetDist = info.dist;
  let targetSpeedMS = 0;

  if (mode === 'LIMIT') {
    targetSpeedMS = displaySpeedToMs(raw.NextSpeedLimit, raw.SpeedUnit);
  }

  if (raw.Speed < 0.5 || targetDist == null || raw.Speed <= targetSpeedMS) return null;
  if (targetDist < -10 && info.isRealTarget) return null;

  const baseDecel = activeProfile?.physics_config?.max_braking_decel ?? DEFAULT_MAX_BRAKE_DECEL;
  const massFactor = raw.TrainMass > 0 ? raw.TrainMass / 500 : 1;
  const lagFactor = TYPE_LAG_MAP[raw.TrainType ?? 1] ?? 1.0;
  const gravityAcc = gravityAcceleration(raw.Gradient || 0);

  const brakeNotches = activeProfile?.specs?.notches_throttle_brake
    ?.filter(n => n.value < 0)
    .sort((a, b) => a.value - b.value) ?? [];

  const decelFor = (fraction: number, notchLabel: string): number => {
    const learned = brakeStats[notchLabel];
    if (learned && learned.samples >= MIN_LEARNED_SAMPLES) {
      return learned.avg_decel;
    }
    return (baseDecel * fraction) / (massFactor * lagFactor) + gravityAcc;
  };

  const brakeDist = (fraction: number, notchLabel: string): number => {
    const decel = decelFor(fraction, notchLabel);
    if (decel <= 0) return Infinity;
    return (raw.Speed ** 2 - targetSpeedMS ** 2) / (2 * decel);
  };

  const fillTimeSecs = activeProfile?.physics_config?.brake_fill_time_s ?? 2.5;
  const reactionMargin = raw.Speed * Math.min(4.0, 1.5 + fillTimeSecs);

  const serviceNotches = brakeNotches.filter(n => n.value > -1.0);
  let phases: { fraction: number; notchLabel: string; label: string }[];

  if (serviceNotches.length >= 1) {
    const total = serviceNotches.length;
    const picks = total <= 4
      ? Array.from({ length: total }, (_, i) => i)
      : [0, Math.floor(total * 0.33), Math.floor(total * 0.66), total - 1];

    phases = picks.map((idx, i) => ({
      fraction: Math.abs(serviceNotches[idx].value),
      notchLabel: serviceNotches[idx].label,
      label: String(i + 1),
    }));
  } else {
    phases = [
      { fraction: 0.30, notchLabel: '30%', label: '1' },
      { fraction: 0.55, notchLabel: '55%', label: '2' },
      { fraction: 0.80, notchLabel: '80%', label: '3' },
    ];
  }

  const steps = phases.map(p => {
    const learned = brakeStats[p.notchLabel];
    const usingLearned = !!(learned && learned.samples >= MIN_LEARNED_SAMPLES);
    const dist = brakeDist(p.fraction, p.notchLabel);
    return {
      notch: p.notchLabel,
      fraction: p.fraction,
      phase: p.label,
      distStart: targetDist - (dist + reactionMargin),
      distNeeded: dist,
      usingLearned,
      samples: learned?.samples ?? 0,
    };
  });

  const main = steps[Math.floor(steps.length / 2)] ?? steps[0];
  if (!main) return null;

  return {
    dist: main.distStart,
    needed: main.distNeeded,
    notch: main.notch,
    steps,
    isRealTarget: info.isRealTarget,
  };
}

export function computeETA(
  raw: Pick<TelemetryData, 'StationETA' | 'Speed' | 'TimeOfDay'>,
  effectiveDist: number | null,
): string | null {
  if (raw.StationETA) return raw.StationETA;
  if (!raw.Speed || raw.Speed < 0.5 || effectiveDist === null || effectiveDist <= 0) return null;

  const secsToArrival = effectiveDist / raw.Speed;
  const parts = raw.TimeOfDay.split(':').map(Number);
  if (parts.length !== 3) return null;

  const totalSecs = parts[0] * 3600 + parts[1] * 60 + parts[2] + secsToArrival;
  const h = Math.floor(totalSecs / 3600) % 24;
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = Math.floor(totalSecs % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function msToDisplaySpeed(ms: number, speedUnit: TelemetryData['SpeedUnit']): number {
  return ms * (speedUnit === 'MPH' ? 2.23694 : 3.6);
}

export function formatOdometer(meters: number, speedUnit: TelemetryData['SpeedUnit']): string {
  if (speedUnit === 'MPH') {
    return `odo ${(meters * METERS_TO_MILES).toFixed(2)} mi`;
  }
  return `odo ${(meters / 1000).toFixed(2)} km`;
}

export function formatActionLabel(
  distUntilAction: number,
  speedMS: number,
  speedUnit: TelemetryData['SpeedUnit'],
): string {
  const isApplyNow = distUntilAction <= APPLY_NOW_MARGIN_M && distUntilAction >= -APPLY_NOW_MARGIN_M;
  const isPassed = distUntilAction < -APPLY_NOW_MARGIN_M;

  if (isApplyNow) return 'APPLY NOW';
  if (isPassed) {
    return `DONE · -${formatDistance(Math.abs(distUntilAction), speedUnit)}`;
  }

  const distLabel = formatDistance(distUntilAction, speedUnit);
  if (speedMS > 2) {
    const secondsUntil = distUntilAction / speedMS;
    if (secondsUntil < 300) {
      const min = Math.floor(secondsUntil / 60);
      const sec = Math.floor(secondsUntil % 60);
      const timeStr = min > 0 ? `${min}m ${sec}s` : `${sec}s`;
      return `${distLabel} · ${timeStr}`;
    }
  }
  return distLabel;
}
