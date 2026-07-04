/**
 * Constantes compartidas por los normalizadores de telemetría.
 */

/** EMA rápida — amperaje, aceleración, G lateral (~7 muestras para estabilizar). */
export const EMA_ALPHA = 0.15;

/** EMA lenta — presiones de freno y reservorios (~20 muestras). */
export const EMA_SLOW = 0.05;

/** Gravedad estándar (m/s²) para conversiones a G. */
export const G_CONSTANT = 9.80665;

/** Mezcla exponencial: `value * alpha + previous * (1 - alpha)`. */
export function emaBlend(previous: number, value: number, alpha: number): number {
  return value * alpha + previous * (1 - alpha);
}
