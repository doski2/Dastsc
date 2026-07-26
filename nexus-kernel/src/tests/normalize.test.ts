import { describe, expect, it } from 'vitest';
import { formatDistance, formatSpeed } from '../format';
import { TelemetryHub } from '../TelemetryHub';

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

describe('TelemetryHub', () => {
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
