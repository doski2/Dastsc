import type { ReactNode } from 'react';
import type { PolicyMode } from '@nexus/kernel';

interface AppShellProps {
  trainName: string;
  profileId: string | null;
  mode: PolicyMode;
  connected: boolean;
  children: ReactNode;
}

export function AppShell({ trainName, profileId, mode, connected, children }: AppShellProps) {
  return (
    <div className="h-screen flex flex-col bg-nexus-surface text-sm">
      <header className="h-12 flex items-center justify-between px-6 border-b border-white/5 bg-nexus-raised shrink-0">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-cyan-400 animate-pulse' : 'bg-red-500'}`} />
          <span className="font-mono text-xs tracking-widest text-white/50 uppercase">
            Nexus V4 · {trainName}
          </span>
        </div>
        <div className="flex items-center gap-4 font-mono text-[11px] text-white/40 uppercase">
          <span>{profileId ?? 'sin perfil'}</span>
          <span className="text-cyan-400/80">{mode}</span>
        </div>
      </header>

      <main className="flex-1 flex flex-col gap-6 p-8 max-w-3xl mx-auto w-full justify-center">
        {children}
      </main>

      <footer className="h-14 border-t border-white/5 flex items-center justify-center gap-8 text-[11px] font-mono uppercase tracking-wider">
        <span className="text-cyan-400/90">Agent</span>
        <a
          href="http://localhost:5173"
          target="_blank"
          rel="noreferrer"
          className="text-white/20 hover:text-white/50 transition-colors"
        >
          Pilot (V3)
        </a>
        <span className="text-white/20">Config</span>
      </footer>
    </div>
  );
}
