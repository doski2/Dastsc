
/**
 * DataNormalizer.ts
 * Utilidades para la limpieza, filtrado y normalización de datos brutos del simulador.
 */

import { TelemetryData } from './TelemetryContext';

export interface NormalizerState {
  distanceTravelled: number;
  totalDistance: number;
  lastSimTime: number;
  effectiveSpeedLimit: number;
  lastNextLimitDist: number;
  lastNextLimitSpeed: number;
  emaAcceleration: number;
  emaAmperage: number; // Raw smoothed
  emaBrakeCyl: number;
  emaBrakePipe: number;
  emaMainRes: number;
  emaEqRes: number;
  emaGradient: number;
  gForce: number;
  lastSpeedMS: number;
}

const EMA_ALPHA = 0.15; 
const EMA_SLOW = 0.05; // Para presiones, más inercia
const G_CONSTANT = 9.80665;

export class DataNormalizer {
  private state: NormalizerState = {
    distanceTravelled: 0,
    totalDistance: 0,
    lastSimTime: 0,
    effectiveSpeedLimit: 0,
    lastNextLimitDist: 0,
    lastNextLimitSpeed: 0,
    emaAcceleration: 0,
    emaAmperage: 0,
    emaBrakeCyl: 0,
    emaBrakePipe: 0,
    emaMainRes: 0,
    emaEqRes: 0,
    emaGradient: 0,
    gForce: 0,
    lastSpeedMS: 0
  };

  /**
   * Procesa los datos brutos y devuelve un estado normalizado.
   */
  normalize(raw: any, prevData: TelemetryData, profile: any): Partial<TelemetryData> {
    const now = Date.now();
    const simTime = raw.SimulationTime || 0;
    const dtSim = (this.state.lastSimTime > 0 && simTime > this.state.lastSimTime) 
      ? simTime - this.state.lastSimTime 
      : 0;

    // 0. Determinación de Unidades y Factores
    // Prioridad: 1. Perfil activo, 2. SpeedoType del simulador
    const profileUnit = profile?.visuals?.unit;
    let speedUnit: 'MPH' | 'KPH' = profileUnit === 'KPH' ? 'KPH' : profileUnit === 'MPH' ? 'MPH' : 'MPH';
    
    // Si no hay perfil, usamos el SpeedoType
    if (!profileUnit) {
      const speedoType = Number(raw.SpeedoType || 1); 
      speedUnit = speedoType === 2 ? 'KPH' : 'MPH';
    }

    const toMS = speedUnit === 'KPH' ? 0.277778 : 0.44704;
    const fromMS = speedUnit === 'KPH' ? 3.6 : 2.23694;

    // 1. Unificación de Velocidad (m/s)
    // Prioridad: 1. CabSpeed (Plugin), 2. CurrentSpeed (MPS), 3. Speed (MPH/KPH)
    let speedMS = 0;
    if (raw.CabSpeed !== undefined && raw.CabSpeed !== 0) {
      speedMS = raw.CabSpeed * toMS;
    } else if (raw.CurrentSpeed !== undefined) {
      speedMS = Math.abs(raw.CurrentSpeed);
    } else {
      speedMS = Math.abs(raw.Speed || 0) * toMS;
    }

    // 1.1 Filtrado de picos absurdos (Denoising avanzado)
    // Un cambio de > 20 m/s en un tick de 0.1s es físicamente imposible (72 km/h de cambio instantáneo)
    const speedDelta = Math.abs(speedMS - this.state.lastSpeedMS);
    if (this.state.lastSimTime > 0 && speedDelta > 20 && dtSim < 0.5) {
      console.warn(`Normalizer: Velocity spike detected (${(speedMS * fromMS).toFixed(1)} ${speedUnit}). Filtering...`);
      speedMS = this.state.lastSpeedMS;
    }
    this.state.lastSpeedMS = speedMS;

    // 1.2 Odómetro y Trip
    if (dtSim > 0 && dtSim < 2) { // Evitar saltos por carga de mapa
      this.state.totalDistance += speedMS * dtSim;
    }

    // 2. Filtrado de Ruido (EMA)
    const rawAcc = raw.Acceleration || 0;
    this.state.emaAcceleration = (rawAcc * EMA_ALPHA) + (this.state.emaAcceleration * (1 - EMA_ALPHA));
    this.state.gForce = this.state.emaAcceleration / G_CONSTANT;
    
    // 3. Sistema de Tracción / Amperaje
    // El amperaje puede ser negativo (Freno Dinámico / Regenerativo)
    const isElectric = raw.Pantograph !== undefined || raw.LineVolts !== undefined || !!profile?.mappings?.ammeter || raw.Ammeter !== undefined;
    const rawAmp = raw.Ammeter || raw.TractiveEffort || 0;
    const ampUnit = isElectric ? 'A' : 'kN';
    
    // Suavizado del valor crudo para evitar saltos en la lectura digital
    this.state.emaAmperage = (rawAmp * EMA_ALPHA) + (this.state.emaAmperage * (1 - EMA_ALPHA));

    // Normalización para barras de UI (TractionPercent)
    const limitRef = isElectric ? (profile?.specs?.max_ammeter || 1000) : (profile?.specs?.max_effort || 400);
    const tractionPercent = (this.state.emaAmperage / limitRef) * 100;

    // 4. Presiones (Suavizado lento para efecto analógico)
    const rawBC = raw.TrainBrakeCylinderPressureBAR || raw.EngineBrakeCylinderPressureBAR || 0;
    const rawBP = raw.TrainBrakePipePressureBAR || 0;
    const rawMR = raw.MainResPressureBAR || 0;
    const rawER = raw.EqResPressureBAR || 0;

    this.state.emaBrakeCyl = (rawBC * EMA_SLOW) + (this.state.emaBrakeCyl * (1 - EMA_SLOW));
    this.state.emaBrakePipe = (rawBP * EMA_SLOW) + (this.state.emaBrakePipe * (1 - EMA_SLOW));
    this.state.emaMainRes = (rawMR * EMA_SLOW) + (this.state.emaMainRes * (1 - EMA_SLOW));
    this.state.emaEqRes = (rawER * EMA_SLOW) + (this.state.emaEqRes * (1 - EMA_SLOW));
    
    // 4.1 Cálculo de Potencia de Frenado Virtual (Braking Effort)
    // El freno neumático depende de la presión en el cilindro (BC)
    const maxBC = profile?.specs?.max_bc_pressure || 5.0; // suele ser 5 BAR o 72 PSI
    const bcPercent = Math.min(1.1, this.state.emaBrakeCyl / maxBC);
    const pneumaticBrakingForce = bcPercent * (profile?.physics_config?.max_braking_kn || 200);
    
    // Freno dinámico (si el amperaje es negativo en modo freno)
    const dynamicBrakingForce = (this.state.emaAmperage < 0) ? Math.abs(this.state.emaAmperage) * 0.5 : 0; 
    const totalBrakingEffort = pneumaticBrakingForce + dynamicBrakingForce;

    // Suavizado del gradiente para evitar saltos en la línea del track
    const rawGrad = raw.Gradient || 0;
    this.state.emaGradient = (rawGrad * EMA_SLOW) + (this.state.emaGradient * (1 - EMA_SLOW));

    const pressureUnit = profile?.visuals?.pressure_unit || (speedUnit === 'MPH' ? 'PSI' : 'BAR');
    const pFactor = pressureUnit === 'PSI' ? 14.5038 : 1;

    // 5. Lógica de "Cola de Tren" y Límites de Velocidad
    const rawLimit = (parseFloat(raw.CurrentSpeedLimit) || 0) * toMS;
    const nextLimitSpeed = (parseFloat(raw.NextSpeedLimitSpeed) || 0) * toMS;
    const nextLimitDistRaw = parseFloat(raw.NextSpeedLimitDistance) || 0;
    
    // Corrección TSC: Si la distancia es < 50 probablemente sea KM, convertimos a M
    const nextLimitDist = (nextLimitDistRaw < 50 && nextLimitDistRaw > 0) ? nextLimitDistRaw * 1000 : nextLimitDistRaw;
    
    const trainLength = raw.TrainLength || 100;

    if (this.state.effectiveSpeedLimit === 0) this.state.effectiveSpeedLimit = rawLimit;

    // Detección de hito por el frente (Head Check)
    // Cuando la distancia al próximo límite salta (p.ej de 5m a 1500m), el frente ha cruzado
    const headJustPassedPost = this.state.lastNextLimitDist < 12 && nextLimitDist > 100;

    if (headJustPassedPost) {
      const newPotentialLimit = this.state.lastNextLimitSpeed;
      
      // Si el límite que acabamos de pasar es superior al que tenemos
      if (newPotentialLimit > this.state.effectiveSpeedLimit + 0.1) {
        // Activamos odómetro de cola: la cabina ya pasó, empezamos a contar
        this.state.distanceTravelled = 0.1; // Valor centinela > 0
      } else {
        // Si es una reducción o igual, aplicamos inmediatamente
        this.state.effectiveSpeedLimit = rawLimit;
        this.state.distanceTravelled = 0;
      }
    }

    // Lógica de avance del odómetro
    if (this.state.distanceTravelled > 0) {
      this.state.distanceTravelled += speedMS * dtSim;
      
      // Si ya hemos recorrido toda la longitud, el tren ha limpiado el hito
      if (this.state.distanceTravelled >= trainLength) {
        this.state.effectiveSpeedLimit = rawLimit; // Sincronizamos con el valor real del simulador
        this.state.distanceTravelled = 0;
      }
    } else {
      // Sincronización normal si no hay limpieza de cola activa
      // Importante: Si el simulador baja el límite (reducción), lo seguimos al instante
      if (rawLimit < this.state.effectiveSpeedLimit - 0.1) {
        this.state.effectiveSpeedLimit = rawLimit;
      } else if (this.state.distanceTravelled === 0) {
        // En tramos constantes, mantenemos sincronía
        this.state.effectiveSpeedLimit = rawLimit;
      }
    }

    this.state.lastNextLimitDist = nextLimitDist;
    this.state.lastNextLimitSpeed = nextLimitSpeed;
    this.state.lastSimTime = simTime;

    const tailDist = this.state.distanceTravelled > 0 
      ? Math.max(0, trainLength - this.state.distanceTravelled) 
      : 0;

    // 5. Unificación de Señales y Distancias
    const sigStateRaw = raw.NextSignalState ?? -1;
    const sigInternal = raw.InternalAspect ?? -1;
    const restrState = raw.RestrictiveState ?? -1;
    const rawSigDist = raw.NextSignalDistance || 0;
    
    // Corrección distancia señal (igual que límites)
    const sigDist = (rawSigDist < 50 && rawSigDist > 0) ? rawSigDist * 1000 : rawSigDist;
    
    let aspect = 'CLEAR';
    let sigVal = sigStateRaw;

    if ((sigStateRaw === 3 || sigStateRaw === -1) && restrState >= 0) {
      sigVal = restrState;
    } else if (sigInternal >= 0) {
      sigVal = sigInternal;
    }

    switch(sigVal) {
      case 0: aspect = 'DANGER'; break;
      case 1: aspect = 'CAUTION'; break;
      case 2: aspect = 'ADV_CAUTION'; break;
      case 3: aspect = 'CLEAR'; break;
      case 4: aspect = 'PROCEED'; break;
      case 10: aspect = 'FL_CAUTION'; break;
      case 11: aspect = 'FL_ADV_CAUTION'; break;
      default: aspect = 'UNKNOWN';
    }

    // 6. Sistemas de Seguridad y Tiempo
    const aws = raw.AWS || raw.AWSWarnCount || raw.AWSWarnAudio || 0;
    const dsd = raw.DVDAlarm || raw.VigilAlarm || 0;
    const dra = raw.DRA === 1;
    const sander = raw.Sander === 1;
    const doors = {
      left: (raw.DoorsOpenCloseLeft || 0) > 0.5,
      right: (raw.DoorsOpenCloseRight || 0) > 0.5
    };

    // Conversión de TimeOfDay (segundos desde medianoche)
    const timeSecs = raw.TimeOfDay || 0;
    const h = Math.floor(timeSecs / 3600);
    const m = Math.floor((timeSecs % 3600) / 60);
    const s = Math.floor(timeSecs % 60);
    const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

    // 7. Proyecciones y Retorno
    const currentThrottle = raw.Throttle ?? raw.Regulator ?? 0;
    const currentBrake = raw.TrainBrake ?? raw.TrainBrakeControl ?? 0;
    const combinedControl = raw.CombinedControl ?? (currentThrottle - currentBrake);
    const projectedSpeedMS = Math.max(0, speedMS + (this.state.emaAcceleration * 10));
    
    // 8. Cálculo de Física Predictiva (Braking Curve)
    const baseDecel = profile?.physics_config?.braking_force_ms2 || 0.65;
    // Compensación por gradiente: a = g * sin(theta) approx g * (grad/100)
    const gradientComp = (this.state.emaGradient / 100) * G_CONSTANT;
    const effectiveDecel = Math.max(0.1, baseDecel + gradientComp); // Evitar división por cero
    const projectedBrakingDistance = (speedMS * speedMS) / (2 * effectiveDecel);

    return {
      Speed: speedMS,
      Throttle: currentThrottle,
      TrainBrake: currentBrake,
      CombinedControl: combinedControl,
      Reverser: raw.Reverser || 0,
      SpeedDisplay: speedMS * fromMS,
      SpeedUnit: speedUnit,
      Acceleration: this.state.emaAcceleration,
      GForce: this.state.gForce,
      ProjectedSpeed: projectedSpeedMS * fromMS,
      SpeedLimit: this.state.effectiveSpeedLimit * fromMS,
      FrontalSpeedLimit: rawLimit * fromMS,
      TailDistance: tailDist,
      DistToNextSpeedLimit: nextLimitDist,
      NextSpeedLimit: nextLimitSpeed * fromMS,
      Gradient: this.state.emaGradient,
      StationDistance: raw.StationDistance || -1,
      StationName: raw.StationName || '',
      StationLength: raw.StationLength || 200, // Default 200m si no viene dato
      BrakeCylinderPressure: this.state.emaBrakeCyl * pFactor,
      BrakePipePressure: this.state.emaBrakePipe * pFactor,
      MainResPressure: this.state.emaMainRes * pFactor,
      EqResPressure: this.state.emaEqRes * pFactor,
      BrakingEffort: totalBrakingEffort,
      BrakingPercent: bcPercent * 100,
      PressureUnit: pressureUnit,
      Amperage: this.state.emaAmperage,
      AmperageUnit: ampUnit,
      TractionPercent: tractionPercent,
      NextSignalAspect: aspect,
      DistToNextSignal: sigDist,
      TrainLength: trainLength,
      TrainMass: raw.TrainMass || 0,
      ProjectedBrakingDistance: projectedBrakingDistance,
      TripDistance: this.state.totalDistance,
      IsEmergency: raw.EmergencyBrake === 1 || raw.EmergencyBrake === true,
      AWS: aws,
      DSD: dsd,
      DRA: dra,
      Sander: sander,
      DoorsOpen: doors,
      TimeOfDay: timeStr,
      LocoName: raw.LocoName || '',
      location: raw.location || '',
      Timestamp: Date.now()
    };
  }
}
