import { describe, expect, it } from 'vitest';
import { createMockSnapshot } from '@nexus/kernel';
import {
  buildBrakeCommand,
  notchToCombinedValue,
  resolveCombinedControlName,
  resolveReleaseAction,
  resolveSuggestedAction,
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

describe('commandBus', () => {
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
      brake: { combined: -0.5, cylinder: 2, effortKn: 40, projectedStopM: 200 },
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
      brake: { combined: -0.25, cylinder: 1, effortKn: 20, projectedStopM: 300 },
      limits: { effective: 60, frontal: 60, next: { speed: 45, distanceM: 100 }, upcoming: [] },
      speedDisplay: 44,
    });
    const action = resolveSuggestedAction('AUTO', plan, CLASS323, snapshot);
    expect(action?.value).toBe(-0.5);
  });

  it('blocks AUTO commands on SAFETY', () => {
    const plan = {
      activeStep: { notch: 'B2', applyNow: true, distStart: 0 },
    } as BrakePlan;
    expect(resolveSuggestedAction('AUTO', plan, CLASS323, undefined, true)).toBeUndefined();
  });
});
