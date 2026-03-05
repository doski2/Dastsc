import { useState, useEffect, useRef } from 'react';

/**
 * Hook para suavizar valores de telemetría usando interpolación lineal (LERP).
 * Garantiza un movimiento fluido de más de 60 FPS incluso si la telemetría se actualiza a una frecuencia menor.
 * 
 * @param targetValue El valor bruto de la telemetría (p. ej., velocidad, presión)
 * @param factor Factor de suavizado (0.01 a 1.0). Menor es más suave/lento.
 * @returns El valor suavizado
 */
export function useSmoothValue(targetValue: number, factor: number = 0.1): number {
  const currentRef = useRef(targetValue);
  const targetRef = useRef(targetValue);
  const [value, setValue] = useState(targetValue);

  // Actualizar el objetivo cuando cambia el valor real (desde el WebSocket/Context)
  useEffect(() => {
    targetRef.current = targetValue;
  }, [targetValue]);

  useEffect(() => {
    let lastTime = performance.now();
    let frameId: number;
    
    const animate = (time: number) => {
      const dt = Math.min(2.0, (time - lastTime) / (1000 / 60)); 
      lastTime = time;

      const diff = targetRef.current - currentRef.current;
      
      if (Math.abs(diff) < 0.0001) {
        if (currentRef.current !== targetRef.current) {
          currentRef.current = targetRef.current;
          setValue(currentRef.current);
        }
      } else {
        const adjustedFactor = 1 - Math.pow(1 - Math.min(factor, 0.99), dt);
        currentRef.current += diff * adjustedFactor;
        
        // OPTIMIZACIÓN: Solo disparamos el re-render de React si el cambio es perceptible
        // Esto evita miles de actualizaciones inútiles cuando la diferencia es despreciable.
        if (Math.abs(currentRef.current - value) > 0.0005) {
          setValue(currentRef.current);
        }
      }
      
      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [factor]);

  return currentRef.current;
}

