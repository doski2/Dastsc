import { describe, expect, it } from 'vitest';
import { formatDistance, formatSpeed } from '../format';
import {
  resolveCombinedControl,
  resolveStationDistance,
  stickyStationDistance,
} from '../dataNormalizerUtils';
import { TelemetryHub } from '../TelemetryHub';
import type { TelemetryData } from '../telemetryTypes';

/** Payload estilo parser.py / test_parser.py + campos típicos TSC. */
const SAMPLE_RAW = {
  Speed: 45.5,
  SpeedoType: 1,
  SimulationTime: 100,
  CurrentSpeedLimit: 60,
  NextLimitSpeed: 40,
  NextLimitDist: 420,
  NextLimit2Speed: 60,
  NextLimit2Dist: 1100,
  TrainLength: 120,
  Mass: 180,
  LocoName: 'Class 323',
  ThrottleAndBrake: -0.5,
  Gradient: 2,
  SigState: 1,
  SigRes: 1,
  SigDist: 800,
  StationDistance: 2400,
  StationNameOCR: 'Ashford',
  StationETA: '14:38',
};

describe('format', () => {
  it('formats speed with one decimal', () => {
    expect(formatSpeed(67.34)).toBe('67.3');
  });

  it('formats distance in miles for MPH', () => {
    expect(formatDistance(1609.344, 'MPH')).toBe('1.00 mi');
    expect(formatDistance(420, 'MPH')).toBe('0.26 mi');
  });
});

describe('stickyStationDistance', () => {
  it('subtracts trip delta between OCR readings', () => {
    const prev = { StationDistance: 1000, TripDistance: 5000 } as TelemetryData;
    const next = stickyStationDistance(
      { StationDistance: -1, TripDistance: 5100 },
      prev,
    );
    expect(next).toBe(900);
  });

  it('rejects OCR jumps that increase distance', () => {
    const prev = { StationDistance: 800, TripDistance: 10000 } as TelemetryData;
    const next = stickyStationDistance(
      { StationDistance: 950, TripDistance: 10100 },
      prev,
    );
    expect(next).toBe(700);
  });

  it('accepts handoff to next station after dwell (0 m → 50 km)', () => {
    const prev = { StationDistance: 0, TripDistance: 12000 } as TelemetryData;
    const next = stickyStationDistance(
      { StationDistance: 50000, TripDistance: 12150 },
      prev,
    );
    expect(next).toBe(50000);
  });

  it('accepts handoff from platform zone to far next station', () => {
    const prev = { StationDistance: 15, TripDistance: 8000 } as TelemetryData;
    const next = stickyStationDistance(
      { StationDistance: 48000, TripDistance: 8200 },
      prev,
    );
    expect(next).toBe(48000);
  });
});

describe('resolveStationDistance', () => {
  it('passes through ocr_tracker distance without sticky jump rejection', () => {
    const prev = {
      StationDistance: 800,
      TripDistance: 10000,
      StationDistanceSource: 'ocr_tracker',
    } as TelemetryData;
    const next = resolveStationDistance(
      {
        StationDistance: 950,
        TripDistance: 10100,
        StationDistanceSource: 'ocr_tracker',
      },
      prev,
    );
    expect(next).toBe(950);
    expect(stickyStationDistance(
      { StationDistance: 950, TripDistance: 10100 },
      prev,
    )).toBe(700);
  });

  it('passes through lua distance from backend', () => {
    const prev = { StationDistance: 1200, StationDistanceSource: 'lua' } as TelemetryData;
    const next = resolveStationDistance(
      { StationDistance: 1180.4, StationDistanceSource: 'lua' },
      prev,
    );
    expect(next).toBe(1180.4);
  });

  it('holds previous backend distance when source is authoritative but reading missing', () => {
    const prev = {
      StationDistance: 640,
      StationDistanceSource: 'ocr_tracker',
    } as TelemetryData;
    const next = resolveStationDistance(
      { StationDistanceSource: 'ocr_tracker' },
      prev,
    );
    expect(next).toBe(640);
  });

  it('falls back to sticky when source is none', () => {
    const prev = { StationDistance: 1000, TripDistance: 5000 } as TelemetryData;
    const next = resolveStationDistance(
      { StationDistance: -1, TripDistance: 5100, StationDistanceSource: 'none' },
      prev,
    );
    expect(next).toBe(900);
  });
});

describe('resolveCombinedControl', () => {
  it('uses ThrottleAndBrake when present', () => {
    expect(resolveCombinedControl({ ThrottleAndBrake: -0.5 }, 0, 0)).toBe(-0.5);
  });

  it('ignores Combined:0 placeholder on split German layout', () => {
    expect(resolveCombinedControl(
      { Combined: 0, Regulator: 0.6, TrainBrakeControl: 0.3 },
      0.6,
      0.3,
    )).toBeCloseTo(0.3);
  });

  it('computes negative combined when braking on split layout', () => {
    expect(resolveCombinedControl(
      { Combined: 0, Regulator: 0, TrainBrakeControl: 0.5 },
      0,
      0.5,
    )).toBeCloseTo(-0.5);
  });
});

describe('TelemetryHub', () => {
  it('normalizes ICE T split brake telemetry', () => {
    const hub = new TelemetryHub();
    const snapshot = hub.ingestRaw(
      {
        Speed: 30,
        SpeedoType: 2,
        SimulationTime: 50,
        CurrentSpeedLimit: 120,
        SimpleThrottle: 0.4,
        VirtualBrake: 0.3,
        TrainBrake: 0.3,
        Combined: 0,
        Gradient: 0,
      },
      true,
      'icet',
    );

    expect(snapshot.brake.combined).toBeCloseTo(0.1);
    expect(snapshot.brake.position).toBeCloseTo(0.3);
  });

  it('inverts ICE T driver gradient when profile requests flip', () => {
    const hub = new TelemetryHub();
    hub.setProfile({
      physics_config: {
        gradient_mode: 'driver',
        gradient_sign_flip: true,
      },
    });
    const snapshot = hub.ingestRaw(
      {
        Speed: 40,
        SpeedoType: 2,
        SimulationTime: 50,
        CurrentSpeedLimit: 160,
        GradientPct: 1.4,
        Gradient: 14,
        Reversal: 1,
        ActiveCab: 1,
        WheelSpeedMS: 0,
      },
      true,
      'icet',
    );

    expect(snapshot.rawGradient).toBeCloseTo(14, 1);
    expect(snapshot.gradient).toBeLessThan(0);
  });

  it('normalizes GetData-style payload into TelemetrySnapshot', () => {
    const hub = new TelemetryHub();
    const snapshot = hub.ingestRaw(SAMPLE_RAW, true, 'class323_expert');

    expect(snapshot.train.name).toBe('Class 323');
    expect(snapshot.speedDisplay).toBeGreaterThan(40);
    expect(snapshot.limits.next?.distanceM).toBe(420);
    expect(snapshot.limits.next?.speed).toBeCloseTo(40, 0);
    expect(snapshot.station.nameOcr).toBe('Ashford');
    expect(snapshot.connected).toBe(true);
    expect(snapshot.train.profileId).toBe('class323_expert');
    expect(snapshot.rawGradient).toBe(2);
    expect(snapshot.activeCab).toBe(1);
  });

  it('uses manual gradient sign + when set on hub', () => {
    const hub = new TelemetryHub();
    hub.setGradientSign('+');
    const snapshot = hub.ingestRaw(
      { ...SAMPLE_RAW, ActiveCab: 2, Reversal: 1, Gradient: 3 },
      true,
      'class323_expert',
    );
    expect(snapshot.rawGradient).toBe(3);
    expect(snapshot.gradient).toBe(3);
  });

  it('uses manual gradient sign - to invert raw', () => {
    const hub = new TelemetryHub();
    hub.setGradientSign('-');
    const snapshot = hub.ingestRaw(
      { ...SAMPLE_RAW, ActiveCab: 1, Reversal: 1, Gradient: 4 },
      true,
      'class323_expert',
    );
    expect(snapshot.rawGradient).toBe(4);
    expect(snapshot.gradient).toBe(-4);
  });

  it('inverts gradient sign for cab 2 forward', () => {
    const hub = new TelemetryHub();
    const snapshot = hub.ingestRaw(
      { ...SAMPLE_RAW, ActiveCab: 2, Reversal: 1, Gradient: 3 },
      true,
      'class323_expert',
    );
    expect(snapshot.rawGradient).toBe(3);
    expect(snapshot.gradient).toBe(-3);
    expect(snapshot.activeCab).toBe(2);
  });

  it('inverts gradient for cab 1 reverse without changing cab number', () => {
    const hub = new TelemetryHub();
    const snapshot = hub.ingestRaw(
      { ...SAMPLE_RAW, ActiveCab: 1, Reversal: -1, Gradient: 4 },
      true,
      'class323_expert',
    );
    expect(snapshot.activeCab).toBe(1);
    expect(snapshot.gradient).toBe(-4);
  });

  it('keeps gradient sign for cab 2 reverse', () => {
    const hub = new TelemetryHub();
    const snapshot = hub.ingestRaw(
      { ...SAMPLE_RAW, ActiveCab: 2, Reversal: -1, Gradient: -5 },
      true,
      'class323_expert',
    );
    expect(snapshot.gradient).toBe(-5);
  });

  it('ingests TELEMETRY websocket messages', () => {
    const hub = new TelemetryHub();
    const snapshot = hub.ingestMessage(
      { type: 'TELEMETRY', ...SAMPLE_RAW },
      true,
      null,
    );

    expect(snapshot).not.toBeNull();
    expect(snapshot!.speedUnit).toBe('MPH');
  });

  it('ignores non-telemetry messages', () => {
    const hub = new TelemetryHub();
    expect(hub.ingestMessage({ type: 'HEARTBEAT' }, true, null)).toBeNull();
  });
});
