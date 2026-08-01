export interface BrakeNotch {
  label: string;
  value: number;
}

export interface BrakePlanProfile {
  physics_config?: {
    max_braking_decel?: number;
    brake_fill_time_s?: number;
    /** Si está definido, margen = velocidad × este valor (s). Sustituye 1.5 + fill_time. */
    reaction_time_s?: number;
  };
  specs?: {
    notches_throttle_brake?: BrakeNotch[];
  };
}

export interface BrakeStatsEntry {
  avg_decel: number;
  samples: number;
  max_decel?: number;
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
