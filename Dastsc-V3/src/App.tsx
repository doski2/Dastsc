import { useState } from 'react'
import { Activity, ShieldCheck, Cpu, Settings } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTelemetry } from './v3/core/TelemetryContext'
import { TrackProfile } from './v3/components/display/TrackProfile'
import { Speedometer } from './v3/components/display/Speedometer'
import { BrakingCurve } from './v3/components/display/BrakingCurve'
import { ProfileSelector } from './v3/components/display/ProfileSelector'

function PhysicsRow({ label, value, unit, color = "text-white/70" }: { label: string, value: number, unit: string, color?: string }) {
  return (
    <div className="flex justify-between items-center text-sm font-mono">
      <span className="text-white/30 uppercase tracking-tighter">{label}</span>
      <div className="flex gap-1 items-baseline">
        <span className={color}>{value.toFixed(2)}</span>
        <span className="text-[10px] text-white/20">{unit}</span>
      </div>
    </div>
  )
}

function DataPoint({ label, value }: { label: string, value: string | number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-white/20 uppercase tracking-widest leading-none">{label}</span>
      <span className="text-base font-light text-white/80">{value}</span>
    </div>
  )
}

function App() {
  const [activeTab, setActiveTab] = useState('PILOT')
  const { data, isConnected, activeProfile } = useTelemetry()

  const formatDistance = (m: number) => {
    if (data.SpeedUnit === 'MPH') {
      const yards = m * 1.09361;
      return yards < 1760 ? `${Math.round(yards)}yd` : `${(m * 0.000621371).toFixed(2)}mi`;
    }
    return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
  };

  const tabs = [
    { id: 'PILOT', icon: Activity, label: 'PILOT HUD' },
    { id: 'IA', icon: Cpu, label: 'IA ASSIST' },
    { id: 'SAFETY', icon: ShieldCheck, label: 'SYSTEM LOG' },
    { id: 'CONFIG', icon: Settings, label: 'CONFIG' },
  ]

  return (
    <div className="h-screen w-screen flex flex-col bg-[#050505] text-[#d0d0d0] overflow-hidden leading-none font-sans">
      {/* Encabezado - Minimalista */}
      <header className="h-12 border-b border-white/5 flex items-center justify-between px-6 bg-[#0a0a0a] shrink-0">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-cyan-500 animate-pulse' : 'bg-red-500'}`} />
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-[0.2em] text-white/60">NEXUS V3 // {activeProfile?.name || data.LocoName || 'SELECT TRAIN'}</span>
            <span className="text-[11px] font-mono text-cyan-500/60 uppercase tracking-widest leading-none mt-1">
              {activeProfile ? `PROFILE: ${activeProfile.id}` : 'NO PROFILE SELECTED'}
            </span>
          </div>
        </div>
        <div className="text-xs font-mono text-white/30 uppercase tracking-widest">
          {data.TimeOfDay} // {isConnected ? 'Link Active' : 'Link Offline'} // 3.0.0-PROTOTYPE
        </div>
      </header>

      {/* Área de contenido principal */}
      <main className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-full"
          >
            {activeTab === 'PILOT' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col gap-0 h-full"
              >
                {/* Sección superior: Perfil de vía */}
                <div className="h-[220px] relative">
                  <TrackProfile />
                  
                  {/* Info Bar (Del nuevo boceto) */}
                  <div className="absolute bottom-0 left-0 right-0 h-10 bg-black/60 border-y border-white/5 backdrop-blur-md flex items-center px-6 justify-between">
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                         <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                         <span className="text-xs font-mono text-white/60 tracking-tighter uppercase leading-none">Link Active</span>
                      </div>
                      <div className="text-sm font-mono leading-none">
                        <span className="text-white/30">SIGNAL:</span>{' '}
                        <span className={`font-bold ${
                          data.NextSignalAspect === 'DANGER' ? 'text-red-500' : 
                          data.NextSignalAspect === 'CLEAR' ? 'text-green-500' : 'text-yellow-500'
                        }`}>
                          {data.NextSignalAspect} @ {formatDistance(data.DistToNextSignal)}
                        </span>
                      </div>
                    </div>

                    {/* Safety Indicators (Movidos aquí) */}
                    <div className="flex gap-2 h-7">
                      <div className={`px-4 flex items-center justify-center rounded-sm border transition-all duration-300 ${data.AWS > 0 ? 'bg-yellow-500/20 border-yellow-500 text-yellow-500 animate-pulse shadow-[0_0_10px_rgba(234,179,8,0.2)]' : 'bg-white/5 border-white/5 text-white/10'}`}>
                        <span className="text-[11px] font-bold font-mono">AWS</span>
                      </div>
                      <div className={`px-4 flex items-center justify-center rounded-sm border transition-all duration-300 ${data.DSD > 0 ? 'bg-red-500/20 border-red-500 text-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.2)]' : 'bg-white/5 border-white/5 text-white/10'}`}>
                        <span className="text-[11px] font-bold font-mono">DSD</span>
                      </div>
                      <div className={`px-4 flex items-center justify-center rounded-sm border transition-all duration-300 ${data.DRA ? 'bg-red-600/40 border-red-500 text-red-100' : 'bg-white/5 border-white/5 text-white/10'}`}>
                        <span className="text-[11px] font-bold font-mono">DRA</span>
                      </div>
                      <div className={`px-4 flex items-center justify-center rounded-sm border transition-all duration-300 ${data.DoorsOpen.left || data.DoorsOpen.right ? 'bg-orange-500/20 border-orange-500 text-orange-500' : 'bg-white/5 border-white/5 text-white/10'}`}>
                        <span className="text-[11px] font-bold font-mono uppercase">Doors</span>
                      </div>
                    </div>

                    <div className="text-xs font-mono text-white/40 uppercase tracking-widest leading-none">
                       TRIP: {data.SpeedUnit === 'MPH' 
                         ? `${(data.TripDistance * 0.000621371).toFixed(2)} mi` 
                         : `${(data.TripDistance / 1000).toFixed(2)} km`
                       } // Sta: {data.location}
                    </div>
                  </div>
                </div>

                {/* Sección inferior: Diseño de 3 columnas con espaciado ajustado */}
                <div className="grid grid-cols-3 gap-4 flex-1 p-4">
                  {/* Columna 1: Velocidad y física */}
                  <div className="flex flex-col gap-4">
                    <Speedometer />
                    <div className="p-4 bg-white/5 border border-white/5 rounded-sm flex-1">
                      <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-4 font-mono">Physics Hub</h3>
                      <div className="space-y-3">
                        <PhysicsRow label="Amperage" value={data.Amperage} unit={data.AmperageUnit} color={data.Amperage >= 0 ? "text-yellow-500" : "text-cyan-400"} />
                        <PhysicsRow label="Brake Cyl" value={data.BrakeCylinderPressure} unit={data.PressureUnit} />
                        <PhysicsRow label="Brake Pipe" value={data.BrakePipePressure} unit={data.PressureUnit} />
                      </div>
                    </div>
                  </div>

                  {/* Columna 2: Gráfico de IA proyectivo */}
                  <BrakingCurve />

                  {/* Columna 3: Métricas secundarias */}
                  <div className="flex flex-col gap-4">
                    <div className="p-4 bg-white/5 border border-white/5 rounded-sm flex-1">
                      <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-4 font-mono">Adaptive Telemetry</h3>
                      <div className="space-y-4">
                        <div className="flex justify-between items-center border-b border-white/5 pb-2 mb-2">
                          <span className="text-[11px] text-white/30 uppercase font-mono">Next Speed</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-mono font-bold text-yellow-500">{Math.round(data.NextSpeedLimit)} {data.SpeedUnit}</span>
                            <span className="text-[11px] text-white/40 font-mono">
                              in {formatDistance(data.DistToNextSpeedLimit)}
                            </span>
                          </div>
                        </div>
                        <DataPoint label="Reverser" value={data.Reverser > 0 ? 'FOR' : data.Reverser < 0 ? 'REV' : 'NEU'} />
                        <DataPoint label="Throttle" value={`${Math.round(data.Throttle * 100)}%`} />
                        <DataPoint label="Train Brake" value={`${Math.round(data.TrainBrake * 100)}%`} />
                        <div className="grid grid-cols-2 gap-4">
                          <DataPoint label="Train Length" value={`${data.TrainLength.toFixed(1)}m`} />
                          <DataPoint label="Train Mass" value={`${data.TrainMass.toFixed(0)} T`} />
                        </div>
                        <DataPoint label="Projected Dist" value={formatDistance(data.ProjectedBrakingDistance)} />
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
            
            {activeTab === 'CONFIG' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="h-full p-6 flex flex-col gap-6"
              >
                <div className="flex-1 grid grid-cols-2 gap-6">
                  <ProfileSelector />
                  
                  <div className="flex flex-col gap-6">
                    <div className="p-4 bg-white/5 border border-white/5 rounded-sm">
                       <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-4 font-mono">System Parameters</h3>
                       <div className="space-y-4">
                          <PhysicsRow label="Units Override" value={0} unit={data.SpeedUnit} color="text-cyan-500" />
                          <PhysicsRow label="Auto-detect" value={1} unit="BOOL" />
                          <PhysicsRow label="Sim Frequency" value={60} unit="HZ" />
                       </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab !== 'PILOT' && activeTab !== 'CONFIG' && (
              <div className="h-full flex items-center justify-center">
                <span className="text-[10px] font-mono text-white/10 uppercase tracking-[1em]">Initialising {activeTab} Module...</span>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Pie de página de navegación */}
      <footer className="h-16 border-t border-white/5 flex justify-center bg-[#0a0a0a] shrink-0">
        <div className="flex gap-2 p-2">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex flex-col items-center justify-center w-24 gap-1.5 transition-all duration-300
                  ${isActive ? 'text-cyan-400 bg-white/5 border-t-2 border-cyan-500' : 'text-white/30 hover:text-white/60'}
                `}
              >
                <Icon size={18} strokeWidth={isActive ? 2.5 : 1.5} />
                <span className="text-[11px] font-bold tracking-tighter uppercase">{tab.label}</span>
              </button>
            )
          })}
        </div>
      </footer>
    </div>
  )
}

export default App

