import type { AgentConfig, CommandProfile } from './types';
import {
  COAST_CLEAR_OVERSHOOT_KMH,
  COAST_CLEAR_OVERSHOOT_MPH,
  COAST_REBRAKE_MARGIN_KMH,
  COAST_REBRAKE_MARGIN_MPH,
  STATION_DEPARTURE_SPEED_MS,
  STATION_DWELL_MAX_DISTANCE_M,
  STATION_FINAL_STOP_SPEED_MS,
  STATION_HOLD_MAX_SPEED_MS,
  STATION_RELEASE_BLOCK_SPEED_MS,
} from './physics';

export interface ResolvedAgentStationConfig {
  dwellMaxDistanceM: number;
  platformTailM: number;
  holdMaxSpeedMs: number;
  releaseBlockSpeedMs: number;
  departureSpeedMs: number;
  finalStopSpeedMs: number;
  planHorizonM: number;
}

export interface ResolvedAgentBrakeConfig {
  releaseMarginMph: number;
  releaseMarginKmh: number;
  brakePositionThreshold: number;
  brakingCombinedThreshold: number;
  coastRebrakeMarginMph: number;
  coastRebrakeMarginKmh: number;
  coastClearOvershootMph: number;
  coastClearOvershootKmh: number;
}

export interface ResolvedAgentConfig {
  station: ResolvedAgentStationConfig;
  brake: ResolvedAgentBrakeConfig;
}

const DEFAULT_STATION: ResolvedAgentStationConfig = {
  dwellMaxDistanceM: STATION_DWELL_MAX_DISTANCE_M,
  platformTailM: -20,
  holdMaxSpeedMs: STATION_HOLD_MAX_SPEED_MS,
  releaseBlockSpeedMs: STATION_RELEASE_BLOCK_SPEED_MS,
  departureSpeedMs: STATION_DEPARTURE_SPEED_MS,
  finalStopSpeedMs: STATION_FINAL_STOP_SPEED_MS,
  planHorizonM: 1500,
};

const DEFAULT_BRAKE: ResolvedAgentBrakeConfig = {
  releaseMarginMph: 2,
  releaseMarginKmh: 3,
  brakePositionThreshold: 0.05,
  brakingCombinedThreshold: -0.05,
  coastRebrakeMarginMph: COAST_REBRAKE_MARGIN_MPH,
  coastRebrakeMarginKmh: COAST_REBRAKE_MARGIN_KMH,
  coastClearOvershootMph: COAST_CLEAR_OVERSHOOT_MPH,
  coastClearOvershootKmh: COAST_CLEAR_OVERSHOOT_KMH,
};

function pickStation(
  overrides?: AgentConfig['station'],
): ResolvedAgentStationConfig {
  return {
    dwellMaxDistanceM: overrides?.dwell_max_distance_m ?? DEFAULT_STATION.dwellMaxDistanceM,
    platformTailM: overrides?.platform_tail_m ?? DEFAULT_STATION.platformTailM,
    holdMaxSpeedMs: overrides?.hold_max_speed_ms ?? DEFAULT_STATION.holdMaxSpeedMs,
    releaseBlockSpeedMs: overrides?.release_block_speed_ms ?? DEFAULT_STATION.releaseBlockSpeedMs,
    departureSpeedMs: overrides?.departure_speed_ms ?? DEFAULT_STATION.departureSpeedMs,
    finalStopSpeedMs: overrides?.final_stop_speed_ms ?? DEFAULT_STATION.finalStopSpeedMs,
    planHorizonM: overrides?.plan_horizon_m ?? DEFAULT_STATION.planHorizonM,
  };
}

function pickBrake(
  overrides?: AgentConfig['brake'],
): ResolvedAgentBrakeConfig {
  return {
    releaseMarginMph: overrides?.release_margin_mph ?? DEFAULT_BRAKE.releaseMarginMph,
    releaseMarginKmh: overrides?.release_margin_kmh ?? DEFAULT_BRAKE.releaseMarginKmh,
    brakePositionThreshold: overrides?.brake_position_threshold ?? DEFAULT_BRAKE.brakePositionThreshold,
    brakingCombinedThreshold: overrides?.braking_combined_threshold ?? DEFAULT_BRAKE.brakingCombinedThreshold,
    coastRebrakeMarginMph: overrides?.coast_rebrake_margin_mph ?? DEFAULT_BRAKE.coastRebrakeMarginMph,
    coastRebrakeMarginKmh: overrides?.coast_rebrake_margin_kmh ?? DEFAULT_BRAKE.coastRebrakeMarginKmh,
    coastClearOvershootMph: overrides?.coast_clear_overshoot_mph ?? DEFAULT_BRAKE.coastClearOvershootMph,
    coastClearOvershootKmh: overrides?.coast_clear_overshoot_kmh ?? DEFAULT_BRAKE.coastClearOvershootKmh,
  };
}

/** Umbrales AUTO de estación/freno — perfil JSON `agent_config` con defaults en código. */
export function resolveAgentConfig(
  profile?: Pick<CommandProfile, 'agent_config'> | null,
): ResolvedAgentConfig {
  const raw = profile?.agent_config;
  return {
    station: pickStation(raw?.station),
    brake: pickBrake(raw?.brake),
  };
}
