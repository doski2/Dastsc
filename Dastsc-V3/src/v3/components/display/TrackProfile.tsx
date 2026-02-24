import React, { useMemo } from 'react';
import { CanvasLayer } from './CanvasLayer';
import { useTelemetrySmoothing } from '../../hooks/useTelemetrySmoothing';

/**
 * TrackProfile renderiza la visualización de la vía curva de alto rendimiento.
 * Usa un mapeo no lineal para simular la perspectiva.
 */
export const TrackProfile: React.FC = () => {
  const { smooth, raw, isConnected } = useTelemetrySmoothing();

  const formatDistance = (m: number) => {
    if (raw.SpeedUnit === 'MPH') {
      const yards = m * 1.09361;
      return yards < 1760 ? `${Math.round(yards)}yd` : `${(m * 0.000621371).toFixed(2)}mi`;
    }
    return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
  };

  // Lógica de dibujo
  const drawTrack = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (!isConnected) return;

    const centerY = height / 2;
    const viewRange = 5000; // 5km de rango visual
    const pixelsPerMeter = width / viewRange;

    ctx.save();
    
    // Gradiente: Desplazamiento máximo de 50px para 5% de gradiente
    const currentGradient = smooth.gradient || 0;
    const gradientOffset = currentGradient * 15; 
    const targetY = centerY - gradientOffset;

    // Configuración de la línea de la vía (Horizontal con Curvatura de Gradiente)
    const renderTrackLine = () => {
      ctx.beginPath();
      // Empezamos un poco desplazados para el degradado de entrada
      ctx.moveTo(0, centerY);

      const segments = 20;
      for (let i = 0; i <= segments; i++) {
        const x = (width / segments) * i;
        const progress = i / segments;
        
        // Efecto de inclinación por gradiente: la línea sube o baja suavemente
        const currentY = centerY - (gradientOffset * progress);
        
        // Micro-vibración por velocidad
        const vIntensity = smooth.speed * 0.1;
        const wiggle = Math.sin(x / 50 + (Date.now() / 800)) * (vIntensity / 2);
        
        if (i === 0) ctx.moveTo(x, currentY + wiggle);
        else ctx.lineTo(x, currentY + wiggle);
      }

      // Estilo: Brillo exterior (Glow)
      ctx.shadowBlur = 15;
      ctx.shadowColor = (currentGradient > 0) ? 'rgba(239, 68, 68, 0.4)' : // Rojo si sube
                        (currentGradient < 0) ? 'rgba(34, 197, 94, 0.4)' : // Verde si baja
                        'rgba(34, 211, 238, 0.4)';
      
      ctx.strokeStyle = (currentGradient > 0) ? 'rgba(239, 68, 68, 0.3)' : 
                        (currentGradient < 0) ? 'rgba(34, 197, 94, 0.3)' : 
                        'rgba(34, 211, 238, 0.3)';
      ctx.lineWidth = 4;
      ctx.stroke();

      // Estilo: Núcleo brillante
      ctx.shadowBlur = 5;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    };

    renderTrackLine();

    // Texto de Gradiente sobre la línea (Más detallado)
    const gradVal = Math.abs(currentGradient);
    const gradColor = currentGradient > 0 ? '#f87171' : currentGradient < 0 ? '#4ade80' : '#94a3b8';
    const gradIcon = currentGradient > 0 ? '▲' : currentGradient < 0 ? '▼' : '─';
    const ratio = gradVal > 0 ? Math.round(100 / gradVal) : 0;
    
    ctx.fillStyle = gradColor;
    ctx.font = 'bold 13px JetBrains Mono';
    const gradText = `${gradIcon} ${gradVal.toFixed(2)}% ${ratio > 0 ? `(1:${ratio})` : ''}`;
    ctx.fillText(gradText, 45, targetY - 25);

    // Dibuja la Escala de Distancia (Regla inferior)
    const drawScale = () => {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.font = '11px JetBrains Mono';
      ctx.lineWidth = 1;
      
      for (let i = 0; i <= viewRange; i += 500) {
        const x = i * pixelsPerMeter;
        ctx.beginPath();
        ctx.moveTo(x, height - 20);
        ctx.lineTo(x, height - 10);
        ctx.stroke();
        
        if (i % 1000 === 0) {
          const text = raw.SpeedUnit === 'MPH' ? `${(i * 0.000621371).toFixed(1)}mi` : `${i/1000}km`;
          ctx.fillText(text, x + 5, height - 15);
        }
      }
    };

    drawScale();

    // Dibuja Andenes (Fase 2.3)
    const stationDist = raw.StationDistance || -1;
    if (stationDist > 0 && stationDist < viewRange) {
      const stationLen = raw.StationLength || 200;
      const xStart = stationDist * pixelsPerMeter;
      const xEnd = (stationDist + stationLen) * pixelsPerMeter;
      const currentYAtStation = centerY - (gradientOffset * (stationDist / viewRange));

      // Rectángulo del andén con degradado
      const platGrad = ctx.createLinearGradient(xStart, 0, xEnd, 0);
      platGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
      platGrad.addColorStop(0.1, 'rgba(255, 255, 255, 0.4)');
      platGrad.addColorStop(0.9, 'rgba(255, 255, 255, 0.4)');
      platGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.fillStyle = platGrad;
      ctx.fillRect(xStart, currentYAtStation + 10, xEnd - xStart, 8);
      
      // Etiquetas de estación
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px JetBrains Mono';
      ctx.fillText(raw.StationName || 'STATION', xStart, currentYAtStation + 35);
      
      // Icono de andén
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.font = 'bold 11px JetBrains Mono';
      ctx.fillText('▊▊▊', xStart, currentYAtStation + 22);
    }

    // Dibuja Señales (Posicionamiento Horizontal)
    const sigDist = smooth.signalDistance;
    const currentYAtSignal = centerY - (gradientOffset * (sigDist / viewRange));

    if (sigDist > 0 && sigDist < viewRange) {
      const xPos = sigDist * pixelsPerMeter;
      const aspectColors: Record<string, string> = {
        "DANGER": "#ef4444",
        "CAUTION": "#fbbf24",
        "ADV_CAUTION": "#f59e0b",
        "CLEAR": "#22c55e",
        "PROCEED": "#3b82f6",
        "FL_CAUTION": "#fbbf24",
        "FL_ADV_CAUTION": "#f59e0b",
      };
      const color = aspectColors[raw.NextSignalAspect] || "#fff";

      // Línea de conexión a la vía
      ctx.setLineDash([2, 4]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath();
      ctx.moveTo(xPos, currentYAtSignal);
      ctx.lineTo(xPos, currentYAtSignal - 60);
      ctx.stroke();
      ctx.setLineDash([]);

      // Semáforo (Cuerpo)
      ctx.fillStyle = "#111";
      ctx.fillRect(xPos - 8, currentYAtSignal - 95, 16, 35);
      
      // Luces del semáforo
      const drawLight = (yOff: number, active: boolean) => {
        ctx.shadowBlur = active ? 15 : 0;
        ctx.shadowColor = color;
        ctx.fillStyle = active ? color : "#222";
        ctx.beginPath();
        ctx.arc(xPos, currentYAtSignal - 95 + yOff, 4, 0, Math.PI * 2);
        ctx.fill();
      };

      drawLight(8, raw.NextSignalAspect === 'DANGER');
      drawLight(17, raw.NextSignalAspect === 'CAUTION' || raw.NextSignalAspect === 'ADV_CAUTION');
      drawLight(26, raw.NextSignalAspect === 'CLEAR' || raw.NextSignalAspect === 'PROCEED');

      // Distancia a la señal (Label)
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '11px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.fillText(formatDistance(sigDist), xPos, currentYAtSignal - 105);
      ctx.textAlign = 'left';
    }

    // Dibuja Límite de Velocidad (Speed Limit Circles)
    const limitDist = smooth.nextLimitDistance;
    const currentYAtLimit = centerY - (gradientOffset * (limitDist / viewRange));
    
    if (limitDist > 0 && limitDist < viewRange) {
      const xPosLimit = limitDist * pixelsPerMeter;
      const limitColor = raw.NextSpeedLimit < raw.SpeedLimit ? "#ef4444" : "#22c55e";
      
      // Línea vertical de conexión
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xPosLimit, currentYAtLimit);
      ctx.lineTo(xPosLimit, currentYAtLimit - 85);
      ctx.stroke();
      ctx.setLineDash([]);

      // Circle
      ctx.strokeStyle = limitColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(xPosLimit, currentYAtLimit - 100, 15, 0, Math.PI * 2);
      ctx.stroke();
      
      // Valor
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.font = "bold 13px JetBrains Mono";
      ctx.fillText(Math.round(raw.NextSpeedLimit).toString(), xPosLimit, currentYAtLimit - 96);

      // Distancia al límite (Label)
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.font = "10px JetBrains Mono";
      ctx.fillText(formatDistance(limitDist), xPosLimit, currentYAtLimit - 75);
      
      ctx.textAlign = "left";
    }

    // Marcador de Posición del Tren (Triángulo naranja del boceto)
    ctx.fillStyle = "#f97316"; // Naranja
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#f97316";
    ctx.beginPath();
    ctx.moveTo(10, centerY + 10);
    ctx.lineTo(25, centerY);
    ctx.lineTo(10, centerY - 10);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  };

  return (
    <div className="relative w-full h-[300px] bg-gradient-to-t from-black/40 to-transparent overflow-hidden">
      <CanvasLayer render={drawTrack} />
      
      {/* Superposición decorativa para sensación de HUD */}
      <div className="absolute inset-0 border-x border-white/5 pointer-events-none" />
      <div className="absolute top-4 left-6 py-1 px-3 bg-cyan-500/10 border border-cyan-500/20 text-[10px] text-cyan-400 font-bold tracking-tighter uppercase rounded">
        {raw.NextSpeedLimit !== undefined 
          ? `Next Limit: ${Math.round(raw.NextSpeedLimit)} ${raw.SpeedUnit} in ${formatDistance(raw.DistToNextSpeedLimit)}`
          : 'Track Focus // Active'}
      </div>
    </div>
  );
};
