import type { AgentAction, TelemetrySnapshot } from '@nexus/kernel';
import { APPLY_NOW_MARGIN_M } from '../brake/physics';
import type { BrakePlan, CommandProfile } from '../brake/types';

const DEFAULT_COMBINED_CONTROL = 'ThrottleAndBrake';
const BLOCKED_NOTCH_LABELS = new Set(['EMG', 'EMERGENCY', 'EMERGENCY_BRAKE']);

export function resolveCombinedControlName(profile?: CommandProfile | null): string {
  const mappings = profile?.mappings;
  if (!mappings) return DEFAULT_COMBINED_CONTROL;
  return (
    mappings.combined_control
    ?? mappings.throttle_brake
    ?? mappings.combined
    ?? DEFAULT_COMBINED_CONTROL
  );
}

export function notchToCombinedValue(
  notchLabel: string,
  profile?: CommandProfile | null,
): number | null {
  if (BLOCKED_NOTCH_LABELS.has(notchLabel.toUpperCase())) return null;
  const notches = profile?.specs?.notches_throttle_brake;
  if (!notches?.length) return null;
  const match = notches.find(n => n.label === notchLabel);
  if (!match || match.value >= 0 || match.value <= -0.99) return null;
  return match.value;
}

export function buildBrakeCommand(
  notch: string,
  profile?: CommandProfile | null,
): AgentAction | null {
  const value = notchToCombinedValue(notch, profile);
  if (value == null) return null;
  const command = resolveCombinedControlName(profile);
  return {
    command,
    value,
    reason: `Aplicar ${notch}`,
  };
}

export function buildReleaseCommand(profile?: CommandProfile | null): AgentAction | null {
  const notches = profile?.specs?.notches_throttle_brake;
  const off = notches?.find(n => n.label === 'OFF');
  if (!off || off.value !== 0) return null;
  const command = resolveCombinedControlName(profile);
  return {
    command,
    value: 0,
    reason: 'Soltar freno — objetivo alcanzado',
  };
}

const RELEASE_SPEED_MARGIN_MPH = 2;
const RELEASE_SPEED_MARGIN_KMH = 3;
const BRAKING_COMBINED_THRESHOLD = -0.05;

function releaseSpeedMargin(unit: TelemetrySnapshot['speedUnit']): number {
  return unit === 'MPH' ? RELEASE_SPEED_MARGIN_MPH : RELEASE_SPEED_MARGIN_KMH;
}

function targetSpeedDisplay(snapshot: TelemetrySnapshot): number {
  return snapshot.limits.next?.speed ?? snapshot.limits.effective;
}

/** Soltar freno (OFF) cuando la velocidad objetivo ya se alcanzó. */
export function resolveReleaseAction(
  snapshot: TelemetrySnapshot,
  plan: BrakePlan | null,
  profile?: CommandProfile | null,
): AgentAction | undefined {
  if (snapshot.brake.combined >= BRAKING_COMBINED_THRESHOLD) return undefined;

  const target = targetSpeedDisplay(snapshot);
  if (snapshot.speedDisplay > target + releaseSpeedMargin(snapshot.speedUnit)) return undefined;

  if (plan?.activeStep) {
    const step = plan.activeStep;
    const inApplyZone =
      step.applyNow
      || (step.distStart <= APPLY_NOW_MARGIN_M && step.distStart >= -APPLY_NOW_MARGIN_M);
    if (inApplyZone && step.notch !== 'OFF') return undefined;
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
    const release = resolveReleaseAction(snapshot, plan, profile);
    if (release) return release;
  }

  if (!plan?.activeStep) return undefined;

  const step = plan.activeStep;
  const inZone =
    step.applyNow
    || (step.distStart <= APPLY_NOW_MARGIN_M && step.distStart >= -APPLY_NOW_MARGIN_M);
  if (!inZone) return undefined;

  const action = buildBrakeCommand(step.notch, profile);
  return action ?? undefined;
}
