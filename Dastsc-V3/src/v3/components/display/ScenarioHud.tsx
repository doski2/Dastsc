import React, { useState, useEffect } from 'react';
import { Clock, Navigation, MapPin, CheckCircle2, ChevronRight, Timer, Search, X } from 'lucide-react';
import axios from 'axios';

interface StopProps {
  name: string;
  type: 'STOP' | 'WAYPOINT';
  dueTime: string | null;
  actualArrival?: string | null; // Nuevo: Tiempo real detectado en el save
  distance: number;
  satisfied: boolean;
  isActive?: boolean;
}

const StopRow: React.FC<StopProps> = ({ name, type, dueTime, actualArrival, distance, satisfied, isActive }) => {
  const isWaypoint = type === 'WAYPOINT';
  
  const formatDist = (m: number) => {
    if (m < 0) return '---';
    return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
  };

  // Lógica para calcular retraso si tenemos hora prevista y real
  const getDelay = () => {
    if (!dueTime || !actualArrival) return null;
    try {
      const [h1, m1, s1] = dueTime.split(':').map(Number);
      const [h2, m2, s2] = actualArrival.split(':').map(Number);
      const t1 = h1 * 3600 + m1 * 60 + s1;
      const t2 = h2 * 3600 + m2 * 60 + s2;
      const diff = Math.floor((t2 - t1) / 60);
      return diff;
    } catch { return null; }
  };

  const delay = getDelay();

  if (satisfied) {
    return (
      <div className="flex items-center gap-3 px-3 py-1.5 opacity-40">
        <CheckCircle2 className="w-3.5 h-3.5 text-green-500/80" />
        <div className="flex flex-col min-w-0">
          <span className="text-[11px] font-mono text-white/50 truncate w-32 uppercase tracking-tight">{name}</span>
          {actualArrival && (
            <span className="text-[9px] font-mono text-green-400/60 leading-none">ARR: {actualArrival}</span>
          )}
        </div>
        <div className="flex-1 border-b border-dashed border-white/5 mx-1" />
        <div className="flex flex-col items-end">
          <span className="text-[10px] font-mono text-white/40 whitespace-nowrap">ARRIVED</span>
          {delay !== null && delay > 0 && (
            <span className="text-[9px] font-mono text-red-400/50">+{delay}m LATE</span>
          )}
        </div>
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
           <Timer className={`w-2.5 h-2.5 ${distance < 1000 && isActive ? 'text-cyan-500/60' : 'text-white/20'}`} />
           <span className={`text-[10px] font-mono ${distance < 500 && isActive ? 'text-yellow-400' : 'text-white/30'}`}>
             {formatDist(distance)}
           </span>
        </div>
      </div>
    </div>
  );
};

export const ScenarioHud: React.FC<{ stops: any[] }> = ({ stops }) => {
  const [showManualSelector, setShowManualSelector] = useState(false);
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (showManualSelector) {
      setLoading(true);
      // Backend corre en el puerto 8000, no en el 5000
      axios.get('http://localhost:8000/scenarios')
        .then(res => setScenarios(res.data))
        .catch(err => {
          console.error('Error fetching scenarios:', err);
          // Intentar fallback si el endpoint no responde
          setScenarios([]);
        })
        .finally(() => setLoading(false));
    }
  }, [showManualSelector]);

  const filteredScenarios = scenarios.filter(s => 
    s.name.toLowerCase().includes(filter.toLowerCase())
  );

  if (!stops || stops.length === 0) {
    return (
      <div className="p-4 bg-white/5 border border-white/5 rounded-sm flex-1 flex flex-col items-center justify-center gap-3 relative">
        <Navigation className="w-6 h-6 text-white/10 animate-pulse" />
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] font-mono text-white/20 uppercase tracking-[0.2em] text-center px-4">
            No scenario service active.
          </span>
          <button 
            onClick={() => setShowManualSelector(true)}
            className="mt-2 px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] font-mono text-cyan-400 uppercase tracking-widest transition-colors"
          >
            Select Scenario Manually
          </button>
        </div>

        {showManualSelector && (
          <div className="absolute inset-0 bg-black/95 z-50 flex flex-col p-4">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Select Route Service</span>
              <button 
                onClick={() => setShowManualSelector(false)}
                title="Close selector"
                aria-label="Close scenario selector"
                className="p-1 hover:bg-white/10 rounded-full transition-colors"
              >
                <X className="w-4 h-4 text-white/40 hover:text-white" />
              </button>
            </div>
            
            <div className="relative mb-3">
              <Search className="absolute left-2 top-2 w-3.5 h-3.5 text-white/20" />
              <input 
                autoFocus
                type="text"
                placeholder="SEARCH SCENARIO..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-sm py-1.5 pl-8 pr-3 text-[10px] font-mono text-white focus:outline-none focus:border-cyan-500/50 uppercase"
              />
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-hide space-y-1">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <span className="text-[9px] font-mono text-white/20 animate-pulse">INDEXING CONTENT...</span>
                </div>
              ) : filteredScenarios.length > 0 ? (
                filteredScenarios.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => {
                        console.log("Selected:", s.name);
                        // Emitir evento para que App.tsx o el servicio sepa que el escenario cambió
                        window.dispatchEvent(new CustomEvent('SCENARIO_MANUAL_SELECT', { 
                          detail: { 
                            scenario_path: s.path,
                            route_id: s.route_id,
                            scenario_id: s.id
                          } 
                        }));
                        setShowManualSelector(false);
                    }}
                    className="w-full text-left px-3 py-2 bg-white/2 hover:bg-white/5 border border-white/5 rounded-sm transition-colors flex flex-col group"
                  >
                    <span className="text-[11px] font-mono text-white/60 group-hover:text-cyan-400 truncate">{s.name}</span>
                    <span className="text-[8px] font-mono text-white/20 truncate">{s.route_id}</span>
                  </button>
                ))
              ) : (
                <span className="text-[9px] font-mono text-white/20 p-4 block text-center uppercase">No scenarios found</span>
              )}
            </div>
          </div>
        )}
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
          {(!stops || stops.length === 0) ? (
            <button 
              onClick={() => {
                console.log("HUD: Opening Manual Selector");
                setShowManualSelector(true);
              }}
              className="group flex items-center gap-2 hover:bg-white/5 px-2 py-1 rounded transition-colors"
              title="Click to select scenario manually"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
              <h3 className="text-[11px] font-bold text-yellow-500/80 uppercase tracking-widest font-mono group-hover:text-yellow-400">Select Scenario</h3>
            </button>
          ) : (
            <>
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
              <h3 className="text-[11px] font-bold text-white/60 uppercase tracking-widest font-mono">Service Sheet</h3>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {stops && stops.length > 0 && (
            <button 
              onClick={() => setShowManualSelector(true)}
              className="text-[9px] font-mono text-white/20 hover:text-white/60 uppercase border border-white/10 px-1.5 rounded"
            >
              Switch
            </button>
          )}
          <span className="text-[9px] font-mono text-white/20 uppercase">Live Ops</span>
        </div>
      </div>
      
      <div className="flex-1 flex flex-col overflow-y-auto scrollbar-hide py-1">
        {(!stops || stops.length === 0) ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center opacity-30">
            <span className="text-[10px] font-mono text-white uppercase tracking-widest mb-2">No Active Service</span>
            <p className="text-[9px] font-mono text-white/60 leading-tight">USE THE SELECTOR ABOVE TO LOAD DATA MANUALLY</p>
          </div>
        ) : (
          displayStops.map((stop, i) => (
            <StopRow
              key={`${stop.name}-${i}`}
              name={stop.name}
              type={stop.type}
              dueTime={stop.due_time}
              actualArrival={stop.actual_arrival}
              distance={stop.distance_m}
              satisfied={stop.satisfied}
              isActive={!stop.satisfied && i === (firstUnsatisfiedIndex >= 0 && firstUnsatisfiedIndex < displayStops.length ? (firstUnsatisfiedIndex >= 1 ? 1 : 0) : 0)}
            />
          ))
        )}
      </div>

      {stops && stops.length > displayStops.length && (
        <div className="h-6 flex items-center justify-center bg-black/20 border-t border-white/5 shrink-0 opacity-40">
           <span className="text-[9px] font-mono text-white/30 uppercase tracking-widest">
             +{stops.length - displayStops.length} more instructions
           </span>
        </div>
      )}
    </div>
  );
};
