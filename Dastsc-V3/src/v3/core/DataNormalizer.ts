/**
 * Orquesta los sub-normalizadores y ensambla TelemetryData desde el plugin TSC.
 */
import { TelemetryData } from './TelemetryContext';
import { G_CONSTANT, EMA_ALPHA, emaBlend } from './normalizers/Constants';
import { PhysicsNormalizer } from './normalizers/PhysicsNormalizer';
import { SignalingNormalizer } from './normalizers/SignalingNormalizer';
import { BrakeNormalizer } from './normalizers/BrakeNormalizer';
import {
  NormalizerProfile,
  SimulatorRawInput,
  brakeCylinderPercent,
  buildUpcomingLimits,
  computeProjectedBrakingDistance,
  computeSimDelta,
  computeTotalBrakingEffort,
  formatTimeOfDay,
  inferActiveCab,
  resolveGradientSign,
  updateLatchedCab,
  MAX_DT_SIM_S,
  MIN_DT_SIM_S,
  MIN_SPEED_FOR_CAB_INFER_MS,
  pressureScale,
  PROJECTION_HORIZON_S,
  resolveCombinedControl,
  resolvePressureUnit,
  resolveSpeedMS,
  resolveTrainLength,
  resolveUnitContext,
  saneSpeedLimit,
  speedUnitLabel,
  stickyOcrField,
  stickyStationDistance,
  toDisplaySpeed,
  worldFarCoordinate,
} from './dataNormalizerUtils';
import { asNumber } from './normalizers/PhysicsNormalizer';

interface NormalizerState {
  lastSimTime: number;
  lastRealTime: number;
  activeCab: number;
  latchedCab: number;
  emaAccelMS2: number;
}

export class DataNormalizer {
  private physics = new PhysicsNormalizer();
  private signaling = new SignalingNormalizer();
  private brakes = new BrakeNormalizer();

  private state: NormalizerState = {
    lastSimTime: 0,
    lastRealTime: 0,
    activeCab: 1,
    latchedCab: 0,
    emaAccelMS2: 0,
  };

  normalize(
    raw: SimulatorRawInput,
    prevData: TelemetryData,
    profile?: NormalizerProfile | null,
  ): Partial<TelemetryData> {
    const now = Date.now() / 1000;
    const rawSimTime = asNumber(raw.SimulationTime);
    const trainLength = resolveTrainLength(raw);
    const units = resolveUnitContext(raw, profile);

    this.state.activeCab = asNumber(raw.ActiveCab, 1);

    const dtSim = computeSimDelta(
      rawSimTime,
      raw.SimulationTime !== undefined,
      this.state.lastSimTime,
      this.state.lastRealTime,
      now,
    );
    this.state.lastSimTime = rawSimTime;
    this.state.lastRealTime = now;

    const speedMS = resolveSpeedMS(raw, units.simToMS);
    const phys = this.physics.normalize(raw, dtSim, speedMS);
    const sig = this.signaling.normalize(raw, phys.speedMS, dtSim, trainLength, units.simToMS);
    const brk = this.brakes.normalize(raw, profile);

    const pressureUnit = resolvePressureUnit(raw, profile);
    const pFactor = pressureScale(pressureUnit);

    if (dtSim > MIN_DT_SIM_S && dtSim < MAX_DT_SIM_S) {
      const rawDelta = (phys.speedMS - prevData.Speed) / dtSim;
      this.state.emaAccelMS2 = emaBlend(this.state.emaAccelMS2, rawDelta, EMA_ALPHA);
    }
    const computedGForce = this.state.emaAccelMS2 / G_CONSTANT;

    const reversal = asNumber(raw.Reversal ?? raw.Reverser);
    this.state.latchedCab = updateLatchedCab(
      this.state.latchedCab,
      reversal,
      phys.speedMS,
      raw.WheelSpeedMS,
      raw.TrackMPH,
    );
    const inferredCab = inferActiveCab(
      this.state.activeCab,
      reversal,
      phys.speedMS,
      raw.WheelSpeedMS,
      raw.TrackMPH,
      this.state.latchedCab,
    );
    const cabSign = resolveGradientSign(
      inferredCab,
      reversal,
      raw.WheelSpeedMS,
      phys.speedMS,
    );
    const gameRawGrad = asNumber(raw.Gradient);
    const currentGrad = cabSign * gameRawGrad;

    const bcPercent = brakeCylinderPercent(brk.bc, pressureUnit);
    const totalBrakingEffort = computeTotalBrakingEffort(bcPercent, brk, profile);

    const upcomingLimits = buildUpcomingLimits(sig, units.simToMS, units.displayFromMS);
    const nextLimitSpeedDisplay = upcomingLimits.length > 0
      ? upcomingLimits[0].speed
      : toDisplaySpeed(sig.currentLimitConverted * units.simToMS, units.displayFromMS);
    const nextLimitDist = upcomingLimits.length > 0 ? upcomingLimits[0].distance : 0;

    const currentThrottle = asNumber(raw.Throttle ?? raw.Regulator);
    const currentBrake = asNumber(raw.TrainBrake ?? raw.TrainBrakeControl);
    const limitFallback = sig.currentLimitConverted;
    const limitToMS = (v: number) => saneSpeedLimit(v, limitFallback) * units.simToMS;

    return {
      Speed: phys.speedMS,
      Throttle: currentThrottle,
      TrainBrake: currentBrake,
      CombinedControl: resolveCombinedControl(raw, currentThrottle, currentBrake),
      Reverser: reversal,
      SpeedDisplay: toDisplaySpeed(phys.speedMS, units.displayFromMS),
      SpeedUnit: speedUnitLabel(units.displayUnit),
      Acceleration: this.state.emaAccelMS2,
      GForce: computedGForce,
      ProjectedSpeed: Math.max(0, phys.speedMS + this.state.emaAccelMS2 * PROJECTION_HORIZON_S) * units.displayFromMS,
      SpeedLimit: toDisplaySpeed(sig.effectiveSpeedLimit, units.displayFromMS),
      FrontalSpeedLimit: toDisplaySpeed(sig.currentLimitConverted * units.simToMS, units.displayFromMS),
      TrackLimit: toDisplaySpeed(
        raw.TrackLimit ? asNumber(raw.TrackLimit) * units.simToMS : sig.currentLimitConverted * units.simToMS,
        units.displayFromMS,
      ),
      SignalLimit: toDisplaySpeed(
        raw.SignalLimit ? asNumber(raw.SignalLimit) * units.simToMS : sig.currentLimitConverted * units.simToMS,
        units.displayFromMS,
      ),
      DistToNextSpeedLimit: nextLimitDist,
      NextSpeedLimit: nextLimitSpeedDisplay,
      NextLimit2Speed: toDisplaySpeed(limitToMS(sig.rawNextLimit2Speed), units.displayFromMS),
      DistToNextLimit2: sig.rawNextLimit2DistFromLua,
      UpcomingLimits: upcomingLimits,
      Gradient: currentGrad,
      RawGradient: gameRawGrad,
      LateralG: phys.lateralG,
      StationDistance: stickyStationDistance(raw, prevData),
      StationName: raw.StationName || '',
      StationLength: asNumber(raw.PlatformLength ?? raw.StationLength, 200),
      BrakeCylinderPressure: brk.bc * pFactor,
      BrakePipePressure: brk.bp * pFactor,
      MainResPressure: brk.mr * pFactor,
      EqResPressure: brk.er * pFactor,
      BrakingEffort: totalBrakingEffort,
      BrakingPercent: bcPercent * 100,
      PressureUnit: pressureUnit,
      Amperage: brk.amperage,
      AmperageUnit: brk.ampUnit,
      Ammeter: asNumber(raw.Ammeter),
      TractiveEffort: asNumber(raw.TractiveEffort),
      TractionPercent: brk.tractionPercent,
      ActiveCab: inferredCab,
      TrainType: asNumber(raw.ConsistType, 1),
      NextSignalAspect: sig.nextSignalAspect,
      DistToNextSignal: sig.nextSignalDistance,
      TrainLength: trainLength,
      TrainMass: asNumber(raw.Mass),
      ConsistType: asNumber(raw.ConsistType),
      TailDistanceRemaining: raw.TailDistance !== undefined
        ? asNumber(raw.TailDistance)
        : sig.tailDistanceRemaining,
      TailSecondsRemaining: raw.TailSeconds !== undefined
        ? asNumber(raw.TailSeconds)
        : (phys.speedMS > MIN_SPEED_FOR_CAB_INFER_MS ? sig.tailDistanceRemaining / phys.speedMS : 0),
      TailIsActive: raw.TailActive !== undefined
        ? asNumber(raw.TailActive) === 1
        : sig.tailIsActive,
      TripDistance: phys.totalDistance,
      ProjectedBrakingDistance: computeProjectedBrakingDistance(
        phys.speedMS,
        asNumber(raw.Mass),
        totalBrakingEffort,
        currentGrad,
      ),
      RVNumber: String(raw.RVNumber ?? raw.RvNumber ?? ''),
      RouteID: String(raw.RouteID ?? raw.RouteId ?? ''),
      ScenarioPath: raw.ScenarioPath || '',
      X: worldFarCoordinate(raw.FarXT, raw.FarXO),
      Z: worldFarCoordinate(raw.FarZT, raw.FarZO),
      IsEmergency: raw.EmergencyBrake === 1,
      AWS: asNumber(raw.AWS),
      AWSState: asNumber(raw.AWSState),
      AWSReset: asNumber(raw.AWSReset) || asNumber(raw.AWSResetButton),
      AWSWarning: asNumber(raw.AWSWarning) || asNumber(raw.AWSWarnAudio),
      AWSWarnCount: asNumber(raw.AWSWarnCount),
      DSD: asNumber(raw.DSD),
      VigilAlarm: asNumber(raw.VigilAlarm),
      Vigilance: asNumber(raw.Vigilance),
      DVDAlarm: asNumber(raw.DVDAlarm),
      DRA: asNumber(raw.DRA) === 1,
      Sander: asNumber(raw.Sander) === 1,
      DoorsOpen: {
        left: asNumber(raw.DoorL) > 0.5,
        right: asNumber(raw.DoorR) > 0.5,
      },
      TimeOfDay: formatTimeOfDay(asNumber(raw.TimeOfDay)),
      LocoName: raw.LocoName || '',
      StationNameOCR: stickyOcrField(raw.StationNameOCR, prevData.StationNameOCR),
      StationETA: stickyOcrField(raw.StationETA, prevData.StationETA),
      StationScheduled: stickyOcrField(raw.StationScheduled, prevData.StationScheduled),
      Timestamp: Date.now(),
    };
  }

  reset(): void {
    this.signaling.reset();
    this.state = {
      lastSimTime: 0,
      lastRealTime: 0,
      activeCab: 1,
      latchedCab: 0,
      emaAccelMS2: 0,
    };
  }
}
