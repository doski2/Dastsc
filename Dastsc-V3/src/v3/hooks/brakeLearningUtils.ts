import { TelemetryData } from '../core/TelemetryContext';
import { ProfileSummary } from '../core/TelemetryContext';
import {
  BrakeNotch,
  brakeApiUrl,
  profileId,
  TrainProfile,
} from '../components/display/brakingCurveUtils';

export const MIN_SPEED_TO_START_MS = 2.0;
export const DECEL_THRESHOLD_MS2 = 0.05;
export const CONFIRM_SECS = 1.5;
export const RELEASE_SECS = 3.0;
export const MIN_DURATION_SECS = 5.0;
export const MIN_DECEL_AVG_MS2 = 0.10;
export const MAX_DURATION_SECS = 240;
export const MAX_PHYSICAL_DECEL_MS2 = 3.5;
export const MIN_STOP_SPEED_MS = 0.5;
export const MIN_DT_S = 0.016;
export const NOTCH_TOLERANCE = 0.05;

export interface BrakeSample {
  speed: number;
  decel: number;
  trip: number;
  notch: string;
  t: number;
}

export interface ActiveBrakeEvent {
  confirmStartT: number;
  confirmed: boolean;
  startSpeed: number;
  startTrip: number;
  samples: BrakeSample[];
  lastDecelT: number;
}

export interface BrakeEventPayload {
  start_speed_ms: number;
  end_speed_ms: number;
  avg_decel_ms2: number;
  max_decel_ms2: number;
  notch: string;
  duration_s: number;
  distance_m: number;
  gradient: number;
  train_mass: number;
  train_length: number;
  profile: string;
  loco: string;
  timestamp?: number;
}

export type LearningProfile = (TrainProfile | ProfileSummary) & {
  specs?: { notches_throttle_brake?: BrakeNotch[] };
} | null | undefined;

export function estimateBrakeNotch(
  combinedControl: number,
  profile?: LearningProfile,
): string {
  const val = combinedControl ?? 0;
  const notches = profile?.specs?.notches_throttle_brake as BrakeNotch[] | undefined;

  if (notches?.length) {
    const brakeNotches = notches
      .filter(n => n.value < 0)
      .sort((a, b) => a.value - b.value);

    for (const notch of brakeNotches) {
      if (val <= notch.value + NOTCH_TOLERANCE) return notch.label;
    }
    if (brakeNotches.length && val < -NOTCH_TOLERANCE) {
      return brakeNotches[brakeNotches.length - 1].label;
    }
  }

  if (val < -NOTCH_TOLERANCE) return `B${Math.round(Math.abs(val) * 100)}%`;
  return '?';
}

export function computeDeceleration(
  speed: number,
  prevSpeed: number,
  prevSpeedChangeTime: number,
  now: number,
): { decel: number; prevSpeed: number; prevSpeedChangeTime: number } {
  if (speed === prevSpeed) {
    return { decel: 0, prevSpeed, prevSpeedChangeTime };
  }

  const dt = Math.max(MIN_DT_S, (now - prevSpeedChangeTime) / 1000);
  return {
    decel: (prevSpeed - speed) / dt,
    prevSpeed: speed,
    prevSpeedChangeTime: now,
  };
}

export function dominantBrakeNotch(samples: BrakeSample[]): string {
  const notchCount: Record<string, number> = {};
  for (const sample of samples) {
    if (sample.notch === '?' || sample.decel < DECEL_THRESHOLD_MS2) continue;
    notchCount[sample.notch] = (notchCount[sample.notch] ?? 0) + 1;
  }
  return Object.entries(notchCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '?';
}

export function buildBrakeEventPayload(
  event: ActiveBrakeEvent,
  endSpeed: number,
  profile: LearningProfile,
  context: {
    gradient: number;
    trainMass: number;
    trainLength: number;
    loco: string;
  },
): BrakeEventPayload | null {
  const samples = event.samples;
  if (!samples.length) return null;

  const duration = (samples[samples.length - 1].t - samples[0].t) / 1000;
  if (duration < MIN_DURATION_SECS) return null;

  const decels = samples
    .map(s => s.decel)
    .filter(d => d > 0 && d <= MAX_PHYSICAL_DECEL_MS2);
  if (!decels.length) return null;

  const avgDecel = decels.reduce((a, b) => a + b, 0) / decels.length;
  if (avgDecel < MIN_DECEL_AVG_MS2) return null;

  const notch = dominantBrakeNotch(samples);
  if (notch === '?') return null;

  const distanceCovered = Math.abs(
    (samples[samples.length - 1].trip ?? 0) - (event.startTrip ?? 0),
  );

  return {
    start_speed_ms: parseFloat(event.startSpeed.toFixed(2)),
    end_speed_ms: parseFloat(endSpeed.toFixed(2)),
    avg_decel_ms2: parseFloat(avgDecel.toFixed(3)),
    max_decel_ms2: parseFloat(Math.max(...decels).toFixed(3)),
    notch,
    duration_s: parseFloat(duration.toFixed(1)),
    distance_m: parseFloat(distanceCovered.toFixed(0)),
    gradient: parseFloat((context.gradient ?? 0).toFixed(2)),
    train_mass: context.trainMass ?? 0,
    train_length: context.trainLength ?? 0,
    profile: profileId(profile) || 'unknown',
    loco: context.loco ?? '',
    timestamp: Date.now() / 1000,
  };
}

export async function postBrakeEvent(payload: BrakeEventPayload): Promise<boolean> {
  try {
    const res = await fetch(brakeApiUrl('/api/brake/event'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return res.ok && !!data.ok;
  } catch {
    return false;
  }
}

export interface BrakeLearningRefs {
  prevSpeed: number;
  prevSpeedChangeTime: number;
  activeEvent: ActiveBrakeEvent | null;
}

export interface BrakeLearningTickResult {
  refs: BrakeLearningRefs;
  submit: { event: ActiveBrakeEvent; endSpeed: number } | null;
}

export function tickBrakeLearning(
  refs: BrakeLearningRefs,
  raw: Pick<TelemetryData, 'Speed' | 'TripDistance' | 'CombinedControl'>,
  profile: LearningProfile,
  now: number,
): BrakeLearningTickResult {
  const { decel, prevSpeed, prevSpeedChangeTime } = computeDeceleration(
    raw.Speed,
    refs.prevSpeed,
    refs.prevSpeedChangeTime,
    now,
  );

  const sample: BrakeSample = {
    speed: raw.Speed,
    decel,
    trip: raw.TripDistance ?? 0,
    notch: estimateBrakeNotch(raw.CombinedControl, profile),
    t: now,
  };

  let activeEvent = refs.activeEvent;
  let submit: { event: ActiveBrakeEvent; endSpeed: number } | null = null;

  if (!activeEvent) {
    if (raw.Speed > MIN_SPEED_TO_START_MS && decel >= DECEL_THRESHOLD_MS2) {
      activeEvent = {
        confirmStartT: now,
        confirmed: false,
        startSpeed: raw.Speed,
        startTrip: raw.TripDistance ?? 0,
        samples: [sample],
        lastDecelT: now,
      };
    }
  } else {
    if (decel > 0) activeEvent.lastDecelT = now;
    activeEvent.samples.push(sample);

    if (!activeEvent.confirmed && (now - activeEvent.confirmStartT) / 1000 >= CONFIRM_SECS) {
      activeEvent.confirmed = true;
    }

    const stopped = raw.Speed < MIN_STOP_SPEED_MS;
    const releasedTooLong = (now - activeEvent.lastDecelT) / 1000 > RELEASE_SECS;
    const tooLong = (now - activeEvent.samples[0].t) / 1000 > MAX_DURATION_SECS;

    if (stopped || releasedTooLong || tooLong) {
      if (activeEvent.confirmed) {
        submit = { event: activeEvent, endSpeed: raw.Speed };
      }
      activeEvent = null;
    }
  }

  return {
    refs: { prevSpeed, prevSpeedChangeTime, activeEvent },
    submit,
  };
}
