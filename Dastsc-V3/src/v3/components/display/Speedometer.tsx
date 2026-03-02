import React, { useRef, useEffect } from 'react';
import { useTelemetrySmoothing } from '../../hooks/useTelemetrySmoothing';
import { CanvasLayer } from './CanvasLayer';
import './Speedometer.css';

export const Speedometer: React.FC = () => {
  const { smooth, raw, isConnected, activeProfile } = useTelemetrySmoothing();
  const progressBarRef = useRef<HTMLDivElement>(null);

  // Update tail progress bar width dynamically using ref to avoid inline styles
  useEffect(() => {
    if (progressBarRef.current && raw.TailIsActive) {
      const progress = Math.max(0, Math.min(100, raw.TrainLength > 0 ? 100 - (smooth.tailDistance / raw.TrainLength) * 100 : 0));
      progressBarRef.current.style.width = `${progress}%`;
    }
  }, [smooth.tailDistance, raw.TrainLength, raw.TailIsActive]);
  
  // Lógica de dibujo del velocímetro circular y G-Force
  const drawGauge = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (!isConnected) return;

    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.4;

    ctx.save();

    // 1. Dibuja el anillo de fondo (Dashed/Segmented)
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 15;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0.75 * Math.PI, 2.25 * Math.PI);
    ctx.stroke();

    // 1.1 Dibuja las Muescas (Ticks) de velocidad
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    const maxSpeedForTicks = activeProfile?.specs?.max_speed || 140;
    const tickCount = 14; // Una muesca cada 10 unidades aprox
    for (let i = 0; i <= tickCount; i++) {
      const angle = 0.75 * Math.PI + (i / tickCount) * 1.5 * Math.PI;
      const innerR = radius - 5;
      const outerR = radius + 5;
      ctx.beginPath();
      ctx.moveTo(centerX + Math.cos(angle) * innerR, centerY + Math.sin(angle) * innerR);
      ctx.lineTo(centerX + Math.cos(angle) * outerR, centerY + Math.sin(angle) * outerR);
      ctx.stroke();
      
      // Etiquetas de escala
      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.font = '8px Monospace';
        ctx.textAlign = 'center';
        const labelR = radius - 18;
        const val = Math.round((i / tickCount) * maxSpeedForTicks);
        ctx.fillText(val.toString(), centerX + Math.cos(angle) * labelR, centerY + Math.sin(angle) * labelR + 3);
      }
    }

    // 2. Dibuja el progreso de velocidad (Arco Cian)
    const maxSpeed = activeProfile?.specs?.max_speed || 140; 
    const speedPercent = Math.min(smooth.speedDisplay / maxSpeed, 1);
    const endAngle = 0.75 * Math.PI + (speedPercent * 1.5 * Math.PI);

    ctx.setLineDash([]);
    ctx.shadowBlur = 15;
    ctx.shadowColor = 'rgba(34, 211, 238, 0.5)';
    ctx.strokeStyle = '#22d3ee'; // Cian
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 5, 0.75 * Math.PI, endAngle);
    ctx.stroke();

    // 2.1 Arco de Potencia / Freno (Interno)
    const combinedVal = raw.CombinedControl !== 0 ? raw.CombinedControl : (raw.Throttle - raw.TrainBrake);
    const ctrlPercent = Math.max(-1, Math.min(1, combinedVal));
    const ctrlAngle = 1.5 * Math.PI; // El centro es 1.5 * PI (arriba)
    const ctrlWidth = 0.4 * Math.PI;
    
    ctx.setLineDash([]);
    ctx.lineWidth = 4;
    ctx.shadowBlur = 0;
    
    // Fondo del arco de control
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius - 10, 1.5 * Math.PI - ctrlWidth/2, 1.5 * Math.PI + ctrlWidth/2);
    ctx.stroke();

    if (ctrlPercent !== 0) {
      ctx.strokeStyle = ctrlPercent > 0 ? '#22d3ee' : '#f97316';
      ctx.shadowBlur = 10;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.beginPath();
      // Dibujamos desde el centro (arriba) hacia los lados
      const startA = 1.5 * Math.PI;
      const endA = 1.5 * Math.PI + (ctrlPercent * (ctrlWidth/2));
      ctx.arc(centerX, centerY, radius - 10, Math.min(startA, endA), Math.max(startA, endA));
      ctx.stroke();
    }

    // 3. Esfera de G-Force (Abajo a la izquierda)
    const gSize = 40;
    const gX = centerX - radius + 10;
    const gY = centerY + radius - 20;

    // Fondo del globo G
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.beginPath();
    ctx.arc(gX, gY, gSize/2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.stroke();

    // Ejes internos del globo
    ctx.beginPath();
    ctx.moveTo(gX - gSize/2, gY); ctx.lineTo(gX + gSize/2, gY);
    ctx.moveTo(gX, gY - gSize/2); ctx.lineTo(gX, gY + gSize/2);
    ctx.stroke();

    // El punto de inercia (G-Point)
    // Escala: Si el máximo esperado es 1.0G o 2.0G, ajustamos el multiplicador.
    // Con multiplier = 10, 1.0G se desplaza 10px (el borde del globo suele ser gSize/2 = 20px)
    // gSize = 40, así que 20px es el límite visual del globo.
    const gMultiplier = 15; 
    const accelerationG = raw.GForce;
    const lateralG = raw.LateralG || 0;
    
    // Inversión de Inercia: 
    // Si aceleras (+), tu cuerpo se mueve hacia Atras (Y+)
    // Si giras Derecha (+ Curvature), tu cuerpo se mueve hacia la Izquierda (X-)
    const pointX = gX - (lateralG * gMultiplier); 
    const pointY = gY + (accelerationG * gMultiplier); 

    ctx.shadowBlur = 10;
    ctx.shadowColor = '#22d3ee';
    ctx.fillStyle = '#22d3ee';
    ctx.beginPath();
    ctx.arc(pointX, pointY, 3, 0, Math.PI * 2);
    ctx.fill();

    // Texto de valores G debajo del globo (Con 2 decimales para máxima precisión)
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '9px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.fillText(`L:${(lateralG * 10).toFixed(2)} Lon:${(accelerationG * 10).toFixed(2)}`, gX, gY + gSize/2 + 10);
    
    ctx.restore();
  };

  // Formatea la velocidad a 1 decimal
  const displaySpeed = smooth.speedDisplay.toFixed(1);

  // Lógica de Muescas (Notches) dinámicas
  const notches = activeProfile?.specs?.notches_throttle_brake || null;
  
  // Si no hay notches en el perfil, usamos los genéricos pero con lógica mejorada
  const defaultNotches = [
    { value: 1.0, label: 'P7', type: 'power' },
    { value: 0.7, label: 'P5', type: 'power' },
    { value: 0.15, label: 'P1', type: 'power' },
    { value: 0, label: 'N', type: 'neutral' },
    { value: 0.1, label: 'B1', type: 'brake' },
    { value: 0.5, label: 'B5', type: 'brake' },
    { value: 0.9, label: 'B9', type: 'brake' }
  ];

  const currentNotches = notches ? notches.map((n: any) => ({
    value: n.value,
    label: n.label,
    // Inferimos tipo basado en el valor relativo al punto neutro (0.0)
    type: n.value > 0 ? 'power' : n.value < 0 ? 'brake' : 'neutral'
  })).sort((a: any, b: any) => b.value - a.value) : defaultNotches;

  // Encontrar el notch activo
  const findActiveNotch = () => {
    // Valor unificado para comparación
    const combinedVal = raw.CombinedControl !== 0 ? raw.CombinedControl : (raw.Throttle - raw.TrainBrake);
    
    if (notches && notches.length > 0) {
      let closest = notches[0];
      let minDiff = Math.abs(combinedVal - notches[0].value);
      
      for (const n of notches) {
        const diff = Math.abs(combinedVal - n.value);
        if (diff < minDiff) {
          minDiff = diff;
          closest = n;
        }
      }
      return closest.label;
    } else {
      // Lógica por defecto adaptada a controles separados o combinados
      if (combinedVal > 0.05) {
        if (combinedVal > 0.9) return 'P7';
        if (combinedVal > 0.6) return 'P5';
        return 'P1';
      }
      if (combinedVal < -0.05) {
        const brakeMag = Math.abs(combinedVal);
        if (brakeMag > 0.8) return 'B9';
        if (brakeMag > 0.4) return 'B5';
        return 'B1';
      }
      return 'N';
    }
  };

  const activeNotchLabel = findActiveNotch();

  return (
    <div className="relative flex flex-col items-center justify-center h-[280px] bg-[#0b0b0b] border border-white/5 rounded-sm overflow-hidden">
      {/* Capa de dibujo de Canvas */}
      <CanvasLayer render={drawGauge} />

      {/* Lectura Digital Central */}
      <div className="absolute flex flex-col items-center select-none pointer-events-none">
        <span className="text-xs font-mono text-white/20 uppercase tracking-[0.2em] mb-1">{raw.SpeedUnit}</span>
        <span className="text-6xl font-light tracking-tighter text-white/90 leading-none">
          {displaySpeed}
        </span>
        <div className="flex items-center gap-1 mt-1 opacity-60">
          <span className="text-[10px] font-mono text-yellow-500 font-bold">EST:</span>
          <span className="text-sm font-mono text-yellow-200">{raw.ProjectedSpeed.toFixed(1)}</span>
        </div>
        <div className="mt-2 flex flex-col items-center">
            <span className="text-xs font-mono text-cyan-500/60 font-bold tracking-widest">
                {raw.GForce >= 0 ? '+' : ''}{(raw.GForce * 10).toFixed(2)}G
            </span>
            <div className={`mt-1 px-3 py-1 rounded-full text-xs font-bold transition-all ${
              raw.SpeedDisplay > raw.SpeedLimit ? 'bg-red-500/30 text-red-400' : 'bg-white/10 text-white/50'
            }`}>
                LIMIT: {Math.round(raw.SpeedLimit)} 
            </div>
        </div>
      </div>

      {/* Indicador de Cola de Tren (Tail Protection) */}
      {raw.TailIsActive && (
        <div className="absolute right-4 bottom-4 bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/50 rounded-lg px-3 py-2 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-1">
            <span className="text-[9px] font-bold uppercase tracking-widest text-amber-300">Tail Clearing</span>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-mono font-bold text-amber-200">
                {smooth.tailSeconds.toFixed(1)}s
              </span>
              <span className="text-[8px] text-amber-400/70">
                ({smooth.tailDistance.toFixed(0)}m)
              </span>
            </div>
            {/* Barra de progreso de cola */}
            <div className="mt-1 w-20 h-1.5 bg-amber-900/40 rounded-full overflow-hidden border border-amber-600/30">
              <div 
                ref={progressBarRef}
                className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-300"
              />
            </div>
          </div>
        </div>
      )}

      {/* Pasos de Potencia/Freno (Estilo Lateral) */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-1">
        {currentNotches.map((notch: any) => {
          const isActive = notch.label === activeNotchLabel;

          return (
            <div key={notch.label} className={`text-[10px] font-mono px-1.5 py-0.5 rounded-xs transition-all duration-200 border ${
              isActive 
                ? (notch.type === 'power' ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.2)]' 
                  : notch.type === 'brake' ? 'bg-orange-500/20 border-orange-500 text-orange-400 shadow-[0_0_8px_rgba(249,115,22,0.2)]' 
                  : 'bg-white/10 border-white/50 text-white') 
                : 'text-white/10 border-transparent'
            }`}>
              {notch.label}
            </div>
          );
        })}
      </div>
    </div>
  );
};
