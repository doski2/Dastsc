import type { AgentTick, PolicyMode, TelemetrySnapshot } from '@nexus/kernel';
import type { BrakeStatsByNotch } from '@nexus/agent';
import type { CommandAck } from './commandTypes';
import type { CabOverride } from './agentSettings';

const API_BASE = 'http://localhost:8000';

export type DiagnosticEventType =
  | 'session_start'
  | 'session_end'
  | 'tick'
  | 'tick_change'
  | 'policy'
  | 'profile'
  | 'cab'
  | 'command'
  | 'ack'
  | 'auto_fallback'
  | 'connection'
  | 'ocr_capture'
  | 'backend_tick';

export interface DiagnosticEvent {
  type: DiagnosticEventType;
  t: number;
  wall: string;
  [key: string]: unknown;
}

export type DiagnosticTickInput = {
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
};

/** Resumen compacto de telemetría + agente para diagnóstico. */
export function buildDiagnosticTick(input: DiagnosticTickInput): Record<string, unknown> {
  const { snapshot: s, agent: a } = input;
  return {
    type: 'tick',
    t: s.t,
    wall: new Date().toISOString(),
    link: {
      backend: input.isBackendConnected,
      game: input.isGameLinked,
      telemetryActive: input.telemetryActive,
    },
    policy: input.policyMode,
    profileSelection: input.profileSelection,
    profileId: input.activeProfileId ?? s.train.profileId,
    cabOverride: input.cabOverride,
    activeCab: s.activeCab,
    speed: {
      ms: s.speedMs,
      display: s.speedDisplay,
      unit: s.speedUnit,
    },
    brake: {
      combined: s.brake.combined,
      position: s.brake.position,
      cylinder: s.brake.cylinder,
      effortKn: s.brake.effortKn,
      projectedStopM: s.brake.projectedStopM,
      stillBraking: input.stillBraking,
    },
    station: {
      distanceM: s.station.distanceM,
      nameOcr: s.station.nameOcr,
      eta: s.station.eta,
      scheduled: s.station.scheduled,
      source: s.station.source,
      luaDistanceM: s.station.luaDistanceM,
      anchorM: s.station.anchorM,
      traveledM: s.station.traveledM,
      driftM: s.station.driftM,
      nearCorrected: s.station.nearCorrected,
    },
    limits: {
      effective: s.limits.effective,
      next: s.limits.next,
    },
    signaling: {
      aspect: s.signaling.aspect,
      distanceM: s.signaling.distanceM,
    },
    gradient: {
      permille: s.gradient,
      raw: s.rawGradient,
    },
    agent: {
      headline: a.headline,
      detail: a.detail,
      urgency: a.urgency,
      blockedReason: a.blockedReason,
      suggestedAction: a.suggestedAction,
      marginM: a.marginM,
      brakePlan: a.brakePlan,
      brakeContext: a.brakeContext,
      horizon: a.horizon.map(e => ({
        kind: e.kind,
        label: e.label,
        distanceM: e.distanceM,
        targetSpeedDisplay: e.targetSpeedDisplay,
      })),
    },
    lastAck: input.lastAck,
    brakeStats: input.brakeStats ?? {},
  };
}

export function diagnosticSignature(tick: Record<string, unknown>): string {
  const agent = tick.agent as Record<string, unknown> | undefined;
  const action = agent?.suggestedAction as { command?: string; value?: number } | undefined;
  const brake = tick.brake as Record<string, unknown> | undefined;
  const station = tick.station as {
    distanceM?: number;
    source?: string;
    driftM?: number;
  } | undefined;
  return [
    action?.command ?? '',
    action?.value?.toFixed(4) ?? '',
    agent?.headline ?? '',
    String(brake?.position ?? ''),
    String(brake?.combined ?? ''),
    String(station?.distanceM ?? ''),
    station?.source ?? '',
    String(station?.driftM ?? ''),
    tick.policy ?? '',
  ].join('|');
}

class SessionDiagnosticClient {
  private sessionId: string | null = null;
  private buffer: DiagnosticEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  async start(meta: Record<string, unknown>): Promise<string | null> {
    try {
      const res = await fetch(`${API_BASE}/api/debug/session/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meta }),
      });
      if (!res.ok) return null;
      const data = await res.json() as { session_id?: string };
      this.sessionId = data.session_id ?? null;
      if (this.sessionId) {
        this.log({ type: 'session_start', t: Date.now(), wall: new Date().toISOString(), meta });
        void this.updateMeta(meta);
        this.startFlush();
      }
      return this.sessionId;
    } catch {
      return null;
    }
  }

  registerWithBackend(ws: WebSocket, meta: Record<string, unknown>): void {
    if (!this.sessionId || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      type: 'SESSION_REGISTER',
      session_id: this.sessionId,
      meta,
    }));
  }

  async updateMeta(patch: Record<string, unknown>): Promise<void> {
    if (!this.sessionId || !Object.keys(patch).length) return;
    try {
      await fetch(`${API_BASE}/api/debug/session/${this.sessionId}/meta`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
    } catch {
      // ignore
    }
  }

  private startFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => void this.flush(), 2000);
  }

  log(event: DiagnosticEvent): void {
    this.buffer.push(event);
    if (this.buffer.length >= 20) void this.flush();
  }

  async flush(): Promise<void> {
    if (!this.sessionId || this.buffer.length === 0) return;
    const batch = this.buffer.splice(0, this.buffer.length);
    try {
      const res = await fetch(`${API_BASE}/api/debug/session/${this.sessionId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: batch }),
      });
      if (!res.ok) {
        this.buffer.unshift(...batch);
      }
    } catch {
      if (typeof navigator !== 'undefined' && typeof Blob !== 'undefined') {
        const blob = new Blob(
          [JSON.stringify({ events: batch })],
          { type: 'application/json' },
        );
        const sent = navigator.sendBeacon(
          `${API_BASE}/api/debug/session/${this.sessionId}/events`,
          blob,
        );
        if (!sent) this.buffer.unshift(...batch);
      } else {
        this.buffer.unshift(...batch);
      }
    }
  }

  flushSyncOnUnload(): void {
    if (!this.sessionId || this.buffer.length === 0) return;
    const batch = this.buffer.splice(0, this.buffer.length);
    if (typeof navigator === 'undefined' || typeof Blob === 'undefined') return;
    const blob = new Blob(
      [JSON.stringify({ events: batch })],
      { type: 'application/json' },
    );
    navigator.sendBeacon(
      `${API_BASE}/api/debug/session/${this.sessionId}/events`,
      blob,
    );
  }

  async end(summary?: Record<string, unknown>): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (!this.sessionId) return;
    this.log({
      type: 'session_end',
      t: Date.now(),
      wall: new Date().toISOString(),
      summary,
    });
    await this.flush();
    try {
      await fetch(`${API_BASE}/api/debug/session/${this.sessionId}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary }),
      });
    } catch {
      // ignore
    }
    this.sessionId = null;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }
}

export const sessionDiagnostic = new SessionDiagnosticClient();

export interface SessionLogSummary {
  id: string;
  started_at?: string;
  ended_at?: string | null;
  event_count?: number;
  meta?: Record<string, unknown>;
}

export async function fetchSessionLogs(): Promise<SessionLogSummary[]> {
  try {
    const res = await fetch(`${API_BASE}/api/debug/sessions`);
    if (!res.ok) return [];
    const data = await res.json() as { sessions?: SessionLogSummary[] };
    return data.sessions ?? [];
  } catch {
    return [];
  }
}
