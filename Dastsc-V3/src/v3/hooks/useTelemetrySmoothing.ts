import { useTelemetry } from '../core/TelemetryContext';
import { useSmoothValue } from './useSmoothValue';

/**
 * Hook de alto nivel que extrae y suaviza los valores de telemetría principales.
 * Este es el punto de consumo principal para los componentes de la interfaz que necesitan movimiento a 60 FPS.
 */
export function useTelemetrySmoothing() {
  const { data, isConnected, activeProfile } = useTelemetry();

  // Factores de suavizado: 
  // - Velocidad: Medio-rápido (0.15) para agujas reactivas
  // - Presiones: Muy suave (0.05) para simular manómetros analógicos
  // - Distancia: Rápido (0.3) para minimizar el retraso en el posicionamiento
  
  const smoothSpeed = useSmoothValue(data.Speed, 0.15);
  const smoothSpeedDisplay = useSmoothValue(data.SpeedDisplay, 0.15);
  const smoothBrakeCylinder = useSmoothValue(data.BrakeCylinderPressure, 0.08);
  const smoothBrakePipe = useSmoothValue(data.BrakePipePressure, 0.08);
  const smoothMainRes = useSmoothValue(data.MainResPressure, 0.05);
  const smoothAmperage = useSmoothValue(data.Amperage, 0.1);
  const smoothSignalDist = useSmoothValue(data.DistToNextSignal, 0.3);
  const smoothNextLimitDist = useSmoothValue(data.DistToNextSpeedLimit, 0.3);
  const smoothGradient = useSmoothValue(data.Gradient, 0.1);
  
  return {
    raw: data,
    smooth: {
      speed: smoothSpeed,
      speedDisplay: smoothSpeedDisplay,
      brakeCylinder: smoothBrakeCylinder,
      brakePipe: smoothBrakePipe,
      mainRes: smoothMainRes,
      amperage: smoothAmperage,
      signalDistance: smoothSignalDist,
      nextLimitDistance: smoothNextLimitDist,
      gradient: smoothGradient
    },
    isConnected,
    activeProfile
  };
}
