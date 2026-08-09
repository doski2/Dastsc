import { useEffect, useRef, type RefObject } from 'react';
import type { AgentTick, PolicyMode, TelemetrySnapshot } from '@nexus/kernel';
import type { BrakeStatsByNotch } from '@nexus/agent';
import type { CabOverride } from '../lib/agentSettings';
import type { CommandAck } from '../lib/commandTypes';
import {
  buildDiagnosticTick,
  diagnosticSignature,
  sessionDiagnostic,
  type DiagnosticTickInput,
} from '../lib/sessionDiagnostic';

const TICK_INTERVAL_MS = 1000;
const IDLE_SPEED_MS = 0.5;

function shouldLogTicks(input: DiagnosticTickInput): boolean {
  return input.isGameLinked
    || input.telemetryActive
    || input.snapshot.speedMs > IDLE_SPEED_MS;
}

export function useSessionDiagnostic({
  snapshot,
  agent,
  policyMode,
  profileSelection,
  activeProfileId,
  isBackendConnected,
  isGameLinked,
  telemetryActive,
  stillBraking,
  cabOverride,
  lastAck,
  brakeStats,
  wsRef,
}: {
  snapshot: TelemetrySnapshot;
  agent: AgentTick;
  policyMode: PolicyMode;
  profileSelection: string;
  activeProfileId: string | null;
  isBackendConnected: boolean;
  isGameLinked: boolean;
  telemetryActive: boolean;
  stillBraking: boolean;
  cabOverride: CabOverride;
  lastAck: CommandAck | null;
  brakeStats?: BrakeStatsByNotch;
  wsRef?: RefObject<WebSocket | null>;
}) {
  const startedRef = useRef(false);
  const lastSigRef = useRef('');
  const lastPolicyRef = useRef(policyMode);
  const lastProfileRef = useRef(profileSelection);
  const lastCabRef = useRef(cabOverride);
  const lastAckRef = useRef<CommandAck | null>(null);
  const lastLinkRef = useRef(isGameLinked);
  const inputRef = useRef<DiagnosticTickInput | null>(null);

  inputRef.current = {
    snapshot,
    agent,
    policyMode,
    profileSelection,
    activeProfileId,
    isBackendConnected,
    isGameLinked,
    telemetryActive,
    stillBraking,
    cabOverride,
    lastAck,
    brakeStats,
  };

  useEffect(() => {
    if (!isBackendConnected || startedRef.current) return;
    startedRef.current = true;
    void sessionDiagnostic.start({
      userAgent: navigator.userAgent,
      profileSelection,
      activeProfileId,
      policyMode,
    }).then(() => {
      const ws = wsRef?.current;
      if (ws?.readyState === WebSocket.OPEN) {
        sessionDiagnostic.registerWithBackend(ws, {
          profileSelection,
          activeProfileId,
          policyMode,
          source: 'v4_session',
        });
      }
    });

    const onUnload = () => {
      sessionDiagnostic.log({
        type: 'session_end',
        t: Date.now(),
        wall: new Date().toISOString(),
        summary: { reason: 'page_unload' },
      });
      sessionDiagnostic.flushSyncOnUnload();
      void sessionDiagnostic.end({ reason: 'page_unload' });
    };
    const onHide = () => {
      void sessionDiagnostic.flush();
    };
    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      document.removeEventListener('visibilitychange', onHide);
      void sessionDiagnostic.end({ reason: 'unmount' });
      startedRef.current = false;
    };
  }, [isBackendConnected, profileSelection, activeProfileId, policyMode, wsRef]);

  useEffect(() => {
    if (!isBackendConnected) return;
    void sessionDiagnostic.updateMeta({
      profileSelection,
      activeProfileId,
      policyMode,
    });
  }, [profileSelection, activeProfileId, policyMode, isBackendConnected]);

  useEffect(() => {
    if (!isBackendConnected) return;
    if (isGameLinked === lastLinkRef.current) return;
    sessionDiagnostic.log({
      type: 'connection',
      t: Date.now(),
      wall: new Date().toISOString(),
      gameLinked: isGameLinked,
      telemetryActive,
    });
    lastLinkRef.current = isGameLinked;
  }, [isGameLinked, telemetryActive, isBackendConnected]);

  useEffect(() => {
    if (!isBackendConnected) return;
    if (policyMode !== lastPolicyRef.current) {
      sessionDiagnostic.log({
        type: 'policy',
        t: Date.now(),
        wall: new Date().toISOString(),
        from: lastPolicyRef.current,
        to: policyMode,
      });
      lastPolicyRef.current = policyMode;
    }
  }, [policyMode, isBackendConnected]);

  useEffect(() => {
    if (!isBackendConnected) return;
    if (profileSelection !== lastProfileRef.current) {
      sessionDiagnostic.log({
        type: 'profile',
        t: Date.now(),
        wall: new Date().toISOString(),
        from: lastProfileRef.current,
        to: profileSelection,
        activeProfileId,
      });
      lastProfileRef.current = profileSelection;
    }
  }, [profileSelection, activeProfileId, isBackendConnected]);

  useEffect(() => {
    if (!isBackendConnected) return;
    if (cabOverride !== lastCabRef.current) {
      sessionDiagnostic.log({
        type: 'cab',
        t: Date.now(),
        wall: new Date().toISOString(),
        from: lastCabRef.current,
        to: cabOverride,
      });
      lastCabRef.current = cabOverride;
    }
  }, [cabOverride, isBackendConnected]);

  useEffect(() => {
    if (!isBackendConnected || !lastAck) return;
    if (lastAck === lastAckRef.current) return;
    lastAckRef.current = lastAck;
    sessionDiagnostic.log({
      type: 'ack',
      t: Date.now(),
      wall: new Date().toISOString(),
      ...lastAck,
    });
  }, [lastAck, isBackendConnected]);

  useEffect(() => {
    if (!isBackendConnected) return;
    const input = inputRef.current;
    if (!input || !shouldLogTicks(input)) return;

    const tick = buildDiagnosticTick(input);
    const sig = diagnosticSignature(tick);
    if (sig !== lastSigRef.current) {
      lastSigRef.current = sig;
      sessionDiagnostic.log({ ...tick, type: 'tick_change' } as never);
    }
  }, [snapshot, agent, policyMode, profileSelection, activeProfileId, isBackendConnected, isGameLinked, telemetryActive, stillBraking, cabOverride, lastAck]);

  useEffect(() => {
    if (!isBackendConnected) return;

    const id = setInterval(() => {
      const input = inputRef.current;
      if (!input || !shouldLogTicks(input)) return;
      const periodic = buildDiagnosticTick(input);
      sessionDiagnostic.log({ ...periodic, type: 'tick' } as never);
    }, TICK_INTERVAL_MS);

    return () => clearInterval(id);
  }, [isBackendConnected]);
}

export function logDiagnosticCommand(action: {
  command: string;
  value: number;
  reason?: string;
}): void {
  sessionDiagnostic.log({
    type: 'command',
    t: Date.now(),
    wall: new Date().toISOString(),
    ...action,
  });
}

export function logDiagnosticAutoFallback(): void {
  sessionDiagnostic.log({
    type: 'auto_fallback',
    t: Date.now(),
    wall: new Date().toISOString(),
  });
}

export function registerSessionWithBackend(
  ws: WebSocket,
  meta: Record<string, unknown>,
): void {
  sessionDiagnostic.registerWithBackend(ws, meta);
}
