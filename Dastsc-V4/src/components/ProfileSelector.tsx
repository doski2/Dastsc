import { useMemo, useState } from 'react';
import { profileIdsEqual, type ProfileSummary } from '@nexus/kernel';
import type { TrainProfileFields } from '../lib/profileBrake';

function matchesSearch(profile: ProfileSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    profile.name?.toLowerCase().includes(q) ||
    profile.id.toLowerCase().includes(q)
  );
}

export function ProfileSelector({
  profiles,
  activeProfile,
  profileSelection,
  isConnected,
  onSelect,
}: {
  profiles: ProfileSummary[];
  activeProfile: ProfileSummary | TrainProfileFields | null;
  profileSelection: string;
  isConnected: boolean;
  onSelect: (profileId: string) => void;
}) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(
    () => profiles.filter(p => matchesSearch(p, search)),
    [profiles, search],
  );

  const autoActive = profileSelection.toUpperCase() === 'AUTO';

  return (
    <section className="rounded-lg border border-white/5 bg-nexus-raised flex flex-col max-h-[min(42vh,22rem)] overflow-hidden">
      <div className="p-4 border-b border-white/5 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[10px] font-mono uppercase tracking-widest text-white/30">
            Perfil de tren
          </h3>
          <p className="text-[10px] text-white/25 mt-1">AUTO detecta por DLL · manual fija JSON</p>
        </div>
        <input
          type="search"
          placeholder="Filtrar…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          disabled={!isConnected}
          className="bg-black/40 border border-white/10 rounded px-2 py-1 text-[10px] font-mono text-white/60 w-28 disabled:opacity-40"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {!isConnected && (
          <p className="text-center text-[10px] font-mono text-red-400/60 uppercase py-8">
            Backend desconectado
          </p>
        )}

        {isConnected && (
          <button
            type="button"
            onClick={() => onSelect('AUTO')}
            className={`w-full text-left rounded border px-3 py-2.5 transition-colors ${
              autoActive
                ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'
                : 'border-white/5 hover:border-white/15 text-white/50'
            }`}
          >
            <div className="text-xs font-mono font-semibold">AUTO</div>
            <div className="text-[10px] text-white/30 mt-0.5">
              Nombre DLL + fingerprint → perfil
            </div>
          </button>
        )}

        {isConnected && filtered.map(profile => {
          const manualActive =
            !autoActive && profileIdsEqual(profileSelection, profile.id);
          const isActiveProfile = profileIdsEqual(activeProfile?.id, profile.id);

          return (
            <button
              key={profile.id}
              type="button"
              onClick={() => onSelect(profile.id)}
              className={`w-full text-left rounded border px-3 py-2.5 transition-colors ${
                manualActive
                  ? 'border-cyan-500/50 bg-cyan-500/10'
                  : 'border-white/5 hover:border-white/15'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: profile.visuals?.color ?? '#3498db' }}
                />
                <span className={`text-xs font-mono font-semibold ${manualActive ? 'text-cyan-300' : 'text-white/70'}`}>
                  {profile.name ?? profile.id}
                </span>
                {isActiveProfile && (
                  <span className="text-[9px] font-mono uppercase text-emerald-400/80 ml-auto">
                    en uso
                  </span>
                )}
              </div>
              <div className="text-[10px] font-mono text-white/25 mt-1 pl-4">
                {profile.id}.json
              </div>
            </button>
          );
        })}
      </div>

      <div className="p-3 border-t border-white/5 text-[9px] font-mono text-white/25 uppercase">
        {profiles.length} perfiles
      </div>
    </section>
  );
}
