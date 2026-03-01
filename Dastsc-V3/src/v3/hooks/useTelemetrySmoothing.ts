import { useTelemetry } from '../core/TelemetryContext';
import { useSmoothValue } from './useSmoothValue';

/**
 * Hook de alto nivel que extrae y suaviza los valores de telemetría principales.
 * Este es el punto de consumo principal para los componentes de la interfaz que necesitan movimiento a 60 FPS.
 */
export function useTelemetrySmoothing() {
  const { data, isConnected, activeProfile } = useTelemetry();

  // MODO MANIOBRA: Si la velocidad es < 2 m/s (aprox 7 km/h), aumentamos la reactividad
  const isManeuvering = data.Speed < 2;
  const speedFactor = isManeuvering ? 0.7 : 0.45; // Aumentado significativamente para reducir lag visual
  const distFactor = isManeuvering ? 0.8 : 0.6; // Distancias más reactivas
  
  const smoothSpeed = useSmoothValue(data.Speed, speedFactor);
  const smoothSpeedDisplay = useSmoothValue(data.SpeedDisplay, speedFactor);
  const smoothBrakeCylinder = useSmoothValue(data.BrakeCylinderPressure, 0.25); // Presión más rápida
  const smoothBrakePipe = useSmoothValue(data.BrakePipePressure, 0.25);
  const smoothMainRes = useSmoothValue(data.MainResPressure, 0.15);
  const smoothAmperage = useSmoothValue(data.Amperage, 0.3); // Amperaje mucho más ágil

  const smoothSignalDist = useSmoothValue(data.DistToNextSignal, distFactor);
  const smoothNextLimitDist = useSmoothValue(data.DistToNextSpeedLimit, distFactor);
  const smoothGradient = useSmoothValue(data.Gradient, 0.1);
  const smoothStationDist = useSmoothValue(data.StationDistance, distFactor);
  const smoothLateralG = useSmoothValue(data.LateralG, 0.1);
  const smoothGForce = useSmoothValue(data.GForce, 0.1);
  
  return {
    raw: data,
    isManeuvering,
    smooth: {
      speed: smoothSpeed,
      speedDisplay: smoothSpeedDisplay,
      brakeCylinder: smoothBrakeCylinder,
      brakePipe: smoothBrakePipe,
      mainRes: smoothMainRes,
      amperage: smoothAmperage,
      signalDistance: smoothSignalDist,
      nextLimitDistance: smoothNextLimitDist,
      gradient: smoothGradient,
      stationDistance: smoothStationDist,
      lateralG: smoothLateralG,
      gForce: smoothGForce
    },
    isConnected,
    activeProfile
  };
}
