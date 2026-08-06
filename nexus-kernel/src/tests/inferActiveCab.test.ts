import { describe, expect, it } from 'vitest';
import { inferActiveCab, normalizeWheelSpeedMS, resolveGradientSign, resolveGradientSignForProfile } from '../dataNormalizerUtils';

describe('inferActiveCab', () => {
  it('keeps reported cab 2', () => {
    expect(inferActiveCab(2, 1, 10)).toBe(2);
  });

  it('infers cab 2 from negative wheel speed with forward reverser', () => {
    expect(inferActiveCab(1, 1, 5, -2)).toBe(2);
  });

  it('infers cab 2 from negative track mph with forward reverser', () => {
    expect(inferActiveCab(1, 1, 5, undefined, -5)).toBe(2);
  });

  it('does not remap cab 1 reverse into cab 2', () => {
    expect(inferActiveCab(1, -1, 5)).toBe(1);
  });

  it('does not infer cab 2 when stopped', () => {
    expect(inferActiveCab(1, 1, 0, -5, -5)).toBe(1);
  });

  it('uses latched cab when stopped', () => {
    expect(inferActiveCab(1, 1, 0, undefined, undefined, 2)).toBe(2);
  });
});

describe('resolveGradientSign', () => {
  it('cab 1 forward keeps route sign', () => {
    expect(resolveGradientSign(1, 1)).toBe(1);
  });

  it('cab 1 reverse inverts sign', () => {
    expect(resolveGradientSign(1, -1)).toBe(-1);
  });

  it('cab 2 forward inverts sign', () => {
    expect(resolveGradientSign(2, 1)).toBe(-1);
  });

  it('cab 2 reverse keeps route sign', () => {
    expect(resolveGradientSign(2, -1)).toBe(1);
  });

  it('neutral reverser keeps route sign', () => {
    expect(resolveGradientSign(2, 0)).toBe(1);
  });

  it('uses wheel speed when cab is wrong but train is moving', () => {
    expect(resolveGradientSign(1, 1, -2, 5)).toBe(-1);
    expect(resolveGradientSign(1, 1, 2, 5)).toBe(1);
  });

  it('ignores zero wheel speed while moving (ICE T sin WheelSpeedAbsMS)', () => {
    expect(normalizeWheelSpeedMS(0, 10)).toBeUndefined();
    expect(resolveGradientSign(1, 1, 0, 10)).toBe(1);
  });
});

describe('resolveGradientSignForProfile', () => {
  it('flips German driver gradient when configured', () => {
    const profile = {
      physics_config: { gradient_mode: 'driver' as const, gradient_sign_flip: true },
    };
    expect(resolveGradientSignForProfile(1, 1, 0, 10, profile)).toBe(-1);
  });

  it('keeps UK consist logic by default', () => {
    expect(resolveGradientSignForProfile(1, 1, undefined, 10, null)).toBe(1);
    expect(resolveGradientSignForProfile(2, 1, undefined, 10, null)).toBe(-1);
  });
});
