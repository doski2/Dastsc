import type { ReactNode } from 'react';
import type { PolicyMode } from '@nexus/kernel';

export type AppView = 'agent' | 'config';

interface AppShellProps {
  trainName: string;
  profileId: string | null;
  mode: PolicyMode;
  backendConnected: boolean;
  gameLinked: boolean;
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  /** Barra fija bajo el header (velocidad, límites, cola). */
  driveHud?: ReactNode;
  children: ReactNode;
}

function linkDotClass(backendConnected: boolean, gameLinked: boolean): string {
  if (gameLinked) return 'bg-cyan-400 animate-pulse';
  if (backendConnected) return 'bg-amber-400';
  return 'bg-red-500';
}

export function AppShell({
  trainName,
  profileId,
  mode,
  backendConnected,
  gameLinked,
  activeView,
  onViewChange,
  driveHud,
  children,
}: AppShellProps) {
  return (
    <div className="h-screen flex flex-col bg-nexus-surface text-sm overflow-hidden">
      <header className="h-12 flex items-center justify-between px-6 border-b border-white/5 bg-nexus-raised shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${linkDotClass(backendConnected, gameLinked)}`} />
          <span className="font-mono text-xs tracking-widest text-white/50 uppercase">
            Nexus V4 · {trainName}
          </span>
        </div>
        <div className="flex items-center gap-4 font-mono text-[11px] text-white/40 uppercase">
          <span>{profileId ?? 'sin perfil'}</span>
          <span className="text-cyan-400/80">{mode}</span>
        </div>
      </header>

      {driveHud}

      <main className="flex-1 flex flex-col gap-4 p-4 sm:p-6 max-w-3xl mx-auto w-full min-h-0 overflow-y-auto">
        {children}
      </main>

      <footer className="h-14 border-t border-white/5 flex items-center justify-center gap-8 text-[11px] font-mono uppercase tracking-wider shrink-0">
        <button
          type="button"
          onClick={() => onViewChange('agent')}
          className={activeView === 'agent' ? 'text-cyan-400/90' : 'text-white/20 hover:text-white/50 transition-colors'}
        >
          Agent
        </button>
        <a
          href="http://localhost:5173"
          target="_blank"
          rel="noreferrer"
          className="text-white/20 hover:text-white/50 transition-colors"
        >
          Pilot (V3)
        </a>
        <button
          type="button"
          onClick={() => onViewChange('config')}
          className={activeView === 'config' ? 'text-cyan-400/90' : 'text-white/20 hover:text-white/50 transition-colors'}
        >
          Config
        </button>
      </footer>
    </div>
  );
}
