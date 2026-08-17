export interface BrakeNotch {
  label: string;
  value: number;
}

export interface AgentStationConfig {
  dwell_max_distance_m?: number;
  platform_tail_m?: number;
  hold_max_speed_ms?: number;
  release_block_speed_ms?: number;
  departure_speed_ms?: number;
  final_stop_speed_ms?: number;
  final_stop_max_distance_m?: number;
  plan_horizon_m?: number;
  /** Distancia (m) a partir de la cual se endurece la frenada de estación. */
  terminal_approach_distance_m?: number;
}

export interface AgentBrakeConfig {
  release_margin_mph?: number;
  release_margin_kmh?: number;
  brake_position_threshold?: number;
  braking_combined_threshold?: number;
  coast_rebrake_margin_mph?: number;
  coast_rebrake_margin_kmh?: number;
  coast_clear_overshoot_mph?: number;
  coast_clear_overshoot_kmh?: number;
}

export interface AgentConfig {
  station?: AgentStationConfig;
  brake?: AgentBrakeConfig;
}

export interface BrakePlanProfile {
  physics_config?: {
    max_braking_decel?: number;
    brake_fill_time_s?: number;
    /** Si está definido, margen = velocidad × este valor (s). Sustituye 1.5 + fill_time. */
    reaction_time_s?: number;
    /** Margen de reacción en parada de estación (s). Más bajo = frena más tarde. */
    station_reaction_time_s?: number;
  };
  specs?: {
    notches_throttle_brake?: BrakeNotch[];
  };
  agent_config?: AgentConfig;
}

export interface BrakeStatsBandEntry {
  avg_decel: number;
  samples: number;
  max_decel?: number;
}

export type SpeedBand = 'high' | 'med' | 'low';

export interface BrakeStatsEntry {
  avg_decel: number;
  samples: number;
  max_decel?: number;
  /** Decel aprendida por banda de velocidad (Plan A — P3.7). */
  by_speed?: Partial<Record<SpeedBand, BrakeStatsBandEntry>>;
}

export type BrakeStatsByNotch = Record<string, BrakeStatsEntry>;

export type BrakeTargetKind = 'STATION' | 'SPEED_LIMIT' | 'SIGNAL';

export interface PlanBrakeInput {
  speedMs: number;
  distanceToTargetM: number;
  targetSpeedMs: number;
  massT: number;
  lengthM: number;
  gradientPermille: number;
  consistType?: number;
  profile?: BrakePlanProfile | null;
  brakeStats?: BrakeStatsByNotch;
  isRealTarget?: boolean;
}

export interface BrakePlanStepDetail {
  notch: string;
  phase: string;
  /** Distancia de frenado cinemática para esta fase (m). */
  distanceM: number;
  /** Distancia restante al objetivo en el punto de aplicación (m). */
  applyAtRemainingM: number;
  /**
   * Señal de control V3: `remaining - (distanceM + reaction)`.
   * Cercano a 0 → aplicar ahora; positivo → aún no; negativo → pasado.
   */
  distStart: number;
  /** Metros a recorrer antes de aplicar esta fase. */
  metersUntilActionM: number;
  usingLearned: boolean;
  applyNow: boolean;
}

export interface CommandProfile {
  mappings?: Record<string, string>;
  physics_config?: BrakePlanProfile['physics_config'];
  specs?: BrakePlanProfile['specs'];
  agent_config?: AgentConfig;
}

export interface SnapshotBrakeContext {
  profile?: BrakePlanProfile | null;
  brakeStats?: BrakeStatsByNotch;
  consistType?: number;
  commandProfile?: CommandProfile | null;
}

export interface BrakePlan {
  targetKind: BrakeTargetKind;
  distanceToTargetM: number;
  targetSpeedMs: number;
  reactionMarginM: number;
  steps: BrakePlanStepDetail[];
  activeStep: BrakePlanStepDetail | null;
  isRealTarget: boolean;
}
