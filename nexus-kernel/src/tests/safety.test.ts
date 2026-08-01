import { describe, expect, it } from 'vitest';
import { resolveSafetyAlerts } from '../safetyUtils';
import { toTelemetrySnapshot } from '../toSnapshot';
import { DEFAULT_TELEMETRY_DATA } from '../telemetryTypes';

describe('resolveSafetyAlerts', () => {
  it('does not alarm when AWS=1 (sistema activo, circulación normal)', () => {
    expect(resolveSafetyAlerts({ ...DEFAULT_TELEMETRY_DATA, AWS: 1 })).toEqual({
      aws: false,
      dsd: false,
    });
  });

  it('alarms when AWS>1 or AWSWarnCount>0', () => {
    expect(resolveSafetyAlerts({ ...DEFAULT_TELEMETRY_DATA, AWS: 2 }).aws).toBe(true);
    expect(resolveSafetyAlerts({ ...DEFAULT_TELEMETRY_DATA, AWSWarnCount: 1 }).aws).toBe(true);
  });

  it('clears AWS alarm when reset is pressed', () => {
    expect(
      resolveSafetyAlerts({ ...DEFAULT_TELEMETRY_DATA, AWS: 2, AWSReset: 1 }).aws,
    ).toBe(false);
  });

  it('detects DSD from multiple vigilance fields', () => {
    expect(resolveSafetyAlerts({ ...DEFAULT_TELEMETRY_DATA, DVDAlarm: 1 }).dsd).toBe(true);
  });
});

describe('toTelemetrySnapshot safety', () => {
  it('maps AWS=1 as non-alarm in snapshot', () => {
    const snap = toTelemetrySnapshot(
      { ...DEFAULT_TELEMETRY_DATA, AWS: 1 },
      true,
      'class323',
    );
    expect(snap.safety.aws).toBe(false);
  });
});
