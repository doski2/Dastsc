import React, { useEffect, useRef } from 'react';

export interface CanvasLayerProps {
  render: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
  className?: string;
  style?: React.CSSProperties;
  zIndex?: number;
}

/**
 * Capa canvas con escalado Retina y bucle rAF.
 * Mantiene render en ref para no reiniciar el loop cuando cambia el callback.
 */
export const CanvasLayer: React.FC<CanvasLayerProps> = ({
  render,
  className = '',
  style,
  zIndex = 0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderRef = useRef(render);

  useEffect(() => {
    renderRef.current = render;
  }, [render]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationId = 0;
    let cachedW = 0;
    let cachedH = 0;

    const applySize = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return;

      cachedW = width;
      cachedH = height;
      const dpr = window.devicePixelRatio || 1;

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      // setTransform evita acumular scale en cada resize
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      applySize(width, height);
    };

    const loop = () => {
      if (cachedW > 0 && cachedH > 0) {
        ctx.clearRect(0, 0, cachedW, cachedH);
        renderRef.current(ctx, cachedW, cachedH);
      }
      animationId = requestAnimationFrame(loop);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    loop();

    return () => {
      observer.disconnect();
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`.trim()}
      style={{ zIndex, ...style }}
    />
  );
};
