import { useMemo } from 'react';
import type { BrakeStatsByNotch } from '@nexus/agent';
import type { PolicyMode, ProfileSummary, TelemetrySnapshot } from '@nexus/kernel';
import type { TrainProfileFields } from '../lib/profileBrake';
import { deriveProfileCompleteness } from '../lib/profileCompleteness';
import { PolicyModeSelector } from './PolicyModeSelector';
import { ProfileCompletenessPanel } from './ProfileCompletenessPanel';
import { ProfileSelector } from './ProfileSelector';
import { SessionLogsPanel } from './SessionLogsPanel';

export function ConfigView({
  snapshot,
  isBackendConnected,
  isGameLinked,
  availableProfiles,
  activeProfile,
  profileSelection,
  policyMode,
  brakeStats,
  onSelectProfile,
  onPolicyModeChange,
}: {
  snapshot: TelemetrySnapshot;
  isBackendConnected: boolean;
  isGameLinked: boolean;
  availableProfiles: ProfileSummary[];
  activeProfile: ProfileSummary | TrainProfileFields | null;
  profileSelection: string;
  policyMode: PolicyMode;
  brakeStats: BrakeStatsByNotch;
  onSelectProfile: (profileId: string) => void;
  onPolicyModeChange: (mode: PolicyMode) => void;
}) {
  const telemetryLive = isGameLinked;
  const autoSelected = profileSelection.toUpperCase() === 'AUTO';
  const completeness = useMemo(
    () => deriveProfileCompleteness(
      activeProfile && 'specs' in activeProfile ? activeProfile : null,
      brakeStats,
    ),
    [activeProfile, brakeStats],
  );

  return (
    <div className="space-y-6 w-full">
      <PolicyModeSelector mode={policyMode} onChange={onPolicyModeChange} />

      {completeness && activeProfile?.id && (
        <ProfileCompletenessPanel
          profileId={activeProfile.id}
          completeness={completeness}
        />
      )}

      <section className="rounded-lg border border-white/5 bg-nexus-raised p-4">
        <h3 className="text-[10px] font-mono uppercase tracking-widest text-white/30 mb-3">
          Sistema
        </h3>
        <dl className="grid grid-cols-2 gap-3 text-xs font-mono">
          <div>
            <dt className="text-white/30 uppercase text-[9px]">Backend</dt>
            <dd className={isBackendConnected ? 'text-emerald-400' : 'text-red-400'}>
              {isBackendConnected ? 'ONLINE' : 'OFFLINE'}
            </dd>
          </div>
          <div>
            <dt className="text-white/30 uppercase text-[9px]">TSC / Lua</dt>
            <dd className={telemetryLive ? 'text-emerald-400' : 'text-amber-400'}>
              {telemetryLive ? 'LIVE' : isBackendConnected ? 'SIN TELEMETRÍA' : 'OFFLINE'}
            </dd>
          </div>
          <div>
            <dt className="text-white/30 uppercase text-[9px]">Mandos</dt>
            <dd className={isBackendConnected ? 'text-emerald-400' : 'text-red-400'}>
              {isBackendConnected ? 'SendCommand OK' : 'NO'}
            </dd>
          </div>
          <div>
            <dt className="text-white/30 uppercase text-[9px]">Modo</dt>
            <dd className="text-cyan-300">{policyMode}</dd>
          </div>
          <div>
            <dt className="text-white/30 uppercase text-[9px]">Perfil</dt>
            <dd className="text-white/70 truncate">
              {autoSelected ? 'AUTO' : profileSelection}
            </dd>
          </div>
          <div>
            <dt className="text-white/30 uppercase text-[9px]">Activo</dt>
            <dd className="text-white/70 truncate">{activeProfile?.id ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-white/30 uppercase text-[9px]">Velocidad</dt>
            <dd className="text-white/70">{snapshot.speedUnit}</dd>
          </div>
          <div>
            <dt className="text-white/30 uppercase text-[9px]">Tren DLL</dt>
            <dd className="text-white/70 truncate">{snapshot.train.name || '—'}</dd>
          </div>
        </dl>
      </section>

      <ProfileSelector
        profiles={availableProfiles}
        activeProfile={activeProfile}
        profileSelection={profileSelection}
        isConnected={isBackendConnected}
        onSelect={onSelectProfile}
      />

      <SessionLogsPanel />
    </div>
  );
}
