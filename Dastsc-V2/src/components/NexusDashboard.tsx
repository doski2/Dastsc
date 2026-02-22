import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTelemetry } from '../hooks/useTelemetry';
import { 
  WifiOff,
  ChevronRight,
  Activity,
  AlertTriangle,
  Bell,
  History,
  PowerOff,
  Wifi,
  Train
} from 'lucide-react';

export const NexusDashboard: React.FC = () => {
  const { data, isConnected, sendMessage } = useTelemetry();
  const [time, setTime] = useState(new Date());
  const [activeTab, setActiveTab] = useState('PILOT');

  // Función para obtener valores mapeados por el perfil
  const getMappedValue = useCallback((key: string, defaultValue: any) => {
    const mapping = data?.active_profile?.mappings?.[key];
    if (mapping && data?.[mapping] !== undefined) {
      return data[mapping];
    }
    // Fallback al nombre de la clave por defecto
    return data?.[key] ?? defaultValue;
  }, [data]);

  // Lógica de "Esperando Cola" (Odrómetro)
  const [waitingForClearance, setWaitingForClearance] = useState(false);
  const [distanceTravelled, setDistanceTravelled] = useState(0);
  const [lastNextLimitDist, setLastNextLimitDist] = useState(0);
  const [lastSimTime, setLastSimTime] = useState(0);
  const [effectiveLimit, setEffectiveLimit] = useState(0);
  const [trainLength, setTrainLength] = useState(61.0);
  const [trainMass, setTrainMass] = useState(0);

  // Historial de Logs
  const [logs, setLogs] = useState<{id: number, time: string, message: string, type: string}[]>([
    { id: 1, time: new Date().toLocaleTimeString().slice(0, 5), message: "Panel Nexus inicializado", type: "info" },
    { id: 2, time: new Date().toLocaleTimeString().slice(0, 5), message: "Link de telemetría estable", type: "info" }
  ]);

  // Historial de Trenes Recientes
  const [recentTrains, setRecentTrains] = useState<{id: string, name: string, color: string}[]>(() => {
    try {
      const saved = localStorage.getItem('nexus_recent_trains');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // Sync recent trains
  useEffect(() => {
    const profile = data?.active_profile;
    if (profile && profile.id && profile.name) {
      const profileId = profile.id;
      const profileName = profile.name;
      const profileColor = profile.visuals?.color || '#4ef2ff';

      setRecentTrains(prev => {
        if (prev.length > 0 && prev[0].id === profileId) return prev;
        
        // Log profile detection
        setLogs(l => [...l.slice(-20), { 
          id: Date.now(), 
          time: new Date().toLocaleTimeString().slice(0, 5), 
          message: `Perfil activo: ${profileName}`, 
          type: 'info' 
        }]);

        const filtered = prev.filter(t => t.id !== profileId);
        const newList = [{ id: profileId, name: profileName, color: profileColor }, ...filtered].slice(0, 5);
        localStorage.setItem('nexus_recent_trains', JSON.stringify(newList));
        return newList;
      });
    }
  }, [data?.active_profile?.id, data?.active_profile?.name, data?.active_profile?.visuals?.color]);

  // Log connection status changes
  useEffect(() => {
    setLogs(l => [...l.slice(-20), { 
      id: Date.now() + 1, 
      time: new Date().toLocaleTimeString().slice(0, 5), 
      message: isConnected ? "Enlace de datos restaurado" : "Error de enlace con el simulador", 
      type: isConnected ? 'info' : 'warn' 
    }]);
  }, [isConnected]);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    const handleKeyDown = (e: KeyboardEvent) => {
      const keys = ['1', '2', '3', '4', '5', '6', '7', '8'];
      const tabs = ['MAIN', 'PILOT', 'TELEMETRY', 'SYSTEM', 'SAFETY', 'CONFIG', 'LOGS', 'EXIT'];
      if (keys.includes(e.key)) setActiveTab(tabs[keys.indexOf(e.key)]);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearInterval(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Memotización de constantes y factores de conversión
  const speedoType = useMemo(() => Number(data?.SpeedoType || 1), [data?.SpeedoType]);
  const speedUnit = useMemo(() => speedoType === 2 ? 'Km/h' : 'Mph', [speedoType]);
  const speedFactor = useMemo(() => speedoType === 2 ? 3.6 : 2.23694, [speedoType]);
  const brandColor = useMemo(() => data?.active_profile?.visuals?.color || '#4ef2ff', [data?.active_profile?.visuals?.color]);

  // Métricas de Tracción robustas
  const ammeter = useMemo(() => Number(getMappedValue('ammeter', getMappedValue('current', data?.TractiveEffort || data?.Ammeter || 0))), [getMappedValue, data]);
  const isElectric = useMemo(() => data?.Pantograph !== undefined || data?.LineVolts !== undefined || data?.active_profile?.mappings?.ammeter, [data]);
  const isDiesel = useMemo(() => data?.FuelLevel !== undefined || data?.active_profile?.mappings?.effort, [data]);
  const powerLabel = useMemo(() => isElectric ? "Amps" : (isDiesel ? "Traction" : "Effort"), [isElectric, isDiesel]);
  const powerUnitLabel = useMemo(() => isElectric ? "A" : (isDiesel ? "kN" : "%"), [isElectric, isDiesel]);

  // Normalización de Esfuerzo
  const effortNormalised = useMemo(() => {
    const isAmmeterProfileMapped = !!data?.active_profile?.mappings?.ammeter;
    const maxAmmeterValue = Number(data?.active_profile?.specs?.max_ammeter) || 100;
    return (isAmmeterProfileMapped || ammeter > 101) 
      ? (Math.abs(ammeter) / maxAmmeterValue) * 100 
      : Math.abs(ammeter);
  }, [ammeter, data?.active_profile]);

  // Lógica de Velocidad Unificada
  const speed = useMemo(() => {
    const cabSpeed = (data?.CabSpeed !== undefined && data.CabSpeed !== 0) ? Number(data.CabSpeed) : null;
    const rawSpeedMPS = Number(data?.CurrentSpeed !== undefined ? data.CurrentSpeed : 0);
    const dataSpeedConverted = Number(data?.Speed || 0);
    return cabSpeed !== null ? cabSpeed : (rawSpeedMPS > 0 ? (rawSpeedMPS * speedFactor) : dataSpeedConverted);
  }, [data, speedFactor]);

  const rawTrackLimit = Number(data?.CurrentSpeedLimit || 120);
  const nextLimitVal = Number(data?.NextSpeedLimitSpeed || 0);
  const nextLimitDistRaw = Number(data?.NextSpeedLimitDistance || 0);
  // Conversión a metros: si es un valor pequeño (probablemente KM), multiplicar por 1000
  const nextLimitDist = nextLimitDistRaw < 40 ? nextLimitDistRaw * 1000 : nextLimitDistRaw;
  
  const acceleration = Number(data?.Acceleration || 0);
  const temperature = Number(data?.Temperature || 42.5);
  const gradient = Number(data?.Gradient || 0);
  const brakeCyl = Number(getMappedValue('brake_cylinder', data?.TrainBrakeCylinderPressureBAR || 0));
  const trainPipe = Number(getMappedValue('train_pipe', data?.TrainPipePressureBAR || 0));
  const targetSpeed = effectiveLimit > 0 ? effectiveLimit : rawTrackLimit;

  // Dial Max Speed
  const maxDialSpeed = useMemo(() => {
    const profileMax = Number(data?.active_profile?.specs?.max_speed);
    return (profileMax && profileMax > 0) ? profileMax : (Number(data?.MaxSpeed) > 0 ? Number(data?.MaxSpeed) : 250);
  }, [data?.active_profile?.specs?.max_speed, data?.MaxSpeed]);

  // Odrómetro y Lógica de Cola Optimizada
  useEffect(() => {
    const currentNextDist = Number(data?.NextSpeedLimitDistance || 0);
    const currentSpeedMS = Number(data?.CurrentSpeed || (Number(data?.Speed || 0) / speedFactor));
    const simTime = Number(data?.SimulationTime || 0);
    const currentLimit = Number(data?.CurrentSpeedLimit || 0);
    const nextLimitSpeed = Number(data?.NextSpeedLimitSpeed || 0);

    // Sync train data
    if (data?.TrainLength && Math.abs(Number(data.TrainLength) - trainLength) > 0.5 && !waitingForClearance) {
      setTrainLength(Number(data.TrainLength));
    }
    if (data?.TrainMass && Math.abs(Number(data.TrainMass) - trainMass) > 0.1) {
      setTrainMass(Number(data.TrainMass));
    }

    if (effectiveLimit === 0 && currentLimit > 0) setEffectiveLimit(currentLimit);

    // Logic for sequence triggers
    if (lastNextLimitDist < 15 && currentNextDist > 100) {
      if (nextLimitSpeed > currentLimit) {
        setWaitingForClearance(true);
        setDistanceTravelled(0);
        setEffectiveLimit(currentLimit);
      } else {
        setWaitingForClearance(false);
        setEffectiveLimit(currentLimit);
      }
    }

    if (currentLimit < effectiveLimit) {
      setEffectiveLimit(currentLimit);
      if (waitingForClearance) {
        setWaitingForClearance(false);
        setDistanceTravelled(0);
      }
    }

    // Accumulate distance
    if (waitingForClearance) {
      const dt = lastSimTime > 0 ? simTime - lastSimTime : 0.05;
      if (dt > 0 && dt < 1) {
        setDistanceTravelled(prev => {
          const newDist = prev + (Math.abs(currentSpeedMS) * dt);
          if (newDist >= trainLength) {
            setWaitingForClearance(false);
            setEffectiveLimit(currentLimit);
            return 0;
          }
          return newDist;
        });
      }
    }

    setLastNextLimitDist(currentNextDist);
    setLastSimTime(simTime);
  }, [data, speedFactor, trainLength, waitingForClearance, lastNextLimitDist, lastSimTime, effectiveLimit]);

  // Safety Systems
  const aws = Number(getMappedValue('aws', data?.AWS || 0)) || (Number(getMappedValue('aws_warning', data?.AWSWarning || 0)) > 0 || Number(data?.AWSWarnCount || 0) > 0 || Number(data?.AWSWarnAudio || 0) > 0 ? 2 : 0);
  const dsd = Number(getMappedValue('dsd', data?.DSD || 0)) || Number(getMappedValue('vigil_alarm', data?.VigilAlarm || 0)) || Number(data?.Vigilance || 0) || Number(data?.DVDAlarm || 0);
  const dra = Number(getMappedValue('dra', data?.DRA || 0));
  const emergency = Number(getMappedValue('emergency_brake', data?.EmergencyBrake || 0));
  
  // Combined Control Logic
  const isCombined = !!data?.active_profile?.controls?.combined_control;
  const combinedValue = isCombined ? Number(getMappedValue('combined_control', 0)) : 0;

  // Velocidad estimada en 10 segundos basada en aceleración actual
  const estimatedSpeed = Math.max(0, speed + (acceleration * speedFactor * 10));
  
  // Supervision Logic
  const isOverSpeed = speed > targetSpeed + 2;

  // Log Critical Systems
  useEffect(() => {
    if (emergency > 0.5) {
      setLogs(l => [...l.slice(-20), { 
        id: Date.now() + 2, 
        time: new Date().toLocaleTimeString().slice(0, 5), 
        message: "¡FRENO DE EMERGENCIA APLICADO!", 
        type: 'error' 
      }]);
    }
  }, [emergency > 0.5]);

  useEffect(() => {
    if (dsd > 0.5) {
      setLogs(l => [...l.slice(-20), { 
        id: Date.now() + 3, 
        time: new Date().toLocaleTimeString().slice(0, 5), 
        message: "ALERTA HOMBRE MUERTO (DSD)", 
        type: 'warn' 
      }]);
    }
  }, [dsd > 0.5]);

  // Signal Logic
  const sigStateRaw = Number(data?.NextSignalState ?? -1);
  const sigDist = (Number(data?.DistanceToNextSignal ?? -1) * (Number(data?.DistanceToNextSignal) < 40 && Number(data?.DistanceToNextSignal) > 0 ? 1000 : 1));
  const sigInternal = Number(data?.InternalAspect ?? -1);
  const restrState = Number(data?.RestrictiveState ?? -1);
  const restrDist = (Number(data?.RestrictiveDistance ?? -1) * (Number(data?.RestrictiveDistance) < 40 && Number(data?.RestrictiveDistance) > 0 ? 1000 : 1));
  
  // Lógica de Señal Inteligente
  let currentSigState = sigStateRaw;
  let displaySigDist = sigDist;

  if ((sigStateRaw === 3 || sigStateRaw === -1) && restrState >= 0) {
    currentSigState = restrState;
    displaySigDist = restrDist;
  } else if (sigInternal >= 0) {
    currentSigState = sigInternal;
  }
  
  const getSignalMeta = useCallback((state: number) => {
    const colors: Record<number, { color: string; label: string }> = {
      0: { color: "#ef4444", label: "PELIGRO / ALTO" },
      1: { color: "#fbbf24", label: "PRECAUCIÓN" },
      2: { color: "#f59e0b", label: "PRECAUCIÓN AV." },
      3: { color: "#10b981", label: "VÍA LIBRE" },
      4: { color: "#3b82f6", label: "MANIOBRA / FLASH" },
      10: { color: "#fbbf24", label: "AMARILLO FLASH" },
      11: { color: "#f59e0b", label: "D. AMARILLO FLASH" },
    };
    
    if (restrState === state) {
       if (state === 3) return colors[0];
       if (state === 2) return colors[2];
       if (state === 1) return colors[1];
    }
    return colors[state] || { color: "#4b5563", label: state >= 0 ? `ESTADO ${state}` : "SIN DATOS" };
  }, [restrState]);

  const signalMeta = useMemo(() => getSignalMeta(currentSigState), [getSignalMeta, currentSigState]);
  
  const hasSignalData = currentSigState >= 0;
  const showSensorAlert = !hasSignalData && aws > 0.5 && speed > 1.0;

  const getTapePosition = useCallback((distance: number): number => {
    const clamped = Math.min(Math.max(distance, 0), 8000);
    if (clamped <= 3000) {
      return (clamped / 3000) * 50;
    }
    return 50 + ((clamped - 3000) / 5000) * 50;
  }, []);

  // Handle EXIT
  useEffect(() => {
    if (activeTab === 'EXIT') {
      window.confirm("¿Cerrar Nexus DMI?") ? window.close() : setActiveTab('PILOT');
    }
  }, [activeTab]);

  return (
    <div className="h-screen w-screen bg-[#030514] text-[#f5f6fb] overflow-hidden font-sans selection:bg-[#4ef2ff]/30 p-4">
      {/* Indicador de Desconexión */}
      {!isConnected && (
        <div className="absolute top-0 left-0 w-full h-1 bg-amber-500/50 z-[100] animate-pulse" />
      )}
      
      {/* Background Decorative Elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[#4ef2ff]/10 rounded-full blur-[150px] -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[#ffa547]/5 rounded-full blur-[120px] translate-y-1/2 -translate-x-1/4" />
        <div className="absolute inset-0 nexus-dots" />
      </div>

      <div className="relative h-full flex flex-col gap-4">
        
        {/* MODERNISED NAV TABS (Fixed spacing and visibility) */}
        <div className="flex items-center gap-1 bg-[#060c1b] p-1.5 rounded-xl border border-white/5 shadow-2xl mx-1 overflow-x-auto no-scrollbar">
          {['MAIN', 'PILOT', 'TELEMETRY', 'SYSTEM', 'SAFETY', 'CONFIG', 'LOGS', 'EXIT'].map((label, idx) => (
            <button 
              key={label}
              onClick={() => setActiveTab(label)}
              className={`flex-grow min-w-[90px] h-10 px-3 rounded-lg text-[10px] font-black tracking-[0.15em] transition-all relative flex items-center justify-center gap-2 group whitespace-nowrap ${
                activeTab === label 
                  ? 'bg-[#4ef2ff]/10 text-[#4ef2ff] shadow-[inset_0_0_10px_rgba(78,242,255,0.1)] border border-[#4ef2ff]/20' 
                  : 'text-neutral-500 hover:text-neutral-200 hover:bg-white/5 border border-transparent'
              }`}
            >
              {activeTab === label && (
                <motion.div 
                  layoutId="activeTab" 
                  className="absolute bottom-1 left-3 right-3 h-0.5 bg-[#4ef2ff] rounded-full shadow-[0_0_12px_#4ef2ff]" 
                />
              )}
              <span className={`text-[8px] font-mono opacity-40 group-hover:opacity-100 ${activeTab === label ? 'text-[#4ef2ff] opacity-100' : ''}`}>{idx + 1}</span>
              <span className="uppercase">{label}</span>
            </button>
          ))}
        </div>

        {/* TOP STATUS BAR */}
        <header className="flex justify-between items-center px-6 py-3 glass-panel rounded-2xl border border-white/5 shadow-2xl mt-0">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#4ef2ff] shadow-[0_0_12px_rgba(78,242,255,0.8)]" />
              <span className="text-xs font-black tracking-[0.2em] uppercase italic bg-gradient-to-r from-[#4ef2ff] to-[#60a5fa] bg-clip-text text-transparent">Nexus Link v3.1</span>
            </div>
            <div className="h-4 w-px bg-white/10" />
            <div className="flex gap-4 text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
              <span>Driver: <span className="text-white">D-102</span></span>
              <span>Vehicle: <span className="text-[#4ef2ff]">{data?.active_profile?.name || 'GENERIC TRAIN'}</span></span>
              <div className="w-px h-3 bg-white/10" />
              <span>L: <span className="text-white">{trainLength.toFixed(0)}m</span></span>
              <span>M: <span className="text-white">{trainMass > 0 ? `${trainMass.toFixed(0)}t` : '---'}</span></span>
            </div>
          </div>

          <div className="flex items-center gap-6">
             <div className="flex flex-col items-end">
                <span className="text-[10px] font-black text-[#4ef2ff] tracking-tighter uppercase">Link Status</span>
                <span className="text-xs font-bold text-emerald-500">SYNCHRONIZED</span>
             </div>
             <div className="h-8 w-px bg-white/10" />
             <div className="flex items-center gap-4">
                <div className="flex flex-col items-end">
                   <span className="text-[10px] text-[#f5f6fb]/60 font-bold">{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                   <span className="text-[8px] text-[#f5f6fb]/40 uppercase font-black tracking-widest leading-none">Local Time</span>
                </div>
                {isConnected ? <Wifi size={16} className="text-[#4ef2ff]" /> : <WifiOff size={16} className="text-[#ff5656]" />}
             </div>
          </div>
        </header>

        {/* MAIN COCKPIT AREA */}
        <div className="flex-grow flex flex-col gap-4 overflow-hidden">
          
          {activeTab === 'MAIN' && (
            <div className="col-span-12 grid grid-cols-12 gap-6 p-4">
              {/* Profile Selector Section */}
              <div className="col-span-12 glass-panel rounded-3xl p-8 border border-white/5 shadow-2xl overflow-hidden relative">
                <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                  <Activity size={120} className="text-[#4ef2ff]" />
                </div>
                
                <div className="relative z-10">
                  <h2 className="text-3xl font-black uppercase tracking-tighter mb-2 reactor-glow">Train Profile Selector</h2>
                  <p className="text-neutral-500 text-xs font-bold uppercase tracking-widest mb-8">Manual override for vehicle mapping & logic</p>
                  
                  {/* QUICK ACCESS (RECENT TRAINS) */}
                  <div className="mb-8">
                    <h3 className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] mb-4 flex items-center gap-2">
                       <Train size={14} className="text-[#4ef2ff]" /> Quick Access (Recent)
                    </h3>
                    <div className="grid grid-cols-5 gap-3">
                       {recentTrains.map((train, i) => (
                         <motion.button
                           key={`recent-${train.id}-${i}`}
                           whileHover={{ scale: 1.02 }}
                           whileTap={{ scale: 0.98 }}
                           onClick={() => sendMessage({ type: 'SELECT_PROFILE', profile_id: train.id })}
                           className={`p-4 rounded-xl border flex flex-col items-start gap-2 relative overflow-hidden transition-all ${
                             data?.active_profile?.id === train.id 
                             ? 'bg-white/10 border-white/20 shadow-[0_0_20px_rgba(255,255,255,0.05)]' 
                             : 'bg-white/5 border-white/5 hover:border-white/20'
                           }`}
                         >
                            <div className="flex items-center gap-2 w-full">
                               <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: train.color, boxShadow: `0 0 8px ${train.color}` }} />
                               <span className="text-[11px] font-black text-white truncate uppercase tracking-tighter flex-grow text-left">
                                 {train.name.replace('.json', '').replace('_expert', '')}
                               </span>
                            </div>
                            {data?.active_profile?.id === train.id && (
                              <div className="absolute top-0 right-0 px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[6px] font-black uppercase rounded-bl-lg">Active</div>
                            )}
                         </motion.button>
                       ))}
                       {recentTrains.length === 0 && (
                         <div className="col-span-5 py-4 text-center text-[10px] text-neutral-600 font-bold uppercase tracking-widest bg-white/5 rounded-xl border border-dashed border-white/5">
                            Waiting for deployment history...
                         </div>
                       )}
                    </div>
                  </div>

                  <div className="w-full h-px bg-white/5 mb-8" />

                  <div className="grid grid-cols-4 gap-4 max-h-[500px] overflow-y-auto pr-4 custom-scrollbar min-h-[200px]">
                    {/* Botón Auto-Detect */}
                    <button 
                      onClick={() => sendMessage({ type: 'SELECT_PROFILE', profile_id: 'AUTO' })}
                      className={`p-6 rounded-2xl border transition-all flex flex-col items-center justify-center gap-3 relative overflow-hidden group ${
                        !data?.active_profile?.id 
                        ? 'bg-[#4ef2ff]/10 border-[#4ef2ff]/40 shadow-[0_0_20px_rgba(78,242,255,0.1)]' 
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center border border-white/10 group-hover:scale-110 transition-transform">
                        <Activity size={24} className={!data?.active_profile?.id ? 'text-[#4ef2ff]' : 'text-white/40'} />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest leading-none">Automatic</span>
                      <span className="text-[8px] font-bold text-neutral-500 uppercase italic">Smart Detection</span>
                      {!data?.active_profile?.id && <div className="absolute bottom-0 left-0 w-full h-1 bg-[#4ef2ff] shadow-[0_0_10px_#4ef2ff]" />}
                    </button>

                    {/* Lista de Perfiles */}
                    {data?.available_profiles && data.available_profiles.length > 0 ? (
                      data.available_profiles.map(profile => (
                        <button 
                          key={profile.id}
                          onClick={() => sendMessage({ type: 'SELECT_PROFILE', profile_id: profile.id })}
                          className={`p-6 rounded-2xl border transition-all flex flex-col items-start gap-3 relative overflow-hidden group ${
                            data?.active_profile?.id === profile.id
                            ? 'bg-[#4ef2ff]/10 border-[#4ef2ff]/40 shadow-[0_0_20px_rgba(78,242,255,0.1)]' 
                            : 'bg-white/5 border-white/10 hover:bg-white/10'
                          }`}
                        >
                          <div className="flex justify-between w-full items-start">
                            <Train size={24} className={data?.active_profile?.id === profile.id ? 'text-[#4ef2ff]' : 'text-neutral-600'} />
                            {data?.active_profile?.id === profile.id && (
                              <div className="px-2 py-0.5 rounded-full bg-[#4ef2ff]/20 border border-[#4ef2ff]/30 text-[8px] font-black text-[#4ef2ff] uppercase animate-pulse">Active</div>
                            )}
                          </div>
                          <div className="flex flex-col items-start mt-2">
                             <span className="text-[11px] font-black uppercase tracking-tight text-left line-clamp-2 leading-tight">{profile.name}</span>
                             <span className="text-[8px] font-bold text-neutral-500 uppercase mt-1">ID: {profile.id}</span>
                          </div>
                          {data?.active_profile?.id === profile.id && <div className="absolute bottom-0 left-0 w-full h-1 bg-[#4ef2ff] shadow-[0_0_10px_#4ef2ff]" />}
                        </button>
                      ))
                    ) : (
                      /* Placeholder si la lista está vacía */
                      <div className="col-span-4 p-12 border-2 border-dashed border-white/5 rounded-2xl flex flex-col items-center justify-center opacity-40">
                         <Activity size={48} className="animate-pulse mb-4 text-[#4ef2ff]" />
                         <span className="text-sm font-black uppercase tracking-widest text-white">Diagnostic Mode</span>
                         <div className="mt-4 flex flex-col items-center gap-2">
                            <span className="text-[10px] text-neutral-500">WebSocket: {isConnected ? 'CONNECTED' : 'OFFLINE'}</span>
                            <span className="text-[10px] text-neutral-500">Metadata nodes: {Object.keys(data || {}).length}</span>
                            <button 
                              onClick={() => window.location.reload()}
                              className="mt-4 px-6 py-2 bg-[#4ef2ff]/10 border border-[#4ef2ff]/30 rounded-lg text-[10px] font-black uppercase text-[#4ef2ff] hover:bg-[#4ef2ff]/20 transition-all font-mono"
                            >
                              Force Web Interface Reset
                            </button>
                         </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Informática de Estado del Perfil */}
              <div className="col-span-12 grid grid-cols-3 gap-6">
                <div className="glass-panel p-6 rounded-3xl border border-white/5 bg-gradient-to-br from-emerald-500/5 to-transparent">
                   <h3 className="text-[10px] font-black text-neutral-500 uppercase tracking-widest mb-4">Detection Engine</h3>
                   <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                         <span className="text-xs font-bold text-white/70 italic">Logic Mode:</span>
                         <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${data?.active_profile?.id ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                           {data?.active_profile?.id ? 'Fingerprint Matched' : 'Scanning...'}
                         </span>
                      </div>
                      <div className="h-px bg-white/5 my-1" />
                      <div className="flex items-center justify-between">
                         <span className="text-[10px] font-bold text-neutral-600 uppercase">Active Profile:</span>
                         <span className="text-[10px] font-black text-[#4ef2ff] uppercase">{data?.active_profile?.name || 'GENERIC'}</span>
                      </div>
                   </div>
                </div>

                <div className="glass-panel p-6 rounded-3xl border border-white/5">
                   <h3 className="text-[10px] font-black text-neutral-500 uppercase tracking-widest mb-4">Hardware Mapping</h3>
                   <div className="space-y-2">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-neutral-600 font-bold uppercase">Combined:</span>
                        <span className={isCombined ? 'text-emerald-400' : 'text-neutral-700'}>{isCombined ? 'ENABLED' : 'DISABLED'}</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-neutral-600 font-bold uppercase">Safety Mapped:</span>
                        <span className="text-white/60">{Object.keys(data?.active_profile?.mappings || {}).length} nodes</span>
                      </div>
                   </div>
                </div>

                <div className="glass-panel p-6 rounded-3xl border border-white/5 flex items-center justify-center gap-4 group cursor-pointer hover:bg-white/5 transition-all" onClick={() => setActiveTab('PILOT')}>
                   <div className="flex flex-col">
                      <span className="text-xl font-black text-white group-hover:text-[#4ef2ff] transition-colors">GO TO PILOT</span>
                      <span className="text-[9px] font-bold text-neutral-600 uppercase tracking-widest">Initialization Complete</span>
                   </div>
                   <ChevronRight size={32} className="text-[#4ef2ff] group-hover:translate-x-2 transition-transform" />
                </div>
              </div>
            </div>
          )}

          {/* SAFETY SYSTEMS MONITOR BAR (Always visible in Pilot mode) */}
          {activeTab === 'PILOT' && (
            <div className="grid grid-cols-4 gap-4 h-16">
               {/* AWS Indicator */}
               <motion.div 
                 animate={aws >= 2 ? { 
                   backgroundColor: ["rgba(255, 165, 71, 0.05)", "rgba(255, 165, 71, 0.4)", "rgba(255, 165, 71, 0.05)"],
                 } : {}}
                 transition={{ repeat: Infinity, duration: 0.3 }}
                 className={`glass-panel rounded-2xl flex items-center justify-between px-6 border-l-4 transition-all duration-300 ${aws > 0 ? 'border-l-[#ffa547]' : 'border-l-white/10 opacity-40'}`}
               >
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black uppercase text-neutral-500 tracking-widest">System</span>
                    <span className="text-xs font-black text-white">AWS MONITOR</span>
                  </div>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${aws === 1 ? 'bg-black border-neutral-700' : aws >= 2 ? 'bg-[#ffa547] border-[#ffa547] shadow-[0_0_20px_#ffa547]' : 'border-white/5'}`}>
                    {aws >= 1 && <div className="w-1 h-6 bg-white/20 rotate-45 absolute" />}
                    {aws >= 1 && <div className="w-1 h-6 bg-white/20 -rotate-45 absolute" />}
                    {aws >= 2 && <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 0.5 }} className="w-full h-full rounded-full bg-[#ffa547] shadow-[0_0_15px_#ffa547]" />}
                  </div>
               </motion.div>

               {/* DSD / Vigilance */}
               <motion.div 
                 animate={dsd > 0.5 ? { 
                   backgroundColor: ["rgba(239, 68, 68, 0.1)", "rgba(239, 68, 68, 0.6)", "rgba(239, 68, 68, 0.1)"],
                   borderColor: ["rgba(239, 68, 68, 0.2)", "rgba(255, 255, 255, 0.8)", "rgba(239, 68, 68, 0.2)"]
                 } : {}}
                 transition={{ repeat: Infinity, duration: 0.2, ease: "linear" }}
                 className={`glass-panel rounded-2xl flex items-center justify-between px-6 border-l-4 transition-all duration-150 ${dsd > 0.5 ? 'border-l-red-500 shadow-[0_0_30px_rgba(239,68,68,0.5)]' : 'border-l-white/10 opacity-40'}`}
               >
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black uppercase text-neutral-500 tracking-widest">Safety</span>
                    <span className="text-xs font-black text-white">DSD ALARM</span>
                  </div>
                  <Bell size={20} className={dsd > 0.5 ? 'text-white animate-bounce' : 'text-neutral-700'} />
               </motion.div>

               {/* DRA (Driver Reminder Appliance) */}
               <div className={`glass-panel rounded-2xl flex items-center justify-between px-6 border-l-4 transition-all duration-300 ${dra > 0.5 ? 'border-l-red-600 bg-red-600/20' : 'border-l-white/10 opacity-40'}`}>
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black uppercase text-neutral-500 tracking-widest">Override</span>
                    <span className="text-xs font-black text-white">DRA ACTIVE</span>
                  </div>
                  <div className={`w-7 h-7 rounded-sm border-2 flex items-center justify-center ${dra > 0.5 ? 'bg-red-600 border-red-400 shadow-[0_0_15px_#dc2626]' : 'border-white/5 opacity-50'}`}>
                    <PowerOff size={14} className="text-white" />
                  </div>
               </div>

               {/* EMERGENCY / TPWS */}
               <div className={`glass-panel rounded-2xl flex items-center justify-between px-6 border-l-4 transition-all duration-300 ${emergency > 0.5 ? 'border-l-red-500 bg-red-500/20' : 'border-l-white/10 opacity-40'}`}>
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black uppercase text-neutral-500 tracking-widest">Critical</span>
                    <span className="text-xs font-black text-white">{emergency > 0.5 ? 'EMERGENCY' : 'BRAKE SYS'}</span>
                  </div>
                  <AlertTriangle size={20} className={emergency > 0.5 ? 'text-red-500 animate-pulse' : 'text-neutral-700'} />
               </div>
            </div>
          )}

          <div className="flex-grow grid grid-cols-12 grid-rows-1 gap-4 overflow-hidden min-h-0">
          
          {/* MAIN PILOT INTERFACE */}
          {activeTab === 'PILOT' && (
            <>
              {/* LEFT: POWER & BRAKE GAUGES (VERTICAL GLASS BARS) */}
              <div className="col-span-2 glass-panel rounded-3xl p-6 flex flex-col justify-between border-l-4 h-full min-h-0" style={{ borderLeftColor: `${brandColor}33` }}>
                <div className="space-y-6 h-full flex flex-col">
                  {/* Master Handle (Only for Combined Control) */}
                  {isCombined && (
                    <div className="h-24 flex flex-col shrink-0">
                      <div className="flex justify-between items-end mb-1">
                        <span className="text-[10px] font-black uppercase text-neutral-500 tracking-widest">Master</span>
                        <span className={`text-sm font-mono font-black ${combinedValue > 0 ? 'text-[#4ef2ff]' : combinedValue < 0 ? 'text-[#ffa547]' : 'text-neutral-500'}`}>
                           {Math.abs(combinedValue * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="flex-grow bg-white/5 rounded-full p-1 relative overflow-hidden border border-white/5">
                        <div className="absolute top-1/2 left-0 right-0 h-px bg-white/10 z-20" />
                        <motion.div 
                          className="absolute left-1 right-1 rounded-full z-10"
                          style={{ 
                            top: combinedValue >= 0 ? 'auto' : '50%',
                            bottom: combinedValue >= 0 ? '50%' : 'auto',
                            backgroundColor: combinedValue > 0 ? brandColor : combinedValue < 0 ? '#ffa547' : 'transparent',
                            boxShadow: combinedValue !== 0 ? `0 0 15px ${combinedValue > 0 ? brandColor : '#ffa547'}88` : 'none'
                          }}
                          animate={{ height: `${Math.abs(combinedValue) * 50}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Traction Power */}
                  <div className="flex-grow flex flex-col">
                    <div className="flex justify-between items-end mb-2">
                      <span className="text-[10px] font-black uppercase text-neutral-500 tracking-widest">{powerLabel}</span>
                      <span className="text-xl font-mono font-black" style={{ color: brandColor }}>{Math.abs(ammeter).toFixed(0)}</span>
                    </div>
                    <div className="flex-grow bg-white/5 rounded-full p-1 relative overflow-hidden backdrop-blur-sm border border-white/5">
                      <motion.div 
                        className="absolute bottom-1 left-1 right-1 rounded-full shadow-[0_0_20px_rgba(78,242,255,0.3)]"
                        style={{ background: `linear-gradient(to top, #0066cc, ${brandColor})` }}
                        animate={{ height: `${Math.min(100, effortNormalised)}%` }}
                        transition={{ type: "spring", stiffness: 50 }}
                      />
                      <div className="absolute inset-0 flex flex-col justify-between py-4 pointer-events-none text-[8px] font-bold text-white/10 pl-6">
                         {[100, 75, 50, 25, 0].map(v => <div key={v} className="flex items-center gap-2"><div className="w-4 h-px bg-white/10" />{v}%</div>)}
                      </div>
                    </div>
                    <span className="text-[9px] text-center mt-2 text-neutral-600 font-bold uppercase tracking-tighter">{powerUnitLabel} (%)</span>
                  </div>

                  {/* Brake Cylinder */}
                  <div className="flex-grow flex flex-col">
                    <div className="flex justify-between items-end mb-2">
                      <span className="text-[10px] font-black uppercase text-neutral-500 tracking-widest">Brake</span>
                      <span className="text-xl font-mono font-black text-[#ffa547]">{brakeCyl.toFixed(1)}</span>
                    </div>
                    <div className="flex-grow bg-white/5 rounded-full p-1 relative overflow-hidden backdrop-blur-sm border border-white/5">
                      <motion.div 
                        className="absolute bottom-1 left-1 right-1 rounded-full bg-gradient-to-t from-[#c05621] to-[#ffa547] shadow-[0_0_20px_rgba(251,146,60,0.3)]"
                        animate={{ height: `${Math.min(100, (brakeCyl/5)*100)}%` }}
                      />
                      <div className="absolute inset-0 flex flex-col justify-between py-4 pointer-events-none text-[8px] font-bold text-white/10 pl-6">
                         {[5, 4, 3, 2, 1, 0].map(v => <div key={v} className="flex items-center gap-2"><div className="w-4 h-px bg-white/10" />{v}bar</div>)}
                      </div>
                    </div>
                    <span className="text-[9px] text-center mt-2 text-neutral-600 font-bold uppercase tracking-tighter">Cylinder</span>
                  </div>
                </div>
              </div>

              {/* CENTER: THE NEXUS SPEED DIAL */}
              <div className="col-span-7 flex flex-col gap-4 h-full min-h-0">
                <div className="flex-grow glass-panel rounded-3xl relative flex flex-col items-center justify-center p-8 overflow-hidden">
                   {/* Orbital Speed Arcs */}
                   <div className="relative w-[500px] h-[500px] flex items-center justify-center">
                      <svg viewBox="0 0 200 200" className="w-full h-full transform -rotate-90 scale-110">
                        {/* AWS Visual Alarm (Orange Ring) */}
                        {aws >= 2 && (
                          <motion.circle 
                            cx="100" cy="100" r="90" fill="none" 
                            stroke="#ffa547" strokeWidth="6"
                            animate={{ opacity: [0.2, 0.8, 0.2], scale: [0.98, 1.02, 0.98] }}
                            transition={{ repeat: Infinity, duration: 0.4 }}
                            style={{ filter: 'drop-shadow(0 0 15px #ffa547)' }}
                          />
                        )}

                        {/* DSD Critical Alert (Red Ring - Inner) */}
                        {dsd > 0.5 && (
                          <motion.circle 
                            cx="100" cy="100" r="82" fill="none" 
                            stroke="#ef4444" strokeWidth="10"
                            animate={{ opacity: [0.3, 1, 0.3], strokeWidth: [8, 14, 8] }}
                            transition={{ repeat: Infinity, duration: 0.2 }}
                            style={{ filter: 'drop-shadow(0 0 20px #ef4444)' }}
                          />
                        )}

                        {/* Background Track */}
                        <circle cx="100" cy="100" r="98" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="2" />
                        
                        {/* Speed Value Arc */}
                        <motion.circle 
                          cx="100" cy="100" r="98" fill="none" 
                          stroke={isOverSpeed ? '#ff5656' : brandColor} strokeWidth="4" strokeLinecap="round"
                          initial={{ strokeDasharray: "615.75", strokeDashoffset: "615.75" }}
                          animate={{ strokeDashoffset: 615.75 - (speed/maxDialSpeed) * 615.75 }}
                          style={{ filter: `drop-shadow(0 0 15px ${isOverSpeed ? '#ff5656' : brandColor}AA)` }}
                        />
                      </svg>

                      {/* Center Digital Display (Now with Limits included) */}
                      <div className="absolute flex flex-col items-center justify-center text-center">
                        {/* Target Limit Above */}
                        <div className="flex flex-col items-center gap-4 mb-2">
                           {waitingForClearance && (
                             <motion.div 
                               initial={{ opacity: 0, scale: 0.9 }}
                               animate={{ opacity: 1, scale: 1 }}
                               className="flex flex-col items-center bg-blue-600/20 px-6 py-2 rounded-2xl border border-blue-500/40 backdrop-blur-md shadow-lg"
                             >
                                <span className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] animate-pulse mb-1">Liberando Cola</span>
                                <span className="text-3xl font-black text-white leading-none">
                                  -{(trainLength - distanceTravelled).toFixed(0)}<span className="text-[11px] font-black opacity-40 ml-[2px]">m</span>
                                </span>
                             </motion.div>
                           )}
                           <motion.div 
                             className="flex flex-col items-center"
                             animate={{ opacity: isConnected ? 0.7 : 0 }}
                           >
                              <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] mb-1">Target Limit</span>
                              <span className={`text-4xl font-black ${speed > targetSpeed + 2 ? 'text-red-500 animate-pulse' : 'text-white/80'}`}>
                                {targetSpeed.toFixed(0)}
                              </span>
                           </motion.div>
                        </div>

                        <div className="flex items-center justify-center relative scale-90 mb-2">
                          {/* Central Alert Glows */}
                          <div className="absolute inset-0 flex items-center justify-center -z-10">
                             {dsd > 0.5 && (
                               <motion.div 
                                 animate={{ scale: [1, 1.5], opacity: [0.2, 0.5, 0.2] }}
                                 transition={{ repeat: Infinity, duration: 0.3 }}
                                 className="w-80 h-80 rounded-full bg-red-600/40 blur-[80px]"
                               />
                             )}
                             {aws >= 2 && (
                               <motion.div 
                                 animate={{ scale: [0.8, 1.2], opacity: [0.1, 0.4, 0.1] }}
                                 transition={{ repeat: Infinity, duration: 0.6 }}
                                 className="w-72 h-72 rounded-full bg-amber-500/30 blur-[60px]"
                               />
                             )}
                          </div>

                          <motion.span 
                            key={Math.floor(speed)}
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ 
                              scale: 1, 
                              opacity: 1,
                              color: dsd > 0.5 ? '#ef4444' : (aws >= 2 ? '#ffa547' : '#f5f6fb')
                            }}
                            className="text-[160px] font-black leading-none tracking-tighter block"
                            style={{ 
                               textShadow: dsd > 0.5 ? '0 0 50px rgba(239,68,68,0.8)' : 
                                            (aws >= 2 ? '0 0 40px rgba(255,165,71,0.6)' : '0 0 20px rgba(78,242,255,0.3)')
                            }}
                          >
                            {Number(speed).toFixed(1)}
                          </motion.span>
                        </div>
                        
                        <div className="flex flex-col items-center">
                           <span className="text-xl font-black text-neutral-500 uppercase tracking-[0.6em] -mt-4">{speedUnit}</span>
                           
                           {/* Next Limit & Signal Data Below */}
                           <motion.div 
                             className="mt-6 flex flex-col items-center border-t border-white/10 pt-4"
                             animate={{ opacity: isConnected ? 0.8 : 0 }}
                           >
                             <div className="flex gap-16">
                                <div className="flex flex-col items-center min-w-[80px]">
                                   <span className="text-[11px] font-black text-[#ffa547] uppercase tracking-widest mb-1">Next Lim</span>
                                   <span className="text-4xl font-black text-[#ffa547]">
                                     {nextLimitVal.toFixed(0)}
                                   </span>
                                   {nextLimitDist > 0 && (
                                      <span className="text-[11px] font-bold text-neutral-500 italic mt-1 bg-black/20 px-2 py-0.5 rounded-full">
                                         en {nextLimitDist.toFixed(0)}m
                                      </span>
                                   )}
                                </div>

                                {hasSignalData && (
                                   <div className="flex flex-col items-center min-w-[120px]">
                                      <span className="text-[11px] font-black uppercase tracking-widest mb-1" style={{ color: signalMeta.color }}>Señal</span>
                                      <div className="flex items-center gap-2">
                                         <div className="w-3.5 h-3.5 rounded-full animate-pulse" style={{ backgroundColor: signalMeta.color, boxShadow: `0 0 12px ${signalMeta.color}` }} />
                                         <span className="text-4xl font-black font-mono" style={{ color: signalMeta.color }}>
                                           {displaySigDist > 0 ? displaySigDist.toFixed(0) : '0'}
                                         </span>
                                         <span className="text-[11px] font-black opacity-40 ml-[4px]">m</span>
                                      </div>
                                      <span className="text-[10px] font-black px-4 py-1 rounded-full mt-2 bg-black/70 border border-white/20 uppercase tracking-[0.1em] backdrop-blur-md shadow-lg whitespace-nowrap" style={{ color: signalMeta.color }}>
                                        {signalMeta.label}
                                      </span>
                                   </div>
                                )}
                             </div>
                           </motion.div>
                        </div>
                      </div>
                   </div>
                </div>

                {/* TELEMETRY QUICK BAR (Métricas movidas aquí fuera del dial) */}
                <div className="h-20 glass-panel rounded-3xl flex justify-around items-center px-4 border border-white/5 shadow-xl">
                  <MetricSquare label="Gradient" value={gradient.toFixed(1)} unit="%" color="#34d399" />
                  <div className="w-px h-8 bg-white/5" />
                  <MetricSquare label="Next Lim" value={nextLimitVal.toFixed(0)} unit={speedUnit.toLowerCase()} color="#ffa547" />
                  <div className="w-px h-8 bg-white/5" />
                  <MetricSquare label="Semaforo" value={displaySigDist > 0 ? displaySigDist.toFixed(0) : '---'} unit="m" color={signalMeta.color} />
                  {aws >= 2 && (
                    <>
                      <div className="w-px h-8 bg-white/5" />
                      <MetricSquare label="Safety" value="AWS" unit="WARN" color="#fbbf24" alert={true} />
                    </>
                  )}
                </div>
              </div>

              {/* RIGHT: PLANNING & LOGS (Grid Layout for Total Stability) */}
              <div className="col-span-3 h-full flex flex-col gap-4 min-h-0 overflow-hidden bg-transparent">
                 {/* G-FORCE / ACCEL MONITOR */}
                 <div className="h-[120px] glass-panel rounded-3xl p-4 flex items-center justify-between border-r-4 relative overflow-hidden shrink-0" style={{ borderRightColor: `${brandColor}66` }}>
                    <div className="flex flex-col z-10">
                      <h3 className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">G-Force Monitor</h3>
                      <div className="flex items-baseline gap-2">
                        <span className={`text-4xl font-black ${acceleration >= 0 ? 'text-[#4ef2ff]' : 'text-[#ffa547]'}`}>
                          {acceleration >= 0 ? '+' : ''}{acceleration.toFixed(2)}
                        </span>
                        <span className="text-[10px] font-bold text-white/20 uppercase">m/s²</span>
                      </div>
                      
                      {/* Velocidad Estimada (Projected Speed) */}
                      <div className="mt-2 flex items-baseline gap-1.5 opacity-80">
                         <span className="text-[8px] font-black text-white/30 uppercase tracking-widest">Est. (10s):</span>
                         <span className={`text-sm font-bold ${estimatedSpeed > speed ? 'text-emerald-400' : estimatedSpeed < speed ? 'text-amber-400' : 'text-white'}`}>
                            {estimatedSpeed.toFixed(1)}
                         </span>
                         <span className="text-[8px] font-mono text-white/20">{speedUnit}</span>
                      </div>
                    </div>

                    <div className="h-20 w-4 bg-white/5 rounded-full relative overflow-hidden border border-white/10 shadow-inner mr-2 z-10">
                        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/20 z-20" />
                        <motion.div 
                          className="absolute left-0 right-0 z-10"
                          style={{ 
                            top: acceleration >= 0 ? 'auto' : '50%',
                            bottom: acceleration >= 0 ? '50%' : 'auto',
                            backgroundColor: acceleration >= 0 ? brandColor : '#ffa547',
                            boxShadow: acceleration >= 0 ? `0 0 15px ${brandColor}` : '0 0 15px #ffa547'
                          }}
                          animate={{ 
                            height: `${Math.min(50, Math.abs(acceleration * 50))}%` 
                          }}
                          transition={{ type: 'spring', stiffness: 120, damping: 14 }}
                        />
                    </div>
                 </div>

                 {/* TRACK STATUS (Signals & Restrictions) */}
                 <div className="h-[140px] glass-panel rounded-3xl p-4 flex flex-col justify-between border-l-4 overflow-hidden relative shrink-0" 
                      style={{ borderLeftColor: showSensorAlert ? '#fbbf24' : (hasSignalData ? signalMeta.color : '#ffa54766') }}>
                   
                   <div className="flex items-center gap-4 z-10">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border shadow-lg transition-all duration-500 ${showSensorAlert ? 'animate-pulse' : ''}`}
                           style={{ 
                             backgroundColor: `${showSensorAlert ? '#fbbf24' : signalMeta.color}15`,
                             borderColor: `${showSensorAlert ? '#fbbf24' : signalMeta.color}40`,
                             boxShadow: `0 0 25px ${showSensorAlert ? '#fbbf24' : signalMeta.color}20`
                           }}>
                        {showSensorAlert ? <Bell size={28} className="text-[#fbbf24]" /> : <div className="w-8 h-8 rounded-full animate-pulse shadow-[0_0_20px_currentColor]" style={{ backgroundColor: signalMeta.color }} />}
                      </div>
                      <div className="flex flex-col flex-grow min-w-0">
                        <span className="text-[10px] font-black uppercase text-white/40 tracking-widest">
                          {showSensorAlert ? 'Control Restricción' : 'Target Signal'}
                        </span>
                        <div className="flex items-center justify-between">
                          <span className="text-2xl font-black tracking-tighter" style={{ color: showSensorAlert ? '#fbbf24' : signalMeta.color }}>
                            {showSensorAlert ? 'ALERTA SENSOR' : signalMeta.label}
                          </span>
                          {displaySigDist > 0 && !showSensorAlert && (
                             <span className="text-2xl font-black font-mono" style={{ color: signalMeta.color }}>
                               {displaySigDist.toFixed(0)}<span className="text-sm ml-1 opacity-50">m</span>
                             </span>
                          )}
                        </div>
                      </div>
                   </div>

                   <div className="flex justify-between items-center z-10 bg-black/40 px-4 py-2.5 rounded-2xl border border-white/5 backdrop-blur-md">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest">Next Restriction</span>
                        <span className="text-xl font-mono font-black text-white/90">
                          {nextLimitDist > 0 ? `${nextLimitDist.toFixed(0)}m` : '---'}
                        </span>
                      </div>
                      <div className="text-right flex flex-col items-end">
                        <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest">Limit</span>
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-black text-[#ffa547] drop-shadow-lg">{nextLimitVal.toFixed(0)}</span>
                          <span className="text-[10px] font-black text-white/20">{speedUnit}</span>
                        </div>
                      </div>
                   </div>
                </div>

                 {/* Planning Tape (8km Dynamic Extended) - FORCED MIN HEIGHT FOR VISIBILITY */}
                 <div className="flex-grow min-h-[350px] glass-panel rounded-3xl p-4 relative border border-white/10 bg-[#060c1b]/60 overflow-hidden shadow-2xl">
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-500/0 to-[#4ef2ff]/5 pointer-events-none" />
                    
                    {/* Scale Labeling - REINFORCED VISIBILITY */}
                    <div className="absolute inset-y-6 left-2 w-14 z-50">
                      {[8, 7, 6, 5, 4, 3, 2, 1, 0.5].map((km) => (
                        <div key={km} className="absolute left-0 right-0 h-0 flex items-center justify-end"
                             style={{ bottom: `${getTapePosition(km * 1000)}%` }}>
                           <span className="text-[11px] font-black text-white px-2 py-0.5 rounded shadow-xl bg-black/70 border border-white/10 mr-1 whitespace-nowrap">
                             {km * 1000}m
                           </span>
                           <div className="w-4 h-[2px] bg-white/40 rounded-full" />
                        </div>
                      ))}
                      <div className="absolute left-0 bottom-0 w-full h-0 flex items-center justify-end">
                        <span className="text-[12px] font-black text-[#4ef2ff] px-2 py-0.5 rounded shadow-xl bg-black/80 border border-[#4ef2ff]/30 mr-1 animate-pulse">
                          0m
                        </span>
                        <div className="w-6 h-[4px] bg-[#4ef2ff] rounded-full shadow-[0_0_15px_#4ef2ff]" />
                      </div>
                    </div>

                    {/* Tape Contents Area */}
                    <div className="absolute inset-y-6 left-16 right-4 rounded-2xl border-l-2 border-white/10 bg-black/40 overflow-hidden">
                       {/* Track Indicator Line */}
                       <div className="absolute inset-y-0 left-6 w-px bg-white/10" />

                       {/* CURRENT POSITION LINE (Anchor) */}
                       <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#4ef2ff] shadow-[0_0_30px_#4ef2ff] z-[100]" />

                       {/* Markers Container */}
                       <div className="absolute inset-0 pointer-events-none">
                          {/* Speed Limit Marker */}
                          {nextLimitDist > 0 && nextLimitDist < 8100 && (
                            <motion.div 
                                 initial={false}
                                 animate={{ bottom: `${getTapePosition(nextLimitDist)}%` }}
                                 transition={{ type: "spring", stiffness: 100, damping: 20 }}
                                 className="absolute left-0 right-0 h-0 z-20">
                               <div className="absolute left-0 right-0 h-1 bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.6)]" />
                               <div className="absolute right-0 -translate-y-1/2 flex items-center">
                                  <div className="bg-red-700 text-white text-[12px] font-black px-4 py-2 rounded-l-xl border-y border-l border-red-400 shadow-[0_0_30px_rgba(239,68,68,0.4)] flex flex-col items-center min-w-[70px]">
                                    <span className="text-[18px] leading-none mb-0.5 drop-shadow-md">{nextLimitVal.toFixed(0)}</span>
                                    <span className="text-[8px] font-black opacity-70 uppercase tracking-widest">{speedUnit}</span>
                                  </div>
                                  <div className="w-2 h-14 bg-red-600 shadow-[0_0_20px_red]" />
                               </div>
                            </motion.div>
                          )}

                          {/* Signal Marker */}
                          {displaySigDist > 0 && displaySigDist < 8100 && (
                            <motion.div 
                                 initial={false}
                                 animate={{ bottom: `${getTapePosition(displaySigDist)}%` }}
                                 transition={{ type: "spring", stiffness: 100, damping: 20 }}
                                 className="absolute left-0 right-0 h-0 z-30">
                               <div className="absolute left-0 right-0 h-1 opacity-80" style={{ backgroundColor: signalMeta.color, boxShadow: `0 0 15px ${signalMeta.color}` }} />
                               <div className="absolute right-2 -translate-y-1/2 flex items-center gap-4 bg-black/95 p-3 rounded-2xl border-2 shadow-2xl backdrop-blur-xl"
                                    style={{ borderColor: signalMeta.color }}>
                                  <div className="flex flex-col items-end">
                                    <span className="text-xl font-black leading-none drop-shadow-md" style={{ color: signalMeta.color }}>{signalMeta.label}</span>
                                    <span className="text-[10px] font-black text-white/60 uppercase tracking-widest mt-1">{displaySigDist.toFixed(0)}m</span>
                                  </div>
                                  <div className="w-12 h-12 rounded-full flex items-center justify-center bg-black/60 border border-white/20 relative">
                                    <div className="absolute inset-0 rounded-full animate-ping opacity-30" style={{ backgroundColor: signalMeta.color }} />
                                    <div className="w-7 h-7 rounded-full shadow-[0_0_30px_currentColor]" style={{ backgroundColor: signalMeta.color }} />
                                  </div>
                               </div>
                            </motion.div>
                          )}
                       </div>
                    </div>
                 </div>

                 {/* System Telemetry Logs - Fixed Height */}
                 <div className="h-32 glass-panel rounded-3xl p-4 overflow-hidden shrink-0 bg-black/50 border border-white/5 shadow-inner">
                    <div className="flex items-center justify-between mb-3 px-1">
                       <div className="flex items-center gap-2">
                         <History size={14} className="text-[#4ef2ff]" />
                         <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Operational Log Feed</span>
                       </div>
                       <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    </div>
                    <div className="space-y-1.5 h-[calc(100%-28px)] overflow-y-auto px-1 custom-scrollbar">
                       {logs.slice(-10).reverse().map(log => (
                         <LogEntry key={log.id} type={log.type} message={log.message} time={log.time} />
                       ))}
                       {logs.length === 0 && (
                         <div className="h-full flex items-center justify-center opacity-10 italic text-[11px] text-[#4ef2ff]/30 tracking-widest">BUFFER_EMPTY // NO_EVENTS</div>
                       )}
                    </div>
                 </div>
              </div>
            </>
          )}

          {activeTab === 'TELEMETRY' && (
            <div className="col-span-12 grid grid-cols-4 gap-4">
              <div className="col-span-1 glass-panel rounded-3xl p-6">
                <h3 className="text-[10px] font-black text-[#4ef2ff] uppercase tracking-widest mb-6 border-b border-white/5 pb-2">Pressure Matrix</h3>
                <div className="space-y-6">
                  <TelemetryBar label="Train Pipe" value={trainPipe} max={5} unit="bar" color={brandColor} />
                  <TelemetryBar label="Main Reservoir" value={Number(getMappedValue('main_reservoir', data?.MainResPressureBAR || 0))} max={10} unit="bar" color="#34d399" />
                  <TelemetryBar label="Cylinder" value={brakeCyl} max={5} unit="bar" color="#ffa547" />
                </div>
              </div>
              <div className="col-span-2 glass-panel rounded-3xl p-6">
                <h3 className="text-[10px] font-black text-[#4ef2ff] uppercase tracking-widest mb-6 border-b border-white/5 pb-2">Power Distribution</h3>
                <div className="h-64 flex items-end justify-between gap-2 px-4 py-4 bg-black/20 rounded-2xl border border-white/5">
                   {[40, 65, 80, 55, 90, 70, 45, 30].map((v, i) => (
                      <motion.div 
                        key={i} 
                        initial={{ height: 0 }}
                        animate={{ height: `${v}%` }}
                        className="w-full bg-[#4ef2ff]/20 rounded-t-lg border-t-2 border-[#4ef2ff] relative group"
                      >
                         <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[8px] font-bold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">PHASE {i+1}</div>
                      </motion.div>
                   ))}
                </div>
              </div>
              <div className="col-span-1 flex flex-col gap-4">
                <div className="glass-panel rounded-3xl p-6 flex-grow">
                  <h3 className="text-[10px] font-black text-[#4ef2ff] uppercase tracking-widest mb-4">Electric Load</h3>
                  <div className="text-4xl font-black text-[#f5f6fb]">{ammeter.toFixed(1)} <span className="text-xs text-neutral-500 uppercase">A</span></div>
                  <div className="mt-4 p-3 bg-white/5 rounded-xl border border-white/5">
                    <div className="text-[8px] font-bold uppercase text-neutral-600 mb-1">Efficiency</div>
                    <div className="flex items-center gap-2">
                      <div className="flex-grow h-1 bg-white/10 rounded-full overflow-hidden">
                        <div className="w-[85%] h-full bg-[#34d399]" />
                      </div>
                      <span className="text-[10px] font-mono text-[#34d399]">85%</span>
                    </div>
                  </div>
                </div>
                <div className="glass-panel rounded-3xl p-6 flex-grow">
                  <h3 className="text-[10px] font-black text-[#ffa547] uppercase tracking-widest mb-4">Temp Status</h3>
                  <div className="text-4xl font-black text-[#f5f6fb]">{temperature.toFixed(1)} <span className="text-xs text-neutral-500 uppercase">°C</span></div>
                  <div className="mt-2 text-[10px] text-[#34d399] uppercase font-bold tracking-tighter">Normal Range Detected</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'CONFIG' && (
            <div className="col-span-12 glass-panel rounded-3xl p-12 flex flex-col items-center">
               <h2 className="text-3xl font-black uppercase tracking-tighter mb-8 reactor-glow text-[#4ef2ff]">Train Configuration</h2>
               
               <div className="grid grid-cols-2 gap-8 w-full max-w-2xl">
                 <div className="glass-panel p-6 rounded-2xl border border-white/5">
                   <h3 className="text-xs font-black text-neutral-500 uppercase mb-4">Train Length Control</h3>
                   <div className="text-5xl font-black text-white mb-6">{trainLength.toFixed(1)} <span className="text-sm text-neutral-600">meters</span></div>
                   
                   <div className="flex gap-4">
                     <button 
                       onClick={() => setTrainLength(61)}
                       className="flex-grow py-3 rounded-xl bg-[#4ef2ff]/10 border border-[#4ef2ff]/30 text-[#4ef2ff] font-black uppercase text-[10px] hover:bg-[#4ef2ff]/20 transition-all"
                     >
                       3 Cars (61m)
                     </button>
                     <button 
                       onClick={() => setTrainLength(122)}
                       className="flex-grow py-3 rounded-xl bg-[#4ef2ff]/10 border border-[#4ef2ff]/30 text-[#4ef2ff] font-black uppercase text-[10px] hover:bg-[#4ef2ff]/20 transition-all"
                     >
                       6 Cars (122m)
                     </button>
                   </div>
                   
                   <button 
                     onClick={() => {
                        const val = prompt("Manual Length (m):", trainLength.toString());
                        if (val) setTrainLength(Number(val));
                     }}
                     className="w-full mt-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white/70 font-black uppercase text-[10px] hover:bg-white/10 transition-all"
                   >
                     Set Custom Length
                   </button>
                 </div>

                 <div className="glass-panel p-6 rounded-2xl border border-white/5">
                   <h3 className="text-xs font-black text-neutral-500 uppercase mb-4">Weight & Mass</h3>
                   <div className="text-5xl font-black text-[#ffa547] mb-6">{trainMass > 0 ? trainMass.toFixed(1) : '---'} <span className="text-sm text-neutral-600">tons</span></div>
                   
                   <div className="p-4 bg-black/20 rounded-xl border border-white/5">
                        <div className="text-[10px] font-bold text-neutral-600 mb-1">Physics Impact</div>
                        <div className="text-white/60 text-[10px] italic">Higher mass increases braking distance and reduces acceleration efficiency.</div>
                   </div>
                 </div>

                 <div className="glass-panel p-6 rounded-2xl border border-white/5">
                   <h3 className="text-xs font-black text-neutral-500 uppercase mb-4">Odometer Calibration</h3>
                   <div className="space-y-4">
                     <div className="p-4 bg-black/20 rounded-xl border border-white/5">
                        <div className="text-[10px] font-bold text-neutral-600 mb-1">Last Sync Status</div>
                        <div className="text-emerald-500 font-black">STABLE (Δt: {lastSimTime > 0 ? '0.05s' : '---'})</div>
                     </div>
                     <button 
                       onClick={() => setWaitingForClearance(false)}
                       className="w-full py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 font-black uppercase text-[10px] hover:bg-red-500/20 transition-all"
                     >
                       Force Clear Wait
                     </button>
                   </div>
                 </div>
               </div>
            </div>
          )}

          {activeTab === 'LOGS' && (
            <div className="col-span-12 glass-panel rounded-3xl p-8 border border-white/5 flex flex-col h-full">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-black uppercase tracking-tighter reactor-glow">System Event Log</h2>
                <div className="flex gap-4">
                   <div className="px-4 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-black text-emerald-500 uppercase">
                     Kernel: Online
                   </div>
                   <div className="px-4 py-1 rounded-full bg-[#4ef2ff]/10 border border-[#4ef2ff]/20 text-[10px] font-black text-[#4ef2ff] uppercase">
                     Data Flow: {data?.Speed !== undefined ? 'Active' : 'Standby'}
                   </div>
                </div>
              </div>

              <div className="flex-grow overflow-y-auto space-y-2 pr-4 custom-scrollbar font-mono text-[11px]">
                 <div className="p-3 rounded-lg bg-white/5 border border-white/5 flex justify-between">
                    <span className="text-neutral-500">[SYSTEM]</span>
                    <span className="text-white">Nexus Hub initialized at {new Date().toLocaleTimeString()}</span>
                 </div>
                 <div className="p-3 rounded-lg bg-white/5 border border-white/5 flex justify-between">
                    <span className="text-[#4ef2ff]">[WEBSOCKET]</span>
                    <span className="text-white">{isConnected ? 'Handshake established with local gateway' : 'Searching for backend...'}</span>
                 </div>
                 <div className="p-3 rounded-lg bg-white/5 border border-white/5 flex justify-between">
                    <span className="text-neutral-500">[STORAGE]</span>
                    <span className="text-white">
                        Detected {data?.available_profiles?.length || 0} vehicle profiles
                        {data?.debug_path && <span className="text-[9px] text-neutral-600 ml-2">({data.debug_path})</span>}
                    </span>
                 </div>
                 {data?.debug_count === 0 && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500">
                       [CRITICAL] Backend reports 0 profiles loaded. Check folder accessibility.
                    </div>
                 )}
                 {data?.active_profile && (
                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex justify-between">
                       <span className="text-emerald-500">[MATCHER]</span>
                       <span className="text-white">Profile '{data.active_profile.name}' matched via hardware fingerprint</span>
                    </div>
                 )}
                 <div className="p-3 rounded-lg bg-white/5 border border-white/5 flex justify-between">
                    <span className="text-neutral-500">[TELEMETRY]</span>
                    <span className="text-white">Current speed node: {data?.Speed?.toFixed(2) || '0.00'} MPH</span>
                 </div>
              </div>
              
              <div className="mt-6 flex justify-center">
                 <button 
                   onClick={() => setActiveTab('MAIN')}
                   className="px-12 py-3 bg-[#4ef2ff]/10 border border-[#4ef2ff]/40 rounded-xl text-xs font-black uppercase text-[#4ef2ff] hover:bg-[#4ef2ff]/20 transition-all shadow-[0_0_20px_rgba(78,242,255,0.1)]"
                 >
                   Go to Profile Selector (MAIN)
                 </button>
              </div>
            </div>
          )}

          {activeTab !== 'MAIN' && activeTab !== 'PILOT' && activeTab !== 'TELEMETRY' && activeTab !== 'CONFIG' && activeTab !== 'LOGS' && (
            <div className="col-span-12 glass-panel rounded-3xl p-12 flex flex-col items-center justify-center">
               <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center"
               >
                  <div className="w-20 h-20 rounded-full bg-[#4ef2ff]/10 flex items-center justify-center text-[#4ef2ff] border border-[#4ef2ff]/20 mx-auto mb-6 shadow-[0_0_30px_rgba(78,242,255,0.1)]">
                    <Activity size={40} />
                  </div>
                  <h2 className="text-4xl font-black uppercase tracking-tighter mb-4 reactor-glow">Module {activeTab}</h2>
                  <p className="text-[#f5f6fb]/50 max-w-md mx-auto italic">Initializing diagnostic interface... Synchronization with Nexus core 3.1 in progress.</p>
               </motion.div>
            </div>
          )}
        </div>
      </div>

        {/* HUD INFERIOR (Status info instead of tabs) */}
        <footer className="flex justify-between items-center px-6 py-2 glass-panel rounded-2xl border border-white/5 opacity-50">
           <div className="text-[9px] font-mono text-[#4ef2ff]/60 tracking-widest uppercase">
             System Status: <span className="text-[#34d399]">Operational</span>
           </div>
           <div className="flex gap-6 items-center">
             <div className="flex items-center gap-2">
               <div className="w-1.5 h-1.5 rounded-full bg-[#34d399] animate-pulse" />
               <span className="text-[8px] font-bold text-neutral-400">SYNC_OK</span>
             </div>
             <div className="text-[8px] font-mono text-neutral-600">
               NODE::NEXUS_V3.1_PROD
             </div>
           </div>
        </footer>

      </div>
    </div>
  );
};

interface MetricSquareProps {
  label: string;
  value: string | number;
  unit: string;
  color: string;
  alert?: boolean;
}

const MetricSquare: React.FC<MetricSquareProps> = ({ label, value, unit, color, alert }) => (
  <div className={`flex flex-col items-center px-8 border-r border-white/5 last:border-0 ${alert ? 'animate-pulse' : ''}`}>
    <span className="text-[9px] text-[#f5f6fb]/30 uppercase font-black tracking-tighter mb-1">{label}</span>
    <span className="text-2xl font-black transition-colors duration-500" style={{ color }}>
      {value}<span className={`text-[11px] font-black opacity-30 ${unit.length === 1 ? 'ml-[-2px]' : 'ml-0.5'}`}>{unit}</span>
    </span>
  </div>
);

interface LogEntryProps {
  type: string;
  message: string;
  time: string;
}

const LogEntry: React.FC<LogEntryProps> = ({ type, message, time }) => (
  <div className="flex justify-between items-center text-[10px] border-b border-white/5 pb-2 last:border-0">
    <div className="flex gap-3 items-center">
      <div className={`w-1.5 h-1.5 rounded-full ${type === 'info' ? 'bg-[#4ef2ff] shadow-[0_0_8px_#4ef2ff]' : 'bg-[#ffa547] shadow-[0_0_8px_#ffa547]'}`} />
      <span className="text-[#f5f6fb]/70 font-medium">{message}</span>
    </div>
    <span className="text-[#f5f6fb]/30 font-mono italic">{time}</span>
  </div>
);

interface TelemetryBarProps {
  label: string;
  value: number;
  max: number;
  unit: string;
  color: string;
}

const TelemetryBar: React.FC<TelemetryBarProps> = ({ label, value, max, unit, color }) => (
  <div className="space-y-2">
    <div className="flex justify-between text-[10px] font-black uppercase text-neutral-500">
      <span>{label}</span>
      <span style={{ color }}>{value.toFixed(1)} {unit}</span>
    </div>
    <div className="h-4 bg-white/5 rounded-full p-1 border border-white/5 relative overflow-hidden">
      <motion.div 
        className="h-full rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 15px ${color}66` }}
        animate={{ width: `${Math.min(100, (value/max)*100)}%` }}
      />
    </div>
  </div>
);