import { TailProtectionService } from '../../services/TailProtectionService';
import { asNumber } from './PhysicsNormalizer';

export type SignalAspect =
  | 'DANGER'
  | 'CAUTION'
  | 'ADV_CAUTION'
  | 'CLEAR'
  | 'PROCEED'
  | 'FL_CAUTION'
  | 'FL_ADV_CAUTION'
  | 'UNKNOWN';

export interface SignalingRawInput {
  CurrentSpeedLimit?: number;
  NextLimitSpeed?: number;
  NextLimitDist?: number;
  NextLimit2Speed?: number;
  NextLimit2Dist?: number;
  SigRes?: number;
  SigState?: number;
  SigDist?: number;
  NextSignalState?: number;
  InternalAspect?: number;
  NextSignalDistance?: number;
}

export interface SignalingNormalizeResult {
  currentLimitConverted: number;
  rawNextLimitSpeed: number;
  rawNextLimitDistFromLua: number;
  rawNextLimit2Speed: number;
  rawNextLimit2DistFromLua: number;
  effectiveSpeedLimit: number;
  tailIsActive: boolean;
  tailSecondsRemaining: number;
  tailDistanceRemaining: number;
  tailTargetLimit: number;
  nextSignalAspect: SignalAspect;
  nextSignalDistance: number;
}

/** Mapeo SigState / RailWorks → aspecto del HUD. */
export const SIG_STATE_ASPECT: Record<number, SignalAspect> = {
  0: 'DANGER',
  1: 'CAUTION',
  2: 'ADV_CAUTION',
  3: 'CLEAR',
  4: 'PROCEED',
  10: 'FL_CAUTION',
  11: 'FL_ADV_CAUTION',
};

const MIN_SPEED_FOR_TAIL_ETA_MS = 0.5;
const NO_SIGNAL_DISTANCE = -1;

export function mapSignalAspect(sigVal: number): SignalAspect {
  return SIG_STATE_ASPECT[sigVal] ?? 'UNKNOWN';
}

export function hasNearbySignal(raw: SignalingRawInput): boolean {
  return asNumber(raw.SigRes) > 0;
}

export function resolveSignalStateValue(raw: SignalingRawInput): number {
  if (hasNearbySignal(raw)) return asNumber(raw.SigState);
  return asNumber(raw.NextSignalState ?? raw.InternalAspect, -1);
}

export function resolveNextSignalDistance(raw: SignalingRawInput): number {
  if (hasNearbySignal(raw)) return asNumber(raw.SigDist, NO_SIGNAL_DISTANCE);
  return asNumber(raw.NextSignalDistance, NO_SIGNAL_DISTANCE);
}

export function computeTailSecondsRemaining(speedMS: number, distanceRemaining: number): number {
  return speedMS > MIN_SPEED_FOR_TAIL_ETA_MS ? distanceRemaining / speedMS : 0;
}

/** Límites de velocidad, señales y protección de cola del tren. */
export class SignalingNormalizer {
  private tailService = new TailProtectionService();

  normalize(
    raw: SignalingRawInput,
    speedMS: number,
    dtSim: number,
    trainLength: number,
    toMS: number,
  ): SignalingNormalizeResult {
    const currentLimitConverted = asNumber(raw.CurrentSpeedLimit);
    const rawNextLimitSpeed = asNumber(raw.NextLimitSpeed);
    const rawNextLimitDistFromLua = asNumber(raw.NextLimitDist, NO_SIGNAL_DISTANCE);
    const rawNextLimit2Speed = asNumber(raw.NextLimit2Speed);
    const rawNextLimit2DistFromLua = asNumber(raw.NextLimit2Dist, NO_SIGNAL_DISTANCE);

    const sigVal = resolveSignalStateValue(raw);
    const nextSignalAspect = mapSignalAspect(sigVal);
    const nextSignalDistance = resolveNextSignalDistance(raw);

    const tailInfo = this.tailService.update(
      currentLimitConverted,
      rawNextLimitSpeed,
      rawNextLimitDistFromLua,
      speedMS,
      dtSim,
      trainLength,
    );

    const tailSecondsRemaining = computeTailSecondsRemaining(speedMS, tailInfo.distanceRemaining);

    return {
      currentLimitConverted,
      rawNextLimitSpeed,
      rawNextLimitDistFromLua,
      rawNextLimit2Speed,
      rawNextLimit2DistFromLua,
      effectiveSpeedLimit: tailInfo.effectiveLimit * toMS,
      tailIsActive: tailInfo.isActive,
      tailSecondsRemaining,
      tailDistanceRemaining: tailInfo.distanceRemaining,
      tailTargetLimit: tailInfo.targetLimit,
      nextSignalAspect,
      nextSignalDistance,
    };
  }

  reset(): void {
    this.tailService.reset();
  }
}
