import { EMA_ALPHA, EMA_SLOW, emaBlend } from './Constants';

export type AmpUnit = 'A' | 'kN';

export interface BrakeNormalizeResult {
  bc: number;
  bp: number;
  mr: number;
  er: number;
  amperage: number;
  ampUnit: AmpUnit;
  tractionPercent: number;
  brakeEfficiency: number;
}

export interface BrakeProfileInput {
  mappings?: { ammeter?: unknown };
  specs?: {
    max_ammeter?: number;
    max_effort?: number;
  };
}

export interface BrakeRawInput {
  BC?: number;
  BP?: number;
  MR?: number;
  ER?: number;
  TrainBrakeCylinderPressureBAR?: number;
  TrainBrakePipePressureBAR?: number;
  MainResPressureBAR?: number;
  EqResPressureBAR?: number;
  Pantograph?: unknown;
  LineVolts?: unknown;
  Ammeter?: number;
  TractiveEffort?: number;
  ConsistType?: number;
}

/** Eficiencia de frenado según ConsistType del simulador (0–11). */
export const CONSIST_BRAKE_EFFICIENCY: Record<number, number> = {
  1: 1.25,
  2: 1.1,
  3: 1.0,
  4: 0.85,
  5: 0.85,
  6: 0.75,
  7: 0.75,
  8: 0.75,
  9: 1.0,
  10: 1.1,
};

const DEFAULT_MAX_AMMETER = 1000;
const DEFAULT_MAX_EFFORT_KN = 400;

export function readNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function readPressure(raw: BrakeRawInput, shortKey: keyof BrakeRawInput, longKey: keyof BrakeRawInput): number {
  return readNumber(raw[shortKey] ?? raw[longKey]);
}

export function isElectricLocomotive(raw: BrakeRawInput, profile?: BrakeProfileInput | null): boolean {
  return (
    raw.Pantograph !== undefined ||
    raw.LineVolts !== undefined ||
    raw.Ammeter !== undefined ||
    !!profile?.mappings?.ammeter
  );
}

export function brakeEfficiencyForConsist(consistType: number): number {
  return CONSIST_BRAKE_EFFICIENCY[consistType] ?? 1.0;
}

export function tractionLimit(isElectric: boolean, profile?: BrakeProfileInput | null): number {
  const limit = isElectric
    ? profile?.specs?.max_ammeter ?? DEFAULT_MAX_AMMETER
    : profile?.specs?.max_effort ?? DEFAULT_MAX_EFFORT_KN;
  return limit > 0 ? limit : (isElectric ? DEFAULT_MAX_AMMETER : DEFAULT_MAX_EFFORT_KN);
}

export function computeTractionPercent(amperage: number, limit: number): number {
  if (limit <= 0) return 0;
  return (amperage / limit) * 100;
}

interface BrakeEmaState {
  emaBrakeCyl: number;
  emaBrakePipe: number;
  emaMainRes: number;
  emaEqRes: number;
  emaAmperage: number;
}

/** Suaviza presiones, amperaje/esfuerzo y calcula eficiencia de freno por tipo de tren. */
export class BrakeNormalizer {
  private state: BrakeEmaState = {
    emaBrakeCyl: 0,
    emaBrakePipe: 0,
    emaMainRes: 0,
    emaEqRes: 0,
    emaAmperage: 0,
  };

  normalize(raw: BrakeRawInput, profile?: BrakeProfileInput | null): BrakeNormalizeResult {
    const rawBC = readPressure(raw, 'BC', 'TrainBrakeCylinderPressureBAR');
    const rawBP = readPressure(raw, 'BP', 'TrainBrakePipePressureBAR');
    const rawMR = readPressure(raw, 'MR', 'MainResPressureBAR');
    const rawER = readPressure(raw, 'ER', 'EqResPressureBAR');

    this.state.emaBrakeCyl = emaBlend(this.state.emaBrakeCyl, rawBC, EMA_SLOW);
    this.state.emaBrakePipe = emaBlend(this.state.emaBrakePipe, rawBP, EMA_SLOW);
    this.state.emaMainRes = emaBlend(this.state.emaMainRes, rawMR, EMA_SLOW);
    this.state.emaEqRes = emaBlend(this.state.emaEqRes, rawER, EMA_SLOW);

    const electric = isElectricLocomotive(raw, profile);
    const rawAmp = readNumber(raw.Ammeter ?? raw.TractiveEffort);
    const ampUnit: AmpUnit = electric ? 'A' : 'kN';

    this.state.emaAmperage = emaBlend(this.state.emaAmperage, rawAmp, EMA_ALPHA);

    const limitRef = tractionLimit(electric, profile);
    const tractionPercent = computeTractionPercent(this.state.emaAmperage, limitRef);
    const brakeEfficiency = brakeEfficiencyForConsist(readNumber(raw.ConsistType));

    return {
      bc: this.state.emaBrakeCyl,
      bp: this.state.emaBrakePipe,
      mr: this.state.emaMainRes,
      er: this.state.emaEqRes,
      amperage: this.state.emaAmperage,
      ampUnit,
      tractionPercent,
      brakeEfficiency,
    };
  }
}
