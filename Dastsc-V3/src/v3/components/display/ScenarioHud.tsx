import React from 'react';
import { Clock, Navigation, MapPin, CheckCircle2, ChevronRight, Timer } from 'lucide-react';

interface StopProps {
  name: string;
  type: 'STOP' | 'WAYPOINT';
  dueTime: string | null;
  distance: number;
  satisfied: boolean;
  isActive?: boolean;
}

const StopRow: React.FC<StopProps> = ({ name, type, dueTime, distance, satisfied, isActive }) => {
  const isWaypoint = type === 'WAYPOINT';
  
  const formatDist = (m: number) => {
    return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
  };

  if (satisfied) {
    return (
      <div className="flex items-center gap-3 px-3 py-1.5 opacity-30">
        <CheckCircle2 className="w-3.5 h-3.5 text-green-500/60" />
        <span className="text-[11px] font-mono text-white/50 truncate w-32 uppercase tracking-tight">{name}</span>
        <div className="flex-1 border-b border-dashed border-white/5" />
        <span className="text-[10px] font-mono text-white/20 whitespace-nowrap">ARRIVED</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 px-3 py-2 border-l-2 transition-all duration-300 ${
      isActive 
        ? 'border-cyan-500 bg-cyan-500/5' 
        : isWaypoint 
          ? 'border-white/10' 
          : 'border-white/20'
    }`}>
      {isActive ? (
        <Navigation className={`w-3.5 h-3.5 ${isWaypoint ? 'text-white/40' : 'text-cyan-400'} animate-pulse`} />
      ) : (
        <MapPin className={`w-3.5 h-3.5 ${isWaypoint ? 'text-white/20' : 'text-white/40'}`} />
      )}
      
      <div className="flex flex-col min-w-0">
        <span className={`text-[12px] font-bold font-mono tracking-tighter truncate w-32 uppercase leading-none ${
          isActive ? 'text-white' : isWaypoint ? 'text-white/40' : 'text-white/70'
        }`}>
          {name}
        </span>
        {isWaypoint && (
          <span className="text-[9px] font-mono text-white/20 uppercase tracking-widest leading-none mt-1">PASSING PT</span>
        )}
      </div>

      <div className="flex-1 border-b border-dashed border-white/5 mx-1" />

      <div className="flex flex-col items-end gap-1 shrink-0">
        <div className="flex items-center gap-1">
          <Clock className={`w-3 h-3 ${isActive ? 'text-cyan-500/60' : 'text-white/20'}`} />
          <span className={`text-[11px] font-mono ${isActive ? 'text-white' : 'text-white/60'}`}>
            {dueTime || '--:--'}
          </span>
        </div>
        <div className="flex items-center gap-1">
           <Timer className="w-2.5 h-2.5 text-white/20" />
           <span className={`text-[10px] font-mono ${distance < 500 && isActive ? 'text-yellow-400' : 'text-white/30'}`}>
             {formatDist(distance)}
           </span>
        </div>
      </div>
    </div>
  );
};

export const ScenarioHud: React.FC<{ stops: any[] }> = ({ stops }) => {
  if (!stops || stops.length === 0) {
    return (
      <div className="p-4 bg-white/5 border border-white/5 rounded-sm flex-1 flex flex-col items-center justify-center gap-3">
        <Navigation className="w-6 h-6 text-white/10 animate-pulse" />
        <span className="text-[10px] font-mono text-white/20 uppercase tracking-[0.2em] text-center px-4">
          No scenario service active. Link with simulator to load timetable.
        </span>
      </div>
    );
  }

  // Filtrar las próximas 5 paradas, priorizando la actual
  const firstUnsatisfiedIndex = stops.findIndex(s => !s.satisfied);
  const displayStops = stops.slice(
    Math.max(0, firstUnsatisfiedIndex - 1), 
    Math.max(4, firstUnsatisfiedIndex + 5)
  );

  return (
    <div className="bg-white/5 border border-white/5 rounded-sm flex-1 flex flex-col overflow-hidden">
      <div className="h-8 border-b border-white/5 bg-white/2 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
          <h3 className="text-[11px] font-bold text-white/60 uppercase tracking-widest font-mono">Service Sheet</h3>
        </div>
        <span className="text-[9px] font-mono text-white/20 uppercase">Live Ops</span>
      </div>
      
      <div className="flex-1 flex flex-col overflow-y-auto scrollbar-hide py-1">
        {displayStops.map((stop, i) => (
          <StopRow
            key={`${stop.name}-${i}`}
            name={stop.name}
            type={stop.type}
            dueTime={stop.due_time}
            distance={stop.distance_m}
            satisfied={stop.satisfied}
            isActive={!stop.satisfied && i === (firstUnsatisfiedIndex >= 1 ? 1 : 0)}
          />
        ))}
      </div>

      {stops.length > displayStops.length && (
        <div className="h-6 flex items-center justify-center bg-black/20 border-t border-white/5 shrink-0 opacity-40">
           <span className="text-[9px] font-mono text-white/30 uppercase tracking-widest">
             +{stops.length - displayStops.length} more instructions
           </span>
        </div>
      )}
    </div>
  );
};
