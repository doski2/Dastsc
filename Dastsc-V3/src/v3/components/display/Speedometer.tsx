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
    const pointX = gX;
    const pointY = gY - (accelerationG * 25); // Sensibilidad ajustada para mayor visibilidad

    ctx.shadowBlur = 10;
    ctx.shadowColor = '#22d3ee';
    ctx.fillStyle = '#22d3ee';
    ctx.beginPath();
    ctx.arc(pointX, pointY, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  // Formatea la velocidad a 1 decimal
  const displaySpeed = smooth.speedDisplay.toFixed(0);

  return (
    <div className="relative flex flex-col items-center justify-center h-[280px] bg-[#0a0a0a] border border-white/5 rounded-sm overflow-hidden">
      {/* Capa de dibujo de Canvas */}
      <CanvasLayer render={drawGauge} />

      {/* Lectura Digital Central */}
      <div className="absolute flex flex-col items-center select-none pointer-events-none">
        <span className="text-[10px] font-mono text-white/20 uppercase tracking-[0.2em] mb-1">{raw.SpeedUnit}</span>
        <span className="text-6xl font-light tracking-tighter text-white/90 leading-none">
          {displaySpeed}
        </span>
        <div className="mt-4 flex flex-col items-center">
            <span className="text-[10px] font-mono text-cyan-500/60 font-bold tracking-widest">
                {raw.GForce >= 0 ? '+' : ''}{raw.GForce.toFixed(2)}G
            </span>
            <div className={`mt-1 px-2 py-0.5 rounded-full text-[8px] font-bold ${raw.SpeedDisplay > raw.SpeedLimit ? 'bg-red-500/20 text-red-500' : 'bg-white/5 text-white/40'}`}>
                LIMIT: {Math.round(raw.SpeedLimit)}
            </div>
        </div>
      </div>

      {/* Pasos de Potencia/Freno (Estilo Lateral) */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-1">
        {['P7', 'P5', 'P1', 'N', 'B1', 'B5', 'B9'].map((step) => {
          const isPower = step.startsWith('P');
          const isBrake = step.startsWith('B');
          const isActive = (isPower && Math.round(raw.Throttle * 7) >= parseInt(step[1])) ||
                           (isBrake && Math.round(raw.TrainBrake * 9) >= parseInt(step[1])) ||
                           (step === 'N' && raw.Throttle === 0 && raw.TrainBrake === 0);

          return (
            <div key={step} className={`text-[8px] font-mono px-1 py-0.5 rounded-xs transition-colors ${
              isActive ? (isPower ? 'bg-cyan-500 text-black' : isBrake ? 'bg-orange-500 text-black' : 'bg-white text-black') 
                       : 'text-white/10'
            }`}>
              {step}
            </div>
          );
        })}
      </div>
    </div>
  );
};
