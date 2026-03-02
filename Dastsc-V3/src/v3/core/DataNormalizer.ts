
/**
 * DataNormalizer.ts
 * Utilidades para la limpieza, filtrado y normalización de datos brutos del simulador.
 */

import { TelemetryData } from './TelemetryContext';
import { TailProtectionService } from '../services/TailProtectionService';


export interface NormalizerState {
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
  
  // G-Lateral Tracking
  posX: number;
  posZ: number;
  lastHeading: number;
  emaLateralG: number;
  lastFrontalLimit: number;
  lastRealTime: number;
  activeCab: number; // 1 = Front, 2 = Back
}

const EMA_ALPHA = 0.15; 
const EMA_SLOW = 0.05; // Para presiones, más inercia
const G_CONSTANT = 9.80665;

export class DataNormalizer {
  private tailService = new TailProtectionService();

  private state: NormalizerState = {
    totalDistance: 0,
    lastSimTime: 0,
    effectiveSpeedLimit: 0,
    lastNextLimitDist: 9999,  // Inicializar ALTO para detectar primer flanco
    lastNextLimitSpeed: 0,
    emaAcceleration: 0,
    emaAmperage: 0,
    emaBrakeCyl: 0,
    emaBrakePipe: 0,
    emaMainRes: 0,
    emaEqRes: 0,
    emaGradient: 0,
    gForce: 0,
    lastSpeedMS: 0,
    posX: 0,
    posZ: 0,
    lastHeading: 999,
    emaLateralG: 0,
    lastFrontalLimit: 0,
    lastRealTime: 0,
    activeCab: 1
  };

  private loggedRawFields = false;



  /**
   * Procesa los datos brutos y devuelve un estado normalizado.
   */
  normalize(raw: any, prevData: TelemetryData, profile: any): Partial<TelemetryData> {
    const rawSimTime = Number(raw.SimulationTime || 0);
    const now = Date.now() / 1000;
    
    // LOG DE CAMPOS DISPONIBLES (Una sola vez al inicio)
    if (!this.loggedRawFields && rawSimTime > 0) {
      this.loggedRawFields = true;
      console.warn('[FIELDS] Campos disponibles en raw:', Object.keys(raw).sort());
    }
    
    // Validar longitud del tren (en metros desde GetConsistLength() en Lua)
    let trainLength = raw.TrainLength || 100;
    if (trainLength <= 0) trainLength = 100;
    
    // SOPORTE OnCameraEnter / ActiveCab (1=Front, 2=Back)
    const rawActiveCab = Number(raw.ActiveCab || 1);
    const cabChanged = this.state.activeCab !== rawActiveCab;
    this.state.activeCab = rawActiveCab;

    const profileUnit = profile?.visuals?.unit;
    let speedUnit: 'MPH' | 'KPH' = profileUnit === 'KPH' ? 'KPH' : profileUnit === 'MPH' ? 'MPH' : 'MPH';
    
    // Si no hay perfil, usamos el SpeedoType
    if (!profileUnit) {
      const speedoType = Number(raw.SpeedoType || 1); 
      speedUnit = speedoType === 2 ? 'KPH' : 'MPH';
    }

    const toMS = speedUnit === 'KPH' ? 1/3.6 : 0.44704;
    const fromMS = speedUnit === 'KPH' ? 3.6 : 2.23694;

    // === SINCRONIZACIÓN DE TIEMPOS (Primero para asegurar dtSim correcto) ===
    let dtSim = 0;
    if (this.state.lastSimTime > 0) {
        if (rawSimTime > this.state.lastSimTime) {
            dtSim = rawSimTime - this.state.lastSimTime;
        } else if (raw.SimulationTime === undefined && this.state.lastRealTime > 0) {
            dtSim = Math.min(0.2, now - this.state.lastRealTime);
        }
    }
    
    // Protección: evitar saltos gigantes de tiempo (carga de mapa, pausas)
    if (dtSim > 1.0) {
      dtSim = 0.033; // Máximo ~30ms (30fps)
    }
    
    // ACTUALIZAR TIEMPOS INMEDIATAMENTE 
    this.state.lastSimTime = rawSimTime;
    this.state.lastRealTime = now;
    // =======================

    // Procesamiento de límites de velocidad (Formato Horizontal V4.1)
    const currentLimitConverted = Number(raw.CurrentSpeedLimit || 0); // Ya viene convertido desde Lua
    const rawNextLimitSpeed = Number(raw.NextLimitSpeed || 0);
    const rawNextLimitDistFromLua = Number(raw.NextLimitDist || -1);

    // Límite de Velocidad nominal (m/s)
    const rawLimitMS = currentLimitConverted * toMS;

    // 1. Unificación de Velocidad (m/s)
    let speedMS = 0;
    const currentSpeedRaw = Number(raw.CurrentSpeed || 0);

    // Mapeo de Controles (Unificación V4.1) - Se extraen aquí para uso temprano
    const rawThrottle = Number(raw.Throttle || 0);
    const rawTrainBrake = Number(raw.TrainBrake || 0);
    const rawCombined = Number(raw.Combined || 0);
    const rawReversal = Number(raw.Reversal || 0);

    if (raw.CabSpeed !== undefined && raw.CabSpeed !== 0) {
      speedMS = raw.CabSpeed * toMS;
    } else if (raw.CurrentSpeed !== undefined) {
      speedMS = Math.abs(raw.CurrentSpeed);
    } else {
      speedMS = Math.abs(raw.Speed || 0) * toMS;
    }

    // === TAIL PROTECTION (V2 LOGIC con campos LUA) ===
    const tailInfo = this.tailService.update(
      currentLimitConverted,      // CurrentSpeedLimit (en MPH/KPH del simulador)
      rawNextLimitSpeed,          // NextLimitSpeed (en MPH/KPH del simulador)
      rawNextLimitDistFromLua,    // NextLimitDist (en metros de Lua)
      speedMS, 
      dtSim, 
      trainLength
    );

    // Actualizar límite efectivo basado en la cola
    this.state.effectiveSpeedLimit = tailInfo.effectiveLimit * toMS;

    // Inicialización del primer límite si es 0 (Solo si hay conexión válida)
    if (this.state.effectiveSpeedLimit === 0 && currentLimitConverted > 0) {
      this.state.effectiveSpeedLimit = rawLimitMS;
    }

    // 0. Latencia y Performance (Del nuevo campo LuaMS)
    const luaLatency = Number(raw.LuaMS || 0);

    // Actualizar odómetro
    if (dtSim > 0 && dtSim < 2) { // Evitar saltos por carga de mapa
      this.state.totalDistance += speedMS * dtSim;
    }

    // 1.2 Filtrado de picos absurdos (Denoising avanzado)
    const speedDelta = Math.abs(speedMS - this.state.lastSpeedMS);
    if (this.state.lastSimTime > 0 && speedDelta > 20 && dtSim < 0.5) {
      speedMS = this.state.lastSpeedMS;
    }
    this.state.lastSpeedMS = speedMS;

    // 2. Filtrado de Ruido (EMA)
    const rawAcc = raw.Acceleration || 0;
    this.state.emaAcceleration = (rawAcc * EMA_ALPHA) + (this.state.emaAcceleration * (1 - EMA_ALPHA));
    this.state.gForce = this.state.emaAcceleration / G_CONSTANT;

    // 2.1 Cálculo de G-Lateral (Prioridad Curvatura, Fallback Yaw Rate)
    const rawCurvature = Number(raw.Curvature || 0);
    const rawHeading = Number(raw.Heading || 0);
    const currX = Number(raw.PosX || 0);
    const currZ = Number(raw.PosZ || 0);
    let lateralG = 0;

    if (Math.abs(rawCurvature) > 0.00001) {
      // Método A: v^2 * k / g (Deducido de TSEngineScripts.pdf)
      // k es 1/R. Fuerza centrífuga a = v^2 / R
      lateralG = (speedMS * speedMS * rawCurvature) / G_CONSTANT;
    } else {
      // Método B: Yaw Rate (Basado en cambio de heading/posición)
      let currentHeading = 0;
      let validHeading = false;

      if (this.state.posX !== 0 && (currX !== this.state.posX || currZ !== this.state.posZ)) {
        const dx = currX - this.state.posX;
        const dz = currZ - this.state.posZ;
        currentHeading = Math.atan2(dx, dz);
        validHeading = true;
      } else if (rawHeading !== 0) {
        currentHeading = rawHeading * (Math.PI / 180);
        validHeading = true;
      }
      
      if (validHeading && dtSim > 0 && speedMS > 1 && this.state.lastHeading !== 999) {
        let deltaHeading = currentHeading - this.state.lastHeading;
        if (deltaHeading > Math.PI) deltaHeading -= 2 * Math.PI;
        if (deltaHeading < -Math.PI) deltaHeading += 2 * Math.PI;
        const yawRate = deltaHeading / dtSim;
        lateralG = -(speedMS * yawRate) / G_CONSTANT;
      }
      if (validHeading) this.state.lastHeading = currentHeading;
    }
    
    // Filtro suave para el G-Lateral
    this.state.emaLateralG = (lateralG * 0.15) + (this.state.emaLateralG * 0.85);
    
    this.state.posX = currX;
    this.state.posZ = currZ;
    
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
    const rawBC = raw.BC || raw.TrainBrakeCylinderPressureBAR || raw.EngineBrakeCylinderPressureBAR || 0;
    const rawBP = raw.BP || raw.TrainBrakePipePressureBAR || 0;
    const rawMR = raw.MR || raw.MainResPressureBAR || 0;
    const rawER = raw.ER || raw.EqResPressureBAR || 0;

    this.state.emaBrakeCyl = (rawBC * EMA_SLOW) + (this.state.emaBrakeCyl * (1 - EMA_SLOW));
    this.state.emaBrakePipe = (rawBP * EMA_SLOW) + (this.state.emaBrakePipe * (1 - EMA_SLOW));
    this.state.emaMainRes = (rawMR * EMA_SLOW) + (this.state.emaMainRes * (1 - EMA_SLOW));
    this.state.emaEqRes = (rawER * EMA_SLOW) + (this.state.emaEqRes * (1 - EMA_SLOW));
    
    // Detección inteligente de Unidad de Presión
    // Si la presión del cilindro o tubería supera 15, asumimos PSI (el máximo en BAR suele ser 10-12)
    const interpretedAsPSI = rawBC > 15 || rawBP > 15 || rawMR > 20;
    const trainUnit = interpretedAsPSI ? 'PSI' : 'BAR';
    const pressureUnit = profile?.visuals?.pressure_unit || trainUnit;

    // 4.1 Cálculo de Potencia de Frenado Virtual (Braking Effort)
    // El freno neumático depende de la presión en el cilindro (BC)
    const maxBC = pressureUnit === 'PSI' ? 72.5 : 5.0; 
    const bcPercent = Math.min(1.1, this.state.emaBrakeCyl / maxBC);
    const pneumaticBrakingForce = bcPercent * (profile?.physics_config?.max_braking_kn || 200);
    
    // Freno dinámico (si el amperaje es negativo en modo freno)
    const dynamicBrakingForce = (this.state.emaAmperage < 0) ? Math.abs(this.state.emaAmperage) * 0.5 : 0; 
    const totalBrakingEffort = pneumaticBrakingForce + dynamicBrakingForce;

    // Suavizado del gradiente para evitar saltos en la línea del track
    // NOTA: El signo ya viene corregido desde el script Lua (Uphill = Positivo)
    const rawGrad = (raw.Gradient || 0);
    this.state.emaGradient = (rawGrad * EMA_SLOW) + (this.state.emaGradient * (1 - EMA_SLOW));

    const pFactor = pressureUnit === 'PSI' ? 14.5038 : 1;

    // Nota: Los tiempos ya se sincronizaron al inicio del método
    
    // EMPAQUETAR DATOS DE COLA PARA TELEMETRÍA
    const tailSeconds = speedMS > 0.5 ? tailInfo.distanceRemaining / speedMS : 0;

    // 5. Lógica de "Próximos Límites" para UI
    const rawUpcoming: { speed: number, distance: number }[] = [];
    if (rawNextLimitDistFromLua > 0) {
        rawUpcoming.push({ speed: rawNextLimitSpeed, distance: rawNextLimitDistFromLua });
    }
    
    // Buscamos el primer cambio real para la lógica de cola
    let nextDiffLimit = { speed: rawLimitMS * fromMS, distance: 0 };
    if (rawUpcoming.length > 0) {
        nextDiffLimit = rawUpcoming[0];
    }

    const rawNextLimitDist = nextDiffLimit.distance;
    const rawNextLimitSpeedMS = nextDiffLimit.speed * toMS;

    /**
     * NOTA: effectiveSpeedLimit ahora se gestiona arriba en la LÓGICA DE COLA (V5.0),
     * no debemos sobrescribirla aquí o anulará la protección.
     */
    this.state.lastFrontalLimit = rawLimitMS;
    // NO sobrescribir lastNextLimitDist aquí - se actualiza en el trigger de Tail Protection ^ arriba
    this.state.lastNextLimitSpeed = rawNextLimitSpeedMS;

    const upcomingLimits: { speed: number, distance: number }[] = [];
    let lastRefSpeedMS = rawLimitMS; 

    for (const limit of rawUpcoming) {
        const limitSpeedMS = limit.speed * toMS;
        if (limit.distance <= 2.0) continue;
        if (Math.abs(limitSpeedMS - lastRefSpeedMS) > 0.1) {
            upcomingLimits.push(limit);
            lastRefSpeedMS = limitSpeedMS;
            if (upcomingLimits.length >= 3) break;
        }
    }

    const nextLimitSpeedMPH = upcomingLimits.length > 0 ? upcomingLimits[0].speed : 0;
    const nextLimitDist = upcomingLimits.length > 0 ? upcomingLimits[0].distance : 0;
    const nextLimitSpeedMS = nextLimitSpeedMPH * toMS;

    const rawSigRes = Number(raw.SigRes ?? -1);
    const rawSigState = Number(raw.SigState ?? -1);
    const rawSigDist = Number(raw.SigDist ?? -1);

    // Fallbacks para versiones antiguas
    const sigStateRaw = raw.NextSignalState ?? -1;
    const sigInternal = raw.InternalAspect ?? -1;
    const restrState = raw.RestrictiveState ?? -1;

    // Prioridad absoluta a GetNextRestrictiveSignal del nuevo motor Lua
    let sigDist = (rawSigRes > 0) ? rawSigDist : parseFloat(raw.NextSignalDistance || raw.DistanceToNextSignal || -1);
    const restrDist = parseFloat(raw.RestrictiveDistance || -1);

    // Fallback: Si la distancia principal es -1 o 0, y tenemos una restrictiva válida, usar esa
    if ((sigDist <= 0) && restrDist > 0) {
      sigDist = restrDist;
    }
    
    let aspect = 'CLEAR';
    let sigVal = (rawSigRes > 0) ? rawSigState : (sigStateRaw !== -1 ? sigStateRaw : sigInternal);

    if (rawSigRes <= 0) {
        if ((sigVal === 3 || sigVal === -1) && restrState >= 0) {
            sigVal = restrState;
        } else if (sigInternal >= 0) {
            sigVal = sigInternal;
        }
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
    const aws = Number(raw.AWS || raw.AWSWarnCount || raw.AWSWarnAudio || 0);
    const dsd = Number(raw.DSD || raw.DVDAlarm || raw.VigilAlarm || 0);
    const dra = Number(raw.DRA || 0) === 1;
    const sander = Number(raw.Sander || 0) === 1;
    const doors = {
      left: Number(raw.DoorL || raw.DoorsOpenCloseLeft || 0) > 0.5,
      right: Number(raw.DoorR || raw.DoorsOpenCloseRight || 0) > 0.5
    };

    // Conversión de TimeOfDay (segundos desde medianoche)
    const timeSecs = raw.TimeOfDay || 0;
    const h = Math.floor(timeSecs / 3600);
    const m = Math.floor((timeSecs % 3600) / 60);
    const s = Math.floor(timeSecs % 60);
    const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

    // 7. Proyecciones y Retorno (Unificación Final V4.1)
    const currentThrottle = Number(raw.Throttle || raw.Regulator || rawThrottle || 0);
    const currentBrake = Number(raw.TrainBrake || raw.TrainBrakeControl || rawTrainBrake || 0);
    const combinedControl = Number(raw.Combined || raw.CombinedControl || rawCombined || (currentThrottle - currentBrake));
    const reverser = Number(raw.Reversal || raw.Reverser || rawReversal || 0);
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
      Reverser: reverser,
      SpeedDisplay: speedMS * fromMS,
      SpeedUnit: speedUnit,
      Acceleration: this.state.emaAcceleration,
      GForce: this.state.gForce,
      ProjectedSpeed: projectedSpeedMS * fromMS,
      SpeedLimit: this.state.effectiveSpeedLimit * fromMS,
      FrontalSpeedLimit: rawLimitMS * fromMS,
      DistToNextSpeedLimit: nextLimitDist,
      NextSpeedLimit: nextLimitSpeedMS * fromMS,
      UpcomingLimits: upcomingLimits,
      Gradient: this.state.emaGradient,
      LateralG: this.state.emaLateralG,
      StationDistance: raw.StationDistance !== undefined ? raw.StationDistance : -1,
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
      ActiveCab: this.state.activeCab,
      NextSignalAspect: aspect,
      DistToNextSignal: sigDist,
      TrainLength: trainLength,
      // Mapeamos 'Mass' del script Lua (en Toneladas según GetData.txt) a 'TrainMass' en V3
      TrainMass: Number(raw.Mass || raw.TrainMass || 0),
      ProjectedBrakingDistance: projectedBrakingDistance,
      TailDistanceRemaining: tailInfo.distanceRemaining,
      TailSecondsRemaining: tailSeconds,
      TailIsActive: tailInfo.isActive,
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
