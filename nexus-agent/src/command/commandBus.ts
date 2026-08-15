import type { AgentAction, TelemetrySnapshot } from '@nexus/kernel';
import { resolveChainedLimitTarget } from '@nexus/kernel';
import {
  APPLY_NOW_MARGIN_M,
  applyZoneMarginM,
  DOWNHILL_LIMIT_GRADIENT_PERMILLE,
  isInApplyZone,
} from '../brake/physics';
import { resolveAgentConfig } from '../brake/agentConfig';
import { signalRequiresFullStop } from '../brake/signalUtils';
import type { BrakePlan, CommandProfile } from '../brake/types';
import { scheduleSlackSec } from '../brake/schedule';
import { weakestServiceNotchLabel } from '../brake/planBrake';

const DEFAULT_COMBINED_CONTROL = 'ThrottleAndBrake';
const BLOCKED_NOTCH_LABELS = new Set(['EMG', 'EMERGENCY', 'EMERGENCY_BRAKE']);

export function usesSplitBrakeLayout(profile?: CommandProfile | null): boolean {
  const mappings = profile?.mappings;
  if (!mappings?.brake && !mappings?.train_brake) return false;
  const brakes = (profile as { brakes?: { train_control?: string } } | null)?.brakes;
  if (mappings.train_brake && brakes?.train_control) return true;
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
  const releaseLabel = off.label === 'NEU' ? 'NEU' : 'OFF';
  return {
    command,
    value: 0,
    reason: `Soltar freno (${releaseLabel}) — objetivo alcanzado`,
  };
}

export function isBrakeApplied(
  snapshot: Pick<TelemetrySnapshot, 'brake'>,
  profile?: CommandProfile | null,
): boolean {
  const brakeCfg = resolveAgentConfig(profile).brake;
  if (usesSplitBrakeLayout(profile)) {
    return snapshot.brake.position > brakeCfg.brakePositionThreshold;
  }
  return snapshot.brake.combined < brakeCfg.brakingCombinedThreshold;
}

export function isBrakeReleased(
  snapshot: Pick<TelemetrySnapshot, 'brake'>,
  profile?: CommandProfile | null,
): boolean {
  return !isBrakeApplied(snapshot, profile);
}

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

function coastRebrakeMargin(
  unit: TelemetrySnapshot['speedUnit'],
  profile?: CommandProfile | null,
): number {
  const cfg = resolveAgentConfig(profile).brake;
  return unit === 'MPH' ? cfg.coastRebrakeMarginMph : cfg.coastRebrakeMarginKmh;
}

function coastClearOvershoot(
  unit: TelemetrySnapshot['speedUnit'],
  profile?: CommandProfile | null,
): number {
  const cfg = resolveAgentConfig(profile).brake;
  return unit === 'MPH' ? cfg.coastClearOvershootMph : cfg.coastClearOvershootKmh;
}

function latchSpeedLimitCoast(snapshot: TelemetrySnapshot): void {
  const next = snapshot.limits.next;
  if (!next || next.distanceM <= 0) return;
  speedLimitCoast = { limitSpeed: next.speed };
}

function updateSpeedLimitCoastLatch(
  snapshot: TelemetrySnapshot,
  profile?: CommandProfile | null,
): void {
  const next = snapshot.limits.next;
  if (!next || next.distanceM <= 0) {
    speedLimitCoast = null;
    return;
  }
  if (speedLimitCoast && speedLimitCoast.limitSpeed !== next.speed) {
    speedLimitCoast = null;
    return;
  }
  if (speedLimitCoast && snapshot.speedDisplay > next.speed + coastClearOvershoot(snapshot.speedUnit, profile)) {
    speedLimitCoast = null;
  }
}

/** Tras un OFF correcto, no re-aplicar freno por inercia / oscilación cerca del cartel. */
function shouldInhibitLimitRebrake(
  snapshot: TelemetrySnapshot,
  plan: BrakePlan | null,
  profile?: CommandProfile | null,
): boolean {
  if (!speedLimitCoast || plan?.targetKind !== 'SPEED_LIMIT') return false;
  if (isDownhillLimitApproach(snapshot)) return false;
  const next = snapshot.limits.next;
  if (!next || next.speed !== speedLimitCoast.limitSpeed) return false;
  if (isBrakeApplied(snapshot, profile)) return false;
  return snapshot.speedDisplay <= next.speed + coastRebrakeMargin(snapshot.speedUnit, profile);
}

function releaseSpeedMargin(
  unit: TelemetrySnapshot['speedUnit'],
  profile?: CommandProfile | null,
): number {
  const cfg = resolveAgentConfig(profile).brake;
  return unit === 'MPH' ? cfg.releaseMarginMph : cfg.releaseMarginKmh;
}

function targetSpeedDisplay(snapshot: TelemetrySnapshot, plan: BrakePlan | null): number {
  if (plan?.targetKind === 'STATION' || plan?.targetKind === 'SIGNAL') {
    return 0;
  }
  return resolveChainedLimitTarget(snapshot.limits)?.speed
    ?? snapshot.limits.next?.speed
    ?? snapshot.limits.effective;
}

/** En bajada el tren no puede mantener el límite con OFF — no coast ni re-brake inhibido. */
function isDownhillLimitApproach(snapshot: TelemetrySnapshot): boolean {
  return snapshot.gradient < DOWNHILL_LIMIT_GRADIENT_PERMILLE
    && (snapshot.limits.next?.distanceM ?? 0) > 0;
}

function stepInApplyZone(
  snapshot: TelemetrySnapshot | undefined,
  step: { distStart: number; applyAtRemainingM?: number; applyNow?: boolean },
  plan?: BrakePlan | null,
): boolean {
  if (step.applyNow) return true;
  if (!snapshot) {
    return step.distStart <= APPLY_NOW_MARGIN_M && step.distStart >= -APPLY_NOW_MARGIN_M;
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

/** En andén parado o arrancando muy lento — no soltar freno para puertas. */
export function isAtStationPlatform(
  snapshot: TelemetrySnapshot,
  profile?: CommandProfile | null,
): boolean {
  const station = resolveAgentConfig(profile).station;
  return (
    snapshot.station.distanceM <= station.dwellMaxDistanceM
    && snapshot.station.distanceM >= station.platformTailM
    && snapshot.speedMs <= station.releaseBlockSpeedMs
  );
}

/** Parado o muy lento ante señal en rojo (DANGER). */
export function isAtStopSignal(
  snapshot: TelemetrySnapshot,
  profile?: CommandProfile | null,
): boolean {
  if (!signalRequiresFullStop(snapshot.signaling.aspect)) return false;
  const station = resolveAgentConfig(profile).station;
  return (
    snapshot.signaling.distanceM <= station.dwellMaxDistanceM
    && snapshot.signaling.distanceM >= station.platformTailM
    && snapshot.speedMs <= station.releaseBlockSpeedMs
  );
}

/** En andén o parada lenta con freno: no soltar (Lua puede ya apuntar a la siguiente estación). */
export function shouldBlockAutoReleaseForStation(
  snapshot: TelemetrySnapshot,
  plan: BrakePlan | null,
  profile?: CommandProfile | null,
): boolean {
  const stationCfg = resolveAgentConfig(profile).station;
  if (isAtStationPlatform(snapshot, profile) || isAtStopSignal(snapshot, profile)) return true;

  if (plan?.targetKind === 'STATION' || plan?.targetKind === 'SIGNAL') {
    if (plan.activeStep?.phase === 'stop') return true;
    if (
      snapshot.station.distanceM <= stationCfg.dwellMaxDistanceM
      && snapshot.station.distanceM >= stationCfg.platformTailM
      && snapshot.speedMs > stationCfg.finalStopSpeedMs
      && isBrakeApplied(snapshot, profile)
    ) {
      return true;
    }
    if (
      snapshot.speedMs <= stationCfg.releaseBlockSpeedMs
      && isBrakeApplied(snapshot, profile)
    ) {
      return true;
    }
    // Frenando hacia la estación — no soltar aunque la velocidad baje al cartel intermedio.
    const step = plan.activeStep;
    if (
      step
      && isBrakeApplied(snapshot, profile)
      && stepInApplyZone(snapshot, step, plan)
      && !isReleaseNotch(step.notch)
    ) {
      return true;
    }
    return false;
  }

  if (
    snapshot.speedMs <= stationCfg.releaseBlockSpeedMs
    && isBrakeApplied(snapshot, profile)
  ) {
    return true;
  }
  return false;
}

/** Mantener freno de servicio en andén si se soltó antes de abrir puertas. */
function resolveStationHoldAction(
  snapshot: TelemetrySnapshot,
  profile?: CommandProfile | null,
): AgentAction | undefined {
  if (!isAtStationPlatform(snapshot, profile) && !isAtStopSignal(snapshot, profile)) {
    return undefined;
  }
  if (isBrakeApplied(snapshot, profile)) return undefined;
  if (snapshot.speedMs > resolveAgentConfig(profile).station.holdMaxSpeedMs) return undefined;

  const hold = buildBrakeCommand(weakestServiceNotchLabel(profile), profile);
  if (!hold) return undefined;
  const reason = isAtStopSignal(snapshot, profile)
    ? 'Mantener freno ante señal en rojo'
    : 'Mantener freno en andén';
  return { ...hold, reason };
}

/** Soltar freno (OFF) cuando la velocidad objetivo ya se alcanzó. */
export function resolveReleaseAction(
  snapshot: TelemetrySnapshot,
  plan: BrakePlan | null,
  profile?: CommandProfile | null,
): AgentAction | undefined {
  if (isBrakeReleased(snapshot, profile)) return undefined;

  if (shouldBlockAutoReleaseForStation(snapshot, plan, profile)) return undefined;

  if (plan?.targetKind === 'SPEED_LIMIT' && isDownhillLimitApproach(snapshot)) {
    return undefined;
  }

  const target = targetSpeedDisplay(snapshot, plan);
  if (snapshot.speedDisplay > target + releaseSpeedMargin(snapshot.speedUnit, profile)) return undefined;

  return buildReleaseCommand(profile) ?? undefined;
}

/** Sugiere mando en ARM/AUTO: soltar OFF o aplicar muesca en zona de aplicación. */
export function resolveSuggestedAction(
  mode: string,
  plan: BrakePlan | null,
  profile?: CommandProfile | null,
  snapshot?: TelemetrySnapshot,
  hasSafetyEvent = false,
  alternatePlans: BrakePlan[] = [],
): AgentAction | undefined {
  if (mode !== 'ARM' && mode !== 'AUTO') return undefined;
  if (mode === 'AUTO' && hasSafetyEvent) return undefined;

  if (snapshot) {
    updateSpeedLimitCoastLatch(snapshot, profile);

    const release = resolveReleaseAction(snapshot, plan, profile);
    if (release) {
      if (
        (plan?.targetKind === 'SPEED_LIMIT' || snapshot.limits.next)
        && !isDownhillLimitApproach(snapshot)
      ) {
        latchSpeedLimitCoast(snapshot);
      }
      return release;
    }

    if (shouldInhibitLimitRebrake(snapshot, plan, profile)) return undefined;

    const stationHold = resolveStationHoldAction(snapshot, profile);
    if (stationHold) return stationHold;
  }

  const candidates = [plan, ...alternatePlans].filter(
    (candidate): candidate is BrakePlan => Boolean(candidate?.activeStep),
  );
  for (const candidate of candidates) {
    const step = candidate.activeStep!;
    if (!stepInApplyZone(snapshot, step, candidate)) continue;
    const action = buildBrakeCommand(step.notch, profile);
    if (action) return action;
  }
  return undefined;
}
