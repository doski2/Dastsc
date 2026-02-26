import React from 'react';
import { motion } from 'framer-motion';
import { useTelemetry } from '../../core/TelemetryContext';
import { Train, Check, Search } from 'lucide-react';

export const ProfileSelector: React.FC = () => {
  const { availableProfiles, activeProfile, setProfile, isConnected } = useTelemetry();
  const [search, setSearch] = React.useState('');

  React.useEffect(() => {
    console.log('ProfileSelector: activeProfile changed ->', activeProfile?.id || 'NONE');
  }, [activeProfile?.id]);

  const filtered = (availableProfiles || []).filter(p => 
    p?.name?.toLowerCase().includes(search.toLowerCase()) ||
    p?.id?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] border border-white/5 rounded-sm overflow-hidden">
      <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <Train className="text-cyan-500" size={18} />
          <div>
            <h3 className="text-xs font-bold text-white/80 uppercase tracking-widest leading-none">Train Profiles</h3>
            <p className="text-[9px] text-white/30 uppercase mt-1">Select locomotive configuration</p>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-white/20" size={12} />
          <input 
            type="text"
            placeholder="FILTER..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-black/40 border border-white/10 rounded-xs pl-7 pr-2 py-1 text-[10px] font-mono text-white/60 focus:outline-none focus:border-cyan-500/40 w-48"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
        {!isConnected && (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center gap-2">
             <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
             <span className="text-[10px] font-mono text-red-500/50 uppercase tracking-widest">Backend Offline</span>
          </div>
        )}
        {isConnected && filtered.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center gap-2">
            <span className="text-[10px] font-mono text-white/20 uppercase tracking-widest">Searching in {availableProfiles?.length === 0 ? 'Empty Folder' : 'Filter'}...</span>
            <span className="text-[8px] font-mono text-white/10 uppercase italic">Path: C:\Users\doski\Dastsc\profiles</span>
          </div>
        ) : filtered.map((profile) => {
          const profileId = profile.id;
          const isActive = activeProfile && (activeProfile.id === profileId || activeProfile.name === profile.name);

          return (
            <button
              key={profileId}
              onClick={() => {
                console.log('UI: Selecting Profile ->', profileId);
                setProfile(profileId);
              }}
              className={`
                w-full flex items-center justify-between p-3 rounded-sm border transition-all duration-200 cursor-pointer
                ${isActive 
                  ? 'bg-cyan-500/20 border-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.1)] text-cyan-400' 
                  : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10 hover:border-white/20'}
              `}
            >
              <div className="flex flex-col items-start gap-1">
                <div className="flex items-center gap-2">
                  <motion.div 
                    className="w-2 h-2 rounded-full shadow-[0_0_5px_rgba(255,255,255,0.2)]" 
                    initial={false}
                    animate={{ backgroundColor: profile.visuals?.color || '#3498db' }}
                  />
                  <span className={`text-[11px] font-bold uppercase tracking-tighter ${isActive ? 'text-cyan-400' : 'text-white/70'}`}>
                    {profile.name || profileId}
                  </span>
                  <span className="text-[8px] font-mono px-1 rounded-xs bg-white/5 text-white/30">
                    {profile.visuals?.unit || 'MPH'}
                  </span>
                </div>
                <span className="text-[9px] font-mono text-white/20 lowercase pl-4">
                  {profileId}.json
                </span>
              </div>
              {isActive && (
                <div className="flex items-center gap-2 animate-in fade-in duration-300">
                  <span className="text-[8px] font-bold uppercase tracking-widest bg-cyan-500 text-black px-1.5 py-0.5 rounded-full shadow-[0_0_10px_rgba(6,182,212,0.5)]">Active</span>
                  <Check size={14} className="text-cyan-500" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="p-3 border-t border-white/5 bg-black/40 flex items-center justify-between">
        <span className="text-[9px] font-mono text-white/20 uppercase">
          Total: {availableProfiles.length} profiles loaded
        </span>
      </div>
    </div>
  );
};
