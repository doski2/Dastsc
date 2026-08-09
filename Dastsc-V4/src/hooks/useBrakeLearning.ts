import { useCallback, useEffect, useRef } from 'react';
import type { TelemetrySnapshot } from '@nexus/kernel';
import {
  brakeLearningContext,
  brakeLearningInput,
  buildBrakeEventPayload,
  postBrakeEvent,
  tickBrakeLearning,
  type ActiveBrakeEvent,
  type BrakeLearningRefs,
  type LearningProfile,
} from '../lib/brakeLearningUtils';

export function useBrakeLearning(
  snapshot: TelemetrySnapshot,
  profile: LearningProfile,
  enabled: boolean,
  onEventPosted?: () => void,
): void {
  const learningRefs = useRef<BrakeLearningRefs>({
    prevSpeed: snapshot.speedMs,
    prevSpeedChangeTime: Date.now(),
    activeEvent: null,
  });

  const profileRef = useRef<LearningProfile>(profile);
  profileRef.current = profile;

  const contextRef = useRef(brakeLearningContext(snapshot));
  contextRef.current = brakeLearningContext(snapshot);

  const onEventPostedRef = useRef(onEventPosted);
  onEventPostedRef.current = onEventPosted;

  const submitEvent = useCallback(async (event: ActiveBrakeEvent, endSpeed: number) => {
    const payload = buildBrakeEventPayload(
      event,
      endSpeed,
      profileRef.current,
      contextRef.current,
    );
    if (!payload) return;

    const ok = await postBrakeEvent(payload);
    if (ok) onEventPostedRef.current?.();
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const now = Date.now();
    const input = brakeLearningInput(snapshot);
    const result = tickBrakeLearning(
      learningRefs.current,
      input,
      profileRef.current,
      now,
    );

    learningRefs.current = result.refs;

    if (result.submit) {
      void submitEvent(result.submit.event, result.submit.endSpeed);
    }
  }, [
    snapshot.speedMs,
    snapshot.tripDistanceM,
    snapshot.brake.combined,
    snapshot.brake.position,
    enabled,
    submitEvent,
  ]);
}
