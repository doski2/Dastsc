import React, { useMemo } from 'react';
import { CanvasLayer } from './CanvasLayer';
import { useTelemetrySmoothing } from '../../hooks/useTelemetrySmoothing';

/**
 * TrackProfile renderiza la visualización de la vía curva de alto rendimiento.
 * Usa un mapeo no lineal para simular la perspectiva.
 */
export const TrackProfile: React.FC = () => {
  const { smooth, isConnected } = useTelemetrySmoothing();

  // Lógica de dibujo
  const drawTrack = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (!isConnected) return;

    const centerX = width / 2;
    const centerY = height * 0.7; // Punto focal
    const trackWidth = 400;

    ctx.save();
    
    // Dibuja la línea principal de la vía (Vertical con perspectiva)
    const gradient = ctx.createLinearGradient(0, height, 0, 50);
    gradient.addColorStop(0, 'rgba(34, 211, 238, 0.4)'); // Cian
    gradient.addColorStop(0.5, 'rgba(34, 211, 238, 0.1)');
    gradient.addColorStop(1, 'rgba(34, 211, 238, 0)');

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 15]); // Línea discontinua para sensación de movimiento
    
    // Anima el desplazamiento de la línea según la velocidad
    const time = Date.now() / 1000;
    const offset = (time * smooth.speed * 10) % 20;
    ctx.lineDashOffset = -offset;

    ctx.beginPath();
    ctx.moveTo(centerX, height);
    ctx.lineTo(centerX, 50);
    ctx.stroke();

    // Dibuja el marcador del tren (Posición fija)
    ctx.fillStyle = '#fff';
    ctx.shadowBlur = 15;
    ctx.shadowColor = 'rgba(34, 211, 238, 0.8)';
    ctx.beginPath();
    ctx.arc(centerX, height - 100, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  return (
    <div className="relative w-full h-[300px] bg-gradient-to-t from-black/40 to-transparent overflow-hidden">
      <CanvasLayer render={drawTrack} />
      
      {/* Superposición decorativa para sensación de HUD */}
      <div className="absolute inset-0 border-x border-white/5 pointer-events-none" />
      <div className="absolute top-4 left-6 py-1 px-3 bg-cyan-500/10 border border-cyan-500/20 text-[10px] text-cyan-400 font-bold tracking-tighter uppercase rounded">
        Track Focus // Active
      </div>
    </div>
  );
};
