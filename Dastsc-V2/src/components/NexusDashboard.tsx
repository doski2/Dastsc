import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTelemetry } from '../hooks/useTelemetry';
import { 
  ShieldAlert, 
  Navigation, 
  Wifi, 
  WifiOff,
  ChevronRight,
  Activity,
  AlertTriangle,
  Bell,
  PowerOff
} from 'lucide-react';

export const NexusDashboard: React.FC = () => {
  const { data, isConnected } = useTelemetry();
  const [time, setTime] = useState(new Date());
  const [activeTab, setActiveTab] = useState('PILOT');

  // Lógica de "Esperando Cola" (Odrómetro)
  const [waitingForClearance, setWaitingForClearance] = useState(false);
  const [distanceTravelled, setDistanceTravelled] = useState(0);
  const [lastNextLimitDist, setLastNextLimitDist] = useState(0);
  const [lastSimTime, setLastSimTime] = useState(0);
  const [effectiveLimit, setEffectiveLimit] = useState(0);
  const [trainLength, setTrainLength] = useState(61.0);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    
    const handleKeyDown = (e: KeyboardEvent) => {
      const keys = ['1', '2', '3', '4', '5', '6', '7', '8'];
      const tabs = ['MAIN', 'PILOT', 'TELEMETRY', 'SYSTEM', 'SAFETY', 'CONFIG', 'LOGS', 'EXIT'];
      if (keys.includes(e.key)) {
        setActiveTab(tabs[keys.indexOf(e.key)]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearInterval(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Proceso del Odrómetro y Lógica de Cola
  useEffect(() => {
    if (!data) return;

    const currentNextDist = Number(data.NextSpeedLimitDistance || 0);
    const currentSpeedMS = Number(data.Speed || 0); // Suponemos m/s segun el proto
    const simTime = Number(data.SimulationTime || 0);
    const currentLimit = Number(data.CurrentSpeedLimit || 0);
    const nextLimitSpeed = Number(data.NextSpeedLimitSpeed || 0);

    // Sincronizar largo del tren si el simulador lo reporta y no ha sido modificado manualmente (opcional)
    // De momento, priorizamos el estado local para permitir ajustes manuales
    if (data.TrainLength && Math.abs(Number(data.TrainLength) - trainLength) > 1 && !waitingForClearance) {
       // Solo actualizamos si hay un cambio significativo y no estamos midiendo
       // setTrainLength(Number(data.TrainLength)); 
    }

    // Initial load
    if (effectiveLimit === 0 && currentLimit > 0) {
       setEffectiveLimit(currentLimit);
    }

    // 1. Detectar cruce de señal (salto de distancia)
    if (lastNextLimitDist < 15 && currentNextDist > 100) {
      // Si el limite que viene es mayor (liberación)
      if (nextLimitSpeed > currentLimit) {
        setWaitingForClearance(true);
        setDistanceTravelled(0);
        // Mantenemos el limite actual como efectivo hasta que despeje
        setEffectiveLimit(currentLimit);
      } else {
        setWaitingForClearance(false);
        setEffectiveLimit(currentLimit);
      }
    }

    // 2. Seguridad: Si el límite de la vía baja de repente, aplicamos inmediatamente.
    // Incluso si estamos "esperando" para subir, si la vía nos impone algo CORTANTE, obedecemos.
    if (currentLimit < effectiveLimit) {
        setEffectiveLimit(currentLimit);
        // Si estábamos esperando despejar para una velocidad mayor, pero ahora la vía baja, abortamos la espera
        if (waitingForClearance) {
          setWaitingForClearance(false);
          setDistanceTravelled(0);
        }
    }

    // 3. Actualizar Odrómetro
    if (waitingForClearance) {
      const dt = lastSimTime > 0 ? simTime - lastSimTime : 0.2;
      if (dt > 0 && dt < 1) {
        const deltaDist = Math.abs(currentSpeedMS) * dt;
        setDistanceTravelled(prev => {
          const newDist = prev + deltaDist;
          if (newDist >= trainLength) {
            setWaitingForClearance(false);
            setEffectiveLimit(currentLimit);
            return 0;
          }
          return newDist;
        });
      }
    } else {
        // Si no estamos esperando, el limite efectivo sigue a la vía
        if (currentLimit !== effectiveLimit) {
            setEffectiveLimit(currentLimit);
        }
    }

    setLastNextLimitDist(currentNextDist);
    setLastSimTime(simTime);
  }, [data, waitingForClearance, lastNextLimitDist, lastSimTime, effectiveLimit, trainLength]);

  // Métricas Calculadas (Con fallbacks para evitar pantalla en blanco)
  const speed = Number(data?.Speed || 0);
  const ammeter = Number(data?.Ammeter || 0);
  const brakeCyl = Number(data?.TrainBrakeCylinderPressureBAR || 0);
  const trainPipe = Number(data?.TrainBrakePipePressureBAR || 0);
  const gradient = Number(data?.Gradient || 0);
  
  // Lógica de Límite Efectivo (No subir hasta despejar cola)
  const rawTrackLimit = Number(data?.CurrentSpeedLimit || 120);
  
  // El targetSpeed real para el velocímetro será el del tramo anterior si estamos esperando cola de liberación
  const targetSpeed = effectiveLimit > 0 ? effectiveLimit : rawTrackLimit;
  
  const nextLimit = Number(data?.NextSpeedLimitSpeed || 80);
  const nextLimitDist = Number(data?.NextSpeedLimitDistance || 0);
  const acceleration = Number(data?.Acceleration || 0);
  const temperature = Number(data?.Temperature || 42.5);
  const maxTrainSpeed = Number(data?.MaxSpeed || 250);
  const maxDialSpeed = maxTrainSpeed > 0 ? maxTrainSpeed : 250;
  const speedUnit = Number(data?.SpeedoType) === 1 ? 'Mph' : 'Km/h';
  const speedFactor = Number(data?.SpeedoType) === 1 ? 2.23694 : 3.6;

  // Safety Systems
  const aws = Number(data?.AWS || 0) || (Number(data?.AWSWarning || 0) > 0 || Number(data?.AWSWarnCount || 0) > 0 || Number(data?.AWSWarnAudio || 0) > 0 ? 2 : 0);
  const dsd = Number(data?.DSD || 0) || Number(data?.VigilAlarm || 0) || Number(data?.Vigilance || 0) || Number(data?.DVDAlarm || 0);
  const dra = Number(data?.DRA || 0);
  const emergency = Number(data?.EmergencyBrake || 0);
  
  // Velocidad estimada en 10 segundos basada en aceleración actual
  const estimatedSpeed = Math.max(0, speed + (acceleration * speedFactor * 10));
  
  // Supervision Logic
  const isOverSpeed = speed > targetSpeed + 5;
  const statusColor = isOverSpeed ? '#ff5656' : (isConnected ? '#4ef2ff' : '#64748b');

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
              <span>Vehicle: <span className="text-[#4ef2ff]">BR-442 VELARO</span></span>
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
          
          {/* SAFETY SYSTEMS MONITOR BAR (Always visible in Pilot mode) */}
          {activeTab === 'PILOT' && (
            <div className="grid grid-cols-5 gap-4 h-16">
               {/* ODOMETER / TAIL CLEARANCE (NEW) */}
               <div 
                 className={`glass-panel rounded-2xl flex flex-col justify-center px-4 border-l-4 transition-all duration-300 cursor-pointer hover:bg-white/5 ${waitingForClearance ? 'border-l-blue-500 bg-blue-500/10' : 'border-l-white/10 opacity-40'}`}
                 onClick={() => {
                   const val = prompt("Ajustar largo del tren (metros):", trainLength.toString());
                   if (val) setTrainLength(Number(val));
                 }}
               >
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[8px] font-black uppercase text-neutral-500 tracking-widest">Tail Clearance ({trainLength.toFixed(0)}m)</span>
                    <span className="text-[9px] font-black text-white">{waitingForClearance ? `${(trainLength - distanceTravelled).toFixed(0)}m` : 'READY'}</span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
                    <motion.div 
                      className="h-full bg-blue-500 shadow-[0_0_10px_#3b82f6]"
                      animate={{ width: waitingForClearance ? `${(distanceTravelled / trainLength) * 100}%` : '0%' }}
                    />
                  </div>
               </div>

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

          <div className="flex-grow grid grid-cols-12 gap-4 overflow-hidden">
          
          {/* TAB CONTENT SWITCHER */}
          {activeTab === 'PILOT' && (
            <>
              {/* LEFT: POWER & BRAKE GAUGES (VERTICAL GLASS BARS) */}
              <div className="col-span-2 glass-panel rounded-3xl p-6 flex flex-col justify-between border-l-4 border-l-[#4ef2ff]/20">
                <div className="space-y-8 h-full flex flex-col">
                  {/* Traction Power */}
                  <div className="flex-grow flex flex-col">
                    <div className="flex justify-between items-end mb-2">
                      <span className="text-[10px] font-black uppercase text-neutral-500 tracking-widest">Tractive</span>
                      <span className="text-xl font-mono font-black text-[#4ef2ff]">{Math.abs(ammeter).toFixed(0)}</span>
                    </div>
                    <div className="flex-grow bg-white/5 rounded-full p-1 relative overflow-hidden backdrop-blur-sm border border-white/5">
                      <motion.div 
                        className="absolute bottom-1 left-1 right-1 rounded-full bg-gradient-to-t from-[#0066cc] to-[#4ef2ff] shadow-[0_0_20px_rgba(78,242,255,0.3)]"
                        animate={{ height: `${Math.min(100, Math.abs(ammeter)/10)}%` }}
                        transition={{ type: "spring", stiffness: 50 }}
                      />
                      <div className="absolute inset-0 flex flex-col justify-between py-4 pointer-events-none text-[8px] font-bold text-white/10 pl-6">
                         {[100, 75, 50, 25, 0].map(v => <div key={v} className="flex items-center gap-2"><div className="w-4 h-px bg-white/10" />{v}%</div>)}
                      </div>
                    </div>
                    <span className="text-[9px] text-center mt-2 text-neutral-600 font-bold uppercase tracking-tighter">Force (kN)</span>
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
              <div className="col-span-7 flex flex-col gap-4">
                <div className="flex-grow glass-panel rounded-3xl relative flex flex-col items-center justify-center p-8 overflow-hidden">
                   {/* Orbital Speed Arcs */}
                   <div className="relative w-[500px] h-[500px] flex items-center justify-center">
                      <svg viewBox="0 0 200 200" className="w-full h-full transform -rotate-90 scale-110">
                        {/* Background Track */}
                        <circle cx="100" cy="100" r="98" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="2" />
                        
                        {/* Speed Value Arc */}
                        <motion.circle 
                          cx="100" cy="100" r="98" fill="none" 
                          stroke={statusColor} strokeWidth="4" strokeLinecap="round"
                          initial={{ strokeDasharray: "615.75", strokeDashoffset: "615.75" }}
                          animate={{ strokeDashoffset: 615.75 - (speed/maxDialSpeed) * 615.75 }}
                          style={{ filter: `drop-shadow(0 0 15px ${statusColor}AA)` }}
                        />
                      </svg>

                      {/* Center Digital Display (Now with Limits included) */}
                      <div className="absolute flex flex-col items-center justify-center text-center">
                        {/* Target Limit Above */}
                        <motion.div 
                          className="flex flex-col items-center -mb-4"
                          animate={{ opacity: isConnected ? 0.6 : 0 }}
                        >
                           <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Target</span>
                           <span className={`text-4xl font-black ${speed > targetSpeed + 2 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                             {targetSpeed.toFixed(0)}
                           </span>
                        </motion.div>

                        <div className="flex items-center justify-center relative scale-90">
                          <motion.span 
                            key={Math.floor(speed)}
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="text-[160px] font-black leading-none tracking-tighter reactor-glow block"
                          >
                            {Number(speed).toFixed(1)}
                          </motion.span>
                        </div>
                        
                        <div className="flex flex-col items-center">
                           <span className="text-xl font-black text-neutral-500 uppercase tracking-[0.6em] -mt-4">{speedUnit}</span>
                           
                           {/* Next Limit Below */}
                           <motion.div 
                             className="mt-6 flex flex-col items-center border-t border-white/10 pt-4"
                             animate={{ opacity: isConnected ? 0.8 : 0 }}
                           >
                             <span className="text-[10px] font-black text-[#ffa547] uppercase tracking-widest">Next Lim</span>
                             <span className="text-3xl font-black text-[#ffa547]">
                               {nextLimit.toFixed(0)}
                             </span>
                           </motion.div>
                        </div>
                      </div>
                   </div>
                </div>

                {/* TELEMETRY QUICK BAR (Métricas movidas aquí fuera del dial) */}
                <div className="h-20 glass-panel rounded-3xl flex justify-around items-center px-4 border border-white/5 shadow-xl">
                  <MetricSquare label="Gradient" value={gradient.toFixed(1)} unit="%" color="#34d399" />
                  <div className="w-px h-8 bg-white/5" />
                  <MetricSquare label="Target" value={targetSpeed.toFixed(1)} unit="km/h" color="#4ef2ff" />
                  <div className="w-px h-8 bg-white/5" />
                  <MetricSquare label="Next Lim" value={nextLimit.toFixed(1)} unit="km/h" color="#ffa547" />
                </div>
              </div>

              {/* RIGHT: PLANNING & LOGS */}
              <div className="col-span-3 flex flex-col gap-4">
                 {/* G-FORCE / ACCEL MONITOR (Movido aquí para máxima visibilidad) */}
                 <div className="h-44 glass-panel rounded-3xl p-4 flex items-center justify-between border-r-4 border-r-[#4ef2ff]/40 relative overflow-hidden">
                    <div className="flex flex-col z-10">
                      <h3 className="text-[10px] font-black text-neutral-500 uppercase tracking-widest mb-2">G-Force Monitor</h3>
                      <div className="flex items-baseline gap-1">
                        <span className={`text-4xl font-black ${acceleration > 0 ? 'text-[#4ef2ff]' : 'text-[#ffa547]'}`}>
                          {acceleration >= 0 ? '+' : ''}{acceleration.toFixed(2)}
                        </span>
                        <span className="text-[10px] font-bold text-neutral-600 uppercase">m/s²</span>
                      </div>
                      
                      {/* Velocidad Estimada (Projected Speed) */}
                      <div className="mt-3 p-2 bg-white/5 rounded-xl border border-white/5">
                        <div className="text-[8px] font-black text-neutral-500 uppercase tracking-widest mb-1">Estimated Speed (10s)</div>
                        <div className="flex items-baseline gap-2">
                          <span className={`text-xl font-bold ${estimatedSpeed > speed ? 'text-emerald-400' : estimatedSpeed < speed ? 'text-amber-400' : 'text-white'}`}>
                            {estimatedSpeed.toFixed(1)}
                          </span>
                          <span className="text-[9px] font-mono text-neutral-600 uppercase">km/h</span>
                        </div>
                      </div>

                      <div className="mt-2 text-[8px] font-bold text-neutral-500 uppercase tracking-tighter italic">
                        {acceleration > 0.1 ? 'System: Gaining Momentum' : acceleration < -0.1 ? 'System: Active Deceleration' : 'System: Inertia Stable'}
                      </div>
                    </div>

                    <div className="h-32 w-4 bg-white/5 rounded-full relative overflow-hidden border border-white/10 shadow-inner mr-2 z-10">
                        {/* Center Neutral Line */}
                        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/20 z-20" />
                        
                        {/* The Dynamic Bar */}
                        <motion.div 
                          className="absolute left-0 right-0 z-10"
                          style={{ 
                            top: acceleration > 0 ? 'auto' : '50%',
                            bottom: acceleration > 0 ? '50%' : 'auto',
                            backgroundColor: acceleration > 0 ? '#4ef2ff' : '#ffa547',
                            boxShadow: acceleration > 0 ? '0 0 15px #4ef2ff88' : '0 0 15px #ffa54788'
                          }}
                          animate={{ 
                            height: `${Math.min(50, Math.abs(acceleration * 40))}%` 
                          }}
                          transition={{ type: 'spring', stiffness: 120, damping: 14 }}
                        />
                    </div>
                 </div>

                 {/* NAVIGATION ALERT (Movido aquí para despejar el centro) */}
                 <div className="h-32 glass-panel rounded-3xl p-5 flex gap-5 border-l-4 border-l-[#ffa547]/40 overflow-hidden relative">
                   <div className="absolute top-0 right-0 p-2 opacity-5"><Activity size={80} className="text-[#ffa547]" /></div>
                   <div className="w-14 h-14 rounded-2xl bg-[#ffa547]/10 flex items-center justify-center text-[#ffa547] border border-[#ffa547]/20 shadow-[0_0_20px_rgba(255,165,71,0.1)]">
                      <ShieldAlert size={28} />
                   </div>
                   <div className="flex flex-col justify-center">
                      <span className="text-[10px] font-black text-[#ffa547] uppercase tracking-[0.2em] mb-1">Navigation Alert</span>
                      <div className="text-sm font-bold text-[#f5f6fb]/80">Restriction: <span className="text-[#ffa547]">{nextLimit.toFixed(0)} km/h</span> at {nextLimitDist.toFixed(0)}m.</div>
                   </div>
                </div>

                 {/* Planning Strips */}
                 <div className="flex-grow glass-panel rounded-3xl p-6 relative overflow-hidden flex flex-col gap-4">
                    <div className="flex justify-between items-center mb-2">
                       <h3 className="text-[10px] font-black text-neutral-500 uppercase tracking-[0.2em] flex items-center gap-2">
                          <Navigation size={14} className="text-[#4ef2ff]" /> Route Matrix
                       </h3>
                       <span className="text-[9px] bg-[#4ef2ff]/10 text-[#4ef2ff] px-3 py-0.5 rounded-full border border-[#4ef2ff]/20 uppercase font-black">Scanning</span>
                    </div>
                    
                    <div className="flex-grow relative bg-[#030514]/50 rounded-2xl border border-white/5 overflow-hidden">
                       {/* Vertical Scale */}
                       <div className="absolute left-4 inset-y-4 flex flex-col justify-between text-[8px] font-black text-[#f5f6fb]/20 pointer-events-none">
                          {[4000, 3000, 2000, 1000, 0].map(m => <span key={m}>{m}m</span>)}
                       </div>
                       
                       {/* Grid Overlay */}
                       <div className="absolute inset-0 opacity-10 industrial-grid" />

                       {/* Marker Entities */}
                       <motion.div 
                        className="absolute bottom-1/3 right-4 flex items-center gap-3 bg-[#ffa547]/10 p-2 rounded-xl border border-[#ffa547]/20"
                        initial={{ x: 20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                       >
                          <div className="text-right">
                             <div className="text-[8px] font-black text-[#ffa547] uppercase">Limit Transition</div>
                             <div className="text-xs font-black text-white">{nextLimit.toFixed(1)} km/h</div>
                          </div>
                          <ChevronRight size={18} className="text-[#ffa547]" />
                       </motion.div>
                    </div>
                 </div>

                 {/* System Telemetry Logs */}
                 <div className="h-48 glass-panel rounded-3xl p-5 flex flex-col overflow-hidden">
                    <h3 className="text-[9px] font-black text-neutral-600 uppercase tracking-widest mb-4 flex items-center gap-2 px-2">
                       <Activity size={14} className="text-[#4ef2ff]" /> Log Feed
                    </h3>
                    <div className="flex flex-col gap-3 overflow-y-auto px-2 custom-scrollbar">
                       <LogEntry type="info" message="Neural link status: OK" time="14:20" />
                       <LogEntry type="warn" message="Brake pressure variance +0.1" time="14:19" />
                       <LogEntry type="info" message="Panto: FULL CONTACT" time="14:19" />
                       <LogEntry type="info" message="OBCU integrity: 100%" time="14:18" />
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
                  <TelemetryBar label="Train Pipe" value={trainPipe} max={5} unit="bar" color="#4ef2ff" />
                  <TelemetryBar label="Main Reservoir" value={data?.MainResPressureBAR || 0} max={10} unit="bar" color="#34d399" />
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

          {activeTab !== 'PILOT' && activeTab !== 'TELEMETRY' && activeTab !== 'CONFIG' && (
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

const MetricSquare = ({ label, value, unit, color }: any) => (
  <div className="flex flex-col items-center px-8 border-r border-white/5 last:border-0">
    <span className="text-[9px] text-[#f5f6fb]/30 uppercase font-black tracking-tighter mb-1">{label}</span>
    <span className="text-2xl font-black" style={{ color }}>{value}<span className="text-xs ml-1 opacity-40 font-normal">{unit}</span></span>
  </div>
);

const LogEntry = ({ type, message, time }: any) => (
  <div className="flex justify-between items-center text-[10px] border-b border-white/5 pb-2 last:border-0">
    <div className="flex gap-3 items-center">
      <div className={`w-1.5 h-1.5 rounded-full ${type === 'info' ? 'bg-[#4ef2ff] shadow-[0_0_8px_#4ef2ff]' : 'bg-[#ffa547] shadow-[0_0_8px_#ffa547]'}`} />
      <span className="text-[#f5f6fb]/70 font-medium">{message}</span>
    </div>
    <span className="text-[#f5f6fb]/30 font-mono italic">{time}</span>
  </div>
);

const TelemetryBar = ({ label, value, max, unit, color }: any) => (
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