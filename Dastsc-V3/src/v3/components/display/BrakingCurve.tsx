import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useTelemetrySmoothing } from '../../hooks/useTelemetrySmoothing';
import { CanvasLayer } from './CanvasLayer';

type CurveMode = 'DYNAMIC' | 'SIGNAL' | 'LIMIT';

interface StationStop {
  name: string;
  is_platform: boolean;
  satisfied: boolean;
  due_time: string | null;
  duration: number;
  distance_m: number;
}

/**
 * BrakingCurve renderiza la parábola de frenado proyectiva.
 */
export const BrakingCurve: React.FC = () => {
  const { smooth, raw, isConnected, activeProfile } = useTelemetrySmoothing();
  const [mode, setMode] = useState<CurveMode>('DYNAMIC');
  const [stops, setStops] = useState<StationStop[]>([]);
  
  // En modo dinámico, si hay un escenario cargado, usamos la primera parada pendiente
  const nextAutoStop = useMemo(() => {
    return stops.find(s => !s.satisfied);
  }, [stops]);

  // anulación manual para modo dinámico (millas)
  const [customMiles, setCustomMiles] = useState<string>('');
  
  // calcular distancia objetivo: Manual > Escenario Automático > Proyectada
  const customTargetDist = React.useMemo(() => {
    if (customMiles) {
      const m = parseFloat(customMiles);
      return !isNaN(m) ? m * 1609.34 : (raw.ProjectedBrakingDistance || 0);
    }
    if (nextAutoStop && mode === 'DYNAMIC') {
      return nextAutoStop.distance_m;
    }
    return raw.ProjectedBrakingDistance || 0;
  }, [customMiles, nextAutoStop, mode, raw.ProjectedBrakingDistance]);

  // Efecto para cargar paradas reales basadas en el tren (RVNumber)
  useEffect(() => {
    if (isConnected && (raw as any).RVNumber) {
      // Usar RVNumber para buscar el servicio del tren en el backend
      const trainId = (raw as any).RVNumber;
      
      // Simulación de llamada al backend para obtener las paradas del servicio de este tren
      // En una implementación real, esto consultaría a: `/api/scenario/stops?rv=${trainId}`
      console.log(`[BrakingCurve] Cargando paradas para tren: ${trainId}`);
      
      setStops([
        { name: "Five Ways Platform 2", is_platform: true, satisfied: false, due_time: "6:51", duration: 35, distance_m: 650 },
        { name: "University (Bham) P2", is_platform: true, satisfied: false, due_time: "6:54", duration: 35, distance_m: 2100 }
      ]);
    }
  }, [isConnected, (raw as any).RVNumber]);

  // distancia restante cuando se establece un valor manual o auto-stop
  const [remainingDist, setRemainingDist] = useState<number>(customTargetDist);
  const lastTimeRef = useRef<number>(Date.now());
  const lastTripRef = useRef<number | null>(null);

  // reiniciar cuando cambie la distancia personalizada o el perfil activo
  useEffect(() => {
    setRemainingDist(customTargetDist);
    lastTimeRef.current = Date.now();
  }, [customTargetDist, activeProfile]);

  // bucle de decremento: descontar según distancia real recorrida (TripDistance) si está disponible
  // Se elimina la restricción de mode === 'DYNAMIC' para que siga descontando en segundo plano
  useEffect(() => {
    let raf: number;
    const tick = () => {
      // Preferimos usar TripDistance (odómetro) para descontar exactamente la distancia
      const trip = (raw as any).TripDistance;

      if (typeof trip === 'number') {
        if (lastTripRef.current == null) lastTripRef.current = trip;
        const delta = trip - (lastTripRef.current || trip);
        lastTripRef.current = trip;
        if (customMiles && remainingDist > 0 && delta > 0) {
          setRemainingDist(d => Math.max(0, d - delta));
        }
      } else {
        // Fallback a velocidad * dt (si no hay TripDistance)
        const now = Date.now();
        const dt = (now - lastTimeRef.current) / 1000;
        lastTimeRef.current = now;
        if (customMiles && remainingDist > 0 && dt > 0) {
          const rawSpeed = raw.Speed || 0;
          const threshold = 0.01;
          if (rawSpeed > threshold) {
            setRemainingDist(d => Math.max(0, d - rawSpeed * dt));
          }
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [customMiles, raw.Speed, raw.TripDistance]);

  const formatDistance = (m: number) => {
    if (raw.SpeedUnit === 'MPH') {
      // Siempre mostrar millas; el juego usa millas en vez de yardas
      const miles = m * 0.000621371;
      return `${miles.toFixed(2)}mi`;
    }
    return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
  };

  const drawGraph = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (!isConnected) return;

    const padding = 45; // padding aumentado para etiquetas de eje
    const topPadding = 60; // más espacio arriba para el título HTML
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
            // convertir metros directamente a millas para todas las marcas
            const miles = distAtX * 0.000621371;
            // siempre usar 2 decimales para precisión en millas
            label = miles.toFixed(2);
        } else {
            // para métrico, usar 1 decimal en km o metros redondeados
            label = distAtX < 1000 ? `${Math.round(distAtX)}` : `${(distAtX/1000).toFixed(2)}`;
        }
        ctx.fillText(label, x, graphHeight + 15);
        ctx.restore();
    }

    // Unidades en los ejes
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillText(raw.SpeedUnit || 'KM/H', -10, -5);
    ctx.textAlign = 'right';
    // unidad del eje x: millas si usa MPH, de lo contrario métrica como antes
    ctx.fillText(raw.SpeedUnit === 'MPH' ? 'mi' : 'm/km', graphWidth, graphHeight + 28);

    // 2. Dibujar Ejes
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(0, graphHeight); ctx.lineTo(graphWidth, graphHeight);
    ctx.stroke();

    // 3. Generar y dibujar la curva de frenado proyectada
    let targetDist = raw.ProjectedBrakingDistance || 500;
    let labelTitle = "BRAKING DISTANCE";
    let targetName = "";

    if (mode === 'DYNAMIC') {
      if (customMiles) {
        targetDist = remainingDist;
        labelTitle = "MANUAL STOP";
      } else if (nextAutoStop) {
        targetDist = nextAutoStop.distance_m;
        labelTitle = "AUTO STATION STOP";
        targetName = nextAutoStop.name;
      }
    }

    let targetSpeedMS = 0; // m/s internos para física
    let targetSpeedDisplay = 0; 
    let curveColor = '#22d3ee';
    let glowColor = 'rgba(34, 211, 238, 0.8)';

    if (mode === 'SIGNAL') {
        targetDist = raw.DistToNextSignal;
        targetSpeedMS = 0;
        targetSpeedDisplay = 0;
        curveColor = '#f87171';
        glowColor = 'rgba(248, 113, 113, 0.8)';
    } else if (mode === 'LIMIT') {
        targetDist = raw.DistToNextSpeedLimit;
        // La telemetría NextSpeedLimit suele venir en la unidad de visualización (MPH/KPH)
        // Convertimos a m/s para el cálculo de física
        const factor = raw.SpeedUnit === 'MPH' ? 0.44704 : 0.27778;
        targetSpeedDisplay = raw.NextSpeedLimit;
        targetSpeedMS = targetSpeedDisplay * factor;
        curveColor = '#fbbf24';
        glowColor = 'rgba(251, 191, 36, 0.8)';
    }

    const currentSpeedMS = raw.Speed;
    
    // Cálculo de Deceleración Requerida (v² = u² + 2as) => a = (v² - u²) / 2s
    let recommendedBrake = 0; // 0 a 100%
    if (currentSpeedMS > targetSpeedMS && targetDist > 5) {
        // Deceleración cinemática necesaria en m/s²
        const requiredAcc = (Math.pow(targetSpeedMS, 2) - Math.pow(currentSpeedMS, 2)) / (2 * targetDist);
        const requiredDecel = Math.abs(requiredAcc);
        
        // --- Cálculo dinámico basado en Masa y Longitud ---
        // 1. Masa (TrainMass en toneladas): A mayor masa, mayor inercia.
        // 2. Longitud (TrainLength en metros): Afecta a la propagación del freno neumático.
        const massFactor = raw.TrainMass > 0 ? (raw.TrainMass / 500) : 1; // 500t como base
        const lengthFactor = raw.TrainLength > 0 ? (1 + (raw.TrainLength / 1000) * 0.1) : 1; 
        
        // 3. Tipo de Tren (Propagación / Lag):
        // Tipo 0 (Freight): +40% de retraso en respuesta (comportamiento neumático lento)
        // Tipo 1 (Passenger): Respuesta estándar
        // Tipo 3 (Light Engine): Respuesta inmediata
        const typeLagMap: Record<number, number> = { 0: 1.4, 1: 1.0, 2: 1.1, 3: 0.8 };
        const trainType = (raw as any).TrainType ?? 1;
        const lagFactor = typeLagMap[trainType] || 1.0;

        // Ajustamos la deceleración máxima de servicio esperada según la carga y el tipo
        let effectiveMaxServiceDecel = activeProfile?.physics_config?.max_braking_decel || 1.0; 
        
        effectiveMaxServiceDecel = effectiveMaxServiceDecel / (massFactor * lengthFactor * lagFactor);

        // --- Influencia del Gradiente (Desnivel) ---
        // La gravedad ayuda o dificulta el frenado: a_gravity = g * sin(theta)
        // En ferrocarriles, el gradiente suele ser pequeño, por lo que sin(theta) ≈ tan(theta) = gradient / 100
        // CORRECCIÓN: En Railworks/Nexus, un gradiente (-) suele ser SUBIDA y (+) BAJADA.
        // Invertimos el signo para que la física sea correcta: Subida ayuda (+ freno), Bajada empuja (- freno).
        const gradient = -(raw.Gradient || 0);
        const gravityAcc = 9.80665 * (gradient / 100); 
        
        // Si el gradiente (corregido) es positivo (subida), nos ayuda a frenar (necesitamos menos muesca)
        // Si el gradiente (corregido) es negativo (bajada), nos empuja (necesitamos más muesca)
        const totalDecelNeeded = requiredDecel - gravityAcc;

        recommendedBrake = Math.min(100, Math.max(0, (totalDecelNeeded / effectiveMaxServiceDecel) * 100));
    }

    if (currentSpeedMS > 0 && targetDist > 0) {
        ctx.beginPath();
        // Mapear velocidad inicial al eje Y (proporcional al máximo mostrado)
        const startY = 0; 
        ctx.moveTo(0, startY);

        const points = 50;
        for (let i = 1; i <= points; i++) {
            const t = i / points;
            const x = t * graphWidth;
            
            // Si el objetivo no es 0 mph/kph, la curva termina más arriba
            const speedRatio = smooth.speedDisplay > 0 ? (targetSpeedDisplay / smooth.speedDisplay) : 0;
            const yBase = (1 - Math.sqrt(1 - t)) * graphHeight;
            const y = yBase * (1 - speedRatio); 
            
            ctx.lineTo(x, y);
        }

        // Estilo de la curva
        ctx.shadowBlur = 10;
        ctx.shadowColor = glowColor;
        ctx.strokeStyle = curveColor;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Relleno degradado bajo la curva
        const gradient = ctx.createLinearGradient(0, 0, 0, graphHeight);
        gradient.addColorStop(0, curveColor + '1A'); // 10% opacidad
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.lineTo(graphWidth, graphHeight);
        ctx.lineTo(0, graphHeight);
        ctx.fill();

        // 3.1 Indicador de Freno Recomendado (HUD interno del gráfico)
        if (recommendedBrake > 1) {
            ctx.save();
            ctx.translate(graphWidth - 80, 20);
            
            // Detectar muesca si el perfil las tiene
            let recommendedNotch = "";
            const notches = activeProfile?.specs?.notches_throttle_brake;
            if (notches) {
                // El freno en notches combinados suele ser valores negativos
                // Buscamos la muesca más cercana al porcentaje negativo requerido
                const targetVal = -(recommendedBrake / 100);
                // Filtrar solo las que son de freno (valor <= 0)
                const brakeNotches = notches.filter((n: any) => n.value <= 0).sort((a: any, b: any) => b.value - a.value); // De 0 a -1
                
                for (const notch of brakeNotches) {
                    if (targetVal >= notch.value) {
                        recommendedNotch = notch.label;
                        break;
                    }
                }
                // Si es muy alto y no encontró, poner la última (EMG/Bmax)
                if (!recommendedNotch && brakeNotches.length > 0) {
                    recommendedNotch = brakeNotches[brakeNotches.length - 1].label;
                }
            }

            // Etiqueta
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.font = '8px JetBrains Mono';
            ctx.textAlign = 'right';
            ctx.fillText(recommendedNotch ? `REC. NOTCH: ${recommendedNotch}` : 'REC. BRAKE', 75, 0);

            // Barra de fondo
            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.fillRect(0, 5, 75, 4);

            // Barra activa
            ctx.fillStyle = curveColor;
            ctx.shadowBlur = 5;
            ctx.shadowColor = curveColor;
            ctx.fillRect(0, 5, (recommendedBrake / 100) * 75, 4);
            
            // Valor %
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px JetBrains Mono';
            ctx.fillText(`${Math.round(recommendedBrake)}%`, 75, 22);
            
            ctx.restore();
        }
    }

    // 4. Marcador de distancia óptima (Punto final)
    ctx.fillStyle = curveColor;
    ctx.beginPath();
    // Ajustar posición Y del punto según la velocidad objetivo
    const endY = smooth.speedDisplay > 0 ? graphHeight * (1 - (targetSpeedDisplay / smooth.speedDisplay)) : graphHeight;
    ctx.arc(graphWidth, endY, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  const getTargetInfo = () => {
    switch(mode) {
        case 'SIGNAL': return { label: 'Next Signal', dist: raw.DistToNextSignal, val: raw.NextSignalAspect };
        case 'LIMIT': return { label: 'Next Limit', dist: raw.DistToNextSpeedLimit, val: `${raw.NextSpeedLimit} ${raw.SpeedUnit}` };
        default: {
            if (customMiles) {
              return { label: 'Manual Stop', dist: remainingDist, val: `${customMiles} mi` };
            }
            if (nextAutoStop) {
              return { label: `Station: ${nextAutoStop.name}`, dist: nextAutoStop.distance_m, val: nextAutoStop.is_platform ? 'PLATFORM' : 'WPT' };
            }
            return { label: 'Optimal Stop', dist: raw.ProjectedBrakingDistance, val: 'Dynamic' };
        }
    }
  };

  const info = getTargetInfo();

  return (
    <div className="relative flex-1 bg-white/[0.02] border border-white/5 rounded-sm overflow-hidden flex flex-col min-h-[300px]">
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-10 pointer-events-none">
        <div className="flex flex-col gap-1 pointer-events-auto max-w-[60%]">
          <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] font-mono leading-none">
            Braking Curve // {mode}
          </span>
          <span className={`text-[14px] font-mono font-bold drop-shadow-[0_0_8px_rgba(34,211,238,0.4)] truncate ${
            mode === 'DYNAMIC' ? 'text-cyan-400' : mode === 'SIGNAL' ? 'text-red-400' : 'text-amber-400'
          }`}>
            {info.label}: <span className="text-white">{formatDistance(info.dist)}</span>
            <span className="ml-2 text-[10px] opacity-40">[{info.val}]</span>
          </span>
          {mode === 'DYNAMIC' && (
            <div className="absolute top-14 left-0 mt-2 flex items-center gap-1">
              <div className="bg-black/80 border border-white/10 rounded-sm p-1 flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={customMiles}
                  onChange={e => setCustomMiles(e.target.value)}
                  className="w-16 text-center text-[10px] font-mono rounded bg-white/5 border border-white/10 px-1 py-0.5 text-white outline-none placeholder:text-white/10"
                />
                <div className="flex flex-col pr-1">
                  <span className="text-[7px] text-white/50 font-bold uppercase leading-none">Manual Dist</span>
                  <span className="text-[9px] text-white/30 font-mono leading-none">MI</span>
                </div>
                {customMiles && (
                  <button 
                    onClick={() => setCustomMiles("")}
                    className="ml-1 px-1 text-white/20 hover:text-white transition-colors text-[10px]"
                    title="Clear"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        
        <div className="flex gap-1.5 pointer-events-auto flex-wrap justify-end">
           <button onClick={() => setMode('DYNAMIC')} className={`px-2 py-1 rounded-xs border text-[9px] font-black uppercase tracking-tighter transition-all ${mode === 'DYNAMIC' ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400' : 'bg-white/5 border-white/5 text-white/30 hover:bg-white/10'}`}>Dynamic</button>
           <button onClick={() => setMode('SIGNAL')} className={`px-2 py-1 rounded-xs border text-[9px] font-black uppercase tracking-tighter transition-all ${mode === 'SIGNAL' ? 'bg-red-500/20 border-red-500/50 text-red-400' : 'bg-white/5 border-white/5 text-white/30 hover:bg-white/10'}`}>Signal</button>
           <button onClick={() => setMode('LIMIT')} className={`px-2 py-1 rounded-xs border text-[9px] font-black uppercase tracking-tighter transition-all ${mode === 'LIMIT' ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' : 'bg-white/5 border-white/5 text-white/30 hover:bg-white/10'}`}>Limit</button>
        </div>
      </div>

      <CanvasLayer render={drawGraph} />
      
      {/* Línea de escaneo decorativa */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/[0.01] to-transparent h-20 w-full animate-scan pointer-events-none" />
      
      <div className="absolute bottom-1.5 left-4 right-4 flex justify-between items-end pointer-events-none z-10">
        <div className="flex flex-col items-start select-none">
          <span className="text-[9px] font-mono text-white/10 uppercase tracking-widest">Auto-Dispatch Ready</span>
        </div>
        
        <div className="text-right select-none flex flex-col items-end">
          {raw.TrainMass > 0 && (
            <div className="bg-black/40 backdrop-blur-md p-1 rounded border border-white/5 flex gap-3 text-[8px] font-mono text-white/40 uppercase shadow-lg">
              <span>M: <strong className="text-white/60">{Math.round(raw.TrainMass)}t</strong></span>
              <span>L: <strong className="text-white/60">{Math.round(raw.TrainLength)}m</strong></span>
              <span>G: <strong className={raw.Gradient > 0 ? 'text-red-400/60' : raw.Gradient < 0 ? 'text-green-400/60' : 'text-white/60'}>{(raw.Gradient || 0).toFixed(1)}%</strong></span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
