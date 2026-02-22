import { useState } from 'react'
import { Activity, ShieldCheck, Cpu, Settings } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTelemetry } from './v3/core/TelemetryContext'
import { TrackProfile } from './v3/components/display/TrackProfile'
import { Speedometer } from './v3/components/display/Speedometer'

function PhysicsRow({ label, value, unit, color = "text-white/70" }: { label: string, value: number, unit: string, color?: string }) {
  return (
    <div className="flex justify-between items-center text-[11px] font-mono">
      <span className="text-white/30 uppercase tracking-tighter">{label}</span>
      <div className="flex gap-1 items-baseline">
        <span className={color}>{value.toFixed(2)}</span>
        <span className="text-[8px] text-white/20">{unit}</span>
      </div>
    </div>
  )
}

function DataPoint({ label, value }: { label: string, value: string | number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[8px] text-white/20 uppercase tracking-widest leading-none">{label}</span>
      <span className="text-sm font-light text-white/80">{value}</span>
    </div>
  )
}

function App() {
  const [activeTab, setActiveTab] = useState('PILOT')
  const { data, isConnected } = useTelemetry()

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
          <span className="text-xs font-bold tracking-[0.2em] text-white/60">NEXUS V3 // {data.LocoName || 'SEARCHING...'}</span>
        </div>
        <div className="text-[10px] font-mono text-white/30 uppercase tracking-widest">
          {isConnected ? 'Link Active' : 'Link Offline'} // 3.0.0-PROTOTYPE
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
                className="flex flex-col gap-4 h-full"
              >
                {/* Sección superior: Perfil de vía */}
                <TrackProfile />

                {/* Sección inferior: Diseño de 3 columnas */}
                <div className="grid grid-cols-3 gap-4 flex-1 px-4 pb-4">
                  {/* Columna 1: Velocidad y física */}
                  <div className="flex flex-col gap-4">
                    <Speedometer />
                    <div className="p-4 bg-white/5 border border-white/5 rounded-sm flex-1">
                      <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-4 font-mono">Physics Hub</h3>
                      <div className="space-y-3">
                        <PhysicsRow label="Amperage" value={data.Amperage} unit="A" color="text-yellow-500" />
                        <PhysicsRow label="Brake Cyl" value={data.BrakeCylinderPressure} unit="PSI" />
                        <PhysicsRow label="Brake Pipe" value={data.BrakePipePressure} unit="PSI" />
                      </div>
                    </div>
                  </div>

                  {/* Columna 2: Marcador de posición del gráfico central */}
                  <div className="col-span-1 bg-white/[0.02] border border-white/5 rounded-sm flex flex-col items-center justify-center relative backdrop-blur-sm group">
                    <div className="absolute top-4 left-4 text-[10px] text-white/20 uppercase tracking-widest font-mono">Braking Curve // Dynamic</div>
                    <div className="text-white/10 italic text-sm group-hover:text-cyan-500/40 transition-colors">Graph Engine Initialization...</div>
                    
                    {/* Línea de escaneo decorativa */}
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/[0.02] to-transparent h-20 w-full animate-scan" />
                  </div>

                  {/* Columna 3: Métricas secundarias */}
                  <div className="flex flex-col gap-4">
                    <div className="p-4 bg-white/5 border border-white/5 rounded-sm flex-1">
                      <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-4 font-mono">Adaptive Telemetry</h3>
                      <div className="space-y-4">
                        <DataPoint label="Reverser" value={data.Reverser > 0 ? 'FOR' : data.Reverser < 0 ? 'REV' : 'NEU'} />
                        <DataPoint label="Throttle" value={`${Math.round(data.Throttle * 100)}%`} />
                        <DataPoint label="Train Brake" value={`${Math.round(data.TrainBrake * 100)}%`} />
                        <DataPoint label="Projected Dist" value={`${data.ProjectedBrakingDistance.toFixed(0)}m`} />
                      </div>
                    </div>
                    <div className="h-28 bg-cyan-500/5 border border-cyan-500/10 rounded-sm flex items-center justify-center">
                      <span className="text-cyan-500/40 text-[10px] font-mono animate-pulse uppercase tracking-widest font-bold">Systems Nominal</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
            
            {activeTab !== 'PILOT' && (
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
                <Icon size={16} strokeWidth={isActive ? 2.5 : 1.5} />
                <span className="text-[9px] font-bold tracking-tighter uppercase">{tab.label}</span>
              </button>
            )
          })}
        </div>
      </footer>
    </div>
  )
}

export default App

