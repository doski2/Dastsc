import { describe, expect, it } from 'vitest';
import { createMockSnapshot } from '@nexus/kernel';
import { applyZoneMarginM, isInApplyZone } from './physics';
import {
  planBrake,
  planBrakeForStation,
  planStationFinalStop,
  selectStationActiveStep,
} from './planBrake';
import { scheduleReactionScale, scheduleSlackSec, scheduleCoastAllowanceM } from './schedule';
import type { BrakePlanProfile } from './types';

const CLASS323_PROFILE: BrakePlanProfile = {
  physics_config: {
    max_braking_decel: 1.1,
    brake_fill_time_s: 5,
    reaction_time_s: 3,
    station_reaction_time_s: 1.2,
  },
  specs: {
    notches_throttle_brake: [
      { value: -0.75, label: 'B3' },
      { value: -0.5, label: 'B2' },
      { value: -0.25, label: 'B1' },
      { value: 0.0, label: 'OFF' },
    ],
  },
};

describe('applyZoneMarginM', () => {
  it('shrinks apply zone at low speed', () => {
    expect(applyZoneMarginM(4, 120)).toBeLessThan(applyZoneMarginM(25, 120));
    expect(applyZoneMarginM(4, 120)).toBeLessThanOrEqual(25);
  });
});

describe('isInApplyZone', () => {
  it('applies when past nominal point (negative distStart)', () => {
    expect(isInApplyZone(-320, 69)).toBe(true);
  });
});

describe('scheduleReactionScale', () => {
  it('reduces reaction when arriving early vs schedule', () => {
    const now = new Date('2026-08-01T14:30:00');
    const early = scheduleReactionScale(600, 20, '14:38', now);
    const late = scheduleReactionScale(600, 20, '14:29', now);
    expect(early).toBeLessThan(late);
    expect(early).toBeLessThan(1);
    expect(late).toBeGreaterThan(1);
  });
});

describe('station braking', () => {
  it('uses shorter reaction margin than speed limits at same speed', () => {
    const station = planBrake({
      speedMs: 20,
      distanceToTargetM: 800,
      targetSpeedMs: 0,
      massT: 180,
      lengthM: 120,
      gradientPermille: 0,
      profile: CLASS323_PROFILE,
    }, 'STATION');
    const limit = planBrake({
      speedMs: 20,
      distanceToTargetM: 800,
      targetSpeedMs: 0,
      massT: 180,
      lengthM: 120,
      gradientPermille: 0,
      profile: CLASS323_PROFILE,
    }, 'SPEED_LIMIT');

    expect(station!.reactionMarginM).toBeLessThan(limit!.reactionMarginM);
  });

  it('plans final stop at platform when distance is 0 and still moving', () => {
    const snapshot = createMockSnapshot({
      speedMs: 3,
      speedDisplay: 7,
      station: { distanceM: 0, nameOcr: 'Birmingham', eta: '14:38' },
    });
    const plan = planStationFinalStop(snapshot, { profile: CLASS323_PROFILE });
    expect(plan?.activeStep?.applyNow).toBe(true);
    expect(plan?.activeStep?.notch).toBe('B2');
  });

  it('does not plan final stop when departing platform at line speed', () => {
    const snapshot = createMockSnapshot({
      speedMs: 12,
      speedDisplay: 43,
      station: { distanceM: 0, nameOcr: 'Birmingham', eta: '' },
    });
    expect(planStationFinalStop(snapshot, { profile: CLASS323_PROFILE })).toBeNull();
  });

  it('prefers strongest notch near station', () => {
    const steps = [
      { notch: 'B3', distStart: 8, applyAtRemainingM: 200, applyNow: false } as const,
      { notch: 'B2', distStart: 12, applyAtRemainingM: 240, applyNow: false } as const,
      { notch: 'B1', distStart: 18, applyAtRemainingM: 270, applyNow: false } as const,
    ];
    expect(selectStationActiveStep(steps as never, 12, 300)?.notch).toBe('B3');
  });

  it('previews B2 when approaching early vs schedule', () => {
    const now = new Date('2026-08-01T14:30:00');
    const plan = planBrake({
      speedMs: 20,
      distanceToTargetM: 900,
      targetSpeedMs: 0,
      massT: 180,
      lengthM: 120,
      gradientPermille: 0,
      profile: CLASS323_PROFILE,
    }, 'STATION', '14:38', now);
    expect(plan?.activeStep?.notch).toBe('B2');
    expect(plan?.activeStep?.distStart).toBeGreaterThan(0);
    expect(scheduleSlackSec(900, 20, '14:38', now)).toBeGreaterThan(30);
    expect(scheduleCoastAllowanceM(900, 20, '14:38', now)).toBeGreaterThan(100);
  });

  it('delays brake point when early vs no schedule ETA', () => {
    const now = new Date('2026-08-01T14:30:00');
    const early = planBrake({
      speedMs: 20,
      distanceToTargetM: 900,
      targetSpeedMs: 0,
      massT: 180,
      lengthM: 120,
      gradientPermille: 0,
      profile: CLASS323_PROFILE,
    }, 'STATION', '14:38', now);
    const noEta = planBrake({
      speedMs: 20,
      distanceToTargetM: 900,
      targetSpeedMs: 0,
      massT: 180,
      lengthM: 120,
      gradientPermille: 0,
      profile: CLASS323_PROFILE,
    }, 'STATION');
    const b2Early = early!.steps.find(s => s.notch === 'B2')!;
    const b2Plain = noEta!.steps.find(s => s.notch === 'B2')!;
    expect(b2Early.distStart).toBeGreaterThan(b2Plain.distStart);
    expect(early!.reactionMarginM).toBeLessThan(noEta!.reactionMarginM);
  });

  it('escalates to B3 when late vs schedule', () => {
    const now = new Date('2026-08-01T14:39:00');
    const plan = planBrake({
      speedMs: 20,
      distanceToTargetM: 500,
      targetSpeedMs: 0,
      massT: 180,
      lengthM: 120,
      gradientPermille: 0,
      profile: CLASS323_PROFILE,
    }, 'STATION', '14:38', now);
    expect(scheduleSlackSec(500, 20, '14:38', now)).toBeLessThan(-12);
    expect(['B2', 'B3']).toContain(plan?.activeStep?.notch);
  });

  it('uses B2 as default service notch when braking point is due', () => {
    const steps = [
      { notch: 'B3', distStart: -40, applyAtRemainingM: 200, applyNow: true } as const,
      { notch: 'B2', distStart: -5, applyAtRemainingM: 240, applyNow: true } as const,
      { notch: 'B1', distStart: -80, applyAtRemainingM: 270, applyNow: true } as const,
    ];
    expect(selectStationActiveStep(steps as never, 18, 600)?.notch).toBe('B2');
  });
});

describe('low-speed limit braking', () => {
  it('reduces reaction margin for small speed drops', () => {
    const fastDrop = planBrake({
      speedMs: 20,
      distanceToTargetM: 400,
      targetSpeedMs: 5,
      massT: 180,
      lengthM: 120,
      gradientPermille: 0,
      profile: CLASS323_PROFILE,
    }, 'SPEED_LIMIT');
    const slowDrop = planBrake({
      speedMs: 8,
      distanceToTargetM: 400,
      targetSpeedMs: 6.7,
      massT: 180,
      lengthM: 120,
      gradientPermille: 0,
      profile: CLASS323_PROFILE,
    }, 'SPEED_LIMIT');

    const fastRatio = fastDrop!.reactionMarginM / 20;
    const slowRatio = slowDrop!.reactionMarginM / 8;
    expect(slowRatio).toBeLessThan(fastRatio);
  });
});
