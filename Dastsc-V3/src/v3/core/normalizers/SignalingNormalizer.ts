// SignalingNormalizer.ts
import { TailProtectionService } from '../../services/TailProtectionService';

export class SignalingNormalizer {
  private tailService = new TailProtectionService();

  normalize(raw: any, speedMS: number, dtSim: number, trainLength: number, toMS: number) {
    const currentLimitConverted = Number(raw.CurrentSpeedLimit || 0);
    const rawNextLimitSpeed = Number(raw.NextLimitSpeed || 0);
    const rawNextLimitDistFromLua = Number(raw.NextLimitDist || -1);

    // Mapeo de estados de seal segn RailWorks (SigState)
    // 0: Rojo (Danger)
    // 1: Amarillo (Caution)
    // 2: Amarillo doble (Adv Caution)
    // 3: Verde (Clear)
    const sigState = Number(raw.SigState !== undefined ? raw.SigState : 3);
    const sigDist = Number(raw.SigDist || 0);
    
    let aspect = 'CLEAR';
    if (sigState === 0) aspect = 'DANGER';
    else if (sigState === 1) aspect = 'CAUTION';
    else if (sigState === 2) aspect = 'ADV_CAUTION';
    else if (sigState === 3) aspect = 'CLEAR';

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
      tailTargetLimit: tailInfo.effectiveLimit,
      // Nuevos campos de sealizacin para el HUD
      nextSignalAspect: aspect,
      nextSignalDistance: sigDist * 1000 // Convertir km de LUA a metros
    };
  }
}
