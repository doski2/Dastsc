import React, { useRef, useEffect } from 'react';
import { useTelemetrySmoothing } from '../../hooks/useTelemetrySmoothing';
import { CanvasLayer } from './CanvasLayer';

/**
 * BrakingCurve renderiza la parábola de frenado proyectiva.
 * Basado en la estética del boceto 'Switchable IA Graph'.
 */
export const BrakingCurve: React.FC = () => {
  const { smooth, raw, isConnected, activeProfile } = useTelemetrySmoothing();

  const formatDistance = (m: number) => {
    if (raw.SpeedUnit === 'MPH') {
      const yards = m * 1.09361;
      // Estándar UK: Usar yardas hasta 1000yd para precisión de frenado
      return yards < 1000 ? `${Math.round(yards)}yd` : `${(m * 0.000621371).toFixed(2)}mi`;
    }
    return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
  };

  const drawGraph = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (!isConnected) return;

    const padding = 45; // Aumentado para etiquetas de eje
    const topPadding = 60; // Más espacio arriba para el título HTML
    const graphWidth = width - padding * 1.5;
    const graphHeight = height - (padding + topPadding);

    ctx.save();
    ctx.translate(padding, topPadding);

    // 1. Dibujar rejilla (Grid) y Etiquetas de Ejes
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.font = '9px JetBrains Mono';
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';

    for (let i = 0; i <= 4; i++) {
        const ratio = i / 4;
        // Líneas horizontales (Velocidad)
        const y = graphHeight - (graphHeight * ratio);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(graphWidth, y);
        ctx.stroke();
        
        // Etiqueta Velocidad
        if (smooth.speedDisplay > 0) {
            const speedLabel = Math.round(smooth.speedDisplay * ratio);
            ctx.fillText(speedLabel.toString(), -10, y + 3);
        }

        // Líneas verticales (Distancia)
        const x = graphWidth * ratio;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, graphHeight);
        ctx.stroke();

        // Etiqueta Distancia (en la base)
        const targetDist = raw.ProjectedBrakingDistance || 500;
        const distAtX = targetDist * ratio;
        ctx.save();
        ctx.textAlign = 'center';
        let label = '';
        if (raw.SpeedUnit === 'MPH') {
            const yards = distAtX * 1.09361;
            label = yards < 1000 ? `${Math.round(yards)}` : `${(distAtX * 0.000621371).toFixed(1)}`;
        } else {
            label = distAtX < 1000 ? `${Math.round(distAtX)}` : `${(distAtX/1000).toFixed(1)}`;
        }
        ctx.fillText(label, x, graphHeight + 15);
        ctx.restore();
    }

    // Unidades en los ejes
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillText(raw.SpeedUnit || 'KM/H', -10, -5);
    ctx.textAlign = 'right';
    ctx.fillText(raw.SpeedUnit === 'MPH' ? 'yd/mi' : 'm/km', graphWidth, graphHeight + 28);

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
      <div className="absolute top-4 left-4 flex flex-col gap-1 z-10">
        <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] font-mono leading-none">
          Braking Curve // Dynamic
        </span>
        <span className="text-[14px] text-cyan-400 font-mono font-bold drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]">
          Optimal Stop: <span className="text-white">{formatDistance(raw.ProjectedBrakingDistance)}</span>
        </span>
      </div>
      
      <div className="absolute top-4 right-4 flex gap-1.5 z-10">
         <div className="px-2 py-0.5 rounded-xs bg-cyan-500/10 border border-cyan-500/30 text-[9px] text-cyan-400 font-black uppercase tracking-tighter">Live Curve</div>
         <div className="px-2 py-0.5 rounded-xs bg-white/5 border border-white/5 text-[9px] text-white/30 font-black uppercase tracking-tighter">Physics V3</div>
      </div>

      <CanvasLayer render={drawGraph} />
      
      {/* Línea de escaneo decorativa */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/[0.01] to-transparent h-20 w-full animate-scan pointer-events-none" />
      
      <div className="absolute bottom-4 right-6 text-right select-none">
          <span className="text-[10px] font-mono text-white/10 uppercase tracking-widest">Auto-Dispatch Ready</span>
      </div>
    </div>
  );
};
