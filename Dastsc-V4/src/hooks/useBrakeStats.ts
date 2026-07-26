import { useEffect, useState } from 'react';
import type { BrakeStatsByNotch } from '@nexus/agent';
import { brakeStatsUrl, profileId, type TrainProfileFields } from '../lib/profileBrake';

const STATS_REFRESH_MS = 60_000;

export function useBrakeStats(activeProfile: TrainProfileFields | null | undefined): BrakeStatsByNotch {
  const [brakeStats, setBrakeStats] = useState<BrakeStatsByNotch>({});

  useEffect(() => {
    const id = profileId(activeProfile);
    if (!id) {
      setBrakeStats({});
      return;
    }

    const load = () => {
      fetch(brakeStatsUrl(id))
        .then(r => r.json())
        .then(d => setBrakeStats(d.by_notch ?? {}))
        .catch(() => setBrakeStats({}));
    };

    load();
    const interval = setInterval(load, STATS_REFRESH_MS);
    return () => clearInterval(interval);
  }, [activeProfile?.id, activeProfile?.name]);

  return brakeStats;
}
