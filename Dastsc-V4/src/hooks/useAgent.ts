import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BrakeStatsByNotch } from '@nexus/agent';
import { isBrakeApplied, tickAgent } from '@nexus/agent';
import type { AgentAction, AgentTick, PolicyMode, TelemetrySnapshot } from '@nexus/kernel';
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
  loadGradientSign,
  savePolicyMode,
  saveProfileSelection,
  saveGradientSign,
  type GradientSignMode,
} from '../lib/agentSettings';
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
import { useSessionDiagnostic, logDiagnosticAutoFallback } from './useSessionDiagnostic';
import { sessionDiagnostic } from '../lib/sessionDiagnostic';

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
  gradientSign: GradientSignMode;
  setGradientSign: (mode: GradientSignMode) => void;
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

function parseCommandAck(message: WsMessage): CommandAck {
  return {
    ok: Boolean(message.ok),
    command: typeof message.command === 'string' ? message.command : undefined,
    value: typeof message.value === 'number' ? message.value : undefined,
    error: typeof message.error === 'string' ? message.error : undefined,
    line: typeof message.line === 'string' ? message.line : undefined,
  };
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
  const [gradientSign, setGradientSignState] = useState<GradientSignMode>(loadGradientSign);
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
  const gradientSignRef = useRef(gradientSign);
  const policyModeRef = useRef(policyMode);

  useEffect(() => {
    profileSelectionRef.current = profileSelection;
  }, [profileSelection]);

  useEffect(() => {
    gradientSignRef.current = gradientSign;
    hubRef.current.setGradientSign(gradientSign);
  }, [gradientSign]);

  useEffect(() => {
    policyModeRef.current = policyMode;
  }, [policyMode]);

  const setGradientSign = useCallback((mode: GradientSignMode) => {
    setGradientSignState(mode);
    saveGradientSign(mode);
    hubRef.current.setGradientSign(mode);
  }, []);

  useEffect(() => {
    hubRef.current.setGradientSign(gradientSignRef.current);
  }, []);

  const applyActiveProfile = useCallback((profile: ProfileSummary | TrainProfileFields | null) => {
    setActiveProfile(profile);
    activeProfileRef.current = profile;
    hubRef.current.setProfile(profile as NormalizerProfile | null);
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
    isMounted.current = true;

    const handleMessage = (event: MessageEvent) => {
      if (!isMounted.current) return;

      try {
        const message = JSON.parse(event.data) as WsMessage;
        if (!message?.type) return;

        if (message.type === 'COMMAND_ACK') {
          setLastCommandAck(parseCommandAck(message));
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
          applyActiveProfile(nextProfile);
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
            applyActiveProfile(resolveIncomingProfile(message, profilesRef.current));
          }
        }

        if (message.type === 'HEARTBEAT') {
          const gameLinked = message.gameLinked !== false;
          setSnapshot(prev => ({ ...prev, connected: gameLinked }));
          return;
        }

        if (!isTelemetryMessage(message)) return;

        const gameLinked = message.gameLinked !== false;

        const next = hubRef.current.ingestMessage(
          message,
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
        sessionDiagnostic.bindWebSocket(ws, {
          profileSelection: selection,
          activeProfileId: activeProfileRef.current?.id ?? null,
          policyMode: policyModeRef.current,
          source: 'v4_session',
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
  }, [applyActiveProfile]);

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

  const stillBraking = useMemo(
    () => isBrakeApplied(snapshot, commandProfile),
    [snapshot, commandProfile],
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
    stillBraking,
    sendCommand,
    lastAck: lastCommandAck,
    onFallback: fallbackFromAuto,
  });

  const isGameLinked = useLive && snapshot.connected;

  useSessionDiagnostic({
    snapshot,
    agent,
    policyMode,
    profileSelection,
    activeProfileId: activeProfile?.id ?? null,
    isBackendConnected: isConnected,
    isGameLinked,
    telemetryActive: useLive,
    stillBraking,
    gradientSign,
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
    gradientSign,
    setGradientSign,
    sendCommand,
    lastCommandAck,
    profileCompleteness,
    profileAlertVisible,
    dismissProfileAlert,
  };
}
