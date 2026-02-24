import React, { useRef, useEffect } from 'react';
import { useTelemetrySmoothing } from '../../hooks/useTelemetrySmoothing';
import { CanvasLayer } from './CanvasLayer';

/**
 * BrakingCurve renderiza la parábola de frenado proyectiva.
 * Basado en la estética del boceto 'Switchable IA Graph'.
 */
export const BrakingCurve: React.FC = () => {
  const { smooth, raw, isConnected } = useTelemetrySmoothing();

  const drawGraph = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (!isConnected) return;

    const padding = 40;
    const graphWidth = width - padding * 2;
    const graphHeight = height - padding * 2;

    ctx.save();
    ctx.translate(padding, padding);

    // 1. Dibujar rejilla (Grid)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        // Líneas horizontales
        const y = (graphHeight / 4) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(graphWidth, y);
        ctx.stroke();

        // Líneas verticales
        const x = (graphWidth / 4) * i;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, graphHeight);
        ctx.stroke();
    }

    // 2. Dibujar Ejes
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(0, graphHeight); ctx.lineTo(graphWidth, graphHeight);
    ctx.stroke();

    // 3. Generar y dibujar la curva de frenado proyectada
    // Simulamos una curva parabólica basada en la velocidad actual y la distancia proyectada
    const currentSpeed = smooth.speed;
    const targetDist = raw.ProjectedBrakingDistance || 500; // Por defecto 500m si no hay dato

    if (currentSpeed > 0) {
        ctx.beginPath();
        ctx.moveTo(0, 0); // Empieza arriba a la izquierda (Velocidad actual)

        const points = 50;
        for (let i = 1; i <= points; i++) {
            const t = i / points;
            const x = t * graphWidth;
            // Curva cuadrática invertida para simular deceleración constante
            const y = (1 - Math.sqrt(1 - t)) * graphHeight; 
            ctx.lineTo(x, y);
        }

        // Estilo de la curva (Cian con Glow)
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(34, 211, 238, 0.8)';
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Relleno degradado bajo la curva
        const gradient = ctx.createLinearGradient(0, 0, 0, graphHeight);
        gradient.addColorStop(0, 'rgba(34, 211, 238, 0.1)');
        gradient.addColorStop(1, 'rgba(34, 211, 238, 0)');
        ctx.fillStyle = gradient;
        ctx.lineTo(graphWidth, graphHeight);
        ctx.lineTo(0, graphHeight);
        ctx.fill();
    }

    // 4. Marcador de distancia óptima (Punto final)
    ctx.fillStyle = '#22d3ee';
    ctx.beginPath();
    ctx.arc(graphWidth, graphHeight, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  return (
    <div className="relative flex-1 bg-white/[0.02] border border-white/5 rounded-sm overflow-hidden flex flex-col">
      <div className="absolute top-4 left-4 flex flex-col gap-0.5 z-10">
        <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest font-mono">Braking Curve // Dynamic</span>
        <span className="text-[9px] text-cyan-500/60 font-mono">Optimal Stop: {raw.ProjectedBrakingDistance.toFixed(0)}m</span>
      </div>
      
      <div className="absolute top-4 right-4 flex gap-2 z-10">
         <div className="px-1.5 py-0.5 rounded-xs bg-cyan-500/10 border border-cyan-500/20 text-[8px] text-cyan-400 font-bold uppercase">Curve</div>
         <div className="px-1.5 py-0.5 rounded-xs bg-white/5 text-[8px] text-white/20 font-bold uppercase">Efficiency</div>
      </div>

      <CanvasLayer render={drawGraph} />
      
      {/* Línea de escaneo decorativa */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/[0.01] to-transparent h-20 w-full animate-scan pointer-events-none" />
      
      <div className="absolute bottom-4 right-6 text-right select-none">
          <span className="text-[8px] font-mono text-white/10 uppercase tracking-widest">Auto-Dispatch Ready</span>
      </div>
    </div>
  );
};
