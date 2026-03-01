import React, { useMemo, useState, useEffect } from 'react';
import { CanvasLayer } from './CanvasLayer';
import { useTelemetrySmoothing } from '../../hooks/useTelemetrySmoothing';

interface StationStop {
  name: string;
  is_platform: boolean;
  satisfied: boolean;
  due_time: string | null;
  duration: number;
  distance_m: number; // Distancia calculada por el backend o frontend
}

/**
 * TrackProfile renderiza la visualización de la vía curva de alto rendimiento.
 */
export const TrackProfile: React.FC = () => {
  const { smooth, raw, isConnected } = useTelemetrySmoothing();
  const [stops, setStops] = useState<StationStop[]>([]);

  // Efecto para cargar las paradas del escenario actual (Simulado hasta integración total)
  useEffect(() => {
    const fetchStops = async () => {
      try {
        // En una implementación real, aquí llamaríamos a /scenarios/stops del backend
        // Por ahora usamos datos mockeables basados en la investigación previa
        const mockStops: StationStop[] = [
          { name: "Five Ways Platform 2", is_platform: true, satisfied: false, due_time: "651", duration: 35, distance_m: 650 },
          { name: "University (Bham) P2", is_platform: true, satisfied: false, due_time: "878", duration: 35, distance_m: 2100 },
          { name: "Selly Oak Platform 2", is_platform: true, satisfied: false, due_time: "994", duration: 35, distance_m: 4500 },
          { name: "Bournville Platform 2", is_platform: true, satisfied: false, due_time: "1132", duration: 35, distance_m: 7200 }
        ];
        setStops(mockStops);
      } catch (e) {
        console.error("Error fetching stops:", e);
      }
    };

    if (isConnected) fetchStops();
  }, [isConnected]);

  const formatDistance = (m: number) => {
    if (m === undefined || m < 0) return '---';
    if (raw.SpeedUnit === 'MPH') {
      const yards = m * 1.09361;
      // Para trenes ingleses (UK): Usar yardas hasta 1000 yd, luego millas
      if (yards < 1000) return `${Math.round(yards)}yd`;
      return `${(m * 0.000621371).toFixed(2)}mi`;
    }
    return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
  };

  // Lógica de dibujo
  const drawTrack = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (!isConnected) return;

    const centerY = height / 2;
    const viewRange = 8000; // 8km de alcance (Pro-HUD)
    
    // Escala NO LINEAL (User Memory: 0-3km = 50% width, 3-8km = 50% width)
    const getX = (m: number) => {
      const startX = 25; // La punta de la locomotora (triángulo naranja) está en x=25
      const availableWidth = width - (startX + 20); // Margen derecho
      
      let relativeX = 0;
      if (m <= 3000) {
        relativeX = (m / 3000) * (availableWidth * 0.5);
      } else {
        const extra = Math.min(5000, m - 3000);
        relativeX = (availableWidth * 0.5) + (extra / 5000) * (availableWidth * 0.5);
      }
      return startX + relativeX;
    };

    ctx.save();
    
    // Gradiente: Desplazamiento máximo de 50px para 5% de gradiente
    // Gradiente y Curvatura
    // CORRECCIÓN Nexus/Railworks: Invertimos el signo para que (-) sea subida y (+) sea bajada visualmente
    const rawGradient = smooth.gradient || 0;
    const currentGradient = -rawGradient;
    const currentLateralG = smooth.lateralG || 0;
    
    const gradientOffset = currentGradient * 15; 
    const curvatureIntensity = currentLateralG * 100; // Multiplicador para el offset visual de la curva

    // Helper para obtener Y con gradiente y curvatura
    const getY = (m: number) => {
      const progress = m / viewRange;
      const currentY = centerY - (gradientOffset * progress);
      const curveOffset = Math.pow(progress, 1.5) * curvatureIntensity;
      return currentY + curveOffset;
    };

    // Configuración de la línea de la vía (Horizontal con Curvatura y Gradiente)
    const renderTrackLine = () => {
      ctx.beginPath();
      
      const segments = 40;
      for (let i = 0; i <= segments; i++) {
        const progress = i / segments;
        const m = progress * viewRange;
        const x = getX(m);
        const y = getY(m);
        
        // Micro-vibración por velocidad
        const vIntensity = smooth.speed * 0.1;
        const wiggle = Math.sin(x / 50 + (Date.now() / 800)) * (vIntensity / 2);
        
        if (i === 0) ctx.moveTo(x, y + wiggle);
        else ctx.lineTo(x, y + wiggle);
      }

      // Estilo: Brillo exterior (Glow)
      ctx.shadowBlur = 15;
      ctx.shadowColor = (currentGradient > 0) ? 'rgba(239, 68, 68, 0.4)' : // Rojo si sube
                        (currentGradient < 0) ? 'rgba(34, 197, 94, 0.4)' : // Verde si baja
                        'rgba(34, 211, 238, 0.4)';
      ctx.stroke();
    };

    // Dibujar estaciones y paradas
    const renderStations = () => {
      ctx.save();
      stops.forEach(stop => {
        if (stop.satisfied || stop.distance_m > viewRange) return;

        const x = getX(stop.distance_m);
        const y = getY(stop.distance_m);

        // Línea vertical marcadora
        ctx.beginPath();
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = stop.is_platform ? '#f472b6' : '#94a3b8'; // Rosa para andén, gris para waypoint
        ctx.lineWidth = 1;
        ctx.moveTo(x, y - 60);
        ctx.lineTo(x, y + 20);
        ctx.stroke();
        ctx.setLineDash([]);

        // Icono y Nombre
        ctx.fillStyle = stop.is_platform ? '#f472b6' : '#94a3b8';
        ctx.font = 'bold 12px JetBrains Mono';
        ctx.textAlign = 'center';
        
        // Rectángulo de fondo para legibilidad
        const labelText = stop.name.toUpperCase();
        const textWidth = ctx.measureText(labelText).width;
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = '#000';
        ctx.fillRect(x - (textWidth/2 + 5), y - 75, textWidth + 10, 18);
        ctx.globalAlpha = 1.0;
        
        ctx.fillStyle = stop.is_platform ? '#f472b6' : '#cbd5e1';
        ctx.fillText(labelText, x, y - 62);

        // Rectángulo marcador en la vía (Sustituye al rombo)
        const rectWidth = 12;
        const rectHeight = 6;
        ctx.beginPath();
        ctx.fillRect(x - rectWidth / 2, y - rectHeight / 2, rectWidth, rectHeight);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - rectWidth / 2, y - rectHeight / 2, rectWidth, rectHeight);
      });
      ctx.restore();
    };

    renderTrackLine();
    renderStations();

    // Texto de Gradiente sobre la línea (Más detallado)
    const gradVal = Math.abs(currentGradient);
    // Usamos rawGradient para la lógica de colores/iconos de modo que (-) sea SUBIDA y (+) sea BAJADA
    const gradColor = rawGradient < 0 ? '#f87171' : rawGradient > 0 ? '#4ade80' : '#94a3b8';
    const gradIcon = rawGradient < 0 ? '▲' : rawGradient > 0 ? '▼' : '─';
    const ratio = gradVal > 0 ? Math.round(100 / gradVal) : 0;
    
    ctx.fillStyle = gradColor;
    ctx.font = 'bold 13px JetBrains Mono';
    const gradText = `${gradIcon} ${gradVal.toFixed(2)}% ${ratio > 0 ? `(1:${ratio})` : ''}`;
    ctx.fillText(gradText, 45, centerY - 25);

    // Dibuja la Escala de Distancia (Regla inferior)
    const drawScale = () => {
      ctx.save();
      ctx.shadowBlur = 0; 
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = '#22d3ee'; // Cian neón tenue
      ctx.fillStyle = '#ffffff'; // Blanco sólido
      ctx.globalAlpha = 1.0;
      ctx.font = 'bold 11px JetBrains Mono, monospace, sans-serif'; 
      ctx.textAlign = 'center';
      
      const isImperial = raw.SpeedUnit === 'MPH';
      
      // Marcadores basados en el sistema (Métricas o Imperiales/UK)
      const scaleMarkers = isImperial 
        ? [0, 91.44, 182.88, 365.76, 731.52, 1609.34, 3218.68, 4828.03, 6437.38, 8046.72] // 0, 100yd, 200yd, 400yd, 800yd, 1mi, 2mi...
        : [0, 100, 500, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 7000, 8000];      // Metros

      for (const m of scaleMarkers) {
        const x = getX(m);
        const yBase = centerY + 15; 
        
        // Marca vertical
        ctx.beginPath();
        ctx.moveTo(x, yBase);
        ctx.lineTo(x, yBase + 10);
        ctx.stroke();
        
        // Texto de distancia (Optimizado para UK/Imperial)
        let label = '';
        if (isImperial) {
          const yards = Math.round(m * 1.09361);
          if (yards === 0) label = '0';
          else if (yards < 1760) label = `${yards}yd`;
          else label = `${Math.round(yards / 1760)}mi`;
        } else {
          if (m === 0) label = '0';
          else if (m < 1000) label = `${m}m`;
          else label = `${m/1000}km`;
        }
          
        ctx.fillText(label, x, yBase + 22);
      }
      ctx.restore();
    };

    drawScale();

    // Dibuja Puntos de Parada (Estaciones de Horario)
    // Usamos >= 0 para que no desaparezca justo al llegar (distancia 0)
    const stationDist = smooth.stationDistance;
    if (stationDist !== undefined && stationDist >= 0 && stationDist < viewRange) {
      const xStop = getX(stationDist);
      const yStop = getY(stationDist);

      // 1. Línea indicadora de parada (Muesca vertical)
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xStop, yStop - 20);
      ctx.lineTo(xStop, yStop + 20);
      ctx.stroke();
      ctx.setLineDash([]); // Reset dash

      // 2. Icono de parada (Bandera / Diamond)
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(xStop, yStop);
      ctx.lineTo(xStop - 6, yStop - 6);
      ctx.lineTo(xStop, yStop - 12);
      ctx.lineTo(xStop + 6, yStop - 6);
      ctx.closePath();
      ctx.fill();

      // 3. Etiqueta de la Parada
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.fillText(raw.StationName || 'NEXT STOP', xStop, yStop - 35);
      
      // 4. Distancia debajo
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = 'bold 11px JetBrains Mono';
      ctx.fillText(formatDistance(stationDist), xStop, yStop + 35);
      
      ctx.textAlign = 'left';
    }

    // Dibuja Andenes (Fase 2.3 - Estático por perfil o mapa)
    if (stationDist !== undefined && stationDist >= 0 && stationDist < viewRange) {
      const stationLen = raw.StationLength || 200;
      const xStart = getX(stationDist);
      const xEnd = getX(stationDist + stationLen);
      const yStation = getY(stationDist);

      const platGrad = ctx.createLinearGradient(xStart, 0, xEnd, 0);
      platGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
      platGrad.addColorStop(0.1, 'rgba(255, 255, 255, 0.2)');
      platGrad.addColorStop(0.9, 'rgba(255, 255, 255, 0.2)');
      platGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.fillStyle = platGrad;
      ctx.fillRect(xStart, yStation + 5, Math.max(1, xEnd - xStart), 4);
    }

    // Dibuja Señales (Posicionamiento Horizontal)
    const sigDist = smooth.signalDistance;
    const ySignal = getY(sigDist);

    if (sigDist > 0 && sigDist < viewRange) {
      const xPos = getX(sigDist);
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
      ctx.moveTo(xPos, ySignal);
      ctx.lineTo(xPos, ySignal - 60);
      ctx.stroke();
      ctx.setLineDash([]);

      // Semáforo (Cuerpo)
      ctx.fillStyle = "#111";
      ctx.fillRect(xPos - 8, ySignal - 95, 16, 35);
      
      // Luces del semáforo
      const drawLight = (yOff: number, active: boolean) => {
        ctx.shadowBlur = active ? 15 : 0;
        ctx.shadowColor = color;
        ctx.fillStyle = active ? color : "#222";
        ctx.beginPath();
        ctx.arc(xPos, ySignal - 95 + yOff, 4, 0, Math.PI * 2);
        ctx.fill();
      };

      drawLight(8, raw.NextSignalAspect === 'DANGER');
      drawLight(17, raw.NextSignalAspect === 'CAUTION' || raw.NextSignalAspect === 'ADV_CAUTION');
      drawLight(26, raw.NextSignalAspect === 'CLEAR' || raw.NextSignalAspect === 'PROCEED');

      // Distancia a la señal (Label) - Más visible con borde/sombra
      ctx.shadowBlur = 4;
      ctx.shadowColor = 'black';
      ctx.fillStyle = color; // Usar el mismo color del aspecto para el texto de distancia
      ctx.font = 'bold 12px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.fillText(formatDistance(sigDist), xPos, ySignal - 105);
      
      // Dibujar etiqueta de "SIG" pequeña debajo de la distancia
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.font = '8px JetBrains Mono';
      ctx.fillText('SIGNAL', xPos, ySignal - 117);
      
      ctx.textAlign = 'left';
      ctx.shadowBlur = 0;
    }

    // Dibuja Límites de Velocidad (Renderiza lo que el normalizador ya ha filtrado)
    const renderSpeedLimits = () => {
      const limits = raw.UpcomingLimits || [];
      if (limits.length === 0) return;

      // 1. Ya vienen ordenados y filtrados del normalizador (DataNormalizer.ts)
      // Usamos el mismo umbral de 2.0m que el normalizador para sincronía perfecta
      const displayLimits = limits.filter((l: any) => l.distance > 2.0).slice(0, 3);

      displayLimits.forEach((limit: any, index: number) => {
        const dist = limit.distance;
        if (dist < viewRange) {
          const xPosLimit = getX(dist);
          const limitValue = limit.speed;
          
          // Escala Progresiva de UI
          const distanceScale = Math.max(0.35, 1 - (dist / viewRange));
          const circleRadius = 15 * distanceScale;
          const fontSize = Math.max(9, 13 * distanceScale);
          
          // Color basado en el cambio real
          const prevLimitValue = index === 0 ? raw.FrontalSpeedLimit : displayLimits[index-1].speed;
          
          let limitColor = "#ffffff";
          if (limitValue < prevLimitValue - 0.5) limitColor = "#ef4444"; // Reducción
          else if (limitValue > prevLimitValue + 0.5) limitColor = "#22c55e"; // Aumento
          
          const yPosLimit = getY(dist);

          // Línea vertical indicadora (Glow sutil)
          ctx.setLineDash([2, 4]);
          ctx.strokeStyle = `rgba(255, 255, 255, ${0.15 * distanceScale})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(xPosLimit, yPosLimit);
          ctx.lineTo(xPosLimit, yPosLimit - (60 * distanceScale));
          ctx.stroke();
          ctx.setLineDash([]);

          // Círculo del cartel (Con sombra para legibilidad)
          ctx.shadowBlur = index === 0 ? 15 : 5;
          ctx.shadowColor = limitColor;
          
          ctx.beginPath();
          ctx.arc(xPosLimit, yPosLimit - (75 * distanceScale), circleRadius, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
          ctx.fill();
          ctx.strokeStyle = limitColor;
          ctx.lineWidth = index === 0 ? 3 : 2; 
          ctx.stroke();
          ctx.shadowBlur = 0;
          
          // Valor de velocidad (Número)
          ctx.fillStyle = "#fff";
          ctx.textAlign = "center";
          ctx.font = `bold ${fontSize}px JetBrains Mono`;
          ctx.fillText(Math.round(limitValue).toString(), xPosLimit, yPosLimit - (71 * distanceScale));

          // Etiqueta de Distancia (Label informativo)
          ctx.fillStyle = `rgba(255, 255, 255, ${0.4 * distanceScale})`;
          ctx.font = `bold ${Math.max(8, 10 * distanceScale)}px JetBrains Mono`;
          ctx.fillText(formatDistance(dist), xPosLimit, yPosLimit - (50 * distanceScale));
        }
      });
    };

    renderSpeedLimits();

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
      <div className="absolute top-4 left-6 py-1 px-3 bg-cyan-500/10 border border-cyan-500/20 text-[10px] text-cyan-400 font-bold tracking-tighter uppercase rounded flex items-center gap-3">
        {raw.StationName && raw.StationName !== 'NONE' ? (
          <span className="animate-pulse">STATION: {raw.StationName} // {formatDistance(raw.StationDistance)}</span>
        ) : (
          <>
            {raw.DistToNextSignal > 0 && raw.DistToNextSignal < 3000 && (
              <span className={raw.NextSignalAspect === 'DANGER' ? 'text-red-400' : 'text-cyan-400'}>
                SIG: {raw.NextSignalAspect} // {formatDistance(raw.DistToNextSignal)}
              </span>
            )}
            {raw.DistToNextSignal > 0 && raw.DistToNextSignal < 3000 && raw.NextSpeedLimit !== undefined && <span className="text-white/20">|</span>}
            {raw.NextSpeedLimit !== undefined && (
              <span>LIMIT: {Math.round(raw.NextSpeedLimit)} {raw.SpeedUnit} // {formatDistance(raw.DistToNextSpeedLimit)}</span>
            )}
            {!raw.StationName && !raw.NextSpeedLimit && (raw.DistToNextSignal <= 0 || raw.DistToNextSignal >= 3000) && <span>TRACK FOCUS // ACTIVE</span>}
          </>
        )}
      </div>
    </div>
  );
};
