import type { ProfileSummary } from '../../core/TelemetryContext';
import type { TelemetryData } from '../../core/TelemetryContext';
import { APP_VERSION, linkStatusLabel, resolveTrainTitle } from './appUtils';

interface AppHeaderProps {
  data: TelemetryData;
  isConnected: boolean;
  activeProfile: ProfileSummary | null;
}

export function AppHeader({ data, isConnected, activeProfile }: AppHeaderProps) {
  const trainTitle = resolveTrainTitle(activeProfile?.name, data.LocoName);

  return (
    <header className="h-12 border-b border-white/5 flex items-center justify-between px-6 bg-nexus-raised shrink-0">
      <div className="flex items-center gap-3">
        <div
          className={`w-2 h-2 rounded-full ${
            isConnected ? 'bg-cyan-500 animate-pulse' : 'bg-red-500'
          }`}
        />
        <div className="flex flex-col">
          <span className="text-sm font-bold tracking-[0.2em] text-white/60">
            NEXUS V3 // {trainTitle}
          </span>
          <span className="text-[11px] font-mono text-cyan-500/60 uppercase tracking-widest leading-none mt-1">
            {activeProfile ? `PROFILE: ${activeProfile.id}` : 'NO PROFILE SELECTED'}
          </span>
        </div>
      </div>
      <div className="text-xs font-mono text-white/30 uppercase tracking-widest">
        {data.TimeOfDay} // {linkStatusLabel(isConnected)} // {APP_VERSION}
      </div>
    </header>
  );
}
