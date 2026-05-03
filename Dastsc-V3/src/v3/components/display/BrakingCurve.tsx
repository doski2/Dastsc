import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useTelemetrySmoothing } from '../../hooks/useTelemetrySmoothing';
import { useTelemetry } from '../../core/TelemetryContext';
import { CanvasLayer } from './CanvasLayer';
import { scenarioService, ScenarioStop } from '../../services/ScenarioService';
import { useBrakeLearning } from '../../hooks/useBrakeLearning';

type CurveMode = 'DYNAMIC' | 'SIGNAL' | 'LIMIT';

/**
 * BrakingCurve renderiza la parábola de frenado proyectiva.
 */
export const BrakingCurve: React.FC = () => {
  const { smooth, raw, isConnected, activeProfile } = useTelemetrySmoothing();
  const { scenarioStops, resetLocalState } = useTelemetry();
  const [mode, setMode] = useState<CurveMode>('DYNAMIC');
  const [resetting, setResetting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [brakeHistory, setBrakeHistory] = useState<any[]>([]);
  // Stats aprendidos por muesca: { [notchLabel]: { avg_decel_ms2, samples } }
  const [brakeStats, setBrakeStats] = useState<Record<string, { avg_decel_ms2: number; samples: number }>>({});

  // Auto-aprendizaje pasivo de frenadas — registra sin intervención del usuario
  useBrakeLearning(raw, activeProfile);

  // Cargar estadísticas aprendidas cuando cambia el perfil, y refrescar cada 60s
  useEffect(() => {
    const profileId = activeProfile?.id ?? activeProfile?.name ?? '';
    const load = () => {
      const url = profileId
        ? `http://localhost:8000/api/brake/stats?profile=${encodeURIComponent(profileId)}`
        : 'http://localhost:8000/api/brake/stats';
      fetch(url)
        .then(r => r.json())
        .then(d => setBrakeStats(d.stats ?? {}))
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [activeProfile]);
  
  // En modo dinámico: siguiente parada real (no WAYPOINT, no satisfecha)
  // Priorizar la parada que el tracker marcó como ACTIVE (is_active=true),
  // sin filtrar por distancia para evitar saltos cuando el tren está en andén.
  // Fallback: primera no satisfecha con distancia significativa (cuando tracker aún no inicializa)
  const nextAutoStop = useMemo(() => {
    const serverActive = scenarioStops.find(
      s => s.is_active && !s.satisfied && s.type !== 'WAYPOINT'
    );
    if (serverActive) return serverActive;
    return scenarioStops.find(
      s => !s.satisfied && s.type !== 'WAYPOINT' && s.distance_m > 100
    );
  }, [scenarioStops]);

  // anulación manual para modo dinámico (millas)
  const [customMiles, setCustomMiles] = useState<string>('');

  // Distancia efectiva al objetivo según modo activo.
  // DYNAMIC: StationDistance del backend (OCR+tracker) o entrada manual.
  // SIGNAL / LIMIT: distancias de telemetría directas.
  // Sin RAF ni estado local — el backend actualiza StationDistance cada frame.
  const effectiveDist = useMemo(() => {
    if (mode === 'DYNAMIC') {
      if (customMiles) {
        const m = parseFloat(customMiles);
        return !isNaN(m) ? m * 1609.34 : 0;
      }
      return raw.StationDistance >= 0 ? raw.StationDistance : 0;
    }
    if (mode === 'SIGNAL') return raw.DistToNextSignal;
    return raw.DistToNextSpeedLimit;
  }, [mode, customMiles, raw.StationDistance, raw.DistToNextSignal, raw.DistToNextSpeedLimit]);

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
          targetDistForLabels = effectiveDist || targetDistForLabels;
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
      targetDist = effectiveDist || targetDist;
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
        // raw.Gradient ya viene normalizado por DataNormalizer: positivo=subida, negativo=bajada.
        // Subida → gravityAcc > 0 → necesitas MENOS freno (gravedad te frena)
        // Bajada → gravityAcc < 0 → necesitas MÁS freno (gravedad te acelera)
        const gravityAcc = 9.80665 * ((raw.Gradient || 0) / 100);
        
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
  }, [isConnected, raw, smooth.speedDisplay, mode, customMiles, effectiveDist, nextAutoStop, activeProfile, formatDistance]);

  const getTargetInfo = () => {
    switch(mode) {
        case 'SIGNAL': return { label: 'Next Signal', dist: raw.DistToNextSignal, val: raw.NextSignalAspect };
        case 'LIMIT': return { label: 'Next Limit', dist: raw.DistToNextSpeedLimit, val: `${raw.NextSpeedLimit} ${raw.SpeedUnit}` };
        default: {
            if (customMiles) {
              return { label: 'Manual Stop', dist: effectiveDist, val: `${customMiles} mi` };
            }
            if (nextAutoStop) {
              // effectiveDist: raw.StationDistance (OCR/tracker) si disponible, sino remainingDist local
              return { label: `Station: ${nextAutoStop.name}`, dist: effectiveDist, val: nextAutoStop.type !== 'WAYPOINT' ? 'PLATFORM' : 'WPT' };
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

      if (mode === 'LIMIT') {
          const factor = raw.SpeedUnit === 'MPH' ? 0.44704 : 0.27778;
          targetSpeedMS = raw.NextSpeedLimit * factor;
      }

      if (!raw.Speed || !targetDist || raw.Speed <= targetSpeedMS) return null;

      const baseDecel = activeProfile?.physics_config?.max_braking_decel || 0.8;
      const massFactor = raw.TrainMass > 0 ? (raw.TrainMass / 500) : 1;
      const typeLagMap: Record<number, number> = { 0: 1.4, 1: 1.0, 2: 1.1, 3: 0.8 };
      const lagFactor = typeLagMap[raw.TrainType ?? 1] || 1.0;
      // raw.Gradient normalizado: positivo=subida (ayuda al frenado), negativo=bajada (dificulta)
      const gravityAcc = 9.80665 * ((raw.Gradient || 0) / 100);

      const notches = activeProfile?.specs?.notches_throttle_brake;
      const brakeNotches = notches
        ? notches.filter((n: any) => n.value < 0).sort((a: any, b: any) => a.value - b.value) // de -1 a 0
        : [];

      // Helper: deceleración efectiva para una fracción
      // Si hay ≥3 muestras aprendidas para la muesca correspondiente, usa el valor real medido
      const MIN_SAMPLES = 3;
      const decelFor = (fraction: number, notchLabel: string): number => {
        const learned = brakeStats[notchLabel];
        if (learned && learned.samples >= MIN_SAMPLES) {
          // Valor aprendido real: ya incluye el efecto promedio del gradiente en esas frenadas
          // Ajustamos con el gradiente actual para mayor precisión situacional
          return learned.avg_decel_ms2 + gravityAcc;
        }
        return (baseDecel * fraction) / (massFactor * lagFactor) + gravityAcc;
      };

      // Helper: distancia de frenado cinemática para una fracción de deceleración
      const brakeDist = (fraction: number, notchLabel: string): number => {
        const decel = decelFor(fraction, notchLabel);
        if (decel <= 0) return Infinity;
        return (Math.pow(raw.Speed, 2) - Math.pow(targetSpeedMS, 2)) / (2 * decel);
      };

      // Margen de reacción: 1.5s humano + tiempo de llenado de cilindros del perfil
      const fillTimeSecs = activeProfile?.physics_config?.brake_fill_time_s ?? 5;
      const reactionMargin = raw.Speed * (1.5 + fillTimeSecs);

      // Fases basadas en las muescas de servicio reales del perfil (excluir EMG = -1.0)
      // brakeNotches está ordenado de más negativo a menos (fuerza descendente)
      const serviceNotches = brakeNotches.filter((n: any) => n.value > -1.0);
      let phases: { fraction: number; notchLabel: string; label: string }[];
      if (serviceNotches.length >= 1) {
        const total = serviceNotches.length;
        const picks = total === 1 ? [0]
          : total === 2 ? [0, 1]
          : [0, Math.floor((total - 1) / 2), total - 1];
        phases = picks.map((idx, i) => ({
          fraction: Math.abs(serviceNotches[idx].value),
          notchLabel: serviceNotches[idx].label,
          label: String(i + 1),
        }));
      } else {
        phases = [
          { fraction: 0.30, notchLabel: '30%', label: '1' },
          { fraction: 0.55, notchLabel: '55%', label: '2' },
          { fraction: 0.80, notchLabel: '80%', label: '3' },
        ];
      }

      const steps = phases.map(p => {
        const learned = brakeStats[p.notchLabel];
        const usingLearned = !!(learned && learned.samples >= MIN_SAMPLES);
        const dist = brakeDist(p.fraction, p.notchLabel);
        return {
          notch: p.notchLabel,
          fraction: p.fraction,
          phase: p.label,
          distStart: targetDist - (dist + reactionMargin),
          distNeeded: dist,
          usingLearned,
          samples: learned?.samples ?? 0,
        };
      });

      // La fase principal de referencia (servicio normal) es la del medio
      const main = steps[1];

      return {
        dist: main.distStart,
        needed: main.distNeeded,
        notch: main.notch,
        steps,  // progresión completa
      };
  }, [raw.Speed, raw.NextSpeedLimit, raw.SpeedUnit, raw.TrainMass, raw.TrainType, raw.Gradient, activeProfile, info.dist, mode, brakeStats]);

  // ETA calculado localmente: TimeOfDay + remainingDist / Speed
  // Fuente primaria sin OCR; OCR override si está disponible
  const computedETA = useMemo(() => {
    if (raw.StationETA) return raw.StationETA; // OCR tiene prioridad
    if (!raw.Speed || raw.Speed < 0.5 || !nextAutoStop || effectiveDist <= 0) return null;
    const secsToArrival = effectiveDist / raw.Speed;
    const parts = raw.TimeOfDay.split(':').map(Number);
    if (parts.length !== 3) return null;
    const totalSecs = parts[0] * 3600 + parts[1] * 60 + parts[2] + secsToArrival;
    const h = Math.floor(totalSecs / 3600) % 24;
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = Math.floor(totalSecs % 60);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }, [raw.Speed, raw.TimeOfDay, raw.StationETA, nextAutoStop, effectiveDist]);

  // Hora programada: del escenario (due_time) o fallback OCR
  const scheduledTime = nextAutoStop?.due_time || raw.StationScheduled || null;

return (
    <div className="relative flex-1 bg-white/[0.02] border border-white/5 rounded-sm overflow-hidden flex flex-col min-h-[300px]">
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-10 pointer-events-none">
        <div className="flex flex-col gap-1 pointer-events-auto max-w-[60%]">
          <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] font-mono leading-none flex items-center gap-2">
            Braking Curve // {mode}
            {raw.ActiveCab === 2 && (
              <span className="px-1 py-0.5 bg-yellow-500/20 border border-yellow-400/40 text-yellow-300 text-[8px] font-black rounded-xs leading-none">
                CAB 2 · REAR
              </span>
            )}
          </span>
          <span className={`text-[14px] font-mono font-bold drop-shadow-[0_0_8px_rgba(34,211,238,0.4)] truncate ${
            mode === 'DYNAMIC' ? 'text-cyan-400' : mode === 'SIGNAL' ? 'text-red-400' : 'text-amber-400'
          }`}>
            {info.label}: <span className="text-white">{formatDistance(info.dist)}</span>
            {mode === 'DYNAMIC' && raw.StationDistance > 0 && (
              <span className="ml-1.5 px-1 py-0.5 bg-cyan-500/15 border border-cyan-500/30 text-cyan-400/70 text-[7px] font-black rounded-xs leading-none align-middle">OCR</span>
            )}
            <span className="ml-2 text-[10px] opacity-40">[{info.val}]</span>
          </span>

          {/* Panel de siguiente estación en modo DYNAMIC */}
          {mode === 'DYNAMIC' && nextAutoStop && (
            <div className="flex flex-col gap-0.5 bg-black/70 border border-cyan-500/25 rounded-sm px-2 py-1 max-w-[95%]">
              <div className="flex items-center gap-1.5">
                <span className="text-[7px] text-cyan-500/50 font-black uppercase tracking-widest shrink-0">NEXT STOP</span>
                <span className="text-[11px] text-cyan-200 font-mono font-bold truncate">{nextAutoStop.name}</span>
              </div>
              {brakeParams && (
                <div className="flex gap-2 flex-wrap text-[8px] font-mono">
                  <span className="text-white/30">BRAKE DIST: <strong className="text-red-300/60">{Math.round(brakeParams.needed)}m</strong></span>
                </div>
              )}
              {(scheduledTime || computedETA) && (
                <div className="flex gap-2 flex-wrap text-[8px] font-mono mt-0.5">
                  {scheduledTime && (
                    <span className="text-white/40">
                      @ <strong className="text-green-300/70">{scheduledTime}</strong>
                      {raw.StationScheduled && raw.StationScheduled !== scheduledTime && (
                        <span className="text-green-500/40 ml-1">(ocr)</span>
                      )}
                    </span>
                  )}
                  {scheduledTime && computedETA && <span className="text-white/20">·</span>}
                  {computedETA && (
                    <span className="text-white/40">
                      ETA <strong className={raw.StationETA ? 'text-yellow-300/70' : 'text-white/50'}>{computedETA}</strong>
                      {raw.StationETA && <span className="text-yellow-500/40 ml-1">(ocr)</span>}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
          
          {/* Dashboard de Frenado Exacto — progresión gradual */}
          {brakeParams && brakeParams.dist > 0 && (
            <div className="mt-16 flex flex-col bg-black/60 p-2 border-l-2 border-amber-500 backdrop-blur-sm gap-1.5">
              <span className="text-[9px] text-amber-500 font-black uppercase tracking-widest">Brake Sequence:</span>
              {/* Fases en orden inverso: la más lejana primero */}
              {[...brakeParams.steps].reverse().map((step, i) => {
                // distToBrakingPoint: positivo = aún faltan metros para llegar al punto de freno
                //                     negativo = ya pasamos el punto (hay que frenar o ya frenamos)
                const distToBrakingPoint = effectiveDist - step.distStart;
                const isApplyNow = distToBrakingPoint <= 50 && distToBrakingPoint >= -50;
                const isPassed   = distToBrakingPoint < -50;
                // upcoming: distToBrakingPoint > 50

                // Posición del odómetro en la que hay que aplicar esta muesca
                const brakingOdometerM = raw.TripDistance + distToBrakingPoint;
                const brakingOdometerLabel = raw.SpeedUnit === 'MPH'
                  ? `mi ${(brakingOdometerM * 0.000621371).toFixed(2)}`
                  : `km ${(brakingOdometerM / 1000).toFixed(2)}`;
                const remainingLabel = distToBrakingPoint > 50
                  ? `in ${formatDistance(distToBrakingPoint)}`
                  : isApplyNow ? 'APPLY NOW' : 'PASSED';

                return (
                  <div key={i} className={`flex items-center gap-2 px-1.5 py-1 rounded-xs border transition-all ${
                    isApplyNow
                      ? 'border-amber-400 bg-amber-500/20'
                      : isPassed
                        ? 'border-white/10 bg-white/[0.02] opacity-40'
                        : 'border-white/5 bg-white/[0.02]'
                  }`}>
                    <div className="flex flex-col min-w-[52px]">
                      <span className={`text-[10px] font-black font-mono leading-none ${isApplyNow ? 'text-amber-300' : 'text-white/70'}`}>
                        {brakingOdometerLabel}
                      </span>
                      <span className={`text-[7px] font-mono leading-none mt-0.5 ${
                        distToBrakingPoint > 50 ? 'text-white/30'
                        : isApplyNow ? 'text-amber-400 font-black animate-pulse'
                        : 'text-white/20'
                      }`}>
                        {remainingLabel}
                      </span>
                    </div>
                    <div className="w-px h-6 bg-white/10 shrink-0" />
                    <div className="flex flex-col min-w-[36px]">
                      <span className="text-[7px] text-white/30 uppercase leading-none">notch</span>
                      <span className={`text-[11px] font-black font-mono leading-none ${isApplyNow ? 'text-amber-300' : 'text-white/50'}`}>
                        {step.notch}
                      </span>
                    </div>
                    <div className="flex flex-col flex-1 items-end">
                      <div className="flex items-center gap-1">
                        <span className="text-[6px] text-white/20 uppercase leading-none">{Math.round(step.fraction * 100)}%</span>
                        {step.usingLearned
                          ? <span className="text-[6px] text-violet-400/80 uppercase leading-none font-black" title={`${step.samples} frenadas reales`}>✦{step.samples}</span>
                          : <span className="text-[6px] text-white/15 uppercase leading-none" title="Usando estimación del perfil">~est</span>
                        }
                      </div>
                      <div className="w-full mt-0.5 h-0.5 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${isApplyNow ? 'bg-amber-400' : 'bg-white/20'}`}
                          // eslint-disable-next-line react/forbid-dom-props
                          style={{ width: `${step.fraction * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {brakeParams && brakeParams.dist <= 0 && (
            <div className="mt-20 flex flex-col bg-red-600/20 p-2 border-l-2 border-red-500 animate-pulse">
                <span className="text-[9px] text-red-500 font-black uppercase">OVERSPEED RISK</span>
                <span className="text-[12px] text-white font-mono font-bold">APPLY BRAKE NOW!</span>
            </div>
          )}

        </div>
        
        <div className="flex gap-1.5 pointer-events-auto flex-wrap justify-end items-center">
           {mode === 'DYNAMIC' && (
             <div className="flex items-center gap-1 bg-black/60 border border-white/10 rounded-sm px-1.5 py-0.5">
               <input
                 type="number"
                 min="0"
                 step="0.01"
                 placeholder="0.00"
                 value={customMiles}
                 onChange={e => setCustomMiles(e.target.value)}
                 className="w-14 text-center text-[9px] font-mono rounded bg-white/5 border border-white/10 px-1 py-0.5 text-white outline-none placeholder:text-white/10"
               />
               <span className="text-[7px] text-white/30 font-bold uppercase">mi</span>
               {customMiles && (
                 <button
                   onClick={() => setCustomMiles('')}
                   className="text-white/20 hover:text-white transition-colors text-[10px] leading-none"
                   title="Clear"
                 >×</button>
               )}
             </div>
           )}
           <button onClick={() => setMode('DYNAMIC')} className={`px-2 py-1 rounded-xs border text-[9px] font-black uppercase tracking-tighter transition-all ${mode === 'DYNAMIC' ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400' : 'bg-white/5 border-white/5 text-white/30 hover:bg-white/10'}`}>Dynamic</button>
           <button onClick={() => setMode('SIGNAL')} className={`px-2 py-1 rounded-xs border text-[9px] font-black uppercase tracking-tighter transition-all ${mode === 'SIGNAL' ? 'bg-red-500/20 border-red-500/50 text-red-400' : 'bg-white/5 border-white/5 text-white/30 hover:bg-white/10'}`}>Signal</button>
           <button onClick={() => setMode('LIMIT')} className={`px-2 py-1 rounded-xs border text-[9px] font-black uppercase tracking-tighter transition-all ${mode === 'LIMIT' ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' : 'bg-white/5 border-white/5 text-white/30 hover:bg-white/10'}`}>Limit</button>
           <button
             disabled={resetting}
             onClick={async () => {
               setResetting(true);
               await scenarioService.resetTracker();
               resetLocalState();
               setCustomMiles('');
               setResetting(false);
             }}
             className="px-2 py-1 rounded-xs border text-[9px] font-black uppercase tracking-tighter transition-all bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20 disabled:opacity-40"
             title="Resetea el tracker del servidor y el estado local del navegador"
           >
             {resetting ? '...' : 'Reset'}
           </button>
        </div>
      </div>

      {/* Panel de historial de frenadas */}
      {showHistory && (
        <div className="absolute bottom-10 left-2 z-30 w-72 max-h-80 overflow-y-auto bg-black/90 border border-violet-500/30 rounded-sm shadow-xl backdrop-blur-md">
          <div className="sticky top-0 bg-black/95 px-3 py-1.5 border-b border-white/10 flex justify-between items-center">
            <span className="text-[9px] text-violet-400 font-black uppercase tracking-widest">Brake Events Log</span>
            <span className="text-[8px] text-white/30 font-mono">{brakeHistory.length} entries</span>
          </div>
          {brakeHistory.length === 0 ? (
            <div className="px-3 py-4 text-[9px] text-white/30 font-mono text-center">
              No events yet — drive and brake normally
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {[...brakeHistory].reverse().map((ev, i) => (
                <div key={i} className="px-3 py-2 flex flex-col gap-0.5 hover:bg-white/[0.03] transition-colors">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black font-mono text-white/70">
                      {ev.start_speed_ms != null ? `${(ev.start_speed_ms * (raw.SpeedUnit === 'MPH' ? 2.23694 : 3.6)).toFixed(0)} → ${(ev.end_speed_ms * (raw.SpeedUnit === 'MPH' ? 2.23694 : 3.6)).toFixed(0)} ${raw.SpeedUnit}` : '—'}
                    </span>
                    <span className={`px-1 py-0.5 text-[8px] font-black rounded-xs ${ev.notch && ev.notch !== '?' ? 'bg-amber-500/20 text-amber-300' : 'bg-white/5 text-white/30'}`}>
                      {ev.notch ?? '?'}
                    </span>
                  </div>
                  <div className="flex gap-2 text-[7px] font-mono text-white/30">
                    <span>AVG <strong className="text-cyan-400/70">{ev.avg_decel_ms2?.toFixed(2)}</strong> m/s²</span>
                    <span>MAX <strong className="text-red-400/70">{ev.max_decel_ms2?.toFixed(2)}</strong></span>
                    <span>{ev.duration_s?.toFixed(0)}s · {ev.distance_m ? `${Math.round(ev.distance_m)}m` : ''}</span>
                  </div>
                  <div className="flex gap-2 text-[7px] font-mono text-white/20">
                    {ev.gradient != null && <span>G: {ev.gradient > 0 ? '+' : ''}{ev.gradient.toFixed(1)}%</span>}
                    {ev.train_mass > 0 && <span>{Math.round(ev.train_mass)}t</span>}
                    {ev.loco && <span className="text-white/15 truncate max-w-[80px]">{ev.loco}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <CanvasLayer render={drawGraph} />
      
      {/* Línea de escaneo decorativa */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/[0.01] to-transparent h-20 w-full animate-scan pointer-events-none" />
      
      <div className="absolute bottom-1.5 left-4 right-4 flex justify-between items-end pointer-events-none z-10">
        <div className="flex flex-col items-start select-none pointer-events-auto">
          <button
            onClick={async () => {
              const profileId = activeProfile?.id ?? activeProfile?.name ?? '';
              const url = profileId
                ? `http://localhost:8000/api/brake/events?limit=20&profile=${encodeURIComponent(profileId)}`
                : 'http://localhost:8000/api/brake/events?limit=20';
              try {
                const res = await fetch(url);
                const data = await res.json();
                setBrakeHistory(data.events ?? []);
              } catch { setBrakeHistory([]); }
              setShowHistory(h => !h);
            }}
            className={`px-2 py-1 rounded-xs border text-[9px] font-black uppercase tracking-tighter transition-all ${showHistory ? 'bg-violet-500/20 border-violet-500/50 text-violet-400' : 'bg-white/5 border-white/5 text-white/30 hover:bg-white/10'}`}
            title="Historial de frenadas aprendidas"
          >
            Brake Log
          </button>
        </div>
        
        <div className="text-right select-none flex flex-col items-end">
          {raw.TrainMass > 0 && (
            <div className="bg-black/40 backdrop-blur-md p-1 rounded border border-white/5 flex gap-3 text-[8px] font-mono text-white/40 uppercase shadow-lg">
              <span>M: <strong className="text-white/60">{Math.round(raw.TrainMass)}t</strong></span>
              <span>L: <strong className="text-white/60">{Math.round(raw.TrainLength)}m</strong></span>
              <span>G: <strong className={raw.RawGradient > 0 ? 'text-green-400/60' : raw.RawGradient < 0 ? 'text-red-400/60' : 'text-white/60'}>{(raw.RawGradient || 0).toFixed(1)}%</strong></span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
