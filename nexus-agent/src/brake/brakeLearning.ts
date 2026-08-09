import type { CommandProfile } from './types';
import { usesSplitBrakeLayout } from '../command/commandBus';

export const BRAKE_LEARNING_NOTCH_TOLERANCE = 0.05;

export interface BrakeLearningSignals {
  combined: number;
  brakePosition: number;
}

export function estimateBrakeNotchFromCombined(
  combinedControl: number,
  profile?: CommandProfile | null,
): string {
  const val = combinedControl ?? 0;
  const notches = profile?.specs?.notches_throttle_brake;

  if (notches?.length) {
    const brakeNotches = notches
      .filter(n => n.value < 0)
      .sort((a, b) => a.value - b.value);

    for (const notch of brakeNotches) {
      if (val <= notch.value + BRAKE_LEARNING_NOTCH_TOLERANCE) return notch.label;
    }
    if (brakeNotches.length && val < -BRAKE_LEARNING_NOTCH_TOLERANCE) {
      return brakeNotches[brakeNotches.length - 1].label;
    }
  }

  if (val < -BRAKE_LEARNING_NOTCH_TOLERANCE) {
    return `B${Math.round(Math.abs(val) * 100)}%`;
  }
  return '?';
}

export function estimateBrakeNotchFromPosition(
  position: number,
  profile?: CommandProfile | null,
): string {
  if (position <= BRAKE_LEARNING_NOTCH_TOLERANCE) return '?';

  const notches = profile?.specs?.notches_throttle_brake;
  if (!notches?.length) return `B${Math.round(position * 100)}%`;

  const brakeNotches = notches
    .filter(n => n.value < 0 && n.value > -0.99)
    .sort((a, b) => Math.abs(a.value) - Math.abs(b.value));

  let bestLabel: string | null = null;
  let bestDiff = Infinity;
  for (const notch of brakeNotches) {
    const target = Math.abs(notch.value);
    const diff = Math.abs(position - target);
    if (diff <= BRAKE_LEARNING_NOTCH_TOLERANCE && diff < bestDiff) {
      bestDiff = diff;
      bestLabel = notch.label;
    }
  }

  return bestLabel ?? '?';
}

export function isBrakeEngagedForLearning(
  signals: BrakeLearningSignals,
  profile?: CommandProfile | null,
): boolean {
  if (usesSplitBrakeLayout(profile)) {
    return signals.brakePosition > BRAKE_LEARNING_NOTCH_TOLERANCE;
  }
  return signals.combined < -BRAKE_LEARNING_NOTCH_TOLERANCE;
}

export function estimateBrakeNotchForLearning(
  signals: BrakeLearningSignals,
  profile?: CommandProfile | null,
): string {
  if (usesSplitBrakeLayout(profile)) {
    return estimateBrakeNotchFromPosition(signals.brakePosition, profile);
  }
  return estimateBrakeNotchFromCombined(signals.combined, profile);
}
