import type { AgentAction, TelemetrySnapshot } from '@nexus/kernel';
import {
  applyZoneMarginM,
  COAST_CLEAR_OVERSHOOT_KMH,
  COAST_CLEAR_OVERSHOOT_MPH,
  COAST_REBRAKE_MARGIN_KMH,
  COAST_REBRAKE_MARGIN_MPH,
  isInApplyZone,
  STATION_DWELL_MAX_DISTANCE_M,
  STATION_HOLD_MAX_SPEED_MS,
} from '../brake/physics';
import type { BrakePlan, CommandProfile } from '../brake/types';
import { scheduleSlackSec } from '../brake/schedule';
import { weakestServiceNotchLabel } from '../brake/planBrake';

const DEFAULT_COMBINED_CONTROL = 'ThrottleAndBrake';
const BLOCKED_NOTCH_LABELS = new Set(['EMG', 'EMERGENCY', 'EMERGENCY_BRAKE']);

export function usesSplitBrakeLayout(profile?: CommandProfile | null): boolean {
  const mappings = profile?.mappings;
  if (!mappings?.brake && !mappings?.train_brake) return false;
  return !mappings.combined_control;
}

export function resolveBrakeControlName(profile?: CommandProfile | null): string {
  const mappings = profile?.mappings;
  if (!mappings) return DEFAULT_COMBINED_CONTROL;
  if (mappings.combined_control) return mappings.combined_control;
  return (
    mappings.brake
    ?? mappings.train_brake
    ?? mappings.throttle_brake
    ?? mappings.combined
    ?? DEFAULT_COMBINED_CONTROL
  );
}

/** @deprecated Use resolveBrakeControlName */
export function resolveCombinedControlName(profile?: CommandProfile | null): string {
  return resolveBrakeControlName(profile);
}

export function notchToBrakeValue(
  notchLabel: string,
  profile?: CommandProfile | null,
): number | null {
  if (BLOCKED_NOTCH_LABELS.has(notchLabel.toUpperCase())) return null;
  const notches = profile?.specs?.notches_throttle_brake;
  if (!notches?.length) return null;
  const match = notches.find(n => n.label === notchLabel);
  if (!match) return null;
  if (match.value <= -0.99) return null;

  if (usesSplitBrakeLayout(profile)) {
    if (match.value >= 0) return null;
    return Math.abs(match.value);
  }

  if (match.value >= 0) return null;
  return match.value;
}

/** @deprecated Use notchToBrakeValue */
export function notchToCombinedValue(
  notchLabel: string,
  profile?: CommandProfile | null,
): number | null {
  return notchToBrakeValue(notchLabel, profile);
}

export function buildBrakeCommand(
  notch: string,
  profile?: CommandProfile | null,
): AgentAction | null {
  const value = notchToBrakeValue(notch, profile);
  if (value == null) return null;
  const command = resolveBrakeControlName(profile);
  return {
    command,
    value,
    reason: `Aplicar ${notch}`,
  };
}

export function buildReleaseCommand(profile?: CommandProfile | null): AgentAction | null {
  const notches = profile?.specs?.notches_throttle_brake;
  const off = notches?.find(n =>
    n.value === 0 && (n.label === 'OFF' || n.label === 'NEU'),
  );
  if (!off) return null;
  const command = resolveBrakeControlName(profile);
  return {
    command,
    value: 0,
    reason: 'Soltar freno — objetivo alcanzado',
  };
}

const RELEASE_SPEED_MARGIN_MPH = 2;
const RELEASE_SPEED_MARGIN_KMH = 3;
const BRAKING_COMBINED_THRESHOLD = -0.05;

function isReleaseNotch(notch: string): boolean {
  const upper = notch.toUpperCase();
  return upper === 'OFF' || upper === 'NEU';
}

type SpeedLimitCoastLatch = { limitSpeed: number };

let speedLimitCoast: SpeedLimitCoastLatch | null = null;

/** Solo para tests — reinicia el latch de coast tras límite. */
export function resetSpeedLimitCoastLatch(): void {
  speedLimitCoast = null;
}

function coastRebrakeMargin(unit: TelemetrySnapshot['speedUnit']): number {
  return unit === 'MPH' ? COAST_REBRAKE_MARGIN_MPH : COAST_REBRAKE_MARGIN_KMH;
}

function coastClearOvershoot(unit: TelemetrySnapshot['speedUnit']): number {
  return unit === 'MPH' ? COAST_CLEAR_OVERSHOOT_MPH : COAST_CLEAR_OVERSHOOT_KMH;
}

function latchSpeedLimitCoast(snapshot: TelemetrySnapshot): void {
  const next = snapshot.limits.next;
  if (!next || next.distanceM <= 0) return;
  speedLimitCoast = { limitSpeed: next.speed };
}

function updateSpeedLimitCoastLatch(snapshot: TelemetrySnapshot): void {
  const next = snapshot.limits.next;
  if (!next || next.distanceM <= 0) {
    speedLimitCoast = null;
    return;
  }
  if (speedLimitCoast && speedLimitCoast.limitSpeed !== next.speed) {
    speedLimitCoast = null;
    return;
  }
  if (speedLimitCoast && snapshot.speedDisplay > next.speed + coastClearOvershoot(snapshot.speedUnit)) {
    speedLimitCoast = null;
  }
}

/** Tras un OFF correcto, no re-aplicar freno por inercia / oscilación cerca del cartel. */
function shouldInhibitLimitRebrake(snapshot: TelemetrySnapshot, plan: BrakePlan | null): boolean {
  if (!speedLimitCoast || plan?.targetKind !== 'SPEED_LIMIT') return false;
  const next = snapshot.limits.next;
  if (!next || next.speed !== speedLimitCoast.limitSpeed) return false;
  if (snapshot.brake.combined < BRAKING_COMBINED_THRESHOLD) return false;
  return snapshot.speedDisplay <= next.speed + coastRebrakeMargin(snapshot.speedUnit);
}

function releaseSpeedMargin(unit: TelemetrySnapshot['speedUnit']): number {
  return unit === 'MPH' ? RELEASE_SPEED_MARGIN_MPH : RELEASE_SPEED_MARGIN_KMH;
}

function targetSpeedDisplay(snapshot: TelemetrySnapshot): number {
  return snapshot.limits.next?.speed ?? snapshot.limits.effective;
}

function stepInApplyZone(
  snapshot: TelemetrySnapshot | undefined,
  step: { distStart: number; applyAtRemainingM?: number; applyNow?: boolean },
  plan?: BrakePlan | null,
): boolean {
  if (step.applyNow) return true;
  if (!snapshot) {
    return step.distStart <= 150 && step.distStart >= -150;
  }

  const zone = applyZoneMarginM(snapshot.speedMs, step.applyAtRemainingM ?? 0);

  if (plan?.targetKind === 'STATION') {
    const slackSec = scheduleSlackSec(
      snapshot.station.distanceM,
      snapshot.speedMs,
      snapshot.station.eta,
    );

    if (slackSec != null && slackSec > 15 && step.distStart > 0) {
      return false;
    }

    if (slackSec != null && slackSec < -12) {
      return step.distStart <= zone;
    }
  }

  return isInApplyZone(step.distStart, zone);
}

/** En plataforma (parado o en aproximación final) — no soltar freno para puertas. */
export function isAtStationPlatform(snapshot: TelemetrySnapshot): boolean {
  return (
    snapshot.station.distanceM <= STATION_DWELL_MAX_DISTANCE_M
    && snapshot.station.distanceM >= -20
  );
}

/** Mantener freno de servicio en andén si se soltó antes de abrir puertas. */
function resolveStationHoldAction(
  snapshot: TelemetrySnapshot,
  profile?: CommandProfile | null,
): AgentAction | undefined {
  if (!isAtStationPlatform(snapshot)) return undefined;
  if (snapshot.brake.combined < BRAKING_COMBINED_THRESHOLD) return undefined;
  if (snapshot.speedMs > STATION_HOLD_MAX_SPEED_MS) return undefined;

  const hold = buildBrakeCommand(weakestServiceNotchLabel(profile), profile);
  if (!hold) return undefined;
  return { ...hold, reason: 'Mantener freno en andén' };
}

/** Soltar freno (OFF) cuando la velocidad objetivo ya se alcanzó. */
export function resolveReleaseAction(
  snapshot: TelemetrySnapshot,
  plan: BrakePlan | null,
  profile?: CommandProfile | null,
): AgentAction | undefined {
  if (snapshot.brake.combined >= BRAKING_COMBINED_THRESHOLD) return undefined;

  if (isAtStationPlatform(snapshot) || plan?.targetKind === 'STATION') return undefined;

  const target = targetSpeedDisplay(snapshot);
  if (snapshot.speedDisplay > target + releaseSpeedMargin(snapshot.speedUnit)) return undefined;

  if (plan?.activeStep) {
    const step = plan.activeStep;
    const stillAboveTarget = snapshot.speedDisplay > target + releaseSpeedMargin(snapshot.speedUnit);
    if (stepInApplyZone(snapshot, step, plan) && !isReleaseNotch(step.notch) && stillAboveTarget) {
      return undefined;
    }
  }

  return buildReleaseCommand(profile) ?? undefined;
}

/** Sugiere mando en ARM/AUTO: soltar OFF o aplicar muesca en zona de aplicación. */
export function resolveSuggestedAction(
  mode: string,
  plan: BrakePlan | null,
  profile?: CommandProfile | null,
  snapshot?: TelemetrySnapshot,
  hasSafetyEvent = false,
): AgentAction | undefined {
  if (mode !== 'ARM' && mode !== 'AUTO') return undefined;
  if (mode === 'AUTO' && hasSafetyEvent) return undefined;

  if (snapshot) {
    updateSpeedLimitCoastLatch(snapshot);

    const release = resolveReleaseAction(snapshot, plan, profile);
    if (release) {
      if (plan?.targetKind === 'SPEED_LIMIT' || snapshot.limits.next) {
        latchSpeedLimitCoast(snapshot);
      }
      return release;
    }

    if (shouldInhibitLimitRebrake(snapshot, plan)) return undefined;

    const stationHold = resolveStationHoldAction(snapshot, profile);
    if (stationHold) return stationHold;
  }

  if (!plan?.activeStep) return undefined;

  const step = plan.activeStep;
  if (!stepInApplyZone(snapshot, step, plan)) return undefined;

  const action = buildBrakeCommand(step.notch, profile);
  return action ?? undefined;
}
