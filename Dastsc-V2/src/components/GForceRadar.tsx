import React from 'react';
import { motion } from 'framer-motion';

interface GForceRadarProps {
  longitudinal: number;
  lateral: number;
}

export const GForceRadar: React.FC<GForceRadarProps> = ({ longitudinal, lateral }) => {
  // Escalado visual: un valor de 0.2G debería estar cerca del borde
  // Representaremos hasta 0.25G
  const MAX_G = 0.25;

  const x = Math.min(Math.max(lateral / MAX_G, -1), 1) * 45; // % desde el centro
  const y = Math.min(Math.max(-longitudinal / MAX_G, -1), 1) * 45; // % desde el centro (Y invertida para HUD)

  return (
    <div className="relative w-40 h-40 bg-neutral-900/80 rounded-full border border-neutral-800 flex items-center justify-center overflow-hidden shadow-2xl group">
      {/* Guías de referencia (Círculos concéntricos) */}
      <div className="absolute inset-2 border border-neutral-800/50 rounded-full" />
      <div className="absolute inset-6 border border-neutral-800/30 rounded-full" />
      <div className="absolute inset-10 border border-neutral-700/20 rounded-full" />
      
      {/* Ejes (Cruz) */}
      <div className="absolute w-full h-[1px] bg-neutral-800/50" />
      <div className="absolute h-full w-[1px] bg-neutral-800/50" />

      {/* Etiquetas Axis */}
      <div className="absolute top-1 text-[8px] font-bold text-neutral-600 uppercase tracking-widest">Acel</div>
      <div className="absolute bottom-1 text-[8px] font-bold text-neutral-600 uppercase tracking-widest">Brk</div>
      <div className="absolute right-1 text-[8px] font-bold text-neutral-600 uppercase tracking-widest">R</div>
      <div className="absolute left-1 text-[8px] font-bold text-neutral-600 uppercase tracking-widest">L</div>

      {/* La "Bola" de G-Force */}
      <motion.div
        className={`relative w-3 h-3 rounded-full flex items-center justify-center ${
          Math.abs(lateral) > 0.12 || Math.abs(longitudinal) > 0.12 
          ? 'bg-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.8)]' 
          : 'bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.5)]'
        }`}
        animate={{
          x: `${x}%`,
          y: `${y}%`
        }}
        transition={{ type: "spring", stiffness: 150, damping: 25 }}
      >
        <div className="w-1 h-1 bg-white rounded-full opacity-50" />
      </motion.div>

      {/* Rastro (opcional, podrías añadir una línea desde el centro) */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20">
        <motion.line
           x1="50%" y1="50%"
           x2={`${50 + x/2}%`} y2={`${50 + y/2}%`} // Aproximación
           stroke="currentColor"
           strokeWidth="1"
           className={Math.abs(lateral) > 0.12 ? 'text-orange-500' : 'text-blue-500'}
        />
      </svg>
    </div>
  );
};
