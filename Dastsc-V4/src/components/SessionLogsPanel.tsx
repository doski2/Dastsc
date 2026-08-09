import { useCallback, useEffect, useState } from 'react';
import { fetchSessionLogs, type SessionLogSummary } from '../lib/sessionDiagnostic';

const API_BASE = 'http://localhost:8000';

export function SessionLogsPanel() {
  const [sessions, setSessions] = useState<SessionLogSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const list = await fetchSessionLogs();
    setSessions(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const download = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/debug/sessions/${encodeURIComponent(id)}`);
      if (!res.ok) return;
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `session_${id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  };

  return (
    <section className="rounded-lg border border-white/5 bg-nexus-raised p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[10px] font-mono uppercase tracking-widest text-white/30">
          Logs de sesión (últimos 5)
        </h3>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="text-[9px] font-mono uppercase tracking-wider text-cyan-400/80 hover:text-cyan-300 disabled:opacity-40"
        >
          {loading ? '…' : 'Actualizar'}
        </button>
      </div>
      <p className="text-[10px] text-white/40 mb-3 font-mono">
        Se guarda automáticamente al abrir V4 con backend. Pásame el JSON para analizar.
      </p>
      {sessions.length === 0 ? (
        <p className="text-xs font-mono text-white/30">Sin sesiones aún.</p>
      ) : (
        <ul className="space-y-2">
          {sessions.map(s => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-2 rounded border border-white/5 bg-black/20 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-xs font-mono text-white/80 truncate">{s.id}</div>
                <div className="text-[9px] font-mono text-white/40">
                  {s.event_count ?? 0} eventos
                  {s.ended_at ? ' · cerrada' : ' · activa'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void download(s.id)}
                className="shrink-0 text-[9px] font-mono uppercase text-emerald-400/90 hover:text-emerald-300"
              >
                JSON
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
