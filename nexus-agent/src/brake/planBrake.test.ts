import { describe, expect, it } from 'vitest';
import { createMockSnapshot } from '@nexus/kernel';
import {
  brakingDistanceM,
  decelForNotch,
  formatClusteredBrakeDetail,
  planBrake,
  planBrakeForLimit,
  planBrakeForSignal,
  planBrakeForStation,
  reactionMarginM,
  brakePlanUrgencyScore,
  selectActiveStep,
  selectStationActiveStep,
  selectUrgentBrakePlan,
  targetsAreClustered,
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

  it('uses profile reaction_time_s override when set', () => {
    expect(reactionMarginM(30, 5, 3)).toBe(90);
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

  it('blends avg and max decel for planning when max is available', () => {
    const learned = decelForNotch(0.5, 'B2', 1.0, 180, 1, 0, {
      B2: { avg_decel: 0.70, max_decel: 0.862, samples: 8 },
    });
    expect(learned).toBeCloseTo(0.70 * 0.65 + 0.862 * 0.35, 4);
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
  it('prefers weakest service notch for speed limits', () => {
    const steps = [
      { notch: 'B3', distStart: 120, applyAtRemainingM: 200, applyNow: false } as const,
      { notch: 'B2', distStart: 5, applyAtRemainingM: 240, applyNow: false } as const,
      { notch: 'B1', distStart: -200, applyAtRemainingM: 270, applyNow: false } as const,
    ];
    expect(selectActiveStep(steps as never, 30, 'SPEED_LIMIT')?.notch).toBe('B1');
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

  it('selects strong notch when limit braking is late', () => {
    const snapshot = createMockSnapshot({
      speedMs: 27.8,
      speedDisplay: 100,
      speedUnit: 'km/h',
      limits: {
        effective: 160,
        frontal: 160,
        next: { speed: 60, distanceM: 153 },
        upcoming: [],
      },
    });
    const plan = planBrakeForLimit(snapshot, { profile: CLASS323_PROFILE });
    expect(plan?.activeStep?.distStart).toBeLessThan(0);
    expect(plan?.activeStep?.notch).toBe('B3');
  });
});

describe('selectUrgentBrakePlan', () => {
  it('detects clustered limit and station targets', () => {
    expect(targetsAreClustered(300, 400)).toBe(true);
    expect(targetsAreClustered(300, 800)).toBe(false);
  });

  it('prefers limit plan when 45 limit is just before stop', () => {
    const snapshot = createMockSnapshot({
      speedMs: 31.3,
      speedDisplay: 70,
      speedUnit: 'MPH',
      limits: {
        effective: 70,
        frontal: 70,
        next: { speed: 45, distanceM: 300 },
        upcoming: [],
      },
      station: { distanceM: 400, nameOcr: 'University', eta: '' },
      gradient: 0,
      train: { lengthM: 120, massT: 180, consistType: 1, profileId: 'class323', name: '323' },
    });
    const ctx = { profile: CLASS323_PROFILE };
    const limitPlan = planBrakeForLimit(snapshot, ctx);
    const stationPlan = planBrakeForStation(snapshot, ctx);
    expect(limitPlan).not.toBeNull();
    expect(stationPlan).not.toBeNull();

    const selected = selectUrgentBrakePlan([limitPlan!, stationPlan!], snapshot);
    expect(selected?.targetKind).toBe('SPEED_LIMIT');
  });

  it('prefers signal plan over limit when clustered at stop', () => {
    const snapshot = createMockSnapshot({
      speedMs: 20,
      speedDisplay: 45,
      speedUnit: 'MPH',
      limits: {
        effective: 45,
        frontal: 45,
        next: { speed: 20, distanceM: 300 },
        upcoming: [],
      },
      signaling: { aspect: 'DANGER', distanceM: 350 },
      station: { distanceM: 800, nameOcr: 'Far', eta: '' },
      gradient: 0,
      train: { lengthM: 120, massT: 180, consistType: 1, profileId: 'class323', name: '323' },
    });
    const ctx = { profile: CLASS323_PROFILE };
    const limitPlan = planBrakeForLimit(snapshot, ctx);
    const signalPlan = planBrakeForSignal(snapshot, ctx);
    expect(limitPlan).not.toBeNull();
    expect(signalPlan).not.toBeNull();

    const selected = selectUrgentBrakePlan([limitPlan!, signalPlan!], snapshot);
    expect(selected?.targetKind).toBe('SIGNAL');
  });

  it('keeps limit plan when station is far beyond the sign', () => {
    const snapshot = createMockSnapshot({
      speedMs: 31.3,
      speedDisplay: 70,
      speedUnit: 'MPH',
      limits: {
        effective: 70,
        frontal: 70,
        next: { speed: 45, distanceM: 300 },
        upcoming: [],
      },
      station: { distanceM: 1200, nameOcr: 'Far', eta: '' },
      gradient: 0,
      train: { lengthM: 120, massT: 180, consistType: 1, profileId: 'class323', name: '323' },
    });
    const ctx = { profile: CLASS323_PROFILE };
    const limitPlan = planBrakeForLimit(snapshot, ctx);
    const stationPlan = planBrakeForStation(snapshot, ctx);
    expect(limitPlan).not.toBeNull();
    expect(stationPlan).not.toBeNull();

    const selected = selectUrgentBrakePlan([limitPlan!, stationPlan!], snapshot);
    expect(selected?.targetKind).toBe('SPEED_LIMIT');
  });

  it('formats clustered detail with both distances', () => {
    const snapshot = createMockSnapshot({
      speedMs: 31.3,
      speedDisplay: 70,
      speedUnit: 'MPH',
      limits: {
        effective: 70,
        frontal: 70,
        next: { speed: 45, distanceM: 280 },
        upcoming: [],
      },
      station: { distanceM: 350, nameOcr: 'Selly Oak', eta: '' },
      gradient: 0,
      train: { lengthM: 120, massT: 180, consistType: 1, profileId: 'class323', name: '323' },
    });
    const plan = planBrakeForStation(snapshot, { profile: CLASS323_PROFILE });
    expect(plan).not.toBeNull();
    const detail = formatClusteredBrakeDetail(snapshot, plan!);
    expect(detail).toContain('70→45');
    expect(detail).toContain('280 m');
    expect(detail).toContain('Selly Oak');
    expect(detail).toContain('350 m');
  });
});
