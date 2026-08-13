import type { AgentBrakeContext, BrakePlanStep } from '@nexus/kernel';
import {
  DEFAULT_MAX_BRAKE_DECEL,
  MIN_LEARNED_SAMPLES,
  PLANNING_DECEL_AVG_WEIGHT,
  PLANNING_DECEL_STATION_AVG_WEIGHT,
  TARGET_CLUSTER_GAP_M,
  applyZoneMarginM,
  displaySpeedToMs,
  gravityAcceleration,
  isInApplyZone,
  lagFactor,
  massFactor,
} from './physics';
import { resolveAgentConfig } from './agentConfig';
import { signalRequiresFullStop } from './signalUtils';
import { scheduleReactionScale, scheduleSlackSec, scheduleCoastAllowanceM } from './schedule';
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

/** Menor distStart = frenar antes (más urgente). */
export function brakePlanUrgencyScore(plan: BrakePlan): number {
  const step = plan.activeStep;
  if (!step) return Number.POSITIVE_INFINITY;
  return step.distStart;
}

export function targetsAreClustered(
  limitDistM: number,
  stationDistM: number,
  clusterGapM = TARGET_CLUSTER_GAP_M,
): boolean {
  if (limitDistM <= 0 || stationDistM <= 0) return false;
  return Math.abs(stationDistM - limitDistM) <= clusterGapM;
}

function targetKindPriority(kind: BrakeTargetKind): number {
  if (kind === 'SIGNAL') return 0;
  if (kind === 'SPEED_LIMIT') return 1;
  return 2;
}

/** Señal en parada gana al cartel si comparten bloque de frenada. */
function shouldPreferSignalOverLimit(
  plan: BrakePlan,
  other: BrakePlan,
  snapshot: {
    limits: { next: { distanceM: number } | null };
    signaling: { distanceM: number };
  },
): boolean {
  if (plan.targetKind !== 'SIGNAL' || other.targetKind !== 'SPEED_LIMIT') return false;
  const limitDist = snapshot.limits.next?.distanceM;
  if (limitDist == null || limitDist <= 0) return false;
  const signalDist = snapshot.signaling.distanceM;
  if (signalDist <= 0) return false;
  return signalDist <= limitDist + TARGET_CLUSTER_GAP_M;
}

/** Elige el plan que exige frenar antes; desempate: señal → límite → estación. */
export function selectUrgentBrakePlan(
  candidates: BrakePlan[],
  snapshot?: {
    limits: { next: { distanceM: number } | null };
    station: { distanceM: number };
    signaling: { distanceM: number };
  },
): BrakePlan | null {
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];

  let pool = candidates;
  if (snapshot) {
    const limitDist = snapshot.limits.next?.distanceM;
    const stationDist = snapshot.station.distanceM;
    const hasLimit = pool.some(p => p.targetKind === 'SPEED_LIMIT');
    const hasStation = pool.some(p => p.targetKind === 'STATION');
    if (
      hasLimit
      && hasStation
      && limitDist != null
      && limitDist > 0
      && stationDist > 0
      && targetsAreClustered(limitDist, stationDist)
    ) {
      pool = pool.filter(p => p.targetKind !== 'STATION');
    }
  }
  if (pool.length === 1) return pool[0];

  return pool.reduce((best, plan) => {
    if (snapshot) {
      if (shouldPreferSignalOverLimit(plan, best, snapshot)) return plan;
      if (shouldPreferSignalOverLimit(best, plan, snapshot)) return best;
    }
    const bestScore = brakePlanUrgencyScore(best);
    const planScore = brakePlanUrgencyScore(plan);
    if (planScore < bestScore - 5) return plan;
    if (bestScore < planScore - 5) return best;
    const planPri = targetKindPriority(plan.targetKind);
    const bestPri = targetKindPriority(best.targetKind);
    if (planPri !== bestPri) return planPri < bestPri ? plan : best;
    return plan.distanceToTargetM < best.distanceToTargetM ? plan : best;
  });
}

export function formatClusteredBrakeDetail(
  snapshot: {
    limits: { next: { speed: number; distanceM: number } | null; effective: number };
    station: { distanceM: number; nameOcr?: string };
    speedUnit: 'MPH' | 'km/h';
  },
  plan: BrakePlan,
): string | null {
  const limit = snapshot.limits.next;
  const stationDist = snapshot.station.distanceM;
  if (!limit || limit.distanceM <= 0 || stationDist <= 0) return null;
  if (!targetsAreClustered(limit.distanceM, stationDist)) return null;

  const stationName = snapshot.station.nameOcr || 'estación';
  const step = plan.activeStep;
  const actionIn = step
    ? (step.applyNow || step.distStart <= 0
      ? 'ahora'
      : `en ~${Math.round(step.metersUntilActionM ?? step.distStart)} m`)
    : '—';
  return (
    `Límite ${Math.round(snapshot.limits.effective)}→${Math.round(limit.speed)} `
    + `${snapshot.speedUnit} a ${Math.round(limit.distanceM)} m · `
    + `${stationName} a ${Math.round(stationDist)} m · frenada ${actionIn}`
  );
}

/** Salida lenta con distancia OCR residual (20–80 m) — no frenar de nuevo. */
export function isStalePlatformDeparture(
  snapshot: {
    speedMs: number;
    station: { distanceM: number };
    brake?: { combined: number };
  },
  stationCfg: ReturnType<typeof resolveAgentConfig>['station'],
): boolean {
  const distanceM = snapshot.station.distanceM;
  if (distanceM <= stationCfg.finalStopMaxDistanceM) return false;
  if (distanceM > stationCfg.dwellMaxDistanceM) return false;
  if (!hasThrottleApplied(snapshot.brake)) return false;
  if (snapshot.speedMs <= stationCfg.finalStopSpeedMs) return false;
  return snapshot.speedMs < stationCfg.departureSpeedMs;
}

const TURNAROUND_DEPARTURE_MAX_DIST_M = 150;
const TURNAROUND_DEPARTURE_MAX_TRAVELED_M = 250;
const BAD_ANCHOR_DWELL_MAX_TRAVELED_M = 15;
const SHORT_TURNAROUND_ANCHOR_MAX_M = 200;
const SHORT_TURNAROUND_MAX_TRAVELED_M = 100;

function hasThrottleApplied(brake?: { combined: number }): boolean {
  return brake != null && brake.combined > 0.05;
}

/**
 * Tras giro de cabina en cabecera: ancla OCR residual (~97 m) o salida con tracción
 * hace que el odómetro “acercarse” de nuevo a la estación — no planificar frenada.
 */
export function shouldSuppressStationBrakingForDeparture(
  snapshot: {
    speedMs: number;
    station: { distanceM: number; traveledM?: number; anchorM?: number };
    brake?: { combined: number };
  },
  stationCfg: ReturnType<typeof resolveAgentConfig>['station'],
): boolean {
  if (isStalePlatformDeparture(snapshot, stationCfg)) return true;

  const distanceM = snapshot.station.distanceM;
  const traveled = snapshot.station.traveledM ?? 0;
  const anchorM = snapshot.station.anchorM;
  const throttle = hasThrottleApplied(snapshot.brake);

  // Ancla corta tras giro en cabecera (p. ej. 129 m al cerrar puertas) — ignorar estación.
  if (
    anchorM != null
    && anchorM > 0
    && anchorM < SHORT_TURNAROUND_ANCHOR_MAX_M
    && traveled <= SHORT_TURNAROUND_MAX_TRAVELED_M
  ) {
    return true;
  }

  // Salida en cabecera con distancia ~0 (llegada completa) y tracción.
  if (
    distanceM <= stationCfg.finalStopMaxDistanceM
    && throttle
    && snapshot.speedMs > stationCfg.finalStopSpeedMs
  ) {
    return true;
  }

  // Parado con ancla errónea (p. ej. 97 m) — no frenar hacia estación fantasma.
  if (
    distanceM > stationCfg.dwellMaxDistanceM
    && distanceM <= TURNAROUND_DEPARTURE_MAX_DIST_M
    && traveled < BAD_ANCHOR_DWELL_MAX_TRAVELED_M
    && snapshot.speedMs <= stationCfg.holdMaxSpeedMs
  ) {
    return true;
  }

  // Salida tras giro: poco recorrido desde ancla + tracción — alejándose, no acercándose.
  if (
    distanceM > stationCfg.finalStopMaxDistanceM
    && distanceM <= TURNAROUND_DEPARTURE_MAX_DIST_M
    && traveled <= TURNAROUND_DEPARTURE_MAX_TRAVELED_M
    && throttle
    && snapshot.speedMs > stationCfg.finalStopSpeedMs
  ) {
    return true;
  }

  return false;
}

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

/** Decel para planificar: blend avg/max — estación favorece max (más agresivo). */
export function planningDecelFromStats(
  entry: BrakeStatsEntry,
  targetKind: BrakeTargetKind = 'SPEED_LIMIT',
): number {
  const weight = targetKind === 'STATION' || targetKind === 'SIGNAL'
    ? PLANNING_DECEL_STATION_AVG_WEIGHT
    : PLANNING_DECEL_AVG_WEIGHT;
  const { avg_decel: avg, max_decel: max } = entry;
  if (max != null && max > avg) {
    return avg * weight + max * (1 - weight);
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
  targetKind: BrakeTargetKind = 'SPEED_LIMIT',
): number {
  const learned = brakeStats[notchLabel];
  if (learned && learned.samples >= MIN_LEARNED_SAMPLES) {
    return planningDecelFromStats(learned, targetKind);
  }
  const grav = gravityAcceleration(gradientPermille);
  return (baseDecel * fraction) / (massFactor(massT) * lagFactor(consistType)) + grav;
}

function reactionTimeForTarget(
  targetKind: BrakeTargetKind,
  profile: BrakePlanProfile | null | undefined,
): number | undefined {
  const physics = profile?.physics_config;
  if (targetKind === 'STATION' || targetKind === 'SIGNAL') {
    return physics?.station_reaction_time_s ?? physics?.reaction_time_s;
  }
  return physics?.reaction_time_s;
}

/** A baja velocidad y poco delta, el margen fijo de 3 s es demasiado conservador. */
function lowSpeedReactionScale(speedMs: number, targetSpeedMs: number): number {
  if (speedMs <= 0.5) return 1;
  const delta = Math.max(0, speedMs - targetSpeedMs);
  const ratio = delta / speedMs;
  return Math.max(0.35, Math.min(1, ratio / 0.4));
}

export function brakingDistanceM(
  speedMs: number,
  targetSpeedMs: number,
  decelMs2: number,
): number {
  if (decelMs2 <= 0) return Infinity;
  return (speedMs ** 2 - targetSpeedMs ** 2) / (2 * decelMs2);
}

function listServiceNotches(
  profile?: BrakePlanProfile | null,
  order: 'asc' | 'desc' = 'asc',
): { value: number; label: string }[] {
  const notches = profile?.specs?.notches_throttle_brake
    ?.filter(n => n.value < 0 && n.value > -1.0) ?? [];
  return order === 'asc'
    ? [...notches].sort((a, b) => a.value - b.value)
    : [...notches].sort((a, b) => b.value - a.value);
}

export function buildServicePhases(profile: BrakePlanProfile | null | undefined): {
  fraction: number;
  notchLabel: string;
  label: string;
}[] {
  const serviceNotches = listServiceNotches(profile);

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

export function notchStrength(
  notch: string,
  profile?: BrakePlanProfile | null,
): number {
  const uk: Record<string, number> = { B3: 3, B2: 2, B1: 1 };
  if (notch in uk) return uk[notch];

  const entry = profile?.specs?.notches_throttle_brake?.find(n => n.label === notch);
  if (entry && entry.value < 0 && entry.value > -0.99) {
    return Math.round(Math.abs(entry.value) * 10);
  }
  return 0;
}

export function moderateServiceNotchLabel(
  profile?: BrakePlanProfile | null,
): string {
  const service = listServiceNotches(profile);
  if (!service.length) return 'B2';
  const mid = service[Math.floor((service.length - 1) / 2)];
  return mid?.label ?? 'B2';
}

export function weakestServiceNotchLabel(
  profile?: BrakePlanProfile | null,
): string {
  return listServiceNotches(profile, 'desc')[0]?.label ?? 'B1';
}

function preferWeakestStep(
  steps: BrakePlanStepDetail[],
  profile?: BrakePlanProfile | null,
): BrakePlanStepDetail {
  return steps.reduce((best, step) =>
    notchStrength(step.notch, profile) < notchStrength(best.notch, profile) ? step : best,
  );
}

function preferStrongestStep(
  steps: BrakePlanStepDetail[],
  profile?: BrakePlanProfile | null,
): BrakePlanStepDetail {
  return steps.reduce((best, step) =>
    notchStrength(step.notch, profile) > notchStrength(best.notch, profile) ? step : best,
  );
}

function applyZoneForStep(speedMs: number, step: BrakePlanStepDetail): number {
  return applyZoneMarginM(speedMs, step.applyAtRemainingM);
}

/** Estación: B2 por defecto, B3 si tarde/cerca, aprovechar holgura de horario. */
export function selectStationActiveStep(
  steps: BrakePlanStepDetail[],
  speedMs: number,
  distanceToTargetM: number,
  scheduleEta?: string,
  now = new Date(),
  profile?: BrakePlanProfile | null,
): BrakePlanStepDetail | null {
  if (!steps.length) return null;

  const moderateLabel = moderateServiceNotchLabel(profile);
  const slackSec = scheduleSlackSec(distanceToTargetM, speedMs, scheduleEta, now);
  const coastingForSchedule = slackSec != null && slackSec > 18 && distanceToTargetM > 300;

  if (coastingForSchedule) {
    const notYet = steps
      .filter(s => s.distStart > 0)
      .sort((a, b) => a.distStart - b.distStart);
    if (notYet.length) {
      const moderate = notYet.find(s => s.notch === moderateLabel);
      if (moderate) return moderate;
      return preferWeakestStep(notYet, profile);
    }
  }

  const due = steps.filter(s => s.distStart <= 0);
  const inZone = steps.filter(s => {
    const zone = applyZoneForStep(speedMs, s);
    return isInApplyZone(s.distStart, zone);
  });
  const upcoming = steps
    .filter(s => s.distStart > 0)
    .sort((a, b) => a.distStart - b.distStart);

  const moderateOrStronger = (candidates: BrakePlanStepDetail[]) =>
    candidates.filter(s => notchStrength(s.notch, profile) >= 2);

  const lateForSchedule = slackSec != null && slackSec < -12;
  const finalApproach = distanceToTargetM < 280;
  const terminalZone = distanceToTargetM < 50;

  if (terminalZone) {
    const pool = moderateOrStronger([...due, ...inZone, ...upcoming]);
    if (pool.length) return preferStrongestStep(pool, profile);
    return preferStrongestStep(steps, profile);
  }

  if (finalApproach || lateForSchedule) {
    const pool = moderateOrStronger([...due, ...inZone]);
    if (pool.length) return preferStrongestStep(pool, profile);
    if (upcoming.length) return preferStrongestStep(upcoming, profile);
    return preferStrongestStep(steps, profile);
  }

  if (distanceToTargetM < 380 && upcoming.length > 0 && upcoming[0].distStart < 60) {
    return preferStrongestStep(upcoming, profile);
  }

  if (due.length || inZone.length) {
    const pool = [...due, ...inZone];
    const service = moderateOrStronger(pool);
    if (service.length) {
      const moderate = service.filter(s => s.notch === moderateLabel);
      if (moderate.length) return preferWeakestStep(moderate, profile);
      return preferStrongestStep(service, profile);
    }
    return preferWeakestStep(pool, profile);
  }

  return steps.find(s => s.notch === moderateLabel) ?? upcoming[0] ?? steps[0];
}

export function selectActiveStep(
  steps: BrakePlanStepDetail[],
  speedMs: number,
  targetKind: BrakeTargetKind = 'SPEED_LIMIT',
  distanceToTargetM = 0,
  scheduleEta?: string,
  now = new Date(),
  profile?: BrakePlanProfile | null,
): BrakePlanStepDetail | null {
  if (!steps.length) return null;

  if (targetKind === 'STATION' || targetKind === 'SIGNAL') {
    return selectStationActiveStep(steps, speedMs, distanceToTargetM, scheduleEta, now, profile);
  }

  const late = steps.filter(s => s.distStart < 0);
  if (late.length) {
    return preferStrongestStep(late, profile);
  }

  const applicable = steps.filter(s => {
    const zone = applyZoneForStep(speedMs, s);
    return s.distStart <= zone;
  });
  if (applicable.length > 0) {
    return preferWeakestStep(applicable, profile);
  }

  const upcoming = steps
    .filter(s => {
      const zone = applyZoneForStep(speedMs, s);
      return s.distStart > zone;
    })
    .sort((a, b) => a.distStart - b.distStart);
  if (upcoming.length > 0) {
    return preferWeakestStep(upcoming, profile);
  }

  return steps[steps.length - 1] ?? null;
}

export function planBrake(
  input: PlanBrakeInput,
  targetKind: BrakeTargetKind,
  scheduleEta?: string,
  now = new Date(),
): BrakePlan | null {
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
  let reaction = reactionMarginM(
    speedMs,
    fillTimeSecs,
    reactionTimeForTarget(targetKind, profile),
  );

  if (targetKind === 'STATION') {
    reaction *= scheduleReactionScale(distanceToTargetM, speedMs, scheduleEta, now);
    const terminalM = resolveAgentConfig(profile).station.terminalApproachDistanceM;
    if (distanceToTargetM < terminalM) {
      const t = Math.max(0, distanceToTargetM / terminalM);
      reaction *= 0.45 + 0.55 * t;
    }
  } else if (targetKind !== 'SIGNAL') {
    reaction *= lowSpeedReactionScale(speedMs, targetSpeedMs);
  }

  const phases = buildServicePhases(profile);
  const coastAllowanceM = targetKind === 'STATION'
    ? scheduleCoastAllowanceM(distanceToTargetM, speedMs, scheduleEta, now)
    : 0;

  const steps: BrakePlanStepDetail[] = phases.map(phase => {
    const decel = decelForNotch(
      phase.fraction,
      phase.notchLabel,
      baseDecel,
      massT,
      consistType,
      gradientPermille,
      brakeStats,
      targetKind,
    );
    const distNeeded = brakingDistanceM(speedMs, targetSpeedMs, decel);
    const applyAtRemainingM = distNeeded + reaction;
    const distStart = distanceToTargetM - applyAtRemainingM + coastAllowanceM;
    const learned = brakeStats[phase.notchLabel];
    const usingLearned = !!(learned && learned.samples >= MIN_LEARNED_SAMPLES);
    const applyZoneM = applyZoneMarginM(speedMs, applyAtRemainingM);

    return {
      notch: phase.notchLabel,
      phase: phase.label,
      distanceM: distNeeded,
      applyAtRemainingM,
      distStart,
      metersUntilActionM: Math.max(0, distStart),
      usingLearned,
      applyNow: isInApplyZone(distStart, applyZoneM),
    };
  });

  return {
    targetKind,
    distanceToTargetM,
    targetSpeedMs,
    reactionMarginM: reaction,
    steps,
    activeStep: targetKind === 'STATION' || targetKind === 'SIGNAL'
      ? selectStationActiveStep(steps, speedMs, distanceToTargetM, scheduleEta, now, profile)
      : selectActiveStep(steps, speedMs, targetKind, distanceToTargetM, scheduleEta, now, profile),
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
    targetKind: plan.targetKind,
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

function pickFinalStopNotch(speedMs: number, notches: { label: string }[]): string {
  const strongest = notches[0]?.label ?? 'B3';
  if (speedMs > 4) return strongest;
  if (speedMs > 1.5) return notches[1]?.label ?? 'B2';
  return notches[2]?.label ?? 'B1';
}

function buildImmediateStopPlan(
  targetKind: 'STATION' | 'SIGNAL',
  distanceM: number,
  speedMs: number,
  profile?: BrakePlanProfile | null,
): BrakePlan {
  const notch = pickFinalStopNotch(speedMs, listServiceNotches(profile));
  const step: BrakePlanStepDetail = {
    notch,
    phase: 'stop',
    distanceM: 0,
    applyAtRemainingM: distanceM,
    distStart: 0,
    metersUntilActionM: 0,
    usingLearned: false,
    applyNow: true,
  };
  return {
    targetKind,
    distanceToTargetM: distanceM,
    targetSpeedMs: 0,
    reactionMarginM: 0,
    steps: [step],
    activeStep: step,
    isRealTarget: true,
  };
}

export function planStationFinalStop(
  snapshot: {
    speedMs: number;
    station: { distanceM: number };
    brake?: { combined: number };
  },
  ctx: SnapshotBrakeContext = {},
): BrakePlan | null {
  const { distanceM } = snapshot.station;
  const agent = resolveAgentConfig(ctx.commandProfile ?? ctx.profile);
  const { station: stationCfg } = agent;
  if (distanceM > stationCfg.finalStopMaxDistanceM || distanceM < stationCfg.platformTailM) return null;
  if (snapshot.speedMs <= stationCfg.finalStopSpeedMs) return null;
  const throttle = hasThrottleApplied(snapshot.brake);
  // Salida del andén con distancia aún en 0 — no frenar de nuevo (giro de cabina / reverser).
  if (
    distanceM <= stationCfg.finalStopMaxDistanceM
    && throttle
    && snapshot.speedMs > stationCfg.finalStopSpeedMs
  ) {
    return null;
  }
  // Salida rápida (Lua no actualizó distancia).
  if (
    distanceM <= 5
    && snapshot.speedMs > stationCfg.departureSpeedMs
  ) {
    return null;
  }

  return buildImmediateStopPlan('STATION', distanceM, snapshot.speedMs, ctx.profile);
}

export function planBrakeForStation(
  snapshot: {
    speedMs: number;
    gradient: number;
    train: { massT: number; lengthM: number; consistType?: number };
    station: { distanceM: number; eta?: string; traveledM?: number; anchorM?: number };
    brake?: { combined: number };
  },
  ctx: SnapshotBrakeContext = {},
): BrakePlan | null {
  const agent = resolveAgentConfig(ctx.commandProfile ?? ctx.profile);
  if (snapshot.station.distanceM < 0) return null;
  if (shouldSuppressStationBrakingForDeparture(snapshot, agent.station)) return null;

  const finalStop = planStationFinalStop(snapshot, ctx);
  if (finalStop) return finalStop;

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
    snapshot.station.eta,
  );
}

export function planSignalFinalStop(
  snapshot: {
    speedMs: number;
    signaling: { distanceM: number; aspect: string };
  },
  ctx: SnapshotBrakeContext = {},
): BrakePlan | null {
  if (!signalRequiresFullStop(snapshot.signaling.aspect)) return null;

  const { distanceM } = snapshot.signaling;
  const agent = resolveAgentConfig(ctx.commandProfile ?? ctx.profile);
  const { station: stationCfg } = agent;
  if (distanceM > stationCfg.finalStopMaxDistanceM || distanceM < stationCfg.platformTailM) return null;
  if (snapshot.speedMs <= stationCfg.finalStopSpeedMs) return null;

  return buildImmediateStopPlan('SIGNAL', distanceM, snapshot.speedMs, ctx.profile);
}

export function planBrakeForSignal(
  snapshot: {
    speedMs: number;
    gradient: number;
    train: { massT: number; lengthM: number; consistType?: number };
    signaling: { distanceM: number; aspect: string };
  },
  ctx: SnapshotBrakeContext = {},
): BrakePlan | null {
  if (!signalRequiresFullStop(snapshot.signaling.aspect)) return null;

  const finalStop = planSignalFinalStop(snapshot, ctx);
  if (finalStop) return finalStop;

  if (snapshot.signaling.distanceM <= 0) return null;

  return planBrake(
    {
      speedMs: snapshot.speedMs,
      distanceToTargetM: snapshot.signaling.distanceM,
      targetSpeedMs: 0,
      massT: snapshot.train.massT,
      lengthM: snapshot.train.lengthM,
      gradientPermille: snapshot.gradient,
      consistType: ctx.consistType ?? snapshot.train.consistType,
      profile: ctx.profile,
      brakeStats: ctx.brakeStats,
      isRealTarget: true,
    },
    'SIGNAL',
  );
}
