import { useEffect, useRef } from 'react';
import type { AgentAction, AgentTick, PolicyMode } from '@nexus/kernel';
import type { CommandAck } from '../lib/commandTypes';

const AUTO_MIN_INTERVAL_MS = 2000;

export function useAutoCommand({
  policyMode,
  connected,
  useLive,
  agent,
  sendCommand,
  lastAck,
  onFallback,
}: {
  policyMode: PolicyMode;
  connected: boolean;
  useLive: boolean;
  agent: AgentTick;
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
    if (policyMode !== 'AUTO' || !connected || !useLive) return;
    if (agent.blockedReason) return;
    if (agent.horizon.some(e => e.kind === 'SAFETY')) return;

    const action = agent.suggestedAction;
    if (!action) return;

    const key = `${action.command}:${action.value.toFixed(4)}`;
    const now = Date.now();
    const last = lastSentRef.current;
    if (last?.key === key) return;
    if (last && now - last.at < AUTO_MIN_INTERVAL_MS) return;

    lastSentRef.current = { key, at: now };
    sendCommand(action);
  }, [
    policyMode,
    connected,
    useLive,
    agent.suggestedAction,
    agent.blockedReason,
    agent.horizon,
    sendCommand,
  ]);
}
