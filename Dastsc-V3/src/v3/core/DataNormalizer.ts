
/**
 * DataNormalizer.ts
 * Utilidades para la limpieza, filtrado y normalización de datos brutos del simulador.
 */

import { TelemetryData } from './TelemetryContext';
import { PhysicsNormalizer } from './normalizers/PhysicsNormalizer';
import { SignalingNormalizer } from './normalizers/SignalingNormalizer';
import { BrakeNormalizer } from './normalizers/BrakeNormalizer';

export class DataNormalizer {
  private physics = new PhysicsNormalizer();
  private signaling = new SignalingNormalizer();
  private brakes = new BrakeNormalizer();

  private state = {
    lastSimTime: 0,
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
    
    if (!this.loggedRawFields && rawSimTime > 0) {
      this.loggedRawFields = true;
      console.warn('[FIELDS] Campos disponibles en raw:', Object.keys(raw).sort());
    }
    
    let trainLength = Number(raw.TrainLength || 100);
    if (trainLength <= 0) trainLength = 100;
    
    this.state.activeCab = Number(raw.ActiveCab || 1);

    const profileUnit = profile?.visuals?.unit;
    let speedUnit: 'MPH' | 'KPH' = profileUnit === 'KPH' ? 'KPH' : 'MPH';
    if (!profileUnit) {
      speedUnit = Number(raw.SpeedoType || 1) === 2 ? 'KPH' : 'MPH';
    }

    const toMS = speedUnit === 'KPH' ? 1/3.6 : 0.44704;
    const fromMS = speedUnit === 'KPH' ? 3.6 : 2.23694;
    const G_CONSTANT = 9.80665;

    let dtSim = 0;
    if (this.state.lastSimTime > 0) {
        if (rawSimTime > this.state.lastSimTime) {
            dtSim = Math.min(1.0, rawSimTime - this.state.lastSimTime);
        } else if (raw.SimulationTime === undefined && this.state.lastRealTime > 0) {
            dtSim = Math.min(0.2, now - this.state.lastRealTime);
        }
    }
    this.state.lastSimTime = rawSimTime;
    this.state.lastRealTime = now;

    // 1. Unificación de Velocidad
    let speedMS = 0;
    if (raw.CabSpeed !== undefined && raw.CabSpeed !== 0) {
      speedMS = raw.CabSpeed * toMS;
    } else {
      speedMS = Math.abs(raw.CurrentSpeed || raw.Speed || 0);
      if (raw.Speed !== undefined && raw.CurrentSpeed === undefined) speedMS *= toMS;
    }

    // --- LLAMADAS A SUB-NORMALIZADORES ---
    const phys = this.physics.normalize(raw, dtSim, speedMS);
    const sig = this.signaling.normalize(raw, phys.speedMS, dtSim, trainLength, toMS);
    const brk = this.brakes.normalize(raw, profile);
    // -------------------------------------

    const currentLimitConverted = sig.currentLimitConverted;
    const rawLimitMS = currentLimitConverted * toMS;

    // Presiones y Unidades
    const interpretedAsPSI = raw.BC > 15 || raw.BP > 15 || raw.MR > 20;
    const trainUnit = interpretedAsPSI ? 'PSI' : 'BAR';
    const pressureUnit = profile?.visuals?.pressure_unit || trainUnit;
    const pFactor = pressureUnit === 'PSI' ? 14.5038 : 1;

    // Gradiente y Frenado
    const EMA_SLOW = 0.05;
    const currentGrad = Number(raw.Gradient || 0);
    // Mantenemos una pequeña persistencia para el gradiente aquí por simplicidad o lo movemos a Physics
    const effectiveGrad = currentGrad; 

    const maxBC = pressureUnit === 'PSI' ? 72.5 : 5.0; 
    const bcPercent = Math.min(1.1, brk.bc / maxBC);
    const totalBrakingEffort = (bcPercent * (profile?.physics_config?.max_braking_kn || 200)) + 
                              ((brk.amperage < 0) ? Math.abs(brk.amperage) * 0.5 : 0);

    // Próximos Límites para UI
    const rawUpcoming: { speed: number, distance: number }[] = [];
    if (sig.rawNextLimitDistFromLua > 0) {
        rawUpcoming.push({ speed: sig.rawNextLimitSpeed, distance: sig.rawNextLimitDistFromLua });
    }
    
    const upcomingLimits: { speed: number, distance: number }[] = [];
    let lastRefSpeedMS = rawLimitMS; 
    for (const limit of rawUpcoming) {
        if (limit.distance <= 2.0) continue;
        const limitSpeedMS = limit.speed * toMS;
        if (Math.abs(limitSpeedMS - lastRefSpeedMS) > 0.1) {
            upcomingLimits.push(limit);
            lastRefSpeedMS = limitSpeedMS;
            if (upcomingLimits.length >= 3) break;
        }
    }

    const nextLimitSpeedMPH = upcomingLimits.length > 0 ? upcomingLimits[0].speed : 0;
    const nextLimitDist = upcomingLimits.length > 0 ? upcomingLimits[0].distance : 0;

    // Señalización (Aspecto)
    let aspect = 'UNKNOWN';
    const sigVal = (Number(raw.SigRes || 0) > 0) ? Number(raw.SigState || 0) : Number(raw.NextSignalState || raw.InternalAspect || -1);
    switch(sigVal) {
      case 0: aspect = 'DANGER'; break;
      case 1: aspect = 'CAUTION'; break;
      case 2: aspect = 'ADV_CAUTION'; break;
      case 3: aspect = 'CLEAR'; break;
      case 4: aspect = 'PROCEED'; break;
      case 10: aspect = 'FL_CAUTION'; break;
      case 11: aspect = 'FL_ADV_CAUTION'; break;
    }

    // Tiempo
    const timeSecs = raw.TimeOfDay || 0;
    const timeStr = `${Math.floor(timeSecs/3600).toString().padStart(2,'0')}:${Math.floor((timeSecs%3600)/60).toString().padStart(2,'0')}:${Math.floor(timeSecs%60).toString().padStart(2,'0')}`;

    // Controles
    const currentThrottle = Number(raw.Throttle || raw.Regulator || 0);
    const currentBrake = Number(raw.TrainBrake || raw.TrainBrakeControl || 0);

    return {
      Speed: phys.speedMS,
      Throttle: currentThrottle,
      TrainBrake: currentBrake,
      CombinedControl: Number(raw.Combined || (currentThrottle - currentBrake)),
      Reverser: Number(raw.Reversal || raw.Reverser || 0),
      SpeedDisplay: phys.speedMS * fromMS,
      SpeedUnit: speedUnit,
      Acceleration: phys.acceleration,
      GForce: phys.gForce,
      ProjectedSpeed: (phys.speedMS + (phys.acceleration * 10)) * fromMS,
      SpeedLimit: sig.effectiveSpeedLimit * fromMS,
      FrontalSpeedLimit: rawLimitMS * fromMS,
      DistToNextSpeedLimit: nextLimitDist,
      NextSpeedLimit: nextLimitSpeedMPH,
      UpcomingLimits: upcomingLimits,
      Gradient: currentGrad,
      LateralG: phys.lateralG,
      StationDistance: raw.StationDistance ?? -1,
      StationName: raw.StationName || '',
      BrakeCylinderPressure: brk.bc * pFactor,
      BrakePipePressure: brk.bp * pFactor,
      MainResPressure: brk.mr * pFactor,
      EqResPressure: brk.er * pFactor,
      BrakingEffort: totalBrakingEffort,
      BrakingPercent: bcPercent * 100,
      PressureUnit: pressureUnit,
      Amperage: brk.amperage,
      AmperageUnit: brk.ampUnit,
      TractionPercent: brk.tractionPercent,
      ActiveCab: this.state.activeCab,
      NextSignalAspect: aspect,
      DistToNextSignal: (Number(raw.SigRes || 0) > 0) ? Number(raw.SigDist || -1) : Number(raw.NextSignalDistance || -1),
      TrainLength: trainLength,
      TrainMass: Number(raw.Mass || 0),
      TailDistanceRemaining: sig.tailDistanceRemaining,
      TailSecondsRemaining: phys.speedMS > 0.5 ? sig.tailDistanceRemaining / phys.speedMS : 0,
      TailIsActive: sig.tailIsActive,
      TripDistance: phys.totalDistance,
      IsEmergency: raw.EmergencyBrake === 1,
      AWS: Number(raw.AWS || 0),
      DSD: Number(raw.DSD || 0),
      DRA: Number(raw.DRA || 0) === 1,
      Sander: Number(raw.Sander || 0) === 1,
      DoorsOpen: { left: Number(raw.DoorL || 0) > 0.5, right: Number(raw.DoorR || 0) > 0.5 },
      TimeOfDay: timeStr,
      LocoName: raw.LocoName || '',
      Timestamp: Date.now()
    };
  }
}
