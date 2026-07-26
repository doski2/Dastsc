const M_TO_MI = 1 / 1609.344;
const M_TO_KM = 0.001;

export type DisplaySpeedUnit = 'MPH' | 'km/h';

/** Velocidad con decimales (p. ej. 67.3). */
export function formatSpeed(value: number, decimals = 1): string {
  return value.toFixed(decimals);
}

/** Distancia en millas (MPH) o km según unidad del tren. */
export function formatDistance(m: number, speedUnit: DisplaySpeedUnit): string {
  if (speedUnit === 'MPH') {
    const mi = m * M_TO_MI;
    if (mi < 10) return `${mi.toFixed(2)} mi`;
    return `${mi.toFixed(1)} mi`;
  }

  const km = m * M_TO_KM;
  if (km < 1) return `${Math.round(m)} m`;
  return `${km.toFixed(1)} km`;
}
