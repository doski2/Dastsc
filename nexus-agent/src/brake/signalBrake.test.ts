import { describe, expect, it } from 'vitest';
import { createMockSnapshot } from '@nexus/kernel';
import { tickAgent } from '../tick';
import { planBrakeForSignal, planSignalFinalStop } from './planBrake';
import { signalRequiresFullStop } from './signalUtils';
import type { BrakePlanProfile } from './types';

const PROFILE: BrakePlanProfile = {
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
      { value: 0, label: 'OFF' },
    ],
  },
};

describe('signalUtils', () => {
  it('treats DANGER as full stop', () => {
    expect(signalRequiresFullStop('DANGER')).toBe(true);
    expect(signalRequiresFullStop('CAUTION')).toBe(false);
  });
});

describe('signal braking', () => {
  it('plans stop for DANGER at distance', () => {
    const plan = planBrakeForSignal({
      speedMs: 20,
      gradient: 0,
      train: { massT: 180, lengthM: 120 },
      signaling: { distanceM: 700, aspect: 'DANGER' },
    }, { profile: PROFILE });

    expect(plan?.targetKind).toBe('SIGNAL');
    expect(plan?.activeStep?.notch).toBeTruthy();
    expect(plan!.distanceToTargetM).toBe(700);
  });

  it('ignores CAUTION for full stop plan', () => {
    const plan = planBrakeForSignal({
      speedMs: 20,
      gradient: 0,
      train: { massT: 180, lengthM: 120 },
      signaling: { distanceM: 700, aspect: 'CAUTION' },
    }, { profile: PROFILE });
    expect(plan).toBeNull();
  });

  it('plans final stop at signal when close', () => {
    const plan = planSignalFinalStop({
      speedMs: 3,
      signaling: { distanceM: 0, aspect: 'DANGER' },
    }, { profile: PROFILE });
    expect(plan?.activeStep?.phase).toBe('stop');
    expect(plan?.targetKind).toBe('SIGNAL');
  });

  it('tickAgent prioritizes closer DANGER signal over distant station', () => {
    const snapshot = createMockSnapshot({
      signaling: { aspect: 'DANGER', distanceM: 400 },
      station: { distanceM: 2000, nameOcr: 'Far', eta: '' },
      speedMs: 20,
      speedDisplay: 72,
      speedUnit: 'km/h',
    });
    const tick = tickAgent(snapshot, 'AUTO', { profile: PROFILE });
    expect(tick.headline).toContain('Señal DANGER');
    expect(tick.brakeContext?.targetKind).toBe('SIGNAL');
  });
});
