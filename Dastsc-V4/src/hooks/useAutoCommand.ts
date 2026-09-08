import { useEffect, useRef } from 'react';
import type { AgentAction, AgentTick, PolicyMode } from '@nexus/kernel';
import { shouldDispatchAutoCommand } from '@nexus/agent';
import type { CommandAck } from '../lib/commandTypes';
import { logDiagnosticCommand } from './useSessionDiagnostic';

export function useAutoCommand({
  policyMode,
  backendAutoActive,
  backendConnected,
  gameLinked,
  agent,
  stillBraking,
  sendCommand,
  lastAck,
  onFallback,
}: {
  policyMode: PolicyMode;
  /** Backend AUTO (Fase 2): no enviar COMMAND desde V4. */
  backendAutoActive: boolean;
  /** Backend vivo → puede escribir SendCommand.txt aunque TSC no mande telemetría. */
  backendConnected: boolean;
  /** Telemetría TSC fresca — AUTO necesita esto para decidir frenadas. */
  gameLinked: boolean;
  agent: AgentTick;
  /** Freno aún aplicado (323: combined; ICE T: posición de palanca). */
  stillBraking: boolean;
  sendCommand: (action: AgentAction) => void;
  lastAck: CommandAck | null;
  onFallback: () => void;
}) {
  const dispatchStateRef = useRef<{ lastKey: string | null; lastAtMs: number }>({
    lastKey: null,
    lastAtMs: 0,
  });

  useEffect(() => {
    dispatchStateRef.current = { lastKey: null, lastAtMs: 0 };
  }, [policyMode, backendAutoActive]);

  useEffect(() => {
    if (policyMode !== 'AUTO' || !lastAck || lastAck.ok) return;
    onFallback();
  }, [lastAck, onFallback, policyMode]);

  useEffect(() => {
    if (policyMode !== 'AUTO' || backendAutoActive || !backendConnected || !gameLinked) return;
    if (agent.blockedReason) return;
    if (agent.horizon.some(e => e.kind === 'SAFETY')) return;

    const action = agent.suggestedAction;
    if (!action) return;

    const { dispatch, next } = shouldDispatchAutoCommand(
      action,
      stillBraking,
      dispatchStateRef.current,
    );
    if (!dispatch) return;

    dispatchStateRef.current = next;
    logDiagnosticCommand({
      command: action.command,
      value: action.value,
      reason: action.reason,
    });
    sendCommand(action);
  }, [
    policyMode,
    backendAutoActive,
    backendConnected,
    gameLinked,
    agent.suggestedAction,
    agent.blockedReason,
    agent.horizon,
    stillBraking,
    sendCommand,
  ]);
}
