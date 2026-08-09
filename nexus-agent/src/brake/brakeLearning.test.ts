import { describe, expect, it } from 'vitest';
import {
  estimateBrakeNotchForLearning,
  estimateBrakeNotchFromPosition,
  isBrakeEngagedForLearning,
} from './brakeLearning';
import type { CommandProfile } from './types';

const ICET: CommandProfile = {
  mappings: {
    throttle: 'SimpleThrottle',
    brake: 'VirtualBrake',
    train_brake: 'TrainBrakeControl',
  },
  specs: {
    notches_throttle_brake: [
      { value: -0.7, label: 'S7' },
      { value: -0.6, label: 'S6' },
      { value: -0.5, label: 'S5' },
      { value: -0.4, label: 'S4' },
      { value: -0.3, label: 'S3' },
      { value: -0.2, label: 'S2' },
      { value: -0.1, label: 'S1' },
      { value: 0, label: 'NEU' },
    ],
  },
};

const CLASS323: CommandProfile = {
  mappings: { combined_control: 'ThrottleAndBrake' },
  specs: {
    notches_throttle_brake: [
      { value: -0.5, label: 'B2' },
      { value: -0.25, label: 'B1' },
      { value: 0, label: 'OFF' },
    ],
  },
};

describe('brakeLearning', () => {
  it('maps ICE T VirtualBrake position to service notch', () => {
    expect(estimateBrakeNotchFromPosition(0.6, ICET)).toBe('S6');
    expect(estimateBrakeNotchFromPosition(0.3, ICET)).toBe('S3');
    expect(estimateBrakeNotchFromPosition(0.1, ICET)).toBe('S1');
    expect(estimateBrakeNotchFromPosition(0, ICET)).toBe('?');
  });

  it('uses position not combined for split ICE T', () => {
    const signals = { combined: 0.17, brakePosition: 0.6 };
    expect(estimateBrakeNotchForLearning(signals, ICET)).toBe('S6');
    expect(isBrakeEngagedForLearning(signals, ICET)).toBe(true);
    expect(isBrakeEngagedForLearning({ combined: 0.17, brakePosition: 0 }, ICET)).toBe(false);
  });

  it('keeps combined learning for Class 323', () => {
    const signals = { combined: -0.5, brakePosition: 0 };
    expect(estimateBrakeNotchForLearning(signals, CLASS323)).toBe('B2');
    expect(isBrakeEngagedForLearning(signals, CLASS323)).toBe(true);
  });
});
