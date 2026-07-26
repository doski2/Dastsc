import { useEffect, useState } from 'react';
import {
  isFullTrainProfile,
  profileDetailUrl,
  type TrainProfileFields,
} from '../lib/profileBrake';
import type { ProfileSummary } from '@nexus/kernel';

export function useTrainProfile(activeProfile: ProfileSummary | TrainProfileFields | null): TrainProfileFields | null {
  const [fullProfile, setFullProfile] = useState<TrainProfileFields | null>(
    isFullTrainProfile(activeProfile) ? activeProfile : null,
  );

  useEffect(() => {
    if (!activeProfile?.id) {
      setFullProfile(null);
      return;
    }

    if (isFullTrainProfile(activeProfile)) {
      setFullProfile(activeProfile);
      return;
    }

    let cancelled = false;
    fetch(profileDetailUrl(activeProfile.id))
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!cancelled && data) setFullProfile(data as TrainProfileFields);
      })
      .catch(() => {
        if (!cancelled) setFullProfile(null);
      });

    return () => {
      cancelled = true;
    };
  }, [activeProfile?.id]);

  return fullProfile;
}
