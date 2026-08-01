import type { PolicyMode } from '@nexus/kernel';

const MODES: { id: PolicyMode; label: string; hint: string; disabled?: boolean }[] = [
  {
    id: 'SUGGEST',
    label: 'SUGGEST',
    hint: 'Solo recomendaciones — sin comandos al simulador',
  },
  {
    id: 'ARM',
    label: 'ARM',
    hint: 'Confirmar envía mando a SendCommand.txt (Lua)',
  },
  {
    id: 'AUTO',
    label: 'AUTO',
    hint: 'Envía frenado y OFF automáticamente (sin tracción; se suspende en SAFETY)',
  },
];

export function PolicyModeSelector({
  mode,
  onChange,
}: {
  mode: PolicyMode;
  onChange: (mode: PolicyMode) => void;
}) {
  return (
    <section className="rounded-lg border border-white/5 bg-nexus-raised p-4 space-y-3">
      <h3 className="text-[10px] font-mono uppercase tracking-widest text-white/30">
        Modo agente
      </h3>
      <div className="space-y-2">
        {MODES.map(item => {
          const active = mode === item.id;
          return (
            <button
              key={item.id}
              type="button"
              disabled={item.disabled}
              onClick={() => onChange(item.id)}
              className={`w-full text-left rounded border px-3 py-2.5 transition-colors ${
                item.disabled
                  ? 'border-white/5 opacity-40 cursor-not-allowed'
                  : active
                    ? 'border-cyan-500/50 bg-cyan-500/10'
                    : 'border-white/5 hover:border-white/15 bg-black/20'
              }`}
            >
              <div className={`text-xs font-mono font-semibold ${active ? 'text-cyan-300' : 'text-white/70'}`}>
                {item.label}
              </div>
              <div className="text-[10px] text-white/35 mt-1 leading-relaxed">{item.hint}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
