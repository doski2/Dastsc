// SignalingNormalizer.ts
import { TailProtectionService } from '../../services/TailProtectionService';

export class SignalingNormalizer {
  private tailService = new TailProtectionService();

  normalize(raw: any, speedMS: number, dtSim: number, trainLength: number, toMS: number) {
    const currentLimitConverted = Number(raw.CurrentSpeedLimit || 0);
    const rawNextLimitSpeed = Number(raw.NextLimitSpeed || 0);
    const rawNextLimitDistFromLua = Number(raw.NextLimitDist || -1);

    const tailInfo = this.tailService.update(
      currentLimitConverted,
      rawNextLimitSpeed,
      rawNextLimitDistFromLua,
      speedMS,
      dtSim,
      trainLength
    );

    const tailSeconds = speedMS > 0.5 ? tailInfo.distanceRemaining / speedMS : 0;

    return {
      currentLimitConverted,
      rawNextLimitSpeed,
      rawNextLimitDistFromLua,
      effectiveSpeedLimit: tailInfo.effectiveLimit * toMS,
      tailIsActive: tailInfo.isActive,
      tailSecondsRemaining: tailSeconds,
      tailDistanceRemaining: tailInfo.distanceRemaining,
      tailTargetLimit: tailInfo.effectiveLimit
    };
  }
}
