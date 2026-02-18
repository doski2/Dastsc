import React, { useState } from 'react';
import { Settings, X, Eye, EyeOff, Maximize } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface DevOverlayProps {
  name: string;
  isActive: boolean;
  children: React.ReactNode;
  onUpdate?: (id: string, updates: any) => void;
  config?: any;
}

export const DevOverlay: React.FC<DevOverlayProps> = ({ name, isActive, children, onUpdate, config }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!config?.isVisible && !isActive) return null;

  return (
    <div className={`relative transition-all duration-300 ${
      isActive ? 'ring-2 ring-blue-500/50 ring-dashed p-1 bg-blue-500/5' : ''
    } ${!config?.isVisible ? 'opacity-30 grayscale' : ''}`}>
      
      {isActive && (
        <div className="absolute -top-6 left-0 z-[100] flex items-center gap-1">
          <div className="bg-blue-600 text-[8px] font-black text-white px-2 py-0.5 rounded shadow-lg uppercase tracking-widest flex items-center gap-1">
            <Maximize size={8} /> {name}
          </div>
          <button 
            onClick={() => setIsOpen(!isOpen)}
            className="bg-neutral-800 hover:bg-blue-600 text-white p-1 rounded shadow-lg transition-colors pointer-events-auto"
            title="Configurar componente"
            aria-label="Configurar componente"
          >
            <Settings size={10} />
          </button>
        </div>
      )}

      <AnimatePresence>
        {isActive && isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute top-8 left-0 z-[200] bg-neutral-900 border border-neutral-700 p-3 rounded-xl shadow-2xl w-48 backdrop-blur-xl"
          >
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] font-black uppercase text-blue-400">Editor de HTML-UI</span>
              <button 
                onClick={() => setIsOpen(false)} 
                title="Cerrar" 
                aria-label="Cerrar editor"
                className="hover:text-red-500 transition-colors"
              >
                <X size={12} />
              </button>
            </div>
            
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label 
                  htmlFor={`label-input-${name}`}
                  className="text-[8px] text-neutral-500 uppercase font-bold"
                >
                  Etiqueta Directa
                </label>
                <input 
                  id={`label-input-${name}`}
                  type="text" 
                  value={config?.label || ''} 
                  onChange={(e) => onUpdate?.(name, { label: e.target.value })}
                  placeholder={name}
                  className="bg-black border border-neutral-700 rounded px-2 py-1 text-[10px] text-white focus:border-blue-500 outline-none"
                />
              </div>

              <div className="flex items-center justify-between">
                <label className="text-[8px] text-neutral-500 uppercase font-bold">Visibilidad</label>
                <button 
                  onClick={() => onUpdate?.(name, { isVisible: !config?.isVisible })}
                  className={`p-1 rounded transition-colors ${config?.isVisible ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'}`}
                  title={config?.isVisible ? "Ocultar componente" : "Mostrar componente"}
                  aria-label={config?.isVisible ? "Ocultar componente" : "Mostrar componente"}
                >
                  {config?.isVisible ? <Eye size={12} /> : <EyeOff size={12} />}
                </button>
              </div>

              <div className="flex flex-col gap-1">
                <label 
                  htmlFor={`scale-input-${name}`}
                  className="text-[8px] text-neutral-500 uppercase font-bold"
                >
                  Ajuste Escala
                </label>
                <input 
                  id={`scale-input-${name}`}
                  type="range" min="0.5" max="2" step="0.1"
                  value={config?.scale || 1}
                  onChange={(e) => onUpdate?.(name, { scale: parseFloat(e.target.value) })}
                  className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  title="Ajustar escala del componente"
                />
              </div>
            </div>

            <div className="mt-4 pt-2 border-t border-neutral-800 flex justify-end">
               <span className="text-[8px] text-neutral-600 italic">Autosave Active</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div 
        animate={{ scale: config?.scale || 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        {children}
      </motion.div>
    </div>
  );
};

