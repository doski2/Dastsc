import { describe, expect, it } from 'vitest';
import {
  describeLimitChain,
  formatLimitChainHint,
  isClusteredLimitChain,
  resolveChainedLimitTarget,
} from '../limitUtils';

describe('limitUtils', () => {
  it('detects clustered UK-style limit chains', () => {
    const first = { speed: 75, distanceM: 800 };
    const second = { speed: 25, distanceM: 850 };
    expect(isClusteredLimitChain(first, second)).toBe(true);
  });

  it('ignores distant second limits', () => {
    const first = { speed: 75, distanceM: 800 };
    const second = { speed: 25, distanceM: 1400 };
    expect(isClusteredLimitChain(first, second)).toBe(false);
  });

  it('plans braking to the lower chained target', () => {
    const target = resolveChainedLimitTarget({
      next: { speed: 75, distanceM: 800 },
      upcoming: [
        { speed: 75, distanceM: 800 },
        { speed: 25, distanceM: 850 },
      ],
    });
    expect(target).toEqual({ speed: 25, distanceM: 850 });
  });

  it('keeps first limit when chain is not clustered', () => {
    const target = resolveChainedLimitTarget({
      next: { speed: 75, distanceM: 800 },
      upcoming: [
        { speed: 75, distanceM: 800 },
        { speed: 25, distanceM: 1600 },
      ],
    });
    expect(target).toEqual({ speed: 75, distanceM: 800 });
  });

  it('formats clustered chain hint', () => {
    const chain = describeLimitChain(
      {
        next: { speed: 90, distanceM: 700 },
        upcoming: [
          { speed: 75, distanceM: 700 },
          { speed: 25, distanceM: 760 },
        ],
      },
      'MPH',
    );
    expect(chain?.clustered).toBe(true);
    expect(formatLimitChainHint(chain!, 'MPH')).toContain('25');
    expect(formatLimitChainHint(chain!, 'MPH')).toContain('+60');
  });
});
