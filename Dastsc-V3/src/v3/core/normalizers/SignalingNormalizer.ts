// SignalingNormalizer.ts
import { TailProtectionService } from '../../services/TailProtectionService';

export class SignalingNormalizer {
  private tailService = new TailProtectionService();

  normalize(raw: any, speedMS: number, dtSim: number, trainLength: number, toMS: number) {
    const currentLimitConverted = Number(raw.CurrentSpeedLimit || 0);
    const rawNextLimitSpeed = Number(raw.NextLimitSpeed || 0);
    const rawNextLimitDistFromLua = Number(raw.NextLimitDist || -1);

    const rawNextLimit2Speed = Number(raw.NextLimit2Speed || 0);
    const rawNextLimit2DistFromLua = Number(raw.NextLimit2Dist || -1);

    // Mapeo de estados de señal según RailWorks (SigState)
    // Si SigRes > 0, hay una señal cercana y se usa SigState.
    // En caso contrario, se usan NextSignalState o InternalAspect como respaldo.
    // 0: Rojo (Danger)
    // 1: Amarillo (Caution)
    // 2: Amarillo doble (Adv Caution)
    // 3: Verde (Clear)
    // 4: Verde completo (Proceed)
    // 10: Amarillo parpadeante (FL Caution)
    // 11: Amarillo doble parpadeante (FL Adv Caution)
    const sigVal = (Number(raw.SigRes || 0) > 0)
      ? Number(raw.SigState || 0)
      : Number(raw.NextSignalState || raw.InternalAspect || -1);

    let aspect = 'UNKNOWN';
    if (sigVal === 0) aspect = 'DANGER';
    else if (sigVal === 1) aspect = 'CAUTION';
    else if (sigVal === 2) aspect = 'ADV_CAUTION';
    else if (sigVal === 3) aspect = 'CLEAR';
    else if (sigVal === 4) aspect = 'PROCEED';
    else if (sigVal === 10) aspect = 'FL_CAUTION';
    else if (sigVal === 11) aspect = 'FL_ADV_CAUTION';
    else if (sigVal === -1) aspect = 'UNKNOWN';

    // Distancia a la siguiente señal: usar SigDist si hay señal cercana, sino NextSignalDistance
    const nextSignalDistance = (Number(raw.SigRes || 0) > 0)
      ? Number(raw.SigDist || -1)
      : Number(raw.NextSignalDistance || -1);

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
      rawNextLimit2Speed,
      rawNextLimit2DistFromLua,
      effectiveSpeedLimit: tailInfo.effectiveLimit * toMS,
      tailIsActive: tailInfo.isActive,
      tailSecondsRemaining: tailSeconds,
      tailDistanceRemaining: tailInfo.distanceRemaining,
      tailTargetLimit: tailInfo.effectiveLimit,
      // Campos de señalización para el HUD
      nextSignalAspect: aspect,
      nextSignalDistance: nextSignalDistance
    };
  }
}
