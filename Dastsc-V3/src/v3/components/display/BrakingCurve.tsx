import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useTelemetrySmoothing } from '../../hooks/useTelemetrySmoothing';
import { CanvasLayer } from './CanvasLayer';
import { scenarioService, ScenarioStop } from '../../services/ScenarioService';

type CurveMode = 'DYNAMIC' | 'SIGNAL' | 'LIMIT';

/**
 * BrakingCurve renderiza la parábola de frenado proyectiva.
 */
export const BrakingCurve: React.FC = () => {
  const { smooth, raw, isConnected, activeProfile } = useTelemetrySmoothing();
  const [mode, setMode] = useState<CurveMode>('DYNAMIC');
  const [stops, setStops] = useState<ScenarioStop[]>([]);
  
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
    return raw.ProjectedBrakingDistance || 0;
  }, [customMiles, raw.ProjectedBrakingDistance]);

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
  useEffect(() => {
    let raf: number;
    const tick = () => {
      const trip = raw.TripDistance;

      if (typeof trip === 'number') {
        if (lastTripRef.current === null) {
          lastTripRef.current = trip;
        }
        const delta = trip - lastTripRef.current;
        lastTripRef.current = trip;
        
        if (delta > 0 && remainingDist > 0) {
          setRemainingDist(d => Math.max(0, d - delta));
        }
      } else {
        const now = Date.now();
        const dt = (now - lastTimeRef.current) / 1000;
        lastTimeRef.current = now;
        if (remainingDist > 0 && dt > 0) {
          const rawSpeed = raw.Speed || 0;
          if (rawSpeed > 0.01) {
            setRemainingDist(d => Math.max(0, d - rawSpeed * dt));
          }
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [raw.Speed, raw.TripDistance]);

  const formatDistance = (m: number) => {
    if (raw.SpeedUnit === 'MPH') {
      // Siempre mostrar millas; el juego usa millas en vez de yardas
      const miles = m * 0.000621371;
      return `${miles.toFixed(2)}mi`;
    }
    return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
  };

  const drawGraph = React.useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
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
        let targetDistForLabels = raw.ProjectedBrakingDistance || 500;
        if (mode === 'DYNAMIC') {
          targetDistForLabels = customMiles ? remainingDist : (nextAutoStop?.distance_m || targetDistForLabels);
        } else if (mode === 'SIGNAL') {
          targetDistForLabels = raw.DistToNextSignal;
        } else if (mode === 'LIMIT') {
          targetDistForLabels = raw.DistToNextSpeedLimit;
        }

        const distAtX = targetDistForLabels * ratio;
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

    if (mode === 'DYNAMIC') {
      targetDist = customMiles ? remainingDist : (nextAutoStop?.distance_m || targetDist);
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
        const factor = raw.SpeedUnit === 'MPH' ? 0.44704 : 0.27778;
        targetSpeedDisplay = raw.NextSpeedLimit;
        targetSpeedMS = targetSpeedDisplay * factor;
        curveColor = '#fbbf24';
        glowColor = 'rgba(251, 191, 36, 0.8)';
    }

    const currentSpeedMS = raw.Speed;
    
    // --- Cálculo de Esfuerzo de Frenado Real vs Teórico ---
    // 1. Esfuerzo Dinámico (Priorizar Ammeter real si es negativo)
    const currentAmps = raw.Ammeter !== undefined ? raw.Ammeter : raw.Amperage;
    const dynamicEffort = (currentAmps < 0) ? Math.abs(currentAmps) : 0;
    
    // 2. Esfuerzo Neumático (kN)
    const pneumaticEffort = raw.BrakingEffort || 0;
    
    // 3. Esfuerzo Total Aplicado (kN) 
    const rawTE = raw.TractiveEffort || 0;
    const totalAppliedEffort = rawTE < 0 ? Math.abs(rawTE) : (pneumaticEffort + (dynamicEffort * 0.5));

    // Cálculo de Deceleración Requerida (v² = u² + 2as) => a = (v² - u²) / 2s
    let recommendedBrake = 0; // 0 a 100%
    if (currentSpeedMS > targetSpeedMS && targetDist > 5) {
        // Deceleración cinemática necesaria en m/s²
        const requiredAcc = (Math.pow(targetSpeedMS, 2) - Math.pow(currentSpeedMS, 2)) / (2 * targetDist);
        const requiredDecel = Math.abs(requiredAcc);
        
        // --- Cálculo dinámico basado en Masa y Longitud ---
        const massFactor = raw.TrainMass > 0 ? (raw.TrainMass / 500) : 1; // 500t como base
        const lengthFactor = raw.TrainLength > 0 ? (1 + (raw.TrainLength / 1000) * 0.1) : 1; 
        
        const typeLagMap: Record<number, number> = { 0: 1.4, 1: 1.0, 2: 1.1, 3: 0.8 };
        const trainType = raw.TrainType ?? 1;
        const lagFactor = typeLagMap[trainType] || 1.0;

        let effectiveMaxServiceDecel = activeProfile?.physics_config?.max_braking_decel || 1.0; 
        
        effectiveMaxServiceDecel = effectiveMaxServiceDecel / (massFactor * lengthFactor * lagFactor);

        // --- Influencia del Gradiente (Desnivel) ---
        const gradient = -(raw.Gradient || 0);
        const gravityAcc = 9.80665 * (gradient / 100); 
        
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

            // Métrica de Esfuerzo Actual (kN / A)
            ctx.fillStyle = (raw.Amperage < 0) ? '#4ade80' : 'rgba(255,255,255,0.3)';
            ctx.font = '7px JetBrains Mono';
            ctx.fillText(`${Math.round(totalAppliedEffort)}kN | ${Math.round(raw.Amperage)}${raw.AmperageUnit}`, 75, 32);
            
            ctx.restore();
        }
    }

    // 4. Marcador de distancia óptima (Punto final)
    ctx.fillStyle = curveColor;
    
    // --- NUEVO: Línea horizontal de velocidad objetivo ---
    if (mode === 'LIMIT' || mode === 'SIGNAL') {
        const targetY = smooth.speedDisplay > 0 ? graphHeight * (1 - (targetSpeedDisplay / smooth.speedDisplay)) : graphHeight;
        
        ctx.save();
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = curveColor + '66'; // 40% opacidad
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, targetY);
        ctx.lineTo(graphWidth, targetY);
        ctx.stroke();
        
        // Etiqueta de velocidad objetivo sobre la línea
        ctx.fillStyle = curveColor;
        ctx.font = 'bold 9px JetBrains Mono';
        ctx.textAlign = 'left';
        ctx.fillText(`${Math.round(targetSpeedDisplay)} ${raw.SpeedUnit}`, 5, targetY - 5);
        ctx.restore();
    }

    // --- NUEVA LÍNEA: Nariz del Tren si estamos en Cabina 2 ---
    if (raw.ActiveCab === 2 && raw.TrainLength > 0 && targetDist > 5) {
        const noseX = (raw.TrainLength / targetDist) * graphWidth;
        if (noseX > 0 && noseX < graphWidth) {
            ctx.save();
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = 'rgba(255, 120, 120, 0.4)';
            ctx.beginPath();
            ctx.moveTo(noseX, 0);
            ctx.lineTo(noseX, graphHeight);
            ctx.stroke();
            
            ctx.fillStyle = 'rgba(255, 120, 120, 0.8)';
            ctx.font = 'bold 9px JetBrains Mono';
            ctx.fillText('TRAIN NOSE', noseX + 4, 15);
            ctx.restore();
        }
    }

    ctx.beginPath();
    // Ajustar posición Y del punto según la velocidad objetivo
    const endY = smooth.speedDisplay > 0 ? graphHeight * (1 - (targetSpeedDisplay / smooth.speedDisplay)) : graphHeight;
    ctx.arc(graphWidth, endY, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }, [isConnected, raw, smooth.speedDisplay, mode, customMiles, remainingDist, nextAutoStop, activeProfile, formatDistance]);

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
    
  // --- NUEVO: Cálculo de distancia de inicio de frenado ---
  // Extraemos las variables necesarias fuera de drawGraph para que estén disponibles
  const brakeParams = useMemo(() => {
      const targetDist = info.dist;
      let targetSpeedMS = 0;
      
      if (mode === 'SIGNAL') {
          targetSpeedMS = 0;
      } else if (mode === 'LIMIT') {
          const factor = raw.SpeedUnit === 'MPH' ? 0.44704 : 0.27778;
          targetSpeedMS = raw.NextSpeedLimit * factor;
      } else {
          // Dynamic mode targets 0
          targetSpeedMS = 0;
      }

      if (!raw.Speed || !targetDist || raw.Speed <= targetSpeedMS) return null;
      
      const baseDecel = activeProfile?.physics_config?.max_braking_decel || 0.8;
      const massFactor = raw.TrainMass > 0 ? (raw.TrainMass / 500) : 1;
      const typeLagMap: Record<number, number> = { 0: 1.4, 1: 1.0, 2: 1.1, 3: 0.8 };
      const lagFactor = typeLagMap[raw.TrainType ?? 1] || 1.0;
      const gradient = -(raw.Gradient || 0);
      const gravityAcc = 9.80665 * (gradient / 100);
      
      // Deceleración de servicio (40% de la max)
      const effectiveDecel = (baseDecel * 0.4) / (massFactor * lagFactor) + gravityAcc;
      
      if (effectiveDecel <= 0) return null;

      const brakeDistNeeded = (Math.pow(raw.Speed, 2) - Math.pow(targetSpeedMS, 2)) / (2 * effectiveDecel);
      const distanceToStart = targetDist - brakeDistNeeded;
      
      // Intentamos obtener la muesca recomendada (basada en el 40% de deceleración)
      let recNotch = "SERVICE";
      const notches = activeProfile?.specs?.notches_throttle_brake;
      if (notches) {
          const targetVal = -0.4; // 40% de freno
          const brakeNotches = notches.filter((n: any) => n.value <= 0).sort((a: any, b: any) => b.value - a.value);
          for (const notch of brakeNotches) {
              if (targetVal >= notch.value) {
                  recNotch = notch.label;
                  break;
              }
          }
      }

      return {
          dist: distanceToStart,
          needed: brakeDistNeeded,
          notch: recNotch
      };
  }, [raw.Speed, raw.NextSpeedLimit, raw.SpeedUnit, raw.TrainMass, raw.TrainType, raw.Gradient, activeProfile, info.dist, mode]);

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
          
          {/* Dashboard de Frenado Exacto */}
          {brakeParams && brakeParams.dist > 0 && (
            <div className="mt-16 flex flex-col bg-black/60 p-2 border-l-2 border-amber-500 backdrop-blur-sm">
                <span className="text-[9px] text-amber-500 font-black uppercase tracking-widest">Brake Start In:</span>
                <span className="text-[18px] text-white font-mono font-bold">
                    {formatDistance(brakeParams.dist)}
                </span>
                <div className="flex gap-2 items-center mt-1">
                    <span className="text-[8px] text-white/40 font-bold uppercase">Rec Notch:</span>
                    <span className="px-1.5 py-0.5 bg-amber-500 text-black text-[10px] font-black rounded-xs">
                        {brakeParams.notch}
                    </span>
                </div>
            </div>
          )}
          
          {brakeParams && brakeParams.dist <= 0 && (
            <div className="mt-20 flex flex-col bg-red-600/20 p-2 border-l-2 border-red-500 animate-pulse">
                <span className="text-[9px] text-red-500 font-black uppercase">OVERSPEED RISK</span>
                <span className="text-[12px] text-white font-mono font-bold">APPLY BRAKE NOW!</span>
            </div>
          )}
          {mode === 'DYNAMIC' && (
            <div className="absolute top-36 left-0 mt-8 flex items-center gap-1">
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
