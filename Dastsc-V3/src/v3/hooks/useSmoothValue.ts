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
  const [smoothedValue, setSmoothedValue] = useState(targetValue);
  const currentRef = useRef(targetValue);
  const targetRef = useRef(targetValue);
  const requestRef = useRef<number>(null);

  // Actualiza el objetivo cuando cambia el valor bruto
  useEffect(() => {
    // Si hay un salto brusco (ej: cambio de señal o límite > 200m de golpe)
    // teletransportamos el valor actual para evitar el efecto "zip" (vuelo rápido)
    const delta = Math.abs(targetValue - currentRef.current);
    if (delta > 200) {
      currentRef.current = targetValue;
      setSmoothedValue(targetValue);
    }
    targetRef.current = targetValue;
  }, [targetValue]);

  useEffect(() => {
    let lastTime = performance.now();
    
    const animate = (time: number) => {
      // Calculamos cuánto tiempo ha pasado realmente (Delta Time)
      const dt = (time - lastTime) / (1000 / 60); // Normalizado a 60 FPS
      lastTime = time;

      const diff = targetRef.current - currentRef.current;
      
      if (Math.abs(diff) < 0.0001) {
        currentRef.current = targetRef.current;
      } else {
        // LERP compensado por Delta Time
        // Esto elimina los saltos si el script Lua tarda un poco más en escribir
        const adjustedFactor = 1 - Math.pow(1 - Math.min(factor, 0.99), dt);
        currentRef.current += diff * adjustedFactor;
      }
      
      setSmoothedValue(currentRef.current);
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [factor]);

  return smoothedValue;
}
