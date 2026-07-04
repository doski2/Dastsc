import { useState, useEffect, useRef } from 'react';
import { finiteNumber, frameDeltaUnits, tickSmoothValue } from './smoothValueUtils';

/**
 * Suaviza un valor numérico de telemetría con interpolación exponencial a ~60 FPS,
 * independiente de la cadencia del WebSocket.
 */
export function useSmoothValue(targetValue: number, factor: number = 0.1): number {
  const safeTarget = finiteNumber(targetValue);
  const currentRef = useRef(safeTarget);
  const targetRef = useRef(safeTarget);
  const factorRef = useRef(factor);
  const lastRenderedRef = useRef(safeTarget);
  const [value, setValue] = useState(safeTarget);

  useEffect(() => {
    targetRef.current = finiteNumber(targetValue);
  }, [targetValue]);

  useEffect(() => {
    factorRef.current = factor;
  }, [factor]);

  useEffect(() => {
    let lastTime = performance.now();
    let frameId: number;

    const animate = (time: number) => {
      const dt = frameDeltaUnits(time, lastTime);
      lastTime = time;

      const result = tickSmoothValue(
        currentRef.current,
        targetRef.current,
        factorRef.current,
        dt,
        lastRenderedRef.current,
      );

      currentRef.current = result.current;

      if (result.shouldRender) {
        lastRenderedRef.current = result.current;
        setValue(result.current);
      }

      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, []);

  return value;
}

/** Un solo loop rAF para varios canales (p. ej. telemetría agrupada). */
export function useMultiSmoothValue<K extends string>(
  keys: readonly K[],
  targets: Record<K, number>,
  factors: Record<K, number>,
): Record<K, number> {
  const targetsRef = useRef(targets);
  const factorsRef = useRef(factors);
  targetsRef.current = targets;
  factorsRef.current = factors;

  const currentsRef = useRef<Record<K, number>>({ ...targets });
  const lastRenderedRef = useRef<Record<K, number>>({ ...targets });
  const [values, setValues] = useState<Record<K, number>>(() => ({ ...targets }));

  useEffect(() => {
    let lastTime = performance.now();
    let frameId: number;

    const animate = (time: number) => {
      const dt = frameDeltaUnits(time, lastTime);
      lastTime = time;
      let dirty = false;

      for (const key of keys) {
        const result = tickSmoothValue(
          currentsRef.current[key],
          finiteNumber(targetsRef.current[key]),
          factorsRef.current[key],
          dt,
          lastRenderedRef.current[key],
        );
        currentsRef.current[key] = result.current;
        if (result.shouldRender) {
          lastRenderedRef.current[key] = result.current;
          dirty = true;
        }
      }

      if (dirty) {
        setValues({ ...currentsRef.current });
      }

      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [keys]);

  return values;
}
