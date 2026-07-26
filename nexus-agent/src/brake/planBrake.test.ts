import { describe, expect, it } from 'vitest';
import { createMockSnapshot } from '@nexus/kernel';
import {
  brakingDistanceM,
  decelForNotch,
  planBrake,
  planBrakeForLimit,
  planBrakeForStation,
  reactionMarginM,
  selectActiveStep,
} from './planBrake';
import { gravityAcceleration, G_MSS } from './physics';
import type { BrakePlanProfile } from './types';

const CLASS323_PROFILE: BrakePlanProfile = {
  physics_config: {
    max_braking_decel: 1.1,
    brake_fill_time_s: 5,
  },
  specs: {
    notches_throttle_brake: [
      { value: -1.0, label: 'EMG' },
      { value: -0.75, label: 'B3' },
      { value: -0.5, label: 'B2' },
      { value: -0.25, label: 'B1' },
      { value: 0.0, label: 'OFF' },
      { value: 0.25, label: 'P1' },
    ],
  },
};

describe('gravityAcceleration', () => {
  it('uses per-mille (‰) convention aligned with kernel ProjectedBrakingDistance', () => {
    expect(gravityAcceleration(10)).toBeCloseTo(G_MSS * 0.01, 5);
    expect(gravityAcceleration(10)).toBeCloseTo(0.098, 2);
  });

  it('differs from legacy V3 /100 bug by 10× on typical gradients', () => {
    const legacyV3 = G_MSS * (10 / 100);
    const fixed = gravityAcceleration(10);
    expect(legacyV3 / fixed).toBeCloseTo(10, 5);
  });
});

describe('reactionMarginM', () => {
  it('scales with speed and fill time cap', () => {
    expect(reactionMarginM(30, 5)).toBe(30 * 4);
    expect(reactionMarginM(10, 1)).toBe(10 * 2.5);
  });
});

describe('brakingDistanceM', () => {
  it('matches v² = u² + 2as for full stop', () => {
    const decel = 0.9;
    const speed = 25;
    const dist = brakingDistanceM(speed, 0, decel);
    expect(dist).toBeCloseTo((speed ** 2) / (2 * decel), 5);
  });

  it('returns Infinity for non-positive deceleration', () => {
    expect(brakingDistanceM(20, 0, 0)).toBe(Infinity);
    expect(brakingDistanceM(20, 0, -0.2)).toBe(Infinity);
  });
});

describe('decelForNotch', () => {
  it('adds uphill gradient to service decel', () => {
    const flat = decelForNotch(0.5, 'B2', 1.0, 180, 1, 0, {});
    const uphill = decelForNotch(0.5, 'B2', 1.0, 180, 1, 10, {});
    expect(uphill).toBeGreaterThan(flat);
    expect(uphill - flat).toBeCloseTo(gravityAcceleration(10), 5);
  });

  it('prefers learned decel when enough samples exist', () => {
    const learned = decelForNotch(0.5, 'B2', 1.0, 180, 1, 0, {
      B2: { avg_decel: 0.72, samples: 5 },
    });
    expect(learned).toBe(0.72);
  });
});

describe('planBrake', () => {
  it('returns null when already at or below target speed', () => {
    expect(planBrake({
      speedMs: 10,
      distanceToTargetM: 500,
      targetSpeedMs: 10,
      massT: 180,
      lengthM: 120,
      gradientPermille: 0,
    }, 'STATION')).toBeNull();
  });

  it('produces ordered phases from profile notches', () => {
    const plan = planBrake({
      speedMs: 29.9,
      distanceToTargetM: 1200,
      targetSpeedMs: 0,
      massT: 180,
      lengthM: 120,
      gradientPermille: 2,
      profile: CLASS323_PROFILE,
    }, 'STATION');

    expect(plan).not.toBeNull();
    expect(plan!.steps.map(s => s.notch)).toEqual(['B3', 'B2', 'B1']);
    expect(plan!.steps.every(s => s.distanceM > 0 && s.distanceM < Infinity)).toBe(true);
  });

  it('requires longer stopping distance on downhill gradient', () => {
    const uphill = planBrake({
      speedMs: 25,
      distanceToTargetM: 1000,
      targetSpeedMs: 0,
      massT: 180,
      lengthM: 120,
      gradientPermille: 8,
      profile: CLASS323_PROFILE,
    }, 'STATION');
    const downhill = planBrake({
      speedMs: 25,
      distanceToTargetM: 1000,
      targetSpeedMs: 0,
      massT: 180,
      lengthM: 120,
      gradientPermille: -8,
      profile: CLASS323_PROFILE,
    }, 'STATION');

    const uphillB2 = uphill!.steps.find(s => s.notch === 'B2')!;
    const downhillB2 = downhill!.steps.find(s => s.notch === 'B2')!;
    expect(downhillB2.distanceM).toBeGreaterThan(uphillB2.distanceM);
  });

  it('marks applyNow when remaining distance matches braking point', () => {
    const speed = 25;
    const fill = 5;
    const reaction = reactionMarginM(speed, fill);
    const decel = decelForNotch(0.5, 'B2', 1.1, 180, 1, 0, {});
    const distNeeded = brakingDistanceM(speed, 0, decel);
    const remaining = distNeeded + reaction;

    const plan = planBrake({
      speedMs: speed,
      distanceToTargetM: remaining,
      targetSpeedMs: 0,
      massT: 180,
      lengthM: 120,
      gradientPermille: 0,
      profile: CLASS323_PROFILE,
    }, 'STATION');

    const b2 = plan!.steps.find(s => s.notch === 'B2')!;
    expect(b2.distStart).toBeCloseTo(0, 1);
    expect(b2.applyNow).toBe(true);
    expect(plan!.activeStep?.notch).toBe('B2');
  });
});

describe('selectActiveStep', () => {
  it('prefers apply-now step closest to zero distStart', () => {
    const steps = [
      { notch: 'B3', distStart: 120, applyNow: true } as const,
      { notch: 'B2', distStart: 5, applyNow: true } as const,
      { notch: 'B1', distStart: -200, applyNow: false } as const,
    ];
    expect(selectActiveStep(steps as never)?.notch).toBe('B2');
  });
});

describe('snapshot helpers', () => {
  it('plans station stop from mock snapshot', () => {
    const snapshot = createMockSnapshot({
      station: { distanceM: 900, nameOcr: 'Birmingham', eta: '' },
    });
    const plan = planBrakeForStation(snapshot, { profile: CLASS323_PROFILE });
    expect(plan?.targetKind).toBe('STATION');
    expect(plan?.activeStep).not.toBeNull();
  });

  it('plans speed limit reduction', () => {
    const snapshot = createMockSnapshot({
      limits: {
        effective: 60,
        frontal: 60,
        next: { speed: 40, distanceM: 420 },
        upcoming: [],
      },
    });
    const plan = planBrakeForLimit(snapshot, { profile: CLASS323_PROFILE });
    expect(plan?.targetKind).toBe('SPEED_LIMIT');
    expect(plan!.targetSpeedMs).toBeGreaterThan(0);
  });
});
