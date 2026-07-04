/**
 * Monitorización pasiva de frenadas — detecta eventos y los envía al backend.
 */
import { useEffect, useRef, useCallback } from 'react';
import { TelemetryData } from '../core/TelemetryContext';
import {
  ActiveBrakeEvent,
  buildBrakeEventPayload,
  BrakeLearningRefs,
  LearningProfile,
  postBrakeEvent,
  tickBrakeLearning,
} from './brakeLearningUtils';

type BrakeContextRefs = {
  gradient: number;
  trainMass: number;
  trainLength: number;
  loco: string;
};

export function useBrakeLearning(
  raw: TelemetryData,
  activeProfile: LearningProfile,
  enabled = true,
): void {
  const learningRefs = useRef<BrakeLearningRefs>({
    prevSpeed: raw.Speed,
    prevSpeedChangeTime: Date.now(),
    activeEvent: null,
  });

  const contextRef = useRef<BrakeContextRefs>({
    gradient: raw.Gradient,
    trainMass: raw.TrainMass,
    trainLength: raw.TrainLength,
    loco: raw.LocoName,
  });

  const profileRef = useRef<LearningProfile>(activeProfile);
  profileRef.current = activeProfile;
  contextRef.current = {
    gradient: raw.Gradient,
    trainMass: raw.TrainMass,
    trainLength: raw.TrainLength,
    loco: raw.LocoName,
  };

  const submitEvent = useCallback(async (event: ActiveBrakeEvent, endSpeed: number) => {
    const payload = buildBrakeEventPayload(
      event,
      endSpeed,
      profileRef.current,
      contextRef.current,
    );
    if (!payload) return;
    await postBrakeEvent(payload);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const now = Date.now();
    const result = tickBrakeLearning(
      learningRefs.current,
      raw,
      profileRef.current,
      now,
    );

    learningRefs.current = result.refs;

    if (result.submit) {
      void submitEvent(result.submit.event, result.submit.endSpeed);
    }
  }, [
    raw.Speed,
    raw.TripDistance,
    raw.CombinedControl,
    enabled,
    submitEvent,
  ]);
}

export type { LearningProfile };
