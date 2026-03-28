import React, { useState, useEffect, useCallback } from 'react';
import { Clock, Navigation, MapPin, CheckCircle2, Timer, Search, X, RefreshCw } from 'lucide-react';
import { scenarioService, ScenarioListItem } from '../../services/ScenarioService';

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
          {actualArrival && actualArrival !== 'N/A' && (
            <span className="text-[9px] font-mono text-green-400/60 leading-none">ARR: {actualArrival}</span>
          )}
        </div>
        <div className="flex-1 border-b border-dashed border-white/5 mx-1" />
        <div className="flex flex-col items-end">
          <span className="text-[10px] font-mono text-white/40 whitespace-nowrap uppercase">ARRIVED</span>
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

export const ScenarioHud: React.FC<{ stops: any[]; onScenarioChanged?: () => void }> = ({ stops, onScenarioChanged }) => {
  const [showSelector, setShowSelector] = useState(false);
  const [scenarioList, setScenarioList] = useState<ScenarioListItem[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [activeScenario, setActiveScenario] = useState<ScenarioListItem | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);

  const openSelector = useCallback(async () => {
    setShowSelector(true);
    setLoading(true);
    setFilter('');
    try {
      const list = await scenarioService.getScenarioList();
      setScenarioList(list);
    } catch {
      setScenarioList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSelect = useCallback(async (id: string) => {
    setSelecting(id);
    setSelectError(null);
    const ok = await scenarioService.selectScenario(id);
    setSelecting(null);
    if (ok) {
      const found = scenarioList.find(s => s.id === id) || null;
      setActiveScenario(found);
      setShowSelector(false);
      onScenarioChanged?.();
    } else {
      setSelectError('Backend no respondió ok. Reinicia Iniciar_Nexus_V3.bat');
    }
  }, [onScenarioChanged, scenarioList]);

  const handleSetAuto = useCallback(async () => {
    await scenarioService.setAutoScenario();
    setActiveScenario(null);
    setShowSelector(false);
    onScenarioChanged?.();
  }, [onScenarioChanged]);

  const filtered = scenarioList.filter(s =>
    s.name.toLowerCase().includes(filter.toLowerCase()) ||
    s.loco.toLowerCase().includes(filter.toLowerCase()) ||
    s.service.toLowerCase().includes(filter.toLowerCase()) ||
    s.route_id.toLowerCase().includes(filter.toLowerCase())
  );

  // JSX del panel selector — inline para que React no lo desmonte en cada render
  const selectorJsx = showSelector ? (
    <div className="absolute inset-0 bg-black/97 z-50 flex flex-col p-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Select Scenario</span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSetAuto}
            className="text-[8px] font-mono text-cyan-400 border border-cyan-500/30 px-2 py-0.5 uppercase hover:bg-cyan-500/10 transition-colors"
            title="Volver a autodetección"
          >
            Auto
          </button>
          <button onClick={() => setShowSelector(false)} className="p-1 hover:bg-white/10 rounded-full transition-colors" aria-label="Cerrar">
            <X className="w-3.5 h-3.5 text-white/40 hover:text-white" />
          </button>
        </div>
      </div>

      <div className="relative mb-2">
        <Search className="absolute left-2 top-2 w-3 h-3 text-white/20" />
        <input
          autoFocus
          type="text"
          placeholder="Buscar escenario, servicio o loco..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="w-full bg-white/5 border border-white/10 py-1.5 pl-7 pr-3 text-[10px] font-mono text-white focus:outline-none focus:border-cyan-500/50 rounded-sm"
        />
      </div>

      {selectError && (
        <div className="mb-2 px-2 py-1.5 bg-red-500/10 border border-red-500/30 rounded-sm">
          <span className="text-[9px] font-mono text-red-400">{selectError}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto scrollbar-hide space-y-1">
        {loading ? (
          <div className="flex items-center justify-center py-10 gap-2">
            <RefreshCw className="w-3 h-3 text-white/20 animate-spin" />
            <span className="text-[9px] font-mono text-white/20 animate-pulse uppercase">Cargando...</span>
          </div>
        ) : filtered.length === 0 ? (
          <span className="text-[9px] font-mono text-white/20 p-4 block text-center uppercase">Sin resultados</span>
        ) : (
          filtered.map((s) => (
            <button
              key={s.id}
              disabled={selecting === s.id}
              onClick={() => handleSelect(s.id)}
              className={`w-full text-left px-3 py-2 border rounded-sm transition-colors flex items-start gap-2 group
                ${s.is_active
                  ? 'border-cyan-500/40 bg-cyan-500/5'
                  : 'border-white/5 bg-white/2 hover:bg-white/5 hover:border-white/10'
                }
                ${selecting === s.id ? 'opacity-50 cursor-wait' : ''}
              `}
            >
              {s.is_active && <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 mt-0.5 shrink-0" />}
              <div className="flex flex-col min-w-0 w-full">
                <span className={`text-[11px] font-mono truncate leading-tight ${s.is_active ? 'text-cyan-300' : 'text-white/60 group-hover:text-white/90'}`}>
                  {s.name}
                </span>
                {s.briefing && (
                  <span className="text-[8px] font-mono text-white/30 leading-snug line-clamp-2 mt-0.5">{s.briefing}</span>
                )}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {s.service && (
                    <span className="text-[8px] font-mono text-cyan-400/50 bg-cyan-500/5 border border-cyan-500/15 px-1 rounded-sm">{s.service}</span>
                  )}
                  {s.loco && <span className="text-[8px] font-mono text-white/25 truncate">{s.loco}</span>}
                  {s.start_location && (
                    <span className="text-[8px] font-mono text-white/20 truncate">@ {s.start_location}</span>
                  )}
                  {!s.has_save && (
                    <span className="text-[7px] font-mono text-white/20 border border-white/10 px-1 rounded-sm ml-auto shrink-0">UNPLAYED</span>
                  )}
                  <div className={`flex items-center gap-1.5 ${s.has_save ? 'ml-auto' : ''} shrink-0`}>
                    {s.start_time && s.start_time !== 'N/A' && (
                      <span className="text-[8px] font-mono text-white/30">{s.start_time}</span>
                    )}
                    {s.duration_mins > 0 && (
                      <span className="text-[8px] font-mono text-white/20">{s.duration_mins}min</span>
                    )}
                    {s.rating > 0 && (
                      <span className="text-[8px] font-mono text-yellow-500/40">{'★'.repeat(s.rating)}</span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  ) : null;

  // ScenarioHud recibe ScenarioStop[] ya mapeado por ScenarioService.getLiveTimetable()
  const processedStops = stops.map(stop => ({
    name: stop.name,
    type: stop.type as 'STOP' | 'WAYPOINT',
    dueTime: stop.due_time,
    actualArrival: stop.arrival_time || null,
    distance: stop.distance_m ?? -1,
    satisfied: stop.satisfied,
    isActive: stop.is_active,
  }));

  if (!processedStops || processedStops.length === 0) {
    return (
      <div className="p-4 bg-white/5 border border-white/5 rounded-sm flex-1 flex flex-col items-center justify-center gap-3 relative">
        {activeScenario ? (
          <>
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
            <div className="flex flex-col items-center gap-1 text-center px-3">
              <span className="text-[11px] font-mono text-cyan-300/70 leading-snug">{activeScenario.name}</span>
              {activeScenario.loco && (
                <span className="text-[9px] font-mono text-white/30">{activeScenario.loco}</span>
              )}
              <span className="text-[8px] font-mono text-white/15 uppercase tracking-widest mt-1">No timetable data</span>
            </div>
          </>
        ) : (
          <>
            <Navigation className="w-6 h-6 text-white/10 animate-pulse" />
            <span className="text-[10px] font-mono text-white/20 uppercase tracking-[0.2em] text-center px-4">
              No scenario service active.
            </span>
          </>
        )}
        <button
          onClick={openSelector}
          className="mt-1 px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] font-mono text-cyan-400 uppercase tracking-widest transition-colors"
        >
          {activeScenario ? 'Change Scenario' : 'Select Scenario'}
        </button>
        {selectorJsx}
      </div>
    );
  }

  // Filtrar las próximas paradas priorizando la actual
  const firstUnsatisfiedIndex = processedStops.findIndex(s => !s.satisfied);
  const displayStops = processedStops.slice(
    Math.max(0, firstUnsatisfiedIndex - 1),
    Math.max(4, firstUnsatisfiedIndex + 5)
  );

  return (
    <div className="bg-white/5 border border-white/5 rounded-sm flex-1 flex flex-col overflow-hidden relative">
      <div className="h-8 border-b border-white/5 bg-white/2 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
          <h3 className="text-[11px] font-bold text-white/60 uppercase tracking-widest font-mono">Service Sheet</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openSelector}
            className="text-[9px] font-mono text-white/30 hover:text-white/70 uppercase border border-white/10 hover:border-white/20 px-1.5 py-0.5 rounded transition-colors"
          >
            Switch
          </button>
          <span className="text-[9px] font-mono text-white/20 uppercase">Live Ops</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-y-auto scrollbar-hide py-1">
        {displayStops.map((stop, i) => (
          <StopRow
            key={`${stop.name}-${i}`}
            name={stop.name}
            type={stop.type}
            dueTime={stop.dueTime}
            actualArrival={stop.actualArrival}
            distance={stop.distance}
            satisfied={stop.satisfied}
            isActive={stop.isActive}
          />
        ))}
      </div>

      {processedStops.length > displayStops.length && (
        <div className="h-6 flex items-center justify-center bg-black/20 border-t border-white/5 shrink-0 opacity-40">
          <span className="text-[9px] font-mono text-white/30 uppercase tracking-widest">
            +{processedStops.length - displayStops.length} more instructions
          </span>
        </div>
      )}

      {selectorJsx}
    </div>
  );
};
