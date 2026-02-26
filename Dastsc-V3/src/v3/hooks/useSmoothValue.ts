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

  const animate = () => {
    // LERP básico: actual = actual + (objetivo - actual) * factor
    const diff = targetRef.current - currentRef.current;
    
    // Umbral para detener la animación cuando está muy cerca
    if (Math.abs(diff) < 0.001) {
      currentRef.current = targetRef.current;
    } else {
      currentRef.current += diff * factor;
      setSmoothedValue(currentRef.current);
    }
    
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [factor]);

  return smoothedValue;
}
