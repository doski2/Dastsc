
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
    activeCab: 1,
    emaAccelMS2: 0,  // aceleración derivada del delta real de velocidad (signo correcto)
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
    }
    
    let trainLength = Number(raw.TrainLength || raw.Length || 100);
    if (trainLength <= 0) trainLength = 100;
    
    this.state.activeCab = Number(raw.ActiveCab || 1);

    // 0. Selección de Unidades
    // 0. Selección de Unidades
    // simUnit: Lo que el juego nos está enviando (basado en SpeedoType o el plugin)
    // displayUnit: Lo que el usuario quiere ver (basado en el perfil)
    const simUnit: 'MPH' | 'KPH' = Number(raw.SpeedoType) === 2 ? 'KPH' : 'MPH';
    const profileUnit = profile?.visuals?.unit;
    const displayUnit: 'MPH' | 'KPH' = (profileUnit === 'KPH' || profileUnit === 'MPH') ? profileUnit : simUnit;

    const simToMS = simUnit === 'KPH' ? 1/3.6 : 0.44704;
    const displayFromMS = displayUnit === 'KPH' ? 3.6 : 2.23694;

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

    // 1. Unificación de Velocidad (Convertir de simUnit a m/s)
    let speedMS = 0;
    if (raw.CabSpeed !== undefined && raw.CabSpeed !== 0) {
      speedMS = raw.CabSpeed * simToMS;
    } else {
      speedMS = Math.abs(raw.CurrentSpeed || raw.Speed || 0);
      if (raw.Speed !== undefined && raw.CurrentSpeed === undefined) speedMS *= simToMS;
    }

    // --- LLAMADAS A SUB-NORMALIZADORES ---
    const phys = this.physics.normalize(raw, dtSim, speedMS);
    const sig = this.signaling.normalize(raw, phys.speedMS, dtSim, trainLength, simToMS);
    const brk = this.brakes.normalize(raw, profile);
    // -------------------------------------

    const rawLimitMS = sig.currentLimitConverted * simToMS;

    // Presiones y Unidades
    const interpretedAsPSI = raw.BC > 15 || raw.BP > 15 || raw.MR > 20;
    const trainUnit = interpretedAsPSI ? 'PSI' : 'BAR';
    const pressureUnit = profile?.visuals?.pressure_unit || trainUnit;
    const pFactor = pressureUnit === 'PSI' ? 14.5038 : 1;

    // Aceleración derivada del delta real de velocidad (sign correcto independientemente del juego)
    // TS Classic puede enviar raw.Acceleration con convención positivo=frenado → no fiable
    if (dtSim > 0.01 && dtSim < 2.0) {
      const rawDelta = (phys.speedMS - prevData.Speed) / dtSim;
      this.state.emaAccelMS2 = rawDelta * 0.15 + this.state.emaAccelMS2 * 0.85;
    }
    const computedGForce = this.state.emaAccelMS2 / 9.80665;

    // Gradiente y Frenado
    // TS Classic: GetGradient() usa convención ESTÁNDAR (positivo = subida, negativo = bajada)
    // Si el tren opera desde la cabina trasera (cab 2), va en sentido contrario → invertir gradiente.
    //
    // El Lua solo actualiza ActiveCab via OnCameraEnter (cámara interior). Si el maquinista usa
    // cámara exterior o el evento no se dispara, ActiveCab se queda en 1 aunque la cabina real sea 2.
    // Fallback: si ActiveCab=1 pero Reversal=-1 (reversa), asumimos cab 2 porque en TSC el
    // maquinista siempre conduce hacia adelante desde su cabina activa.
    const reportedCab = this.state.activeCab;
    const reversal = Number(raw.Reversal || raw.Reverser || 0);
    // Si el juego dice cab 1 pero el reversor está en reversa con velocidad, probablemente es cab 2
    const inferredCab = (reportedCab === 1 && reversal < 0 && phys.speedMS > 0.5) ? 2 : reportedCab;
    const cabSign = inferredCab === 2 ? -1 : 1;
    const gameRawGrad = Number(raw.Gradient || 0); // valor original del juego (positivo=subida)
    const currentGrad = cabSign * gameRawGrad;

    const maxBC = pressureUnit === 'PSI' ? 72.5 : 5.0; 
    const bcPercent = Math.min(1.1, brk.bc / maxBC);
    
    // El esfuerzo de frenado base se multiplica por la eficiencia del ConsistType
    const baseBrakingEffort = (bcPercent * (profile?.physics_config?.max_braking_kn || 200));
    const totalBrakingEffort = (baseBrakingEffort * (brk.brakeEfficiency || 1)) + 
                              ((brk.amperage < 0) ? Math.abs(brk.amperage) * 0.5 : 0);

    // Próximos Límites para UI (Convertir todo a displayUnit de forma segura)
    // FILTRO DE SEGURIDAD: el sim devuelve valores corruptos (200006/inf) cuando el
    // próximo "límite" es en realidad una señal en rojo. currentLimitConverted ya viene
    // en unidad de display (km/h o mph), igual que rawNextLimitSpeed → comparamos directo.
    const MAX_SANE_LIMIT = 450;
    const saneLimit = (v: number): number =>
        (!isFinite(v) || v <= 0 || v > MAX_SANE_LIMIT) ? sig.currentLimitConverted : v;

    const rawUpcoming: { speed: number, distance: number }[] = [];
    if (sig.rawNextLimitDistFromLua > 0) {
        // Primero a MS (unidad neutra) y luego a Display
        const speedMS = saneLimit(sig.rawNextLimitSpeed) * simToMS;
        rawUpcoming.push({ 
            speed: speedMS * displayFromMS, 
            distance: sig.rawNextLimitDistFromLua 
        });
    }
    if ((sig as any).rawNextLimit2DistFromLua > 0) {
        const speedMS = saneLimit((sig as any).rawNextLimit2Speed) * simToMS;
        rawUpcoming.push({ 
            speed: speedMS * displayFromMS, 
            distance: (sig as any).rawNextLimit2DistFromLua 
        });
    }
    
    // Mostramos siempre el primer próximo límite (aunque coincida con el actual) y
    // deduplicamos solo límites consecutivos idénticos para no saturar el HUD.
    const upcomingLimits: { speed: number, distance: number }[] = [];
    let lastRefSpeedMS = NaN; 
    for (const limit of rawUpcoming) {
        if (limit.distance <= 2.0) continue;
        const limitSpeedMS = limit.speed / displayFromMS;
        if (isNaN(lastRefSpeedMS) || Math.abs(limitSpeedMS - lastRefSpeedMS) > 0.1) {
            upcomingLimits.push(limit);
            lastRefSpeedMS = limitSpeedMS;
            if (upcomingLimits.length >= 3) break;
        }
    }

    // Si no hay próximos límites, el "NextSpeedLimit" es el actual convertido
    const nextLimitSpeedDisplay = upcomingLimits.length > 0 
        ? upcomingLimits[0].speed 
        : (sig.currentLimitConverted * simToMS * displayFromMS);
    const nextLimitDist = upcomingLimits.length > 0 ? upcomingLimits[0].distance : 0;

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
      SpeedDisplay: phys.speedMS * displayFromMS,
      SpeedUnit: displayUnit === 'KPH' ? 'km/h' : 'MPH',
      Acceleration: this.state.emaAccelMS2,
      GForce: computedGForce,
      // ProjectedSpeed: velocidad estimada en 5s basada en el delta real de velocidad (dSpeed/dt)
      // Evita depender del signo de raw.Acceleration (convención variable según versión del juego)
      ProjectedSpeed: Math.max(0, (phys.speedMS + this.state.emaAccelMS2 * 5)) * displayFromMS,
      SpeedLimit: sig.effectiveSpeedLimit * displayFromMS,
      FrontalSpeedLimit: sig.currentLimitConverted * simToMS * displayFromMS,
      TrackLimit: (raw.TrackLimit ? Number(raw.TrackLimit) * simToMS : (sig.currentLimitConverted * simToMS)) * displayFromMS,
      SignalLimit: (raw.SignalLimit ? Number(raw.SignalLimit) * simToMS : (sig.currentLimitConverted * simToMS)) * displayFromMS,
      DistToNextSpeedLimit: nextLimitDist,
      NextSpeedLimit: nextLimitSpeedDisplay,
      NextLimit2Speed: saneLimit((sig as any).rawNextLimit2Speed) * simToMS * displayFromMS,
      DistToNextLimit2: (sig as any).rawNextLimit2DistFromLua,
      UpcomingLimits: upcomingLimits,
      Gradient: currentGrad,
      RawGradient: gameRawGrad, // valor sin normalizar del juego (TS Classic: positivo=subida, estándar)
      LateralG: phys.lateralG,
      // StationDistance: preferir raw si es válido (>= 0), sino conservar el último
      // valor conocido de prevData (evita parpadeo a -1 entre frames sin escenario).
      StationDistance: (raw.StationDistance !== undefined && raw.StationDistance >= 0)
        ? raw.StationDistance
        : (prevData.StationDistance >= 0 ? prevData.StationDistance : -1),
      StationName: raw.StationName || '',
      StationLength: Number(raw.PlatformLength || raw.StationLength || 200),
      BrakeCylinderPressure: brk.bc * pFactor,
      BrakePipePressure: brk.bp * pFactor,
      MainResPressure: brk.mr * pFactor,
      EqResPressure: brk.er * pFactor,
      BrakingEffort: totalBrakingEffort,
      BrakingPercent: bcPercent * 100,
      PressureUnit: pressureUnit,
      Amperage: brk.amperage,
      AmperageUnit: brk.ampUnit,
      Ammeter: Number(raw.Ammeter || 0),
      TractiveEffort: Number(raw.TractiveEffort || 0),
      TractionPercent: brk.tractionPercent,
      ActiveCab: inferredCab,
      TrainType: Number(raw.ConsistType || 1),
      NextSignalAspect: sig.nextSignalAspect,
      DistToNextSignal: sig.nextSignalDistance,
      TrainLength: trainLength,
      TrainMass: Number(raw.Mass || 0),
      ConsistType: Number(raw.ConsistType || 0),
      // Preferir valores computados por Lua (TailProtection V6) cuando estén disponibles
      TailDistanceRemaining: raw.TailDistance !== undefined ? Number(raw.TailDistance) : sig.tailDistanceRemaining,
      TailSecondsRemaining: raw.TailSeconds !== undefined ? Number(raw.TailSeconds) : (phys.speedMS > 0.5 ? sig.tailDistanceRemaining / phys.speedMS : 0),
      TailIsActive: raw.TailActive !== undefined ? Number(raw.TailActive) === 1 : sig.tailIsActive,
      TripDistance: phys.totalDistance,
      ProjectedBrakingDistance: (() => {
        const v = phys.speedMS;
        if (v < 0.5) return 0;
        const mass = Number(raw.Mass || 0);
        // totalBrakingEffort is in kN, mass is in tonnes; both ×1000 cancel → decelMS2 = kN/t = m/s²
        const decelMS2 = (totalBrakingEffort > 0 && mass > 0)
          ? totalBrakingEffort / mass
          : 0.7; // Desaceleración estándar de tren (m/s²)
        // Corrección por gradiente: Gradient en ‰ → fracción → componente gravitatoria (m/s²)
        // Pendiente positiva (subida) ayuda al freno; negativa (bajada) lo reduce
        const gradFraction = currentGrad / 1000.0;
        const gravComponent = gradFraction * 9.81;
        const effectiveDecel = Math.max(0.05, decelMS2 + gravComponent);
        return Math.round((v * v) / (2 * effectiveDecel));
      })(),
      RVNumber: raw.RVNumber || raw.RvNumber || '',
      RouteID: raw.RouteID || raw.RouteId || '',
      ScenarioPath: raw.ScenarioPath || '',
      // Coordenadas mundiales: FarXT*1024+FarXO (estables entre tiles, a diferencia de NX/NZ)
      X: Number(raw.FarXT || 0) * 1024 + Number(raw.FarXO || 0),
      Z: Number(raw.FarZT || 0) * 1024 + Number(raw.FarZO || 0),
      IsEmergency: raw.EmergencyBrake === 1,
      // Mapeo robusto de AWS basado en el debug.txt (AWSReset, AWSWarnCount, etc.)
      AWS: Number(raw.AWS || 0),
      AWSState: Number(raw.AWSState || 0),
      AWSReset: Number(raw.AWSReset || 0) || Number(raw.AWSResetButton || 0),
      AWSWarning: Number(raw.AWSWarning || 0) || Number(raw.AWSWarnAudio || 0),
      AWSWarnCount: Number(raw.AWSWarnCount || 0),
      DSD: Number(raw.DSD || 0),
      VigilAlarm: Number(raw.VigilAlarm || 0),
      Vigilance: Number(raw.Vigilance || 0),
      DVDAlarm: Number(raw.DVDAlarm || 0),
      DRA: Number(raw.DRA || 0) === 1,
      Sander: Number(raw.Sander || 0) === 1,
      DoorsOpen: { left: Number(raw.DoorL || 0) > 0.5, right: Number(raw.DoorR || 0) > 0.5 },
      TimeOfDay: timeStr,
      LocoName: raw.LocoName || '',
      // Los campos OCR solo llegan en frames de captura (cada 5-30s).
      // - Si el campo NO está en el payload (undefined) → conservar prevData (frame normal sin captura)
      // - Si el campo está explícitamente vacío ('') → limpiar (señal de nueva parada desde backend)
      // - Si el campo tiene valor → usarlo
      StationNameOCR: raw.StationNameOCR !== undefined ? (raw.StationNameOCR || '') : (prevData.StationNameOCR || ''),
      StationETA: raw.StationETA !== undefined ? (raw.StationETA || '') : (prevData.StationETA || ''),
      StationScheduled: raw.StationScheduled !== undefined ? (raw.StationScheduled || '') : (prevData.StationScheduled || ''),
      Timestamp: Date.now()
    };
  }
}
