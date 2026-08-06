import { useEffect, useState } from 'react';

export interface StationDistanceSample {
  t: number;
  event: 'door_anchor' | 'near_correction' | 'tick' | 'arrival';
  distance_m: number;
  traveled_m: number;
  speed_ms: number;
  anchor_m?: number;
  ocr_raw_m?: number;
  computed_before_m?: number;
  drift_m?: number;
}

export interface StationDistanceDebug {
  has_anchor: boolean;
  anchor_distance_m?: number;
  traveled_m?: number;
  current_distance_m?: number;
  near_correction_done?: boolean;
  last_drift_m?: number | null;
  sample_count?: number;
  samples: StationDistanceSample[];
}

const DEBUG_URL = 'http://localhost:8000/api/station/distance-debug';
const POLL_MS = 8000;

export function useStationDistanceDebug(enabled: boolean): StationDistanceDebug | null {
  const [debug, setDebug] = useState<StationDistanceDebug | null>(null);

  useEffect(() => {
    if (!enabled) {
      setDebug(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(DEBUG_URL);
        if (!res.ok || cancelled) return;
        const data = await res.json() as StationDistanceDebug;
        if (!cancelled) setDebug(data);
      } catch {
        if (!cancelled) setDebug(null);
      }
    };

    void load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled]);

  return debug;
}
