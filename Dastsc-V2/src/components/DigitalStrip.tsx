import React from 'react';
import { motion } from 'framer-motion';

interface DigitalStripProps {
  value: number; // -100 to 100 (Negative: Braking, Positive: Traction)
  label: string;
}

export const DigitalStrip: React.FC<DigitalStripProps> = ({ value, label }) => {
  // Aseguramos que el valor esté entre -100 y 100
  const clampedValue = Math.min(Math.max(value, -100), 100);
  
  // Si el valor es positivo (Tracción), crece hacia arriba desde el centro
  // Si es negativo (Freno), crece hacia abajo desde el centro
  const isTraction = clampedValue >= 0;
  const heightPercent = Math.abs(clampedValue);

  return (
    <div className="flex flex-col items-center gap-2 h-48">
      <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-tighter">{label}</div>
      <div className="relative w-4 flex-grow bg-neutral-800/50 rounded-full border border-neutral-700/50 overflow-hidden shadow-inner">
        {/* Línea central de referencia */}
        <div className="absolute top-1/2 left-0 w-full h-[1px] bg-neutral-600 z-10" />
        
        {/* Barra de Tracción / Freno */}
        <motion.div
          className={`absolute left-0 w-full rounded-sm ${isTraction ? 'bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]' : 'bg-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.5)]'}`}
          initial={false}
          animate={{
            height: `${heightPercent}%`,
            top: isTraction ? `${50 - heightPercent}%` : '50%',
          }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
          style={{
            // Ajuste visual para que la barra de tracción suba desde el centro
            top: isTraction ? 'auto' : '50%',
            bottom: isTraction ? '50%' : 'auto'
          }}
        />
      </div>
      <div className={`text-[10px] font-mono font-bold ${isTraction ? 'text-blue-400' : 'text-orange-400'}`}>
        {Math.round(clampedValue)}%
      </div>
    </div>
  );
};
