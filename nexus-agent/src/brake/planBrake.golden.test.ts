import { describe, expect, it } from 'vitest';
import {
  computeBrakeParams,
  displaySpeedToMs,
  type BrakeStatsByNotch,
  type TrainProfile,
} from '../../../Dastsc-V3/src/v3/components/display/brakingCurveUtils';
import type { TelemetryData } from '../../../Dastsc-V3/src/v3/core/TelemetryContext';
import { planBrake } from './planBrake';
import type { BrakePlanProfile, BrakePlanStepDetail } from './types';

const CLASS323_PROFILE: TrainProfile & BrakePlanProfile = {
  id: 'class323',
  name: 'Class 323',
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

function baseTelemetry(overrides: Partial<TelemetryData> = {}): TelemetryData {
  return {
    Speed: 29.9,
    SpeedDisplay: 67,
    SpeedUnit: 'MPH',
    ProjectedSpeed: 0,
    Acceleration: 0,
    GForce: 0,
    LateralG: 0,
    SpeedLimit: 60,
    TrackLimit: 60,
    SignalLimit: 60,
    FrontalSpeedLimit: 60,
    Gradient: 2,
    RawGradient: 2,
    DistToNextSignal: 1100,
    NextSignalAspect: 'CAUTION',
    NextSpeedLimit: 40,
    DistToNextSpeedLimit: 420,
    NextLimit2Speed: 60,
    DistToNextLimit2: 1100,
    UpcomingLimits: [],
    StationDistance: 900,
    StationName: 'Birmingham',
    StationLength: 0,
    StationNameOCR: 'Birmingham',
    StationETA: '',
    StationScheduled: '',
    Throttle: 0,
    TrainBrake: 0,
    CombinedControl: -0.5,
    Reverser: 0,
    BrakeCylinderPressure: 2,
    BrakePipePressure: 5,
    MainResPressure: 8,
    EqResPressure: 5,
    PressureUnit: 'BAR',
    Amperage: 0,
    AmperageUnit: 'A',
    Ammeter: 0,
    TractiveEffort: 0,
    TractionPercent: 0,
    BrakingEffort: 45,
    BrakingPercent: 0,
    TrainLength: 120,
    TrainMass: 180,
    ConsistType: 1,
    TrainType: 1,
    ActiveCab: 1,
    ProjectedBrakingDistance: 890,
    TripDistance: 12400,
    TailDistanceRemaining: 0,
    TailSecondsRemaining: 0,
    TailIsActive: false,
    LocoName: 'Class 323',
    RVNumber: '',
    RouteID: '',
    ScenarioPath: '',
    X: 0,
    Z: 0,
    NX: 0,
    NY: 0,
    NZ: 0,
    FarXT: 0,
    FarZO: 0,
    Curvature: 0,
    TimeOfDay: '12:00:00',
    location: '',
    AWS: 0,
    AWSWarning: 0,
    DSD: 0,
    VigilAlarm: 0,
    DRA: false,
    DoorL: 0,
    DoorR: 0,
    Sander: 0,
    Timestamp: Date.now(),
    ...overrides,
  } as TelemetryData;
}

function assertStepsMatchV3(
  v3Steps: { notch: string; distNeeded: number; distStart: number }[],
  v4Steps: BrakePlanStepDetail[],
  toleranceM = 0.5,
): void {
  expect(v4Steps.length).toBe(v3Steps.length);
  for (let i = 0; i < v3Steps.length; i++) {
    expect(v4Steps[i].notch).toBe(v3Steps[i].notch);
    expect(v4Steps[i].distanceM).toBeCloseTo(v3Steps[i].distNeeded, toleranceM);
    expect(v4Steps[i].distStart).toBeCloseTo(v3Steps[i].distStart, toleranceM);
  }
}

describe('planBrake golden parity with V3 computeBrakeParams', () => {
  it('station stop — flat, Class 323', () => {
    const raw = baseTelemetry();
    const v3 = computeBrakeParams(
      'DYNAMIC',
      raw,
      { label: 'Station', dist: raw.StationDistance, val: 'OCR', isRealTarget: true },
      CLASS323_PROFILE,
      {},
    );
    const v4 = planBrake(
      {
        speedMs: raw.Speed,
        distanceToTargetM: raw.StationDistance,
        targetSpeedMs: 0,
        massT: raw.TrainMass,
        lengthM: raw.TrainLength,
        gradientPermille: raw.Gradient,
        consistType: raw.TrainType,
        profile: CLASS323_PROFILE,
      },
      'STATION',
    );

    expect(v3).not.toBeNull();
    expect(v4).not.toBeNull();
    assertStepsMatchV3(v3!.steps, v4!.steps);
  });

  it('speed limit reduction — uphill gradient', () => {
    const raw = baseTelemetry({ Gradient: 8, DistToNextSpeedLimit: 650 });
    const v3 = computeBrakeParams(
      'LIMIT',
      raw,
      {
        label: 'Next Limit',
        dist: raw.DistToNextSpeedLimit,
        val: '40 MPH',
        isRealTarget: true,
      },
      CLASS323_PROFILE,
      {},
    );
    const v4 = planBrake(
      {
        speedMs: raw.Speed,
        distanceToTargetM: raw.DistToNextSpeedLimit,
        targetSpeedMs: displaySpeedToMs(raw.NextSpeedLimit, raw.SpeedUnit),
        massT: raw.TrainMass,
        lengthM: raw.TrainLength,
        gradientPermille: raw.Gradient,
        consistType: raw.TrainType,
        profile: CLASS323_PROFILE,
      },
      'SPEED_LIMIT',
    );

    expect(v3).not.toBeNull();
    expect(v4).not.toBeNull();
    assertStepsMatchV3(v3!.steps, v4!.steps);
  });

  it('learned decel per notch matches V3', () => {
    const stats: BrakeStatsByNotch = {
      B2: { avg_decel: 0.68, samples: 4 },
      B3: { avg_decel: 0.95, samples: 6 },
    };
    const raw = baseTelemetry({ StationDistance: 1100 });
    const v3 = computeBrakeParams(
      'DYNAMIC',
      raw,
      { label: 'Station', dist: raw.StationDistance, val: 'OCR', isRealTarget: true },
      CLASS323_PROFILE,
      stats,
    );
    const v4 = planBrake(
      {
        speedMs: raw.Speed,
        distanceToTargetM: raw.StationDistance,
        targetSpeedMs: 0,
        massT: raw.TrainMass,
        lengthM: raw.TrainLength,
        gradientPermille: raw.Gradient,
        consistType: raw.TrainType,
        profile: CLASS323_PROFILE,
        brakeStats: stats,
      },
      'STATION',
    );

    assertStepsMatchV3(v3!.steps, v4!.steps);
    expect(v4!.steps.find(s => s.notch === 'B2')?.usingLearned).toBe(true);
  });

  it('downhill requires longer distances in both engines', () => {
    const uphill = baseTelemetry({ Gradient: 10, StationDistance: 1000 });
    const downhill = baseTelemetry({ Gradient: -10, StationDistance: 1000 });

    const v3Up = computeBrakeParams(
      'DYNAMIC',
      uphill,
      { label: 'Station', dist: uphill.StationDistance, val: 'OCR', isRealTarget: true },
      CLASS323_PROFILE,
      {},
    );
    const v3Down = computeBrakeParams(
      'DYNAMIC',
      downhill,
      { label: 'Station', dist: downhill.StationDistance, val: 'OCR', isRealTarget: true },
      CLASS323_PROFILE,
      {},
    );

    const b2Up = v3Up!.steps.find((s: { notch: string }) => s.notch === 'B2')!;
    const b2Down = v3Down!.steps.find((s: { notch: string }) => s.notch === 'B2')!;
    expect(b2Down.distNeeded).toBeGreaterThan(b2Up.distNeeded);
  });
});
