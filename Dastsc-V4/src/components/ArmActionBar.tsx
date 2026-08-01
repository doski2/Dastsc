import { useEffect, useState } from 'react';
import type { AgentAction } from '@nexus/kernel';
import type { CommandAck } from '../lib/commandTypes';

export function ArmActionBar({
  action,
  mode,
  connected,
  lastAck,
  onConfirm,
}: {
  action?: AgentAction;
  mode: string;
  connected: boolean;
  lastAck: CommandAck | null;
  onConfirm: (action: AgentAction) => void;
}) {
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!lastAck?.ok) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 2000);
    return () => clearTimeout(t);
  }, [lastAck]);

  if (mode === 'AUTO') {
    if (!action) return null;
    return (
      <section
        className={`rounded-lg border p-4 transition-colors ${
          flash
            ? 'border-emerald-500/50 bg-emerald-500/10'
            : 'border-cyan-500/40 bg-cyan-500/5'
        }`}
      >
        <div className="text-[10px] font-mono uppercase tracking-widest text-cyan-300/80 mb-1">
          AUTO — mando en curso
        </div>
        <p className="text-sm text-white/70">
          {action.reason}: <span className="font-mono text-white">{action.command}</span>
          {' → '}
          <span className="font-mono text-cyan-300">{action.value.toFixed(2)}</span>
        </p>
        {lastAck && (
          <p className={`text-[10px] font-mono mt-2 ${lastAck.ok ? 'text-emerald-400' : 'text-red-400'}`}>
            {lastAck.ok
              ? `Enviado · ${lastAck.line ?? ''}`
              : `Error: ${lastAck.error ?? 'desconocido'} — volviendo a SUGGEST`}
          </p>
        )}
      </section>
    );
  }

  if (mode !== 'ARM' || !action) return null;

  return (
    <section
      className={`rounded-lg border p-4 transition-colors ${
        flash
          ? 'border-emerald-500/50 bg-emerald-500/10'
          : 'border-amber-500/40 bg-amber-500/5'
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-amber-300/80 mb-1">
            ARM — confirmar mando
          </div>
          <p className="text-sm text-white/70">
            {action.reason}: <span className="font-mono text-white">{action.command}</span>
            {' → '}
            <span className="font-mono text-cyan-300">{action.value.toFixed(2)}</span>
          </p>
          {lastAck && (
            <p className={`text-[10px] font-mono mt-2 ${lastAck.ok ? 'text-emerald-400' : 'text-red-400'}`}>
              {lastAck.ok
                ? `Enviado · ${lastAck.line ?? ''}`
                : `Error: ${lastAck.error ?? 'desconocido'}`}
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={!connected}
          onClick={() => onConfirm(action)}
          className="shrink-0 rounded border border-amber-400/60 bg-amber-500/20 px-4 py-2 text-xs font-mono font-semibold uppercase tracking-wider text-amber-100 hover:bg-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Confirmar
        </button>
      </div>
    </section>
  );
}
