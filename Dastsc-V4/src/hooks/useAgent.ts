import { useEffect, useMemo, useRef, useState } from 'react';
import { tickAgent } from '@nexus/agent';
import type { AgentTick, PolicyMode, TelemetrySnapshot } from '@nexus/kernel';
import {
  TelemetryHub,
  TELEMETRY_WS_URL,
  WS_RECONNECT_MS,
  createMockSnapshot,
  isTelemetryMessage,
  profileIdsEqual,
  resolveIncomingProfile,
  type NormalizerProfile,
  type ProfileSummary,
  type WsMessage,
} from '@nexus/kernel';
import { toBrakePlanProfile, type TrainProfileFields } from '../lib/profileBrake';
import { useBrakeStats } from './useBrakeStats';
import { useTrainProfile } from './useTrainProfile';

export interface UseAgentResult {
  snapshot: TelemetrySnapshot;
  agent: AgentTick;
  isConnected: boolean;
  useLive: boolean;
  activeProfile: ProfileSummary | TrainProfileFields | null;
  availableProfiles: ProfileSummary[];
}

export function useAgent(mode: PolicyMode = 'SUGGEST'): UseAgentResult {
  const hubRef = useRef(new TelemetryHub());
  const [snapshot, setSnapshot] = useState<TelemetrySnapshot>(() =>
    createMockSnapshot({ connected: false }),
  );
  const [isConnected, setIsConnected] = useState(false);
  const [useLive, setUseLive] = useState(false);
  const [activeProfile, setActiveProfile] = useState<ProfileSummary | TrainProfileFields | null>(null);
  const [availableProfiles, setAvailableProfiles] = useState<ProfileSummary[]>([]);

  const trainProfile = useTrainProfile(activeProfile);
  const brakeStats = useBrakeStats(trainProfile);

  const activeProfileRef = useRef<ProfileSummary | TrainProfileFields | null>(null);
  const profilesRef = useRef<ProfileSummary[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    activeProfileRef.current = activeProfile;
    hubRef.current.setProfile(activeProfile as NormalizerProfile | null);
  }, [activeProfile]);

  useEffect(() => {
    isMounted.current = true;

    const handleMessage = (event: MessageEvent) => {
      if (!isMounted.current) return;

      try {
        const message = JSON.parse(event.data) as WsMessage;
        if (!message?.type) return;

        if (Array.isArray(message.available_profiles)) {
          profilesRef.current = message.available_profiles;
          setAvailableProfiles(message.available_profiles);
        }

        if (message.type === 'INIT' || message.type === 'PROFILE_CHANGED') {
          const resolved = resolveIncomingProfile(message, profilesRef.current);
          const incoming = message.active_profile as TrainProfileFields | undefined;
          setActiveProfile(incoming ?? resolved);
          activeProfileRef.current = incoming ?? resolved;
          hubRef.current.setProfile((incoming ?? resolved) as NormalizerProfile | null);
          if (message.isConnected !== undefined) {
            setIsConnected(Boolean(message.isConnected));
          }
          return;
        }

        if (message.active_profile !== undefined || message.active_profile_id !== undefined) {
          const incomingId = message.active_profile_id ?? message.active_profile?.id ?? null;
          const currentId = activeProfileRef.current?.id ?? null;
          if (!profileIdsEqual(incomingId, currentId) || message.active_profile !== undefined) {
            const resolved = resolveIncomingProfile(message, profilesRef.current);
            setActiveProfile(resolved);
            activeProfileRef.current = resolved;
            hubRef.current.setProfile(resolved as NormalizerProfile | null);
          }
        }

        if (!isTelemetryMessage(message)) return;

        const next = hubRef.current.ingestMessage(
          message,
          true,
          activeProfileRef.current?.id ?? null,
        );
        if (!next) return;

        setUseLive(true);
        setSnapshot(next);
      } catch (err) {
        console.error('[useAgent] Parse error:', err);
      }
    };

    const connect = () => {
      if (!isMounted.current) return;
      if (
        socketRef.current?.readyState === WebSocket.OPEN ||
        socketRef.current?.readyState === WebSocket.CONNECTING
      ) {
        return;
      }

      if (reconnectRef.current) clearTimeout(reconnectRef.current);

      const ws = new WebSocket(TELEMETRY_WS_URL);
      socketRef.current = ws;

      ws.onopen = () => {
        if (!isMounted.current) {
          ws.close();
          return;
        }
        setIsConnected(true);
      };

      ws.onmessage = handleMessage;

      ws.onclose = () => {
        if (!isMounted.current) return;
        setIsConnected(false);
        setUseLive(false);
        setSnapshot(prev => ({ ...prev, connected: false }));
        reconnectRef.current = setTimeout(connect, WS_RECONNECT_MS);
      };

      ws.onerror = () => {
        if (isMounted.current) ws.close();
      };
    };

    connect();

    return () => {
      isMounted.current = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  const agent = useMemo(
    () => tickAgent(snapshot, mode, {
      profile: toBrakePlanProfile(trainProfile),
      brakeStats,
    }),
    [snapshot, mode, trainProfile, brakeStats],
  );

  return {
    snapshot,
    agent,
    isConnected,
    useLive,
    activeProfile,
    availableProfiles,
  };
}
