import type { TelemetrySnapshot } from './types';

/** Snapshot de desarrollo hasta conectar kernel real (port desde V3). */
export function createMockSnapshot(overrides: Partial<TelemetrySnapshot> = {}): TelemetrySnapshot {
  return {
    t: Date.now(),
    speedMs: 29.9,
    speedDisplay: 67,
    speedUnit: 'MPH',
    limits: {
      effective: 60,
      frontal: 60,
      next: { speed: 40, distanceM: 420 },
      upcoming: [
        { speed: 40, distanceM: 420 },
        { speed: 60, distanceM: 1100 },
      ],
    },
    signaling: {
      aspect: 'CAUTION',
      distanceM: 1100,
    },
    station: {
      distanceM: 2400,
      nameOcr: 'Ashford',
      eta: '14:38',
    },
    brake: {
      combined: -0.35,
      position: 0.35,
      cylinder: 2.1,
      effortKn: 45,
      tractiveKn: -45,
      projectedStopM: 890,
    },
    tail: {
      active: false,
      distanceM: 0,
      seconds: 0,
    },
    safety: {
      aws: false,
      dsd: false,
      dra: false,
    },
    train: {
      lengthM: 120,
      massT: 180,
      consistType: 1,
      profileId: 'class323_expert',
      name: 'Class 323',
    },
    gradient: 2,
    rawGradient: 2,
    activeCab: 1,
    reverser: 1,
    tripDistanceM: 12400,
    connected: true,
    ...overrides,
  };
}
