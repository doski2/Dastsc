/** Protección de cola proactiva (port de V2 / tsc_dashboard_proto.py). */

export const DEFAULT_TRAIN_LENGTH_M = 100;
/** Distancia a señal justo antes del cruce (m). */
export const SIGNAL_CROSSED_NEAR_M = 15;
/** Distancia a la siguiente señal tras el cruce (m). */
export const SIGNAL_CROSSED_FAR_M = 100;

export interface TailProtectionState {
  waitingForClearance: boolean;
  distanceTravelledSinceLimit: number;
  effectiveShowLimit: number;
  lastNextDist: number;
  pendingLimit: number;
  trainLength: number;
}

export interface TailProtectionInput {
  currentLimit: number;
  nextLimitSpeed: number;
  nextLimitDist: number;
  speedMS: number;
  dt: number;
  trainLength: number;
}

export interface TailProtectionResult {
  isActive: boolean;
  distanceRemaining: number;
  effectiveLimit: number;
  /** Límite al que se aspira cuando la cola termina de cruzar. */
  targetLimit: number;
  progress: number;
}

export function createInitialTailProtectionState(): TailProtectionState {
  return {
    waitingForClearance: false,
    distanceTravelledSinceLimit: 0,
    effectiveShowLimit: 0,
    lastNextDist: 0,
    pendingLimit: 0,
    trainLength: DEFAULT_TRAIN_LENGTH_M,
  };
}

export function resolveTrainLengthM(trainLength: number): number {
  return trainLength > 0 ? trainLength : DEFAULT_TRAIN_LENGTH_M;
}

export function crossedSignal(lastNextDist: number, nextLimitDist: number): boolean {
  return lastNextDist < SIGNAL_CROSSED_NEAR_M && nextLimitDist > SIGNAL_CROSSED_FAR_M;
}

export function computeTailDistanceRemaining(
  trainLength: number,
  distanceTravelled: number,
): number {
  return Math.max(0, trainLength - distanceTravelled);
}

export function computeTailProgress(trainLength: number, distanceTravelled: number): number {
  if (trainLength <= 0) return 100;
  return Math.min(100, (distanceTravelled / trainLength) * 100);
}

export function tickTailProtection(
  state: TailProtectionState,
  input: TailProtectionInput,
): { state: TailProtectionState; result: TailProtectionResult } {
  const trainLength = resolveTrainLengthM(input.trainLength);
  let {
    waitingForClearance,
    distanceTravelledSinceLimit,
    effectiveShowLimit,
    lastNextDist,
    pendingLimit,
  } = state;

  const { currentLimit, nextLimitSpeed, nextLimitDist, speedMS, dt } = input;

  if (crossedSignal(lastNextDist, nextLimitDist)) {
    if (pendingLimit > currentLimit) {
      waitingForClearance = true;
      distanceTravelledSinceLimit = 0;
    } else {
      waitingForClearance = false;
      effectiveShowLimit = currentLimit;
    }
  }

  if (currentLimit < effectiveShowLimit) {
    waitingForClearance = false;
    effectiveShowLimit = currentLimit;
    distanceTravelledSinceLimit = 0;
  }

  if (!waitingForClearance) {
    effectiveShowLimit = currentLimit;
  }

  lastNextDist = nextLimitDist;
  pendingLimit = nextLimitSpeed;

  if (waitingForClearance) {
    distanceTravelledSinceLimit += Math.abs(speedMS) * dt;
    if (distanceTravelledSinceLimit >= trainLength) {
      waitingForClearance = false;
      effectiveShowLimit = pendingLimit || currentLimit;
    }
  }

  const targetLimit = waitingForClearance
    ? pendingLimit || currentLimit
    : effectiveShowLimit;

  const nextState: TailProtectionState = {
    waitingForClearance,
    distanceTravelledSinceLimit,
    effectiveShowLimit,
    lastNextDist,
    pendingLimit,
    trainLength,
  };

  return {
    state: nextState,
    result: {
      isActive: waitingForClearance,
      distanceRemaining: computeTailDistanceRemaining(trainLength, distanceTravelledSinceLimit),
      effectiveLimit: effectiveShowLimit,
      targetLimit,
      progress: computeTailProgress(trainLength, distanceTravelledSinceLimit),
    },
  };
}
