import React from 'react';
import { useTelemetrySmoothing } from '../../hooks/useTelemetrySmoothing';
import { CanvasLayer } from './CanvasLayer';

export const Speedometer: React.FC = () => {
  const { smooth, raw, isConnected, activeProfile } = useTelemetrySmoothing();
  
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
    const accelerationG = raw.GForce;
    const lateralG = raw.LateralG || 0;
    
    // Inversión de Inercia: 
    // Si aceleras (+), tu cuerpo se mueve hacia Atras (Y+)
    // Si giras Derecha (+ Curvature), tu cuerpo se mueve hacia la Izquierda (X-)
    const pointX = gX - (lateralG * 25); 
    const pointY = gY + (accelerationG * 25); 

    ctx.shadowBlur = 10;
    ctx.shadowColor = '#22d3ee';
    ctx.fillStyle = '#22d3ee';
    ctx.beginPath();
    ctx.arc(pointX, pointY, 3, 0, Math.PI * 2);
    ctx.fill();

    // Texto de valores G debajo del globo
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '9px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.fillText(`L:${lateralG.toFixed(2)} Lon:${accelerationG.toFixed(2)}`, gX, gY + gSize/2 + 10);
    ctx.textAlign = 'left';

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
    // Inferimos tipo si no viene
    type: n.value > 0 ? 'power' : n.value < 0 ? 'brake' : 'neutral'
  })).reverse() : defaultNotches;

  // Encontrar el notch activo
  const findActiveNotch = () => {
    if (notches) {
      // Si el perfil tiene muescas combinadas (-1 a 1)
      const combinedVal = raw.CombinedControl !== undefined ? raw.CombinedControl : (raw.Throttle - raw.TrainBrake);
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
      // Lógica por defecto
      if (raw.Throttle > 0) {
        if (raw.Throttle > 0.9) return 'P7';
        if (raw.Throttle > 0.6) return 'P5';
        return 'P1';
      }
      if (raw.TrainBrake > 0.05) {
        if (raw.TrainBrake > 0.8) return 'B9';
        if (raw.TrainBrake > 0.4) return 'B5';
        return 'B1';
      }
      return 'N';
    }
  };

  const activeNotchLabel = findActiveNotch();

  return (
    <div className="relative flex flex-col items-center justify-center h-[280px] bg-[#0a0a0a] border border-white/5 rounded-sm overflow-hidden">
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
                {raw.GForce >= 0 ? '+' : ''}{raw.GForce.toFixed(2)}G
            </span>
            <div className="flex gap-1 mt-1">
               <div className={`px-2 py-1 rounded-sm text-[11px] font-bold font-mono ${
                 raw.Reverser > 0 ? 'bg-cyan-500/20 text-cyan-500' : 
                 raw.Reverser < 0 ? 'bg-red-500/20 text-red-500' : 
                 'bg-white/5 text-white/40'
               }`}>
                 {raw.Reverser > 0 ? 'FOR' : raw.Reverser < 0 ? 'REV' : 'NEU'}
               </div>
               <div className={`px-3 py-1 rounded-sm text-[11px] font-bold font-mono transition-colors ${
                 activeNotchLabel.startsWith('B') ? 'bg-orange-500/20 text-orange-500' :
                 activeNotchLabel.startsWith('P') ? 'bg-cyan-500/20 text-cyan-500' :
                 'bg-white/5 text-white/60'
               }`}>
                   {activeNotchLabel}
               </div>
            </div>
            <div className={`mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${raw.SpeedDisplay > raw.SpeedLimit ? 'bg-red-500/20 text-red-500' : 'bg-white/5 text-white/40'}`}>
                LIMIT: {Math.round(raw.SpeedLimit)}
            </div>
        </div>
      </div>

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
