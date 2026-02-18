import React from 'react';
import { motion } from 'framer-motion';

interface ETCSSpeedDialProps {
  currentSpeed: number;
  permittedSpeed: number;
  targetSpeed: number;
  maxSpeed?: number;
  supervisionStatus?: 'normal' | 'indication' | 'warning' | 'intervention' | 'none';
}

export const ETCSSpeedDial: React.FC<ETCSSpeedDialProps> = ({
  currentSpeed,
  permittedSpeed,
  targetSpeed,
  maxSpeed = 400,
  supervisionStatus = 'normal'
}) => {
  // Configuración del dial ETCS (estilo ERA)
  // El dial suele empezar a las 7 en punto (-135 grados) y terminar a las 5 en punto (135 grados)
  const START_ANGLE = -135;
  const END_ANGLE = 135;
  const TOTAL_RANGE = END_ANGLE - START_ANGLE;

  const getAngle = (value: number) => {
    return Math.min(Math.max((value / maxSpeed) * TOTAL_RANGE + START_ANGLE, START_ANGLE), END_ANGLE);
  };

  const currentAngle = getAngle(currentSpeed);
  const permittedAngle = getAngle(permittedSpeed);
  const targetAngle = getAngle(targetSpeed);

  // Colores normativos de la ERA
  const colors = {
    none: '#9ca3af',        // Gris (Normal / Sin supervisión)
    normal: '#4ade80',      // Verde (Monitorización básica)
    indication: '#facc15',  // Amarillo (Pre-aviso / Curva de frenado activa)
    warning: '#fb923c',     // Naranja (Exceso de velocidad permitido)
    intervention: '#ef4444' // Rojo (Intervención de freno)
  };

  const statusColor = colors[supervisionStatus] || colors.none;

  return (
    <div className="relative flex items-center justify-center w-80 h-80 bg-neutral-900 rounded-xl border-4 border-neutral-800 shadow-2xl p-4 overflow-hidden">
      {/* Contenedor del Dial SVG */}
      <svg viewBox="0 0 200 200" className="w-full h-full transform">
        
        {/* Fondo oscuro del dial circular */}
        <circle cx="100" cy="100" r="95" className="fill-neutral-950" />
        
        {/* Arco de fondo (Gris oscuro) */}
        <path
          d={`M ${100 + 85 * Math.cos((START_ANGLE - 90) * Math.PI / 180)} ${100 + 85 * Math.sin((START_ANGLE - 90) * Math.PI / 180)} 
             A 85 85 0 1 1 ${100 + 85 * Math.cos((END_ANGLE - 90) * Math.PI / 180)} ${100 + 85 * Math.sin((END_ANGLE - 90) * Math.PI / 180)}`}
          fill="none"
          stroke="#262626"
          strokeWidth="10"
          strokeLinecap="butt"
        />

        {/* Arco de Supervisión (Permitted Speed Arc) */}
        <motion.path
          d={`M ${100 + 85 * Math.cos((START_ANGLE - 90) * Math.PI / 180)} ${100 + 85 * Math.sin((START_ANGLE - 90) * Math.PI / 180)} 
             A 85 85 0 ${permittedAngle - START_ANGLE > 180 ? 1 : 0} 1 
             ${100 + 85 * Math.cos((permittedAngle - 90) * Math.PI / 180)} ${100 + 85 * Math.sin((permittedAngle - 90) * Math.PI / 180)}`}
          fill="none"
          stroke={supervisionStatus === 'none' ? '#525252' : statusColor}
          strokeWidth="10"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: Math.min(permittedSpeed / maxSpeed, 1) }}
          className="transition-colors duration-300"
        />

        {/* Marcas de Velocidad */}
        {[0, 50, 100, 150, 200, 250, 300, 350, 400].map((v) => {
          const a = getAngle(v) - 90;
          return (
            <g key={v}>
              <line
                x1={100 + 75 * Math.cos(a * Math.PI / 180)}
                y1={100 + 75 * Math.sin(a * Math.PI / 180)}
                x2={100 + 85 * Math.cos(a * Math.PI / 180)}
                y2={100 + 85 * Math.sin(a * Math.PI / 180)}
                stroke="#525252"
                strokeWidth="2"
              />
              <text
                x={100 + 60 * Math.cos(a * Math.PI / 180)}
                y={100 + 60 * Math.sin(a * Math.PI / 180)}
                fill="#737373"
                fontSize="10"
                textAnchor="middle"
                alignmentBaseline="middle"
                className="font-mono"
              >
                {v}
              </text>
            </g>
          );
        })}

        {/* Speed Hook (V_perm actual) - Marcador en el borde */}
        <motion.path
          d="M 100 -85 L 105 -95 L 95 -95 Z"
          fill={statusColor}
          animate={{ rotate: permittedAngle }}
          className="origin-center"
        />

        {/* Target Speed Indicator (V_target) - Marcador interior si aplica */}
        <motion.path
          d="M 100 -70 L 103 -60 L 97 -60 Z"
          fill="#facc15"
          animate={{ rotate: targetAngle }}
          className="origin-center"
        />

        {/* Aguja de Velocidad Actual (Needle) */}
        <motion.line
          x1="100" y1="100"
          x2="100" y2="25"
          stroke="white"
          strokeWidth="3"
          animate={{ rotate: currentAngle }}
          className="origin-center"
        />
        <motion.circle
          cx="100" cy="18" r="4"
          fill="white"
          animate={{ rotate: currentAngle }}
          className="origin-center"
        />
      </svg>

      {/* Centro: Velocidad Digital */}
      <div className="absolute flex flex-col items-center justify-center">
        <span className={`text-6xl font-black font-mono tracking-tighter ${
          currentSpeed > permittedSpeed ? 'text-orange-500 animate-pulse' : 'text-white'
        }`}>
          {Math.round(currentSpeed)}
        </span>
        <div className="flex gap-2 mt-1">
          <div className="px-2 py-0.5 bg-neutral-800 rounded text-[9px] font-bold text-neutral-400 uppercase tracking-widest">
            Level 2
          </div>
          <div className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest ${
            supervisionStatus !== 'normal' ? 'bg-yellow-500/20 text-yellow-500' : 'bg-green-500/20 text-green-500'
          }`}>
            FS Mode
          </div>
        </div>
      </div>
      
      {/* Indicador de Distancia al Objetivo (Efecto DMI) */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1">
        <div className="w-1.5 h-32 bg-neutral-800 rounded-full overflow-hidden relative">
          <motion.div 
            className="absolute bottom-0 w-full bg-yellow-500"
            initial={{ height: '0%' }}
            animate={{ height: '60%' }} // Simulado
          />
        </div>
        <span className="text-[8px] font-black text-neutral-500">1254m</span>
      </div>
    </div>
  );
};
