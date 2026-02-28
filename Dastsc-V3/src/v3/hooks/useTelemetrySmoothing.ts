import { useTelemetry } from '../core/TelemetryContext';
import { useSmoothValue } from './useSmoothValue';

/**
 * Hook de alto nivel que extrae y suaviza los valores de telemetría principales.
 * Este es el punto de consumo principal para los componentes de la interfaz que necesitan movimiento a 60 FPS.
 */
export function useTelemetrySmoothing() {
  const { data, isConnected, activeProfile } = useTelemetry();

  // MODO MANIOBRA: Si la velocidad es < 2 m/s (aprox 7 km/h), aumentamos la reactividad
  // para permitir acoplamientos y paradas de precisión.
  const isManeuvering = data.Speed < 2;
  const speedFactor = isManeuvering ? 0.4 : 0.15;
  const distFactor = isManeuvering ? 0.6 : 0.3;
  
  const smoothSpeed = useSmoothValue(data.Speed, speedFactor);
  const smoothSpeedDisplay = useSmoothValue(data.SpeedDisplay, speedFactor);
  const smoothBrakeCylinder = useSmoothValue(data.BrakeCylinderPressure, 0.08);
  const smoothBrakePipe = useSmoothValue(data.BrakePipePressure, 0.08);
  const smoothMainRes = useSmoothValue(data.MainResPressure, 0.05);
  const smoothAmperage = useSmoothValue(data.Amperage, 0.1);
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
