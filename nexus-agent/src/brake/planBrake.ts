import type { AgentBrakeContext, BrakePlanStep } from '@nexus/kernel';
import {
  APPLY_NOW_MARGIN_M,
  DEFAULT_MAX_BRAKE_DECEL,
  MIN_LEARNED_SAMPLES,
  PLANNING_DECEL_AVG_WEIGHT,
  displaySpeedToMs,
  gravityAcceleration,
  lagFactor,
  massFactor,
} from './physics';
import type {
  BrakePlan,
  BrakePlanProfile,
  BrakePlanStepDetail,
  BrakeStatsByNotch,
  BrakeStatsEntry,
  BrakeTargetKind,
  PlanBrakeInput,
  SnapshotBrakeContext,
} from './types';

export function reactionMarginM(
  speedMs: number,
  fillTimeSecs: number,
  reactionTimeOverride?: number,
): number {
  if (reactionTimeOverride != null && reactionTimeOverride > 0) {
    return speedMs * reactionTimeOverride;
  }
  return speedMs * Math.min(4.0, 1.5 + fillTimeSecs);
}

/** Decel para planificar: blend avg/max — la media de sesiones suele ser conservadora. */
export function planningDecelFromStats(entry: BrakeStatsEntry): number {
  const { avg_decel: avg, max_decel: max } = entry;
  if (max != null && max > avg) {
    return avg * PLANNING_DECEL_AVG_WEIGHT + max * (1 - PLANNING_DECEL_AVG_WEIGHT);
  }
  return avg;
}

export function decelForNotch(
  fraction: number,
  notchLabel: string,
  baseDecel: number,
  massT: number,
  consistType: number,
  gradientPermille: number,
  brakeStats: BrakeStatsByNotch,
): number {
  const learned = brakeStats[notchLabel];
  if (learned && learned.samples >= MIN_LEARNED_SAMPLES) {
    return planningDecelFromStats(learned);
  }
  const grav = gravityAcceleration(gradientPermille);
  return (baseDecel * fraction) / (massFactor(massT) * lagFactor(consistType)) + grav;
}

export function brakingDistanceM(
  speedMs: number,
  targetSpeedMs: number,
  decelMs2: number,
): number {
  if (decelMs2 <= 0) return Infinity;
  return (speedMs ** 2 - targetSpeedMs ** 2) / (2 * decelMs2);
}

export function buildServicePhases(profile: BrakePlanProfile | null | undefined): {
  fraction: number;
  notchLabel: string;
  label: string;
}[] {
  const serviceNotches = profile?.specs?.notches_throttle_brake
    ?.filter(n => n.value < 0 && n.value > -1.0)
    .sort((a, b) => a.value - b.value) ?? [];

  if (serviceNotches.length >= 1) {
    const total = serviceNotches.length;
    const picks = total <= 4
      ? Array.from({ length: total }, (_, i) => i)
      : [0, Math.floor(total * 0.33), Math.floor(total * 0.66), total - 1];

    return picks.map((idx, i) => ({
      fraction: Math.abs(serviceNotches[idx].value),
      notchLabel: serviceNotches[idx].label,
      label: String(i + 1),
    }));
  }

  return [
    { fraction: 0.30, notchLabel: '30%', label: '1' },
    { fraction: 0.55, notchLabel: '55%', label: '2' },
    { fraction: 0.80, notchLabel: '80%', label: '3' },
  ];
}

export function selectActiveStep(steps: BrakePlanStepDetail[]): BrakePlanStepDetail | null {
  if (!steps.length) return null;

  const inZone = steps.filter(
    s => s.distStart <= APPLY_NOW_MARGIN_M && s.distStart >= -APPLY_NOW_MARGIN_M,
  );
  if (inZone.length > 0) {
    return inZone.reduce((best, step) =>
      Math.abs(step.distStart) < Math.abs(best.distStart) ? step : best,
    );
  }

  const upcoming = steps
    .filter(s => s.distStart > APPLY_NOW_MARGIN_M)
    .sort((a, b) => a.distStart - b.distStart);
  if (upcoming.length > 0) return upcoming[0];

  return steps[steps.length - 1] ?? null;
}

export function planBrake(input: PlanBrakeInput, targetKind: BrakeTargetKind): BrakePlan | null {
  const {
    speedMs,
    distanceToTargetM,
    targetSpeedMs,
    massT,
    gradientPermille,
    consistType = 1,
    profile,
    brakeStats = {},
    isRealTarget = true,
  } = input;

  if (speedMs < 0.5 || distanceToTargetM == null || speedMs <= targetSpeedMs) return null;
  if (distanceToTargetM < -10 && isRealTarget) return null;

  const baseDecel = profile?.physics_config?.max_braking_decel ?? DEFAULT_MAX_BRAKE_DECEL;
  const fillTimeSecs = profile?.physics_config?.brake_fill_time_s ?? 2.5;
  const reaction = reactionMarginM(
    speedMs,
    fillTimeSecs,
    profile?.physics_config?.reaction_time_s,
  );
  const phases = buildServicePhases(profile);

  const steps: BrakePlanStepDetail[] = phases.map(phase => {
    const decel = decelForNotch(
      phase.fraction,
      phase.notchLabel,
      baseDecel,
      massT,
      consistType,
      gradientPermille,
      brakeStats,
    );
    const distNeeded = brakingDistanceM(speedMs, targetSpeedMs, decel);
    const applyAtRemainingM = distNeeded + reaction;
    const distStart = distanceToTargetM - applyAtRemainingM;
    const learned = brakeStats[phase.notchLabel];
    const usingLearned = !!(learned && learned.samples >= MIN_LEARNED_SAMPLES);

    return {
      notch: phase.notchLabel,
      phase: phase.label,
      distanceM: distNeeded,
      applyAtRemainingM,
      distStart,
      metersUntilActionM: Math.max(0, distStart),
      usingLearned,
      applyNow: distStart <= APPLY_NOW_MARGIN_M && distStart >= -APPLY_NOW_MARGIN_M,
    };
  });

  return {
    targetKind,
    distanceToTargetM,
    targetSpeedMs,
    reactionMarginM: reaction,
    steps,
    activeStep: selectActiveStep(steps),
    isRealTarget,
  };
}

export function toKernelBrakeSteps(plan: BrakePlan): BrakePlanStep[] {
  return plan.steps.map(step => ({
    notch: step.notch,
    phase: step.phase,
    distanceM: step.distanceM,
    distStart: step.distStart,
    metersUntilActionM: step.metersUntilActionM,
    usingLearned: step.usingLearned,
    applyNow: step.applyNow,
  }));
}

export function toAgentBrakeContext(plan: BrakePlan, gradientPermille: number): AgentBrakeContext {
  return {
    targetKind: plan.targetKind === 'SIGNAL' ? 'SPEED_LIMIT' : plan.targetKind,
    distanceToTargetM: plan.distanceToTargetM,
    reactionMarginM: plan.reactionMarginM,
    gradientPermille,
    activeNotch: plan.activeStep?.notch ?? null,
  };
}

export function planBrakeForLimit(
  snapshot: {
    speedMs: number;
    speedDisplay: number;
    speedUnit: 'MPH' | 'km/h';
    gradient: number;
    train: { massT: number; lengthM: number; consistType?: number };
    limits: { next: { speed: number; distanceM: number } | null };
  },
  ctx: SnapshotBrakeContext = {},
): BrakePlan | null {
  const next = snapshot.limits.next;
  if (!next || next.distanceM <= 0) return null;

  return planBrake(
    {
      speedMs: snapshot.speedMs,
      distanceToTargetM: next.distanceM,
      targetSpeedMs: displaySpeedToMs(next.speed, snapshot.speedUnit),
      massT: snapshot.train.massT,
      lengthM: snapshot.train.lengthM,
      gradientPermille: snapshot.gradient,
      consistType: ctx.consistType ?? snapshot.train.consistType,
      profile: ctx.profile,
      brakeStats: ctx.brakeStats,
      isRealTarget: true,
    },
    'SPEED_LIMIT',
  );
}

export function planBrakeForStation(
  snapshot: {
    speedMs: number;
    gradient: number;
    train: { massT: number; lengthM: number; consistType?: number };
    station: { distanceM: number };
  },
  ctx: SnapshotBrakeContext = {},
): BrakePlan | null {
  if (snapshot.station.distanceM <= 0) return null;

  return planBrake(
    {
      speedMs: snapshot.speedMs,
      distanceToTargetM: snapshot.station.distanceM,
      targetSpeedMs: 0,
      massT: snapshot.train.massT,
      lengthM: snapshot.train.lengthM,
      gradientPermille: snapshot.gradient,
      consistType: ctx.consistType ?? snapshot.train.consistType,
      profile: ctx.profile,
      brakeStats: ctx.brakeStats,
      isRealTarget: true,
    },
    'STATION',
  );
}
