import { useEffect, useState } from 'react';
import {
  BrakeStatsByNotch,
  TrainProfile,
  brakeApiUrl,
  profileId,
} from '../components/display/brakingCurveUtils';

const STATS_REFRESH_MS = 60_000;

export function useBrakeStats(activeProfile: TrainProfile | null | undefined): BrakeStatsByNotch {
  const [brakeStats, setBrakeStats] = useState<BrakeStatsByNotch>({});

  useEffect(() => {
    const id = profileId(activeProfile);
    const load = () => {
      fetch(brakeApiUrl('/api/brake/stats', id || null))
        .then(r => r.json())
        .then(d => setBrakeStats(d.by_notch ?? {}))
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, STATS_REFRESH_MS);
    return () => clearInterval(interval);
  }, [activeProfile]);

  return brakeStats;
}
