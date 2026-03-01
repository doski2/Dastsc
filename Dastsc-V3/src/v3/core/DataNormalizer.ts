
/**
 * DataNormalizer.ts
 * Utilidades para la limpieza, filtrado y normalización de datos brutos del simulador.
 */

import { TelemetryData } from './TelemetryContext';
import { TailProtectionService } from './TailProtectionService';

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
}

const EMA_ALPHA = 0.15; 
const EMA_SLOW = 0.05; // Para presiones, más inercia
const G_CONSTANT = 9.80665;

export class DataNormalizer {
  private tailProtection = new TailProtectionService();
  private state: NormalizerState = {
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
    lastSpeedMS: 0,
    posX: 0,
    posZ: 0,
    lastHeading: 999, // Centinela para indicar que no hay heading previo
    emaLateralG: 0,
    lastFrontalLimit: 0,
    lastRealTime: 0
  };

  /**
   * Procesa los datos brutos y devuelve un estado normalizado.
   */
  normalize(raw: any, prevData: TelemetryData, profile: any): Partial<TelemetryData> {
    const rawSimTime = Number(raw.SimulationTime || 0);
    const now = Date.now() / 1000;
    const trainLength = profile?.physics_config?.train_length || raw.TrainLength || 100;
    const profileUnit = profile?.visuals?.unit;
    let speedUnit: 'MPH' | 'KPH' = profileUnit === 'KPH' ? 'KPH' : profileUnit === 'MPH' ? 'MPH' : 'MPH';
    
    // Si no hay perfil, usamos el SpeedoType
    if (!profileUnit) {
      const speedoType = Number(raw.SpeedoType || 1); 
      speedUnit = speedoType === 2 ? 'KPH' : 'MPH';
    }

    const toMS = speedUnit === 'KPH' ? 1/3.6 : 0.44704;
    const fromMS = speedUnit === 'KPH' ? 3.6 : 2.23694;

    // Procesamiento de límites de velocidad (Formato Horizontal V3)
    const currentLimitConverted = Number(raw.CurrentSpeedLimit || 0); // Ya viene convertido desde Lua
    const nextLimit0Speed = Number(raw.NextLimit0Speed || 0);
    const nextLimit0Dist = Number(raw.NextLimit0Dist || -1);

    this.state.effectiveSpeedLimit = currentLimitConverted * toMS; // Almacenamos en m/s interno

    let dtSim = 0;
    // Lógica de Delta Time robusta (Evita avanzar el odómetro en pausa)
    if (this.state.lastSimTime > 0) {
        if (rawSimTime > this.state.lastSimTime) {
            dtSim = rawSimTime - this.state.lastSimTime;
        } else if (raw.SimulationTime === undefined && this.state.lastRealTime > 0) {
            // Solo usamos fallback de tiempo real si el simulador no reporta simTime (para locos incompatibles)
            dtSim = Math.min(0.2, now - this.state.lastRealTime);
        }
    }
    
    // 0. Latencia y Performance (Del nuevo campo LuaMS)
    const luaLatency = Number(raw.LuaMS || 0);

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


    // 1.1 Límite de Velocidad (Normalizar a m/s inmediatamente)
    const rawLimitMS = Number(raw.CurrentSpeedLimit || 0) * toMS;

    // 1.2 Filtrado de picos absurdos (Denoising avanzado)
    const speedDelta = Math.abs(speedMS - this.state.lastSpeedMS);
    if (this.state.lastSimTime > 0 && speedDelta > 20 && dtSim < 0.5) {
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

    // 5. Lógica de "Cola de Tren" (Tail Protection)
    // DEPURACIÓN V3.9: Recolección única y global de límites (8 hitos de Lua)
    const rawUpcoming: { speed: number, distance: number }[] = [];
    for (let i = 0; i < 8; i++) {
        const s = parseFloat(raw[`NextLimit${i}Speed`]);
        const d = parseFloat(raw[`NextLimit${i}Dist`]);
        if (!isNaN(s) && !isNaN(d) && d > 0.1) {
            rawUpcoming.push({ speed: s, distance: d });
        }
    }
    rawUpcoming.sort((a, b) => a.distance - b.distance);

    // Buscamos el primer cambio real para la lógica de cola
    let nextDiffLimit = { speed: rawLimitMS * fromMS, distance: 0 };
    for(const l of rawUpcoming) {
        if(Math.abs((l.speed * toMS) - rawLimitMS) > 0.1) {
            nextDiffLimit = l;
            break;
        }
    }

    const rawNextLimitDist = nextDiffLimit.distance;
    const rawNextLimitSpeedMS = nextDiffLimit.speed * toMS;

    // Inicialización del estado (En MPS)
    if (this.state.lastFrontalLimit === 0 && rawLimitMS !== 0) {
        this.state.lastFrontalLimit = rawLimitMS;
    }
    if (this.state.effectiveSpeedLimit === 0 && rawLimitMS !== 0) {
        this.state.effectiveSpeedLimit = rawLimitMS;
    }

    // DETECCIÓN DE TRIGGER (PASO DE CABINA POR SEÑAL)
    // Detección por cambio de límite nominal (Lo más común)
    const limitIncreased = rawLimitMS > (this.state.lastFrontalLimit + 0.1);
    const limitDecreased = rawLimitMS < (this.state.lastFrontalLimit - 0.1);

    // Detección por salto de distancia en el radar (Para señales que el simulador no reporta en nominal)
    // Solo se activa si el límite NOMINAL no ha cambiado aún para sincronizarse con el radar.
    const distanceJumped = !limitIncreased && 
                           this.state.lastNextLimitDist > 0 && 
                           this.state.lastNextLimitDist < 15 && 
                           (rawNextLimitDist > (this.state.lastNextLimitDist + 50) || rawNextLimitDist === 0) &&
                           Math.abs(this.state.lastNextLimitSpeed - rawLimitMS) > 0.1;
    
    // Objetivo tras limpiar cola: si saltó, usamos lo que teníamos en el radar
    const targetLimitMS = limitIncreased ? rawLimitMS : (distanceJumped ? this.state.lastNextLimitSpeed : rawLimitMS);
    const isIncreaseEvent = limitIncreased || (distanceJumped && targetLimitMS > (rawLimitMS + 0.1));

    // 1. RESTRICCIÓN INMEDIATA (La seguridad manda)
    if (limitDecreased) {
        this.tailProtection.reset();
        this.state.effectiveSpeedLimit = rawLimitMS;
    }

    // 2. ACTIVACIÓN DEL ODÓMETRO (La cabina cruza primero un aumento)
    // Solo permitimos trigger si es un evento reciente (limitIncreased o distanceJumped)
    // para evitar que se re-active si el odómetro termina pero ya estábamos en una zona superior.
    const isApplyingProtection = targetLimitMS > (this.state.effectiveSpeedLimit + 0.1);

    if (isIncreaseEvent && isApplyingProtection) {
        // ...
        const initialOffset = (distanceJumped && !limitIncreased) ? Math.max(0.2, 5.0 - this.state.lastNextLimitDist) : 0.01;
        this.tailProtection.trigger(targetLimitMS, this.state.effectiveSpeedLimit, trainLength, initialOffset);
    } 
    
    // 3. ACTUALIZACIÓN DE LA PROTECCIÓN
    const protection = this.tailProtection.update(speedMS, dtSim, trainLength, rawLimitMS);
    
    // El servicio siempre devuelve un límite numérico (ya sea el de la cola o el de la vía)
    const nominal = protection.effectiveLimit ?? rawLimitMS;
    const current = this.state.effectiveSpeedLimit;
    
    const isSignificantDiff = Math.abs(nominal - current) > 0.1;
    const isReduction = nominal < (current - 0.5);
    
    // Sincronización final del velocímetro
    if (isSignificantDiff) {
        if (!isReduction || limitDecreased) {
            this.state.effectiveSpeedLimit = nominal;
        }
    }

    const tailDist = protection.tailDist;

    // FrontalLimitMS para el HUD (Límite que ve la cabina, ignorando cola)
    const frontalLimitMS = this.tailProtection.getIsProtecting()
        ? this.tailProtection.getCleaningTarget()
        : rawLimitMS;

    // Próximos hitos visibles para la UI (máximo 3 cambios)
    const upcomingLimits: { speed: number, distance: number }[] = [];
    
    // Filtramos redundancias. Usamos frontalLimitMS como referencia inicial
    // para que la lista no muestre el límite en el que ya está la cabina.
    let lastRefSpeedMS = frontalLimitMS; 

    for (const limit of rawUpcoming) {
        const limitSpeedMS = limit.speed * toMS;
        const dist = limit.distance;

        // Umbral de 2m para evitar que la señal desaparezca antes de que el usuario la vea pasar
        if (dist <= 2.0) continue;

        // Filtramos redundancias de la misma velocidad
        const isDifferentSpeed = Math.abs(limitSpeedMS - lastRefSpeedMS) > 0.1;

        if (isDifferentSpeed) {
            upcomingLimits.push(limit);
            lastRefSpeedMS = limitSpeedMS;
            if (upcomingLimits.length >= 3) break;
        }
    }

    const nextLimitSpeedMPH = upcomingLimits.length > 0 ? upcomingLimits[0].speed : (this.tailProtection.getCleaningTarget() * fromMS);
    const nextLimitDist = upcomingLimits.length > 0 ? upcomingLimits[0].distance : 0;
    const nextLimitSpeedMS = nextLimitSpeedMPH * toMS;

    // Actualización de estado para el próximo tick
    this.state.lastFrontalLimit = rawLimitMS;
    this.state.lastNextLimitDist = rawNextLimitDist;
    this.state.lastNextLimitSpeed = rawNextLimitSpeedMS;

    // 5. Unificación de Señales y Distancias (V4.1 Pro)
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
      FrontalSpeedLimit: frontalLimitMS * fromMS,
      TailDistance: tailDist,
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
      NextSignalAspect: aspect,
      DistToNextSignal: sigDist,
      TrainLength: trainLength,
      // Mapeamos 'Mass' del script Lua (en Toneladas según GetData.txt) a 'TrainMass' en V3
      TrainMass: Number(raw.Mass || raw.TrainMass || 0),
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
