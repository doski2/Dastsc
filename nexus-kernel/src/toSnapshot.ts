import type { TelemetrySnapshot } from './types';
import type { TelemetryData } from './telemetryTypes';
import { resolveSafetyAlerts } from './safetyUtils';

export function toTelemetrySnapshot(
  data: TelemetryData,
  connected: boolean,
  profileId: string | null,
): TelemetrySnapshot {
  const upcoming = data.UpcomingLimits.map(limit => ({
    speed: limit.speed,
    distanceM: limit.distance,
  }));

  const next = upcoming.length > 0
    ? { speed: upcoming[0].speed, distanceM: upcoming[0].distanceM }
    : data.DistToNextSpeedLimit > 0
      ? { speed: data.NextSpeedLimit, distanceM: data.DistToNextSpeedLimit }
      : null;

  return {
    t: data.Timestamp,
    speedMs: data.Speed,
    speedDisplay: data.SpeedDisplay,
    speedUnit: data.SpeedUnit,
    limits: {
      effective: data.SpeedLimit,
      frontal: data.FrontalSpeedLimit,
      next,
      upcoming,
    },
    signaling: {
      aspect: data.NextSignalAspect,
      distanceM: data.DistToNextSignal,
    },
    station: {
      distanceM: data.StationDistance,
      nameOcr: data.StationNameOCR || data.StationName,
      eta: data.StationETA,
    },
    brake: {
      combined: data.CombinedControl,
      cylinder: data.BrakeCylinderPressure,
      effortKn: data.BrakingEffort,
      projectedStopM: data.ProjectedBrakingDistance,
    },
    tail: {
      active: data.TailIsActive,
      distanceM: data.TailDistanceRemaining,
      seconds: data.TailSecondsRemaining,
    },
    safety: {
      ...resolveSafetyAlerts(data),
      dra: data.DRA,
    },
    train: {
      lengthM: data.TrainLength,
      massT: data.TrainMass,
      consistType: data.TrainType,
      profileId,
      name: data.LocoName,
    },
    gradient: data.Gradient,
    tripDistanceM: data.TripDistance,
    connected,
  };
}
