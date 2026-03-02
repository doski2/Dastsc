// BrakeNormalizer.ts
import { EMA_ALPHA, EMA_SLOW } from './Constants.ts';

export class BrakeNormalizer {
  private state = {
    emaBrakeCyl: 0,
    emaBrakePipe: 0,
    emaMainRes: 0,
    emaEqRes: 0,
    emaAmperage: 0,
  };

  normalize(raw: any, profile: any) {
    // 1. Presiones
    const rawBC = Number(raw.BC || raw.TrainBrakeCylinderPressureBAR || 0);
    const rawBP = Number(raw.BP || raw.TrainBrakePipePressureBAR || 0);
    const rawMR = Number(raw.MR || raw.MainResPressureBAR || 0);
    const rawER = Number(raw.ER || raw.EqResPressureBAR || 0);

    this.state.emaBrakeCyl = (rawBC * EMA_SLOW) + (this.state.emaBrakeCyl * (1 - EMA_SLOW));
    this.state.emaBrakePipe = (rawBP * EMA_SLOW) + (this.state.emaBrakePipe * (1 - EMA_SLOW));
    this.state.emaMainRes = (rawMR * EMA_SLOW) + (this.state.emaMainRes * (1 - EMA_SLOW));
    this.state.emaEqRes = (rawER * EMA_SLOW) + (this.state.emaEqRes * (1 - EMA_SLOW));

    // 2. Tracción/Amperaje
    const isElectric = raw.Pantograph !== undefined || raw.LineVolts !== undefined || !!profile?.mappings?.ammeter || raw.Ammeter !== undefined;
    const rawAmp = Number(raw.Ammeter || raw.TractiveEffort || 0);
    const ampUnit = isElectric ? 'A' : 'kN';
    this.state.emaAmperage = (rawAmp * EMA_ALPHA) + (this.state.emaAmperage * (1 - EMA_ALPHA));

    const limitRef = isElectric ? (profile?.specs?.max_ammeter || 1000) : (profile?.specs?.max_effort || 400);
    const tractionPercent = (this.state.emaAmperage / limitRef) * 100;

    return {
      bc: this.state.emaBrakeCyl,
      bp: this.state.emaBrakePipe,
      mr: this.state.emaMainRes,
      er: this.state.emaEqRes,
      amperage: this.state.emaAmperage,
      ampUnit,
      tractionPercent
    };
  }
}
