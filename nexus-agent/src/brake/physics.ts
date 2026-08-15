/** Retardo de llenado de freno según tipo de consist (ConsistType / TrainType TSC). */
export const TYPE_LAG_MAP: Record<number, number> = { 0: 1.4, 1: 1.0, 2: 1.1, 3: 0.8 };

export const APPLY_NOW_MARGIN_M = 150;
export const APPLY_NOW_MARGIN_MIN_M = 25;
/** Distancia máxima para planificar frenado ante un cartel de límite. */
export const LIMIT_PLANNING_HORIZON_M = 2500;
/** Por debajo (‰ negativo) la política de límite escala muesca y no suelta OFF. */
export const DOWNHILL_LIMIT_GRADIENT_PERMILLE = -3;
/** Límite y estación a menos de esta separación se planifican como un solo bloque de frenada. */
export const TARGET_CLUSTER_GAP_M = 350;
/** Tras soltar OFF en un límite, no volver a frenar hasta superar objetivo + este margen. */
export const COAST_REBRAKE_MARGIN_MPH = 5;
export const COAST_REBRAKE_MARGIN_KMH = 8;
/** Si se acelera claramente por encima del objetivo, cancelar el coast latch. */
export const COAST_CLEAR_OVERSHOOT_MPH = 8;
export const COAST_CLEAR_OVERSHOOT_KMH = 13;
/** Mínima velocidad (m/s) para considerar parada en andén. */
export const STATION_DWELL_MAX_DISTANCE_M = 80;
/** Parada final (applyNow): últimos metros del andén (override en `agent_config`). */
export const STATION_FINAL_STOP_MAX_DISTANCE_M = 20;
/** Por debajo de esta distancia no aplica holgura de horario al planificar frenada. */
export const STATION_COAST_CUTOFF_M = 100;
/** Aproximación terminal: reducir margen de reacción por debajo de esta distancia. */
export const STATION_TERMINAL_APPROACH_M = 80;
export const STATION_FINAL_STOP_SPEED_MS = 0.2;
/** Velocidad máxima (m/s) para mantener freno de servicio en andén (~2 mph). */
export const STATION_HOLD_MAX_SPEED_MS = 1.0;
/** Por debajo de esta velocidad con freno, no mandar NEU/OFF (andén / arranque). */
export const STATION_RELEASE_BLOCK_SPEED_MS = 2.5;
/** Por encima: salida clara del andén — no aplicar parada final con distancia en 0. */
export const STATION_DEPARTURE_SPEED_MS = 5;
export const MIN_LEARNED_SAMPLES = 3;
export const DEFAULT_MAX_BRAKE_DECEL = 0.8;
export const G_MSS = 9.80665;
/** Peso de la media en decel de planificación (resto = max aprendido). */
export const PLANNING_DECEL_AVG_WEIGHT = 0.65;
/** Estación: más peso al max aprendido → plan más agresivo / frena más tarde. */
export const PLANNING_DECEL_STATION_AVG_WEIGHT = 0.4;

/**
 * Zona "aplicar ahora" escalada: a baja velocidad no dispara 150 m antes del punto.
 */
export function applyZoneMarginM(speedMs: number, applyAtRemainingM: number): number {
  const speedBased = speedMs * 2.5;
  const remainingBased = applyAtRemainingM * 0.12;
  return Math.min(
    APPLY_NOW_MARGIN_M,
    Math.max(APPLY_NOW_MARGIN_MIN_M, speedBased, remainingBased),
  );
}

export function isInApplyZone(distStart: number, applyZoneM: number): boolean {
  // distStart < 0 → ya pasó el punto nominal de aplicación; frenar igualmente.
  if (distStart < 0) return true;
  return distStart <= applyZoneM;
}

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
