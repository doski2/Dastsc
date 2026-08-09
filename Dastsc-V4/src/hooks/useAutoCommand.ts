import { useEffect, useRef } from 'react';
import type { AgentAction, AgentTick, PolicyMode } from '@nexus/kernel';
import type { CommandAck } from '../lib/commandTypes';
import { logDiagnosticCommand } from './useSessionDiagnostic';

const AUTO_MIN_INTERVAL_MS = 2000;

export function useAutoCommand({
  policyMode,
  backendConnected,
  gameLinked,
  agent,
  stillBraking,
  sendCommand,
  lastAck,
  onFallback,
}: {
  policyMode: PolicyMode;
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
  const lastSentRef = useRef<{ key: string; at: number } | null>(null);

  useEffect(() => {
    if (policyMode !== 'AUTO' || !lastAck || lastAck.ok) return;
    onFallback();
  }, [lastAck, onFallback, policyMode]);

  useEffect(() => {
    if (policyMode !== 'AUTO' || !backendConnected || !gameLinked) return;
    if (agent.blockedReason) return;
    if (agent.horizon.some(e => e.kind === 'SAFETY')) return;

    const action = agent.suggestedAction;
    if (!action) return;

    const key = `${action.command}:${action.value.toFixed(4)}`;
    const now = Date.now();
    const last = lastSentRef.current;
    const isRelease = Math.abs(action.value) < 0.01;
    if (last?.key === key) {
      if (!isRelease || !stillBraking) return;
      if (now - last.at < AUTO_MIN_INTERVAL_MS) return;
    } else if (
      last
      && now - last.at < AUTO_MIN_INTERVAL_MS
      && !(isRelease && stillBraking)
    ) {
      return;
    }

    lastSentRef.current = { key, at: now };
    logDiagnosticCommand({
      command: action.command,
      value: action.value,
      reason: action.reason,
    });
    sendCommand(action);
  }, [
    policyMode,
    backendConnected,
    gameLinked,
    agent.suggestedAction,
    agent.blockedReason,
    agent.horizon,
    stillBraking,
    sendCommand,
  ]);
}
