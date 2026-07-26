/** Retardo de llenado de freno según tipo de consist (ConsistType / TrainType TSC). */
export const TYPE_LAG_MAP: Record<number, number> = { 0: 1.4, 1: 1.0, 2: 1.1, 3: 0.8 };

export const APPLY_NOW_MARGIN_M = 150;
export const MIN_LEARNED_SAMPLES = 3;
export const DEFAULT_MAX_BRAKE_DECEL = 0.8;
export const G_MSS = 9.80665;

/**
 * Componente de aceleración efectiva por pendiente.
 * `gradientPermille` está en ‰ (convención TSC / kernel), no en %.
 */
export function gravityAcceleration(gradientPermille: number): number {
  return G_MSS * (gradientPermille / 1000);
}

export function displaySpeedToMs(speed: number, speedUnit: 'MPH' | 'km/h'): number {
  return speed * (speedUnit === 'MPH' ? 0.44704 : 0.27778);
}

export function massFactor(massT: number): number {
  return massT > 0 ? massT / 500 : 1;
}

export function lagFactor(consistType: number): number {
  return TYPE_LAG_MAP[consistType] ?? 1.0;
}
