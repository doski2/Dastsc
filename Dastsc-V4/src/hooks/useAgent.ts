import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BrakeStatsByNotch } from '@nexus/agent';
import { isBrakeApplied, tickAgent } from '@nexus/agent';
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
import {
  loadPolicyMode,
  loadProfileSelection,
  loadCabOverride,
  savePolicyMode,
  saveProfileSelection,
  saveCabOverride,
  type CabOverride,
} from '../lib/agentSettings';
import type { AgentAction } from '@nexus/kernel';
import { isFullTrainProfile, toBrakePlanProfile, toCommandProfile, type TrainProfileFields } from '../lib/profileBrake';
import {
  deriveProfileCompleteness,
  shouldShowCompletenessAlert,
  type ProfileCompleteness,
} from '../lib/profileCompleteness';
import { useBrakeLearning } from './useBrakeLearning';
import { useBrakeStats } from './useBrakeStats';
import { useTrainProfile } from './useTrainProfile';
import type { CommandAck } from '../lib/commandTypes';
import { useAutoCommand } from './useAutoCommand';
import { useSessionDiagnostic, logDiagnosticAutoFallback, registerSessionWithBackend } from './useSessionDiagnostic';

export interface UseAgentResult {
  snapshot: TelemetrySnapshot;
  agent: AgentTick;
  /** WebSocket con el backend Python (puede escribir SendCommand.txt). */
  isBackendConnected: boolean;
  /** Telemetría fresca desde TSC (GetData.txt). */
  isGameLinked: boolean;
  /** @deprecated Use isBackendConnected / isGameLinked */
  isConnected: boolean;
  useLive: boolean;
  activeProfile: ProfileSummary | TrainProfileFields | null;
  availableProfiles: ProfileSummary[];
  brakeStats: BrakeStatsByNotch;
  policyMode: PolicyMode;
  profileSelection: string;
  setPolicyMode: (mode: PolicyMode) => void;
  selectProfile: (profileId: string) => void;
  cabOverride: CabOverride;
  setCabOverride: (override: CabOverride) => void;
  sendCommand: (action: AgentAction) => void;
  lastCommandAck: CommandAck | null;
  profileCompleteness: ProfileCompleteness | null;
  profileAlertVisible: boolean;
  dismissProfileAlert: () => void;
}

function sendProfileCommand(ws: WebSocket | null, profileId: string): void {
  if (ws?.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    type: 'SELECT_PROFILE',
    profile_id: profileId,
  }));
}

export function useAgent(): UseAgentResult {
  const hubRef = useRef(new TelemetryHub());
  const [snapshot, setSnapshot] = useState<TelemetrySnapshot>(() =>
    createMockSnapshot({ connected: false }),
  );
  const [isConnected, setIsConnected] = useState(false);
  const [useLive, setUseLive] = useState(false);
  const [activeProfile, setActiveProfile] = useState<ProfileSummary | TrainProfileFields | null>(null);
  const [availableProfiles, setAvailableProfiles] = useState<ProfileSummary[]>([]);
  const [policyMode, setPolicyModeState] = useState<PolicyMode>(loadPolicyMode);
  const [profileSelection, setProfileSelection] = useState(loadProfileSelection);
  const [cabOverride, setCabOverrideState] = useState<CabOverride>(loadCabOverride);
  const [lastCommandAck, setLastCommandAck] = useState<CommandAck | null>(null);
  const [profileAlertVisible, setProfileAlertVisible] = useState(false);

  const trainProfile = useTrainProfile(activeProfile);
  const { brakeStats, refreshBrakeStats } = useBrakeStats(trainProfile);

  const brakeLearningEnabled =
    useLive && isConnected && isFullTrainProfile(trainProfile);
  useBrakeLearning(snapshot, trainProfile, brakeLearningEnabled, refreshBrakeStats);

  const profileCompleteness = useMemo(
    () => deriveProfileCompleteness(trainProfile, brakeStats),
    [trainProfile, brakeStats],
  );

  const dismissProfileAlert = useCallback(() => {
    setProfileAlertVisible(false);
  }, []);

  const activeProfileRef = useRef<ProfileSummary | TrainProfileFields | null>(null);
  const profilesRef = useRef<ProfileSummary[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);
  const profileSelectionRef = useRef(profileSelection);
  const cabOverrideRef = useRef(cabOverride);

  useEffect(() => {
    profileSelectionRef.current = profileSelection;
  }, [profileSelection]);

  useEffect(() => {
    cabOverrideRef.current = cabOverride;
  }, [cabOverride]);

  const setCabOverride = useCallback((override: CabOverride) => {
    setCabOverrideState(override);
    saveCabOverride(override);
  }, []);

  const setPolicyMode = useCallback((mode: PolicyMode) => {
    setPolicyModeState(mode);
    savePolicyMode(mode);
    if (mode === 'SUGGEST' && socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'PURGE_SEND_COMMAND' }));
    }
  }, []);

  const selectProfile = useCallback((profileId: string) => {
    const selection = profileId.toUpperCase() === 'AUTO' ? 'AUTO' : profileId;
    setProfileSelection(selection);
    saveProfileSelection(selection);
    sendProfileCommand(socketRef.current, selection);
  }, []);

  const sendCommand = useCallback((action: AgentAction) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      setLastCommandAck({ ok: false, error: 'websocket_closed' });
      return;
    }
    socketRef.current.send(JSON.stringify({
      type: 'COMMAND',
      command: action.command,
      value: action.value,
    }));
  }, []);

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

        if (message.type === 'COMMAND_ACK') {
          setLastCommandAck({
            ok: Boolean(message.ok),
            command: typeof message.command === 'string' ? message.command : undefined,
            value: typeof message.value === 'number' ? message.value : undefined,
            error: typeof message.error === 'string' ? message.error : undefined,
            line: typeof message.line === 'string' ? message.line : undefined,
          });
          return;
        }

        if (Array.isArray(message.available_profiles)) {
          profilesRef.current = message.available_profiles;
          setAvailableProfiles(message.available_profiles);
        }

        if (message.type === 'INIT' || message.type === 'PROFILE_CHANGED') {
          const resolved = resolveIncomingProfile(message, profilesRef.current);
          const incoming = message.active_profile as TrainProfileFields | undefined;
          const nextProfile = incoming ?? resolved;
          setActiveProfile(nextProfile);
          activeProfileRef.current = nextProfile;
          hubRef.current.setProfile((nextProfile) as NormalizerProfile | null);
          if (message.type === 'PROFILE_CHANGED') {
            const completeness = deriveProfileCompleteness(
              isFullTrainProfile(nextProfile) ? nextProfile : null,
            );
            setProfileAlertVisible(shouldShowCompletenessAlert(completeness));
          }
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

        if (message.type === 'HEARTBEAT') {
          const gameLinked = message.gameLinked !== false;
          setSnapshot(prev => ({ ...prev, connected: gameLinked }));
          return;
        }

        if (!isTelemetryMessage(message)) return;

        const gameLinked = message.gameLinked !== false;

        const override = cabOverrideRef.current;
        const payload = override === 'auto'
          ? message
          : { ...message, ActiveCab: override };

        const next = hubRef.current.ingestMessage(
          payload,
          gameLinked,
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
        const selection = profileSelectionRef.current;
        registerSessionWithBackend(ws, {
          profileSelection: selection,
          source: 'v4_websocket',
        });
        if (selection && selection.toUpperCase() !== 'AUTO') {
          sendProfileCommand(ws, selection);
        }
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

  const commandProfile = useMemo(
    () => toCommandProfile(trainProfile),
    [trainProfile],
  );

  const agent = useMemo(
    () => tickAgent(snapshot, policyMode, {
      profile: toBrakePlanProfile(trainProfile),
      commandProfile,
      brakeStats,
    }),
    [snapshot, policyMode, trainProfile, commandProfile, brakeStats],
  );

  const fallbackFromAuto = useCallback(() => {
    logDiagnosticAutoFallback();
    setPolicyModeState('SUGGEST');
    savePolicyMode('SUGGEST');
  }, []);

  useAutoCommand({
    policyMode,
    backendConnected: isConnected,
    gameLinked: useLive && snapshot.connected,
    agent,
    stillBraking: isBrakeApplied(snapshot, commandProfile),
    sendCommand,
    lastAck: lastCommandAck,
    onFallback: fallbackFromAuto,
  });

  const isGameLinked = useLive && snapshot.connected;
  const telemetryActive = useLive;

  useSessionDiagnostic({
    snapshot,
    agent,
    policyMode,
    profileSelection,
    activeProfileId: activeProfile?.id ?? null,
    isBackendConnected: isConnected,
    isGameLinked,
    telemetryActive,
    stillBraking: isBrakeApplied(snapshot, commandProfile),
    cabOverride,
    lastAck: lastCommandAck,
    brakeStats,
    wsRef: socketRef,
  });

  return {
    snapshot,
    agent,
    isBackendConnected: isConnected,
    isGameLinked,
    isConnected,
    useLive,
    activeProfile,
    availableProfiles,
    brakeStats,
    policyMode,
    profileSelection,
    setPolicyMode,
    selectProfile,
    cabOverride,
    setCabOverride,
    sendCommand,
    lastCommandAck,
    profileCompleteness,
    profileAlertVisible,
    dismissProfileAlert,
  };
}
