import React from 'react';
import { motion } from 'framer-motion';
import type { TelemetryData } from '../hooks/useTelemetry';

interface CriticalMetricsProps {
  data: TelemetryData | null;
}

const CriticalMetrics: React.FC<CriticalMetricsProps> = ({ data }) => {
  if (!data) return null;

  // Extraer métricas con valores por defecto
  const ammeter = data.Ammeter ?? data.AmmeterActual ?? 0;
  const trainBrake = data.TrainBrakeCylinderPressureBAR ?? 0;
  const airPipe = data.TrainBrakePipePressureBAR ?? 0;

  // Mapear colores Reactor
  const getMetricColor = (val: number, max: number) => {
    const ratio = Math.abs(val) / max;
    if (ratio > 0.8) return 'text-red-500'; 
    if (ratio > 0.5) return 'text-yellow-500';
    return 'text-blue-500'; 
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 w-full p-6 bg-neutral-900/30 border border-neutral-800 rounded-3xl backdrop-blur-xl">
      {/* Amperaje / Esfuerzo */}
      <div className="flex flex-col justify-between p-2 border-r border-neutral-800 last:border-0 px-4">
        <span className="text-[9px] uppercase font-black text-neutral-500 tracking-widest mb-2 flex items-center gap-2">
          <div className="w-1 h-1 bg-blue-500 rounded-full" /> Tractive Effort
        </span>
        <div className="flex items-baseline gap-2">
          <span className={`text-3xl font-mono font-black ${getMetricColor(ammeter, 1000)} tabular-nums`}>
            {ammeter.toFixed(0)}
          </span>
          <span className="text-[10px] font-bold text-neutral-600">kN</span>
        </div>
        <div className="w-full bg-neutral-800 h-1 rounded-full overflow-hidden mt-3">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, (Math.abs(ammeter) / 1000) * 100)}%` }}
            className={`h-full ${ammeter >= 0 ? 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 'bg-orange-500'}`}
          />
        </div>
      </div>

      {/* Cilindro de Freno */}
      <div className="flex flex-col justify-between p-2 border-r border-neutral-800 last:border-0 px-4">
        <span className="text-[9px] uppercase font-black text-neutral-500 tracking-widest mb-2 flex items-center gap-2">
           <div className="w-1 h-1 bg-orange-500 rounded-full" /> Brake Cyl
        </span>
        <div className="flex items-baseline gap-2">
          <span className={`text-3xl font-mono font-black ${trainBrake > 0.1 ? 'text-orange-500' : 'text-neutral-700'} tabular-nums`}>
            {trainBrake.toFixed(2)}
          </span>
          <span className="text-[10px] font-bold text-neutral-600">BAR</span>
        </div>
        <div className="w-full bg-neutral-800 h-1 rounded-full overflow-hidden mt-3">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, (trainBrake / 5) * 100)}%` }}
            className="h-full bg-orange-500"
          />
        </div>
      </div>

      {/* Tubería de Freno */}
      <div className="flex flex-col justify-between p-2 border-r border-neutral-800 last:border-0 px-4">
        <span className="text-[9px] uppercase font-black text-neutral-500 tracking-widest mb-2 flex items-center gap-2">
           <div className="w-1 h-1 bg-green-500 rounded-full" /> Brake Pipe
        </span>
        <div className="flex items-baseline gap-2">
          <span className={`text-3xl font-mono font-black ${airPipe > 4.5 ? 'text-green-500' : 'text-red-500'} tabular-nums`}>
            {airPipe.toFixed(2)}
          </span>
          <span className="text-[10px] font-bold text-neutral-600">BAR</span>
        </div>
        <div className="mt-2 flex items-center gap-1">
            {airPipe < 4.8 && (
                <div className="flex gap-1">
                    <span className="w-1 h-1 bg-red-500 rounded-full animate-ping" />
                    <span className="text-[8px] font-bold text-red-500">VENTING</span>
                </div>
            )}
        </div>
      </div>

      {/* AWS / Seguridad */}
      <div className="flex flex-col justify-between p-2 px-4 bg-neutral-950/40 rounded-2xl border border-neutral-800">
        <span className="text-[9px] uppercase font-black text-neutral-500 tracking-widest mb-2 flex items-center gap-2">
           Safety Systems
        </span>
        <div className="flex items-center justify-between gap-4 h-full">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center border-2 ${data.AWS === 1 ? 'bg-yellow-500/20 border-yellow-500 text-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.2)]' : 'bg-neutral-800 border-neutral-700 text-neutral-600'}`}>
                <span className="text-xs font-black">AWS</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
             <div className="flex gap-1">
                {[1,2,3,4].map(i => (
                    <div key={i} className={`w-3 h-1.5 rounded-sm ${data.DSD === 1 ? 'bg-red-500' : 'bg-neutral-800'}`} />
                ))}
             </div>
             <span className="text-[7px] font-black uppercase tracking-tighter text-neutral-600">Driver Vigilance</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CriticalMetrics;
