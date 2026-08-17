import { MIN_LEARNED_SAMPLES } from './physics';
import type { BrakeStatsEntry, SpeedBand } from './types';

/** ~78 mph — dinámico dominante (p. ej. Acela). */
export const SPEED_BAND_HIGH_MS = 35;
/** ~18 mph — transición aire / andén. */
export const SPEED_BAND_MED_MS = 8;

export function speedBandFromMs(speedMs: number): SpeedBand {
  if (speedMs >= SPEED_BAND_HIGH_MS) return 'high';
  if (speedMs >= SPEED_BAND_MED_MS) return 'med';
  return 'low';
}

/** Elige stats de la banda actual; si no hay muestras suficientes, fallback al promedio global. */
export function resolveLearnedEntry(
  entry: BrakeStatsEntry | undefined,
  speedMs: number,
): BrakeStatsEntry | null {
  if (!entry) return null;

  const band = speedBandFromMs(speedMs);
  const bandEntry = entry.by_speed?.[band];
  if (bandEntry && bandEntry.samples >= MIN_LEARNED_SAMPLES) {
    return {
      avg_decel: bandEntry.avg_decel,
      max_decel: bandEntry.max_decel,
      samples: bandEntry.samples,
    };
  }

  if (entry.samples >= MIN_LEARNED_SAMPLES) {
    return entry;
  }

  return null;
}
