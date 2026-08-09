/** Modo de política del agente (default MVP: SUGGEST). */
export type PolicyMode = 'SUGGEST' | 'ARM' | 'AUTO';

export type Urgency = 'info' | 'warn' | 'critical';

export type HorizonKind =
  | 'SIGNAL'
  | 'SPEED_LIMIT'
  | 'STATION_STOP'
  | 'TAIL_CLEAR'
  | 'SAFETY';

export interface TelemetrySnapshot {
  t: number;
  speedMs: number;
  speedDisplay: number;
  speedUnit: 'MPH' | 'km/h';
  limits: {
    effective: number;
    frontal: number;
    next: { speed: number; distanceM: number } | null;
    upcoming: { speed: number; distanceM: number }[];
  };
  signaling: {
    aspect: string;
    distanceM: number;
  };
  station: {
    distanceM: number;
    nameOcr: string;
    eta: string;
    anchorM?: number;
    traveledM?: number;
    driftM?: number;
    nearCorrected?: boolean;
    /** lua = GetNextStation; ocr_tracker = ancla OCR + odómetro. */
    source?: 'lua' | 'ocr_tracker' | 'none';
    luaDistanceM?: number;
    scheduled?: string;
  };
  brake: {
    combined: number;
    /** Posición del freno 0–1 (split: VirtualBrake/TrainBrakeControl). */
    position: number;
    cylinder: number;
    effortKn: number;
    projectedStopM: number;
  };
  tail: {
    active: boolean;
    distanceM: number;
    seconds: number;
  };
  safety: {
    aws: boolean;
    dsd: boolean;
    dra: boolean;
  };
  train: {
    lengthM: number;
    massT: number;
    consistType: number;
    profileId: string | null;
    name: string;
  };
  /** Gradiente corregido por cabina (‰, + = subida según marcha). */
  gradient: number;
  /** Valor crudo del simulador antes de corrección de cabina. */
  rawGradient: number;
  /** Cabina activa reportada o inferida (1 = delantera, 2 = trasera). */
  activeCab: number;
  /** Inversor: -1 atrás, 0 neutro, +1 adelante. */
  reverser: number;
  tripDistanceM: number;
  connected: boolean;
}

export interface HorizonEvent {
  id: string;
  kind: HorizonKind;
  distanceM: number;
  label: string;
  targetSpeedDisplay?: number;
  requiredAction?: string;
  priority: number;
}

export interface BrakePlanStep {
  notch: string;
  distanceM: number;
  phase: string;
  /** Señal de control: ~0 → aplicar ahora. Solo en tick agente V4. */
  distStart?: number;
  metersUntilActionM?: number;
  usingLearned?: boolean;
  applyNow?: boolean;
}

export type BrakeTargetKind = 'STATION' | 'SPEED_LIMIT' | 'SIGNAL';

export interface AgentBrakeContext {
  targetKind: BrakeTargetKind;
  distanceToTargetM: number;
  reactionMarginM: number;
  gradientPermille: number;
  activeNotch: string | null;
}

export interface AgentAction {
  command: string;
  value: number;
  reason: string;
}

export interface AgentTick {
  t: number;
  mode: PolicyMode;
  headline: string;
  detail: string;
  urgency: Urgency;
  marginM: number;
  marginS: number;
  horizon: HorizonEvent[];
  brakePlan?: BrakePlanStep[];
  brakeContext?: AgentBrakeContext;
  suggestedAction?: AgentAction;
  blockedReason?: string;
}
