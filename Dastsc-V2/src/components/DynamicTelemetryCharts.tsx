import React, { useMemo } from 'react';
import { 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { motion } from 'framer-motion';

interface TelemetryHistoryProps {
  history: any[];
}

const METRIC_COLORS: Record<string, string> = {
  Ammeter: '#fbbf24',    // Ámbar para electricidad
  Regulator: '#3b82f6',  // Azul para tracción
  Brake: '#ef4444',      // Rojo para freno
  Gradient: '#10b981',   // Esmeralda para vía
  default: '#8b5cf6'      // Violeta para el resto
};

/**
 * Componente que detecta métricas numéricas automáticamente y las grafica
 * Inspirado en la filosofía "Zero-Config" de telefarming.
 */
export const DynamicTelemetryCharts: React.FC<TelemetryHistoryProps> = ({ history }) => {
  // Detectamos qué campos son numéricos basándonos en el último registro
  const numericMetrics = useMemo(() => {
    if (history.length === 0) return [];
    const lastEntry = history[history.length - 1];
    return Object.keys(lastEntry).filter(key => 
      typeof lastEntry[key] === 'number' && 
      !['timestamp', 'id', 'Speed'].includes(key) // Excluimos lo obvio
    );
  }, [history]);

  if (history.length < 2) return (
    <div className="flex items-center justify-center h-full text-neutral-600 font-mono text-[10px] uppercase">
      Capturando flujo de datos...
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
      {numericMetrics.map(metric => {
        const color = METRIC_COLORS[metric] || METRIC_COLORS.default;
        
        return (
          <div key={metric} className="bg-black/40 border border-neutral-800/50 p-4 rounded-2xl backdrop-blur-md relative overflow-hidden group hover:border-blue-500/30 transition-all duration-500 shadow-lg">
            {/* Decoración lateral de color */}
            <motion.div 
              className="absolute top-0 left-0 w-1 h-full opacity-50" 
              animate={{ backgroundColor: color }} 
            />
            
            <div className="flex justify-between items-end mb-4 relative z-10">
              <div className="flex flex-col">
                <span className="text-[8px] font-black text-neutral-500 uppercase tracking-[0.2em] mb-1">Telemetry Node</span>
                <span className="text-xs font-black uppercase tracking-widest text-white group-hover:text-blue-400 transition-colors">{metric}</span>
              </div>
              <div className="flex flex-col items-end">
                <motion.span 
                  className="text-[18px] font-mono font-bold leading-none tracking-tighter" 
                  animate={{ color: color }}
                >
                  {history[history.length - 1][metric]?.toFixed(metric === 'Gradient' ? 1 : 0)}
                  <span className="text-[10px] ml-1 opacity-50 uppercase">{metric === 'Ammeter' ? 'A' : '%'}</span>
                </motion.span>
              </div>
            </div>

            <div className="h-28 w-full relative z-10">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`gradient-${metric}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity={0.4}/>
                      <stop offset="100%" stopColor={color} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  
                  <CartesianGrid 
                    strokeDasharray="4 4" 
                    stroke="#171717" 
                    vertical={false} 
                  />
                  
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(0,0,0,0.8)', 
                      border: '1px solid #333', 
                      borderRadius: '8px',
                      fontSize: '10px',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
                    }}
                    itemStyle={{ color: color }}
                    cursor={{ stroke: '#444', strokeWidth: 1 }}
                  />
                  
                  <Area 
                    type="stepAfter" // Líneas más "técnicas" y agradables para telemetría
                    dataKey={metric} 
                    stroke={color} 
                    fillOpacity={1} 
                    fill={`url(#gradient-${metric})`} 
                    isAnimationActive={true}
                    animationDuration={1000}
                    strokeWidth={2.5}
                    // Sutil efecto de brillo
                    style={{ filter: `drop-shadow(0 0 8px ${color}33)` }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
    </div>
  );
};
