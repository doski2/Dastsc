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

    // 3. Ajuste de eficiencia basado en ConsistType (0-11)
    const consistType = Number(raw.ConsistType || 0);
    let brakeEfficiency = 1.0;

    switch(consistType) {
      case 1: // Light Engine
        brakeEfficiency = 1.25; // Muy potente para su masa
        break;
      case 2: // Express Passenger
      case 10: // International
        brakeEfficiency = 1.1; // Frenos de disco/alta performance
        break;
      case 3: // Stopping Passenger
      case 9: // Empty Stock
        brakeEfficiency = 1.0; // Estándar
        break;
      case 4: // High Speed Freight
      case 5: // Express Freight
        brakeEfficiency = 0.85; // Carga rápida
        break;
      case 6: // Standard Freight
      case 7: // Low Speed Freight
      case 8: // Other Freight
        brakeEfficiency = 0.75; // Carga pesada, frenado lento y largo
        break;
      default:
        brakeEfficiency = 1.0;
    }

    return {
      bc: this.state.emaBrakeCyl,
      bp: this.state.emaBrakePipe,
      mr: this.state.emaMainRes,
      er: this.state.emaEqRes,
      amperage: this.state.emaAmperage,
      ampUnit,
      tractionPercent,
      brakeEfficiency
    };
  }
}
