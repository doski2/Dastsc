import React from 'react';
import { motion } from 'framer-motion';

interface SpeedGaugeProps {
  speed: number;
  maxSpeed?: number;
}

export const SpeedGauge: React.FC<SpeedGaugeProps> = ({ speed, maxSpeed = 160 }) => {
  // Calculamos el ángulo: suponemos que 0 km/h es -120 grados y maxSpeed es 120 grados
  const angle = (speed / maxSpeed) * 240 - 120;
  
  // Normalizamos el ángulo para que no se salga del dial
  const clampedAngle = Math.min(Math.max(angle, -120), 120);

  return (
    <div className="relative flex items-center justify-center w-64 h-64">
      {/* Círculo exterior (Dial) */}
      <svg viewBox="0 0 200 200" className="w-full h-full transform -rotate-90">
        {/* Fondo del arco */}
        <path
          d="M 40 100 A 60 60 0 1 1 160 100"
          fill="none"
          stroke="#1f2937"
          strokeWidth="12"
          strokeLinecap="round"
          className="transform translate-y-10"
        />
        
        {/* Arco de progreso de velocidad */}
        <motion.path
          d="M 40 100 A 60 60 0 0 1 160 100"
          fill="none"
          stroke={speed > 100 ? "#ef4444" : "#3b82f6"}
          strokeWidth="12"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: Math.min(speed / maxSpeed, 1) }}
          transition={{ type: "spring", stiffness: 50, damping: 15 }}
          className="transform translate-y-10"
        />

        {/* Marcas de graduación (opcional, para realismo) */}
        {[0, 20, 40, 60, 80, 100, 120, 140, 160].map((val) => {
          const tickAngle = (val / maxSpeed) * 240 - 210;
          return (
            <line
              key={val}
              x1="100" y1="25" x2="100" y2="35"
              stroke="#9ca3af"
              strokeWidth="2"
              transform={`rotate(${tickAngle} 100 100)`}
            />
          );
        })}
      </svg>

      {/* Aguja (Needle) */}
      <motion.div
        className="absolute w-1 h-24 bg-red-500 origin-bottom rounded-full"
        style={{ bottom: "50%", left: "calc(50% - 2px)" }}
        animate={{ rotate: clampedAngle }}
        transition={{ type: "spring", stiffness: 60, damping: 12 }}
      />

      {/* Centro de la aguja */}
      <div className="absolute w-4 h-4 bg-gray-300 rounded-full border-2 border-gray-800 shadow-lg" />

      {/* Valor numérico central */}
      <div className="absolute mt-24 text-center">
        <span className="text-5xl font-bold font-mono tracking-tighter text-white">
          {Math.round(speed)}
        </span>
        <div className="text-xs uppercase tracking-widest text-gray-400">km/h</div>
      </div>
    </div>
  );
};
