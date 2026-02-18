import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

interface PlanningObject {
  id: string;
  type: 'signal' | 'speed_limit' | 'gradient' | 'station' | 'balise';
  distance: number; // metros desde la posición actual
  value?: string | number;
}

interface ETCSPlanningAreaProps {
  objects?: PlanningObject[];
  currentSpeed?: number;
  maxPlanningDistance?: number; // Ej: 8000 metros
}

export const ETCSPlanningArea: React.FC<ETCSPlanningAreaProps> = ({
  objects = [
    { id: '1', type: 'speed_limit', distance: 1200, value: 160 },
    { id: '2', type: 'signal', distance: 2500, value: 'Stop' },
    { id: '3', type: 'gradient', distance: 3000, value: -1.2 },
    { id: '4', type: 'station', distance: 4500, value: 'Central Station' },
    { id: '5', type: 'balise', distance: 500, value: 'B01' },
  ],
  maxPlanningDistance = 4000
}) => {
  // Escala logarítmica para la distancia (estándar ETCS)
  // Permite ver con detalle lo cercano y comprimir lo lejano
  const getVerticalPos = (dist: number) => {
    // Normalizamos 0 a 100% de la altura
    // dist 0 -> 100% (fondo)
    // dist max -> 0% (techo)
    const factor = Math.log10(dist + 10) / Math.log10(maxPlanningDistance + 10);
    return 100 - (factor * 100);
  };

  const renderObjects = useMemo(() => {
    return objects.map((obj) => {
      const yPos = getVerticalPos(obj.distance);
      if (yPos < 0) return null;

      return (
        <motion.g 
          key={obj.id} 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1, y: `${yPos}%` }}
          className="transition-all duration-500"
        >
          {/* Línea horizontal de referencia */}
          <line x1="0" y1="0" x2="100" y2="0" stroke="#404040" strokeWidth="1" strokeDasharray="2,2" />
          
          {/* Icono según tipo */}
          {obj.type === 'signal' && (
            <rect x="5" y="-10" width="15" height="15" fill="#ef4444" className="stroke-white stroke-[1]" />
          )}
          {obj.type === 'speed_limit' && (
            <circle cx="12" cy="-2" r="8" className="fill-neutral-900 stroke-yellow-500 stroke-[2]" />
          )}
          {obj.type === 'gradient' && (
             <path d="M 50 -5 L 60 5 L 40 5 Z" fill={Number(obj.value) < 0 ? "#3b82f6" : "#ef4444"} />
          )}
          
          {/* Texto de valor */}
          <text x="25" y="0" fill="#a3a3a3" fontSize="10" className="font-mono font-bold">
            {obj.value} {obj.type === 'speed_limit' ? 'km/h' : ''}
          </text>
          
          {/* Distancia lateral */}
          <text x="85" y="0" fill="#525252" fontSize="8" textAnchor="end" className="font-mono">
            {obj.distance}m
          </text>
        </motion.g>
      );
    });
  }, [objects, maxPlanningDistance]);

  return (
    <div className="w-48 h-[400px] bg-neutral-900 border-2 border-neutral-800 rounded-lg overflow-hidden flex flex-col shadow-inner relative">
      {/* Cabecera del Planning Area */}
      <div className="bg-neutral-850 p-2 border-b border-neutral-700 text-center">
        <span className="text-[10px] font-black uppercase text-neutral-500 tracking-tighter">Planning Area (Zone C)</span>
      </div>

      <div className="flex-grow relative">
        {/* Escala de distancia lateral */}
        <div className="absolute right-0 h-full w-4 bg-neutral-950/50 flex flex-col justify-between text-[8px] font-mono text-neutral-600 py-1">
          <span>{maxPlanningDistance}</span>
          <span>{maxPlanningDistance / 2}</span>
          <span>0</span>
        </div>

        {/* Canvas de trazado */}
        <svg className="w-full h-full p-4" viewBox="0 0 100 100" preserveAspectRatio="none">
          {/* Línea vertical central (Vía) */}
          <line x1="50" y1="0" x2="50" y2="100" stroke="#262626" strokeWidth="2" />
          
          {/* Renderizado de objetos dinámicos */}
          <g className="objects-layer">
            {renderObjects}
          </g>

          {/* Curva de Velocidad (Perfil PASP - Static Speed Profile) */}
          <path 
            d="M 50 100 L 50 80 L 70 80 L 70 50 L 60 50 L 60 0" 
            fill="none" 
            stroke="#facc15" 
            strokeWidth="1.5"
            className="opacity-50"
          />
        </svg>

        {/* Gradiente de profundidad (Efecto cristal) */}
        <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-neutral-900 to-transparent pointer-events-none" />
      </div>

      {/* Footer con modo de visualización */}
      <div className="bg-neutral-900 p-1 flex justify-around text-[7px] font-bold text-neutral-600 border-t border-neutral-800 uppercase tracking-widest">
        <span className="text-blue-500">Grad</span>
        <span>Scale</span>
        <span>Speed</span>
      </div>
    </div>
  );
};
