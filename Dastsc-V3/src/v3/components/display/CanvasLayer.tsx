import React, { useEffect, useRef } from 'react';

interface CanvasLayerProps {
  render: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
  className?: string;
  zIndex?: number;
}

/**
 * Una capa de Canvas reutilizable con soporte de escalado automático para alta densidad de píxeles (Retina).
 * Garantiza el renderizado más nítido posible para los elementos del HUD.
 */
export const CanvasLayer: React.FC<CanvasLayerProps> = ({ render, className = "", zIndex = 0 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationId: number;

    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    };

    const loop = () => {
      const { width, height } = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, width, height);
      render(ctx, width, height);
      animationId = requestAnimationFrame(loop);
    };

    window.addEventListener('resize', resize);
    resize();
    loop();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, [render]);

  // Usa un mapeo de clases para evitar estilos en línea y satisfacer a los linters estrictos
  const zIndexClass = zIndex !== undefined ? `z-[${zIndex}]` : '';

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full pointer-events-none ${zIndexClass} ${className}`}
    />
  );
};
