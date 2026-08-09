import { describe, expect, it, beforeEach } from 'vitest';
import { createMockSnapshot } from '@nexus/kernel';
import {
  buildBrakeCommand,
  buildReleaseCommand,
  notchToCombinedValue,
  resetSpeedLimitCoastLatch,
  resolveCombinedControlName,
  resolveReleaseAction,
  resolveSuggestedAction,
  shouldBlockAutoReleaseForStation,
  isAtStationPlatform,
} from './commandBus';
import type { BrakePlan } from '../brake/types';

const CLASS323: Parameters<typeof buildBrakeCommand>[1] = {
  mappings: { combined_control: 'ThrottleAndBrake' },
  specs: {
    notches_throttle_brake: [
      { value: -0.75, label: 'B3' },
      { value: -0.5, label: 'B2' },
      { value: -0.25, label: 'B1' },
      { value: 0, label: 'OFF' },
    ],
  },
};

function testBrake(
  combined: number,
  extra: Partial<{
    position: number;
    cylinder: number;
    effortKn: number;
    projectedStopM: number;
  }> = {},
) {
  return {
    combined,
    position: extra.position ?? (combined < 0 ? Math.abs(combined) : 0),
    cylinder: extra.cylinder ?? 0,
    effortKn: extra.effortKn ?? 0,
    projectedStopM: extra.projectedStopM ?? 50,
    ...extra,
  };
}

describe('commandBus', () => {
  beforeEach(() => {
    resetSpeedLimitCoastLatch();
  });

  it('maps B2 to ThrottleAndBrake -0.5', () => {
    expect(buildBrakeCommand('B2', CLASS323)).toEqual({
      command: 'ThrottleAndBrake',
      value: -0.5,
      reason: 'Aplicar B2',
    });
  });

  it('rejects service notch EMG', () => {
    const withEmg = {
      ...CLASS323,
      specs: {
        notches_throttle_brake: [
          { value: -1, label: 'EMG' },
          ...(CLASS323.specs?.notches_throttle_brake ?? []),
        ],
      },
    };
    expect(notchToCombinedValue('EMG', withEmg)).toBeNull();
    expect(buildBrakeCommand('EMG', withEmg)).toBeNull();
  });

  it('uses profile mapping for control name', () => {
    expect(
      resolveCombinedControlName({ mappings: { combined_control: 'Regulator' } }),
    ).toBe('Regulator');
  });

  it('maps German split brake S3 to VirtualBrake 0.3', () => {
    const icet = {
      mappings: {
        throttle: 'SimpleThrottle',
        brake: 'VirtualBrake',
        train_brake: 'TrainBrakeControl',
      },
      specs: {
        notches_throttle_brake: [
          { value: -0.3, label: 'S3' },
          { value: 0, label: 'NEU' },
        ],
      },
    };
    expect(buildBrakeCommand('S3', icet)).toEqual({
      command: 'VirtualBrake',
      value: 0.3,
      reason: 'Aplicar S3',
    });
    expect(buildBrakeCommand('NEU', icet)).toBeNull();
    expect(buildReleaseCommand(icet)?.value).toBe(0);
    expect(buildReleaseCommand(icet)?.command).toBe('VirtualBrake');
    expect(buildReleaseCommand(icet)?.reason).toContain('NEU');
  });

  it('releases NEU (VirtualBrake 0) for ICE T when at speed limit target', () => {
    const icet = {
      mappings: {
        throttle: 'SimpleThrottle',
        brake: 'VirtualBrake',
        train_brake: 'TrainBrakeControl',
      },
      specs: {
        notches_throttle_brake: [
          { value: -0.7, label: 'S7' },
          { value: -0.3, label: 'S3' },
          { value: 0, label: 'NEU' },
        ],
      },
    };
    const plan = {
      targetKind: 'SPEED_LIMIT' as const,
      activeStep: {
        notch: 'S3',
        applyNow: true,
        distStart: 0,
        applyAtRemainingM: 80,
      },
    } as BrakePlan;
    const snapshot = createMockSnapshot({
      brake: testBrake(-0.3, { position: 0.3, cylinder: 2, effortKn: 40, projectedStopM: 120 }),
      speedMs: 16.7,
      speedDisplay: 60,
      limits: {
        effective: 160,
        frontal: 160,
        next: { speed: 60, distanceM: 80 },
        upcoming: [],
      },
    });
    const action = resolveSuggestedAction('AUTO', plan, icet, snapshot);
    expect(action?.command).toBe('VirtualBrake');
    expect(action?.value).toBe(0);
    expect(action?.reason).toContain('NEU');
  });

  it('releases NEU for ICE T when combined is positive but brake lever is up', () => {
    const icet = {
      mappings: {
        throttle: 'SimpleThrottle',
        brake: 'VirtualBrake',
        train_brake: 'TrainBrakeControl',
      },
      specs: {
        notches_throttle_brake: [
          { value: -0.3, label: 'S3' },
          { value: 0, label: 'NEU' },
        ],
      },
    };
    const snapshot = createMockSnapshot({
      brake: testBrake(0.17, { position: 0.22, cylinder: 1, projectedStopM: 50 }),
      speedMs: 15,
      speedDisplay: 54,
      limits: {
        effective: 100,
        frontal: 100,
        next: { speed: 60, distanceM: 200 },
        upcoming: [],
      },
    });
    const action = resolveReleaseAction(snapshot, null, icet);
    expect(action?.command).toBe('VirtualBrake');
    expect(action?.value).toBe(0);
    expect(action?.reason).toContain('NEU');
  });

  it('does not NEU when dwelling after stop (ICE T, next station already in Lua)', () => {
    const icet = {
      mappings: {
        throttle: 'SimpleThrottle',
        brake: 'VirtualBrake',
        train_brake: 'TrainBrakeControl',
      },
      specs: {
        notches_throttle_brake: [
          { value: -0.3, label: 'S3' },
          { value: 0, label: 'NEU' },
        ],
      },
    };
    const snapshot = createMockSnapshot({
      brake: testBrake(0.1, { position: 0.25 }),
      speedMs: 0,
      speedDisplay: 0,
      station: { distanceM: 1200, nameOcr: 'Siguiente', eta: '' },
      limits: {
        effective: 100,
        frontal: 100,
        next: { speed: 100, distanceM: 5000 },
        upcoming: [],
      },
    });
    expect(resolveReleaseAction(snapshot, null, icet)).toBeUndefined();
    expect(shouldBlockAutoReleaseForStation(snapshot, null, icet)).toBe(true);
  });

  it('respects agent_config release_block_speed for platform detection', () => {
    const snapshot = createMockSnapshot({
      speedMs: 4,
      speedDisplay: 14,
      station: { distanceM: 0, nameOcr: 'Test', eta: '' },
    });
    const strict = {
      agent_config: { station: { release_block_speed_ms: 5 } },
    };
    const relaxed = {
      agent_config: { station: { release_block_speed_ms: 2 } },
    };
    expect(isAtStationPlatform(snapshot, strict)).toBe(true);
    expect(isAtStationPlatform(snapshot, relaxed)).toBe(false);
  });

  it('does not treat high speed at stale platform distance as at platform', () => {
    const snapshot = createMockSnapshot({
      speedMs: 12,
      speedDisplay: 43,
      station: { distanceM: 0, nameOcr: 'Test', eta: '' },
    });
    expect(isAtStationPlatform(snapshot)).toBe(false);
  });

  it('does not NEU while braking for station approach in apply zone', () => {
    const icet = {
      mappings: {
        throttle: 'SimpleThrottle',
        brake: 'VirtualBrake',
        train_brake: 'TrainBrakeControl',
      },
      specs: {
        notches_throttle_brake: [
          { value: -0.7, label: 'S7' },
          { value: 0, label: 'NEU' },
        ],
      },
    };
    const plan = {
      targetKind: 'STATION' as const,
      activeStep: {
        notch: 'S7',
        phase: 'brake',
        applyNow: true,
        distStart: 50,
        applyAtRemainingM: 400,
      },
    } as BrakePlan;
    const snapshot = createMockSnapshot({
      brake: testBrake(0.1, { position: 0.5 }),
      speedMs: 12,
      speedDisplay: 43,
      station: { distanceM: 300, nameOcr: 'Test', eta: '' },
      limits: {
        effective: 60,
        frontal: 60,
        next: { speed: 60, distanceM: 5000 },
        upcoming: [],
      },
    });
    expect(shouldBlockAutoReleaseForStation(snapshot, plan, icet)).toBe(true);
    expect(resolveReleaseAction(snapshot, plan, icet)).toBeUndefined();
  });

  it('releases NEU when ICE T departs station above crawl speed', () => {
    const icet = {
      mappings: {
        throttle: 'SimpleThrottle',
        brake: 'VirtualBrake',
        train_brake: 'TrainBrakeControl',
      },
      specs: {
        notches_throttle_brake: [{ value: 0, label: 'NEU' }],
      },
    };
    const snapshot = createMockSnapshot({
      brake: testBrake(0.1, { position: 0.25 }),
      speedMs: 8,
      speedDisplay: 29,
      station: { distanceM: 1200, nameOcr: 'Siguiente', eta: '' },
      limits: {
        effective: 100,
        frontal: 100,
        next: { speed: 60, distanceM: 3000 },
        upcoming: [],
      },
    });
    expect(shouldBlockAutoReleaseForStation(snapshot, null, icet)).toBe(false);
    expect(resolveReleaseAction(snapshot, null, icet)?.value).toBe(0);
  });

  it('suggests action only in ARM when apply zone', () => {
    const plan = {
      activeStep: {
        notch: 'B2',
        applyNow: true,
        distStart: 0,
      },
    } as BrakePlan;

    expect(resolveSuggestedAction('SUGGEST', plan, CLASS323)).toBeUndefined();
    expect(resolveSuggestedAction('ARM', plan, CLASS323)?.value).toBe(-0.5);
    expect(resolveSuggestedAction('AUTO', plan, CLASS323)?.value).toBe(-0.5);
  });

  it('suggests OFF when speed at target and braking', () => {
    const snapshot = createMockSnapshot({
      brake: testBrake(-0.5, { cylinder: 2, effortKn: 40, projectedStopM: 200 }),
      limits: { effective: 60, frontal: 60, next: { speed: 45, distanceM: 100 }, upcoming: [] },
      speedDisplay: 44,
    });
    const action = resolveReleaseAction(snapshot, null, CLASS323);
    expect(action?.value).toBe(0);
    expect(action?.reason).toContain('Soltar');
  });

  it('prefers brake apply over OFF when still in apply zone', () => {
    const plan = {
      activeStep: {
        notch: 'B2',
        applyNow: true,
        distStart: 0,
      },
    } as BrakePlan;
    const snapshot = createMockSnapshot({
      brake: testBrake(-0.25, { cylinder: 1, effortKn: 20, projectedStopM: 300 }),
      speedMs: 22,
      speedDisplay: 50,
      limits: { effective: 60, frontal: 60, next: { speed: 45, distanceM: 100 }, upcoming: [] },
    });
    const action = resolveSuggestedAction('AUTO', plan, CLASS323, snapshot);
    expect(action?.value).toBe(-0.5);
  });

  it('does not release OFF when stopped at station without plan', () => {
    const snapshot = createMockSnapshot({
      brake: testBrake(-0.5, { cylinder: 2, effortKn: 40, projectedStopM: 5 }),
      speedMs: 0.1,
      speedDisplay: 0,
      station: { distanceM: 0, nameOcr: 'Test', eta: '' },
      limits: { effective: 25, frontal: 25, next: null, upcoming: [] },
    });
    expect(resolveReleaseAction(snapshot, null, CLASS323)).toBeUndefined();
  });

  it('holds S1 at platform for split ICE T profile', () => {
    const icet = {
      mappings: {
        throttle: 'SimpleThrottle',
        brake: 'VirtualBrake',
        train_brake: 'TrainBrakeControl',
      },
      specs: {
        notches_throttle_brake: [
          { value: -0.3, label: 'S3' },
          { value: -0.1, label: 'S1' },
          { value: 0, label: 'NEU' },
        ],
      },
    };
    const snapshot = createMockSnapshot({
      brake: testBrake(0, { projectedStopM: 50 }),
      speedMs: 0.1,
      speedDisplay: 0,
      station: { distanceM: 0, nameOcr: 'Test', eta: '' },
      limits: { effective: 25, frontal: 25, next: null, upcoming: [] },
    });
    const action = resolveSuggestedAction('AUTO', null, icet, snapshot);
    expect(action?.command).toBe('VirtualBrake');
    expect(action?.value).toBe(0.1);
    expect(action?.reason).toContain('andén');
  });

  it('does not AUTO-brake at station when early vs schedule and step not yet due', () => {
    const future = new Date(Date.now() + 8 * 60_000);
    const eta = `${String(future.getHours()).padStart(2, '0')}:${String(future.getMinutes()).padStart(2, '0')}`;
    const plan = {
      targetKind: 'STATION' as const,
      activeStep: { notch: 'B2', distStart: 80, applyAtRemainingM: 400, applyNow: false },
    };
    const snapshot = createMockSnapshot({
      speedMs: 18,
      speedDisplay: 40,
      station: { distanceM: 700, nameOcr: 'Test', eta },
      brake: testBrake(0, { projectedStopM: 50 }),
      limits: { effective: 60, frontal: 60, next: null, upcoming: [] },
    });
    expect(resolveSuggestedAction('AUTO', plan as never, CLASS323, snapshot)).toBeUndefined();
  });

  it('does not release OFF when at station platform', () => {
    const snapshot = createMockSnapshot({
      brake: testBrake(-0.5, { cylinder: 2, effortKn: 40, projectedStopM: 20 }),
      speedMs: 2,
      speedDisplay: 4,
      station: { distanceM: 0, nameOcr: 'Test', eta: '' },
      limits: { effective: 25, frontal: 25, next: null, upcoming: [] },
    });
    const plan = {
      targetKind: 'STATION' as const,
      activeStep: { notch: 'B2', distStart: 0, applyAtRemainingM: 0, applyNow: true },
    };
    expect(resolveReleaseAction(snapshot, plan as never, CLASS323)).toBeUndefined();
  });

  it('blocks AUTO commands on SAFETY', () => {
    const plan = {
      activeStep: { notch: 'B2', applyNow: true, distStart: 0 },
    } as BrakePlan;
    expect(resolveSuggestedAction('AUTO', plan, CLASS323, undefined, true)).toBeUndefined();
  });

  it('releases OFF in apply zone when already at target speed', () => {
    const plan = {
      targetKind: 'SPEED_LIMIT' as const,
      activeStep: {
        notch: 'B2',
        applyNow: true,
        distStart: 0,
        applyAtRemainingM: 80,
      },
    } as BrakePlan;
    const snapshot = createMockSnapshot({
      brake: testBrake(-0.5, { cylinder: 2, effortKn: 40, projectedStopM: 120 }),
      speedMs: 22.35,
      speedDisplay: 50,
      limits: { effective: 60, frontal: 60, next: { speed: 50, distanceM: 80 }, upcoming: [] },
    });
    const action = resolveReleaseAction(snapshot, plan as never, CLASS323);
    expect(action?.value).toBe(0);
  });

  it('does not re-brake after OFF coast latch near speed limit', () => {
    const plan = {
      targetKind: 'SPEED_LIMIT' as const,
      activeStep: {
        notch: 'B1',
        applyNow: true,
        distStart: 0,
        applyAtRemainingM: 40,
      },
    } as BrakePlan;

    const braking = createMockSnapshot({
      brake: testBrake(-0.5, { cylinder: 2, effortKn: 40, projectedStopM: 80 }),
      speedMs: 22.8,
      speedDisplay: 51,
      limits: { effective: 60, frontal: 60, next: { speed: 50, distanceM: 60 }, upcoming: [] },
    });
    resolveSuggestedAction('AUTO', plan, CLASS323, braking);

    const coasting = createMockSnapshot({
      brake: testBrake(0, { projectedStopM: 200 }),
      speedMs: 22.8,
      speedDisplay: 51,
      limits: { effective: 60, frontal: 60, next: { speed: 50, distanceM: 40 }, upcoming: [] },
    });
    expect(resolveSuggestedAction('AUTO', plan, CLASS323, coasting)).toBeUndefined();
  });

  it('allows braking again after coast latch when clearly above target', () => {
    const plan = {
      targetKind: 'SPEED_LIMIT' as const,
      activeStep: { notch: 'B2', applyNow: true, distStart: 0 },
    } as BrakePlan;

    const atTarget = createMockSnapshot({
      brake: testBrake(-0.5, { cylinder: 2, effortKn: 40, projectedStopM: 80 }),
      speedMs: 22.35,
      speedDisplay: 50,
      limits: { effective: 60, frontal: 60, next: { speed: 50, distanceM: 80 }, upcoming: [] },
    });
    expect(resolveSuggestedAction('AUTO', plan, CLASS323, atTarget)?.value).toBe(0);

    const fastAgain = createMockSnapshot({
      brake: testBrake(0, { projectedStopM: 300 }),
      speedMs: 31,
      speedDisplay: 69,
      limits: { effective: 60, frontal: 60, next: { speed: 50, distanceM: 150 }, upcoming: [] },
    });
    expect(resolveSuggestedAction('AUTO', plan, CLASS323, fastAgain)?.value).toBe(-0.5);
  });

  it('brakes for speed limit when past nominal apply point (late distStart)', () => {
    const icet = {
      mappings: {
        throttle: 'SimpleThrottle',
        brake: 'VirtualBrake',
        train_brake: 'TrainBrakeControl',
      },
      specs: {
        notches_throttle_brake: [
          { value: -0.7, label: 'S7' },
          { value: -0.5, label: 'S5' },
          { value: -0.3, label: 'S3' },
          { value: -0.1, label: 'S1' },
          { value: 0, label: 'NEU' },
        ],
      },
    };
    const plan = {
      targetKind: 'SPEED_LIMIT' as const,
      activeStep: {
        notch: 'S7',
        applyNow: false,
        distStart: -320,
        applyAtRemainingM: 480,
      },
    } as BrakePlan;
    const snapshot = createMockSnapshot({
      brake: testBrake(0.4, { projectedStopM: 900 }),
      speedMs: 27.8,
      speedDisplay: 100,
      limits: { effective: 160, frontal: 160, next: { speed: 60, distanceM: 153 }, upcoming: [] },
    });
    const action = resolveSuggestedAction('AUTO', plan, icet, snapshot);
    expect(action?.command).toBe('VirtualBrake');
    expect(action?.value).toBe(0.7);
  });
});
