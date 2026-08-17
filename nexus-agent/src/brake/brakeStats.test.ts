import { describe, expect, it } from 'vitest';
import {
  resolveLearnedEntry,
  speedBandFromMs,
  SPEED_BAND_HIGH_MS,
  SPEED_BAND_MED_MS,
} from './brakeStats';

describe('speedBandFromMs', () => {
  it('classifies high/med/low thresholds', () => {
    expect(speedBandFromMs(SPEED_BAND_HIGH_MS)).toBe('high');
    expect(speedBandFromMs(SPEED_BAND_HIGH_MS + 5)).toBe('high');
    expect(speedBandFromMs(SPEED_BAND_MED_MS)).toBe('med');
    expect(speedBandFromMs(SPEED_BAND_MED_MS - 0.1)).toBe('low');
  });
});

describe('resolveLearnedEntry', () => {
  it('returns null when no entry', () => {
    expect(resolveLearnedEntry(undefined, 30)).toBeNull();
  });

  it('prefers band entry when enough samples', () => {
    const entry = resolveLearnedEntry({
      avg_decel: 0.5,
      samples: 10,
      by_speed: {
        high: { avg_decel: 0.82, samples: 4 },
      },
    }, 40);
    expect(entry?.avg_decel).toBe(0.82);
  });
});
