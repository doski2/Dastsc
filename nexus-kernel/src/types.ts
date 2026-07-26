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
  };
  brake: {
    combined: number;
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
  gradient: number;
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
  suggestedAction?: AgentAction;
  blockedReason?: string;
}
