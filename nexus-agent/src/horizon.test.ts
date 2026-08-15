import { describe, expect, it } from 'vitest';
import { createMockSnapshot } from '@nexus/kernel';
import { buildHorizon } from './horizon';

describe('buildHorizon', () => {
  it('includes second upcoming limit and clustered chain hint', () => {
    const snapshot = createMockSnapshot({
      limits: {
        effective: 90,
        frontal: 90,
        next: { speed: 75, distanceM: 800 },
        upcoming: [
          { speed: 75, distanceM: 800 },
          { speed: 25, distanceM: 860 },
        ],
      },
    });

    const events = buildHorizon(snapshot);
    const limits = events.filter(e => e.kind === 'SPEED_LIMIT');
    expect(limits).toHaveLength(2);
    expect(limits[0]?.label).toContain('75');
    expect(limits[1]?.label).toContain('Cadena');
    expect(limits[1]?.label).toContain('25');
  });
});
