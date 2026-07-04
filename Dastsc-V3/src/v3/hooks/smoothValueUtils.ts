export const REF_FPS = 60;
export const MAX_DT_FRAMES = 2.0;
export const SNAP_EPSILON = 0.0001;
export const RENDER_EPSILON = 0.0005;
export const MAX_SMOOTH_FACTOR = 0.99;

export function finiteNumber(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

/** Delta en unidades de frame a 60 FPS (acotado para pestañas en segundo plano). */
export function frameDeltaUnits(timeMs: number, lastTimeMs: number): number {
  const dt = (timeMs - lastTimeMs) / (1000 / REF_FPS);
  return Math.min(MAX_DT_FRAMES, dt);
}

/** Factor de avance exponencial por frame (equivalente a LERP con factor ajustado por dt). */
export function smoothStepFactor(factor: number, dt: number): number {
  const f = Math.min(Math.max(factor, 0), MAX_SMOOTH_FACTOR);
  return 1 - Math.pow(1 - f, dt);
}

export interface SmoothTickResult {
  current: number;
  shouldRender: boolean;
}

export function tickSmoothValue(
  current: number,
  target: number,
  factor: number,
  dt: number,
  lastRendered: number,
): SmoothTickResult {
  const diff = target - current;

  if (Math.abs(diff) < SNAP_EPSILON) {
    if (current === target) {
      return { current, shouldRender: false };
    }
    return {
      current: target,
      shouldRender: Math.abs(target - lastRendered) > RENDER_EPSILON,
    };
  }

  const next = current + diff * smoothStepFactor(factor, dt);
  return {
    current: next,
    shouldRender: Math.abs(next - lastRendered) > RENDER_EPSILON,
  };
}
