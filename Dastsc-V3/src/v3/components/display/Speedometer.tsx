import React from 'react';
import { useTelemetrySmoothing } from '../../hooks/useTelemetrySmoothing';

export const Speedometer: React.FC = () => {
  const { smooth, raw } = useTelemetrySmoothing();
  
  // Formatea la velocidad a 1 decimal
  const displaySpeed = smooth.speed.toFixed(1);
  const integerPart = displaySpeed.split('.')[0];
  const fractionalPart = displaySpeed.split('.')[1];

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-[#0a0a0a] border border-white/5 rounded-sm relative overflow-hidden group">
      {/* Resplandor de fondo */}
      <div className="absolute -bottom-10 w-32 h-32 bg-cyan-500/10 blur-[50px] rounded-full group-hover:bg-cyan-500/20 transition-all duration-700" />
      
      <div className="text-[10px] font-mono text-white/30 uppercase tracking-[0.3em] mb-2">
        Velocity // km/h
      </div>
      
      <div className="flex items-baseline gap-1">
        <span className="text-7xl font-light tracking-tighter text-white/90">
          {integerPart}
        </span>
        <span className="text-3xl font-light text-cyan-500/60 tabular-nums">
          .{fractionalPart}
        </span>
      </div>

      {/* Indicador de límite de velocidad (Mini) */}
      <div className="mt-4 flex items-center gap-2">
        <div className="w-8 h-8 rounded-full border-2 border-red-500/50 flex items-center justify-center">
          <span className="text-[10px] font-bold text-red-400">
            {raw.SpeedLimit || '--'}
          </span>
        </div>
        <div className="h-[1px] w-8 bg-white/10" />
        <div className="text-[10px] font-mono text-white/40 uppercase">
          Limit Ref
        </div>
      </div>
    </div>
  );
};
