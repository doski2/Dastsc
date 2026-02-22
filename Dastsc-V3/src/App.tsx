import { useState } from 'react'
import { Activity, ShieldCheck, Cpu, Settings } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

function App() {
  const [activeTab, setActiveTab] = useState('PILOT')

  const tabs = [
    { id: 'PILOT', icon: Activity, label: 'PILOT HUD' },
    { id: 'IA', icon: Cpu, label: 'IA ASSIST' },
    { id: 'SAFETY', icon: ShieldCheck, label: 'SYSTEM LOG' },
    { id: 'CONFIG', icon: Settings, label: 'CONFIG' },
  ]

  return (
    <div className="h-screen w-screen flex flex-col bg-[#050505] text-[#d0d0d0] overflow-hidden">
      {/* Header - Minimalist */}
      <header className="h-12 border-b border-white/5 flex items-center justify-between px-6 bg-[#0a0a0a]">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
          <span className="text-xs font-bold tracking-[0.2em] text-white/60">NEXUS V3 // ENGINE_FUSION</span>
        </div>
        <div className="text-[10px] font-mono text-white/30 uppercase tracking-widest">
          Build 3.0.0-ALPHA // STABLE_READY
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 relative overflow-hidden flex bg-black/20">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="flex-1 p-6"
          >
            {activeTab === 'PILOT' && (
              <div className="h-full flex flex-col gap-6">
                {/* Track Profile Placeholder (Future Canvas) */}
                <div className="h-2/3 border border-white/5 rounded-sm bg-gradient-to-b from-white/5 to-transparent flex items-center justify-center relative overflow-hidden">
                  <div 
                    className="absolute inset-0 opacity-10 pointer-events-none grid-background" 
                  />
                  <span className="text-[10px] font-mono text-white/20 uppercase tracking-[0.5em]">Canvas Engine Active</span>
                </div>

                {/* Bottom Stats Grid */}
                <div className="h-1/3 grid grid-cols-3 gap-6">
                  <div className="border border-white/5 bg-white/[0.02] p-4 flex flex-col justify-between">
                    <span className="text-[9px] text-white/40 uppercase tracking-widest">Speed Dynamics</span>
                    <div className="text-3xl font-light text-white/90">0.0 <span className="text-xs text-white/30">km/h</span></div>
                  </div>
                  <div className="border border-white/5 bg-white/[0.02] p-4 flex flex-col justify-between">
                    <span className="text-[9px] text-white/40 uppercase tracking-widest">Brake Cylinder</span>
                    <div className="text-3xl font-light text-cyan-500/80">0.00 <span className="text-xs text-white/30">bar</span></div>
                  </div>
                  <div className="border border-white/5 bg-white/[0.02] p-4 flex flex-col justify-between">
                    <span className="text-[9px] text-white/40 uppercase tracking-widest">G-Inertial</span>
                    <div className="w-12 h-12 rounded-full border border-white/10 mx-auto relative flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 blur-[1px]" />
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {activeTab !== 'PILOT' && (
              <div className="h-full flex items-center justify-center">
                <span className="text-[10px] font-mono text-white/10 uppercase tracking-[1em]">Initialising {activeTab} Module...</span>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Navigation Footer */}
      <footer className="h-16 border-t border-white/5 flex justify-center bg-[#0a0a0a]">
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
