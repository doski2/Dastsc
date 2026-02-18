import { useTelemetry } from './hooks/useTelemetry';
import { NexusDashboard } from './components/NexusDashboard';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import './App.css';

function App() {
  const { isConnected } = useTelemetry();
  const [isBooting, setIsBooting] = useState(true);

  // Simulación de secuencia de arranque industrial (Modernizado)
  useEffect(() => {
    const timer = setTimeout(() => setIsBooting(false), 2500);
    return () => clearTimeout(timer);
  }, []);

  if (isBooting) {
    return (
      <div className="h-screen w-screen bg-black flex flex-col items-center justify-center font-mono text-blue-500 overflow-hidden relative">
        {/* Animated grid background during boot */}
        <div className="absolute inset-0 industrial-grid opacity-20" />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          className="relative z-10 text-left space-y-4 p-12 glass-panel border border-blue-500/30 rounded-3xl"
        >
          <div className="flex items-center gap-4 mb-6">
             <div className="w-12 h-12 rounded-xl bg-blue-500/20 border border-blue-500/50 flex items-center justify-center">
                <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
             </div>
             <div>
                <div className="text-xl font-black tracking-tighter text-white uppercase italic">Nexus <span className="text-blue-500">Core</span></div>
                <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-[0.3em]">Quantum Telemetry OS</div>
             </div>
          </div>

          <div className="space-y-1">
            <div className="text-[10px] flex justify-between gap-12"><span>SYS_OOB_RECOVERY:</span> <span className="text-emerald-500">READY</span></div>
            <div className="text-[10px] flex justify-between gap-12"><span>BRIDGE_LINK_PROTOCOL:</span> <span className="text-emerald-500">V4_SECURE</span></div>
            <div className="text-[10px] flex justify-between gap-12"><span>VIRTUAL_LUA_HARVESTER:</span> <span className="text-blue-500">POLLING...</span></div>
          </div>

          <div className="w-full bg-blue-500/10 h-1 mt-6 rounded-full overflow-hidden">
             <motion.div 
               initial={{ width: 0 }}
               animate={{ width: "100%" }}
               transition={{ duration: 2, ease: "easeInOut" }}
               className="h-full bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]"
             />
          </div>
          
          <div className="text-[8px] text-neutral-600 mt-4 text-center">ENCRYPTED CONNECTION STABLISHED WITH RAILWORKS PLUGIN</div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black scanlines overflow-hidden">
      <NexusDashboard />
      
      {/* Global Connection Badge */}
      <div className={`fixed bottom-20 right-8 z-[100] px-4 py-1.5 rounded-full border flex items-center gap-3 glass-panel backdrop-blur-3xl transition-all duration-500 ${
        isConnected ? 'border-emerald-500/30 text-emerald-400' : 'border-red-500/30 text-red-400'
      }`}>
        <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981]' : 'bg-red-500 shadow-[0_0_10px_#ef4444]'}`} />
        <span className="text-[10px] font-black uppercase tracking-[0.2em]">
          {isConnected ? 'Bridge Linked' : 'Link Offline'}
        </span>
      </div>
    </div>
  );
}

export default App;

