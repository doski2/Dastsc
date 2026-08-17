import type { AgentTick, PolicyMode, TelemetrySnapshot } from '@nexus/kernel';
import type { BrakeStatsByNotch } from '@nexus/agent';
import type { CommandAck } from './commandTypes';

const API_BASE = 'http://localhost:8000';

export type DiagnosticEventType =
  | 'session_start'
  | 'session_end'
  | 'tick'
  | 'tick_change'
  | 'policy'
  | 'profile'
  | 'gradient_sign'
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
  lastAck: CommandAck | null;
  brakeStats?: BrakeStatsByNotch;
};

/** Resumen compacto de telemetría + agente para diagnóstico. */
export function buildDiagnosticTick(input: DiagnosticTickInput): Record<string, unknown> {
  const { snapshot: s, agent: a } = input;
  const activeStep = a.brakePlan?.find(step => step.applyNow)
    ?? a.brakePlan?.[a.brakePlan.length - 1];
  return {
    type: 'tick',
    t: s.t,
    wall: new Date().toISOString(),
    policy: input.policyMode,
    profileId: input.activeProfileId ?? s.train.profileId,
    speed: {
      ms: s.speedMs,
      display: s.speedDisplay,
      unit: s.speedUnit,
    },
    brake: {
      combined: s.brake.combined,
      position: s.brake.position,
      stillBraking: input.stillBraking,
      effortKn: Math.round(s.brake.effortKn * 10) / 10,
      tractiveKn: Math.round(s.brake.tractiveKn * 10) / 10,
      cylinder: Math.round(s.brake.cylinder * 10) / 10,
    },
    station: {
      distanceM: s.station.distanceM,
      nameOcr: s.station.nameOcr,
      source: s.station.source,
      driftM: s.station.driftM,
    },
    limits: {
      effective: s.limits.effective,
      frontal: s.limits.frontal,
      next: s.limits.next,
      upcoming: s.limits.upcoming,
    },
    signaling: {
      aspect: s.signaling.aspect,
      distanceM: s.signaling.distanceM,
    },
    gradient: Math.round(s.gradient * 10) / 10,
    /** Desnivel legible: ‰ / 10 (p. ej. +8.5‰ → +0.85%). */
    gradientPct: Math.round((s.gradient / 10) * 100) / 100,
    train: {
      profileId: s.train.profileId,
      massT: s.train.massT,
      lengthM: s.train.lengthM,
      consistType: s.train.consistType,
    },
    agent: {
      headline: a.headline,
      detail: a.detail,
      urgency: a.urgency,
      blockedReason: a.blockedReason,
      suggestedAction: a.suggestedAction,
      marginM: a.marginM,
      brakeContext: a.brakeContext,
      brakePlanSteps: a.brakePlan?.length ?? 0,
      activeStep: activeStep
        ? {
            notch: activeStep.notch,
            phase: activeStep.phase,
            distStart: activeStep.distStart,
            applyNow: activeStep.applyNow,
          }
        : null,
      horizon: a.horizon.map(e => ({
        kind: e.kind,
        label: e.label,
        distanceM: e.distanceM,
        targetSpeedDisplay: e.targetSpeedDisplay,
      })),
    },
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
  const dist = station?.distanceM;
  const distBucket = dist != null && dist >= 0 ? Math.round(dist / 10) * 10 : dist;
  return [
    action?.command ?? '',
    action?.value?.toFixed(4) ?? '',
    agent?.headline ?? '',
    String(brake?.position ?? ''),
    String(brake?.combined ?? ''),
    String(distBucket ?? ''),
    station?.source ?? '',
    tick.policy ?? '',
  ].join('|');
}

class SessionDiagnosticClient {
  private sessionId: string | null = null;
  private buffer: DiagnosticEvent[] = [];
  private pendingBeforeSession: DiagnosticEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private startPromise: Promise<string | null> | null = null;
  private startMeta: Record<string, unknown> = {};
  private boundWs: WebSocket | null = null;
  private boundWsMeta: Record<string, unknown> = {};

  ensureStarted(meta: Record<string, unknown> = {}): Promise<string | null> {
    if (this.sessionId) {
      void this.updateMeta(meta);
      this.tryRegisterBackend();
      return Promise.resolve(this.sessionId);
    }
    this.startMeta = { ...this.startMeta, ...meta };
    if (!this.startPromise) {
      this.startPromise = this.start(this.startMeta).finally(() => {
        this.startPromise = null;
      });
    }
    return this.startPromise;
  }

  bindWebSocket(ws: WebSocket, meta: Record<string, unknown> = {}): void {
    this.boundWs = ws;
    this.boundWsMeta = { ...meta, source: meta.source ?? 'v4_session' };
    void this.ensureStarted(this.boundWsMeta).then(() => {
      this.tryRegisterBackend();
    });
  }

  private tryRegisterBackend(): void {
    const ws = this.boundWs;
    if (!ws || ws.readyState !== WebSocket.OPEN || !this.sessionId) return;
    ws.send(JSON.stringify({
      type: 'SESSION_REGISTER',
      session_id: this.sessionId,
      meta: this.boundWsMeta,
    }));
  }

  private drainPendingBeforeSession(): void {
    if (!this.sessionId || this.pendingBeforeSession.length === 0) return;
    this.buffer.push(...this.pendingBeforeSession);
    this.pendingBeforeSession = [];
    if (this.buffer.length >= 20) void this.flush();
  }

  async start(meta: Record<string, unknown>): Promise<string | null> {
    try {
      const res = await fetch(`${API_BASE}/api/debug/session/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meta: { ...meta, source: meta.source ?? 'v4_session' } }),
      });
      if (!res.ok) {
        console.warn('[sessionDiagnostic] start failed:', res.status, res.statusText);
        return null;
      }
      const data = await res.json() as { session_id?: string };
      this.sessionId = data.session_id ?? null;
      if (this.sessionId) {
        this.log({ type: 'session_start', t: Date.now(), wall: new Date().toISOString(), meta });
        void this.updateMeta(meta);
        this.drainPendingBeforeSession();
        this.startFlush();
        this.tryRegisterBackend();
        void this.flush();
      }
      return this.sessionId;
    } catch (err) {
      console.warn('[sessionDiagnostic] start error:', err);
      return null;
    }
  }

  registerWithBackend(ws: WebSocket, meta: Record<string, unknown>): void {
    this.bindWebSocket(ws, meta);
  }

  async updateMeta(patch: Record<string, unknown>): Promise<void> {
    if (!this.sessionId || !Object.keys(patch).length) return;
    try {
      await fetch(`${API_BASE}/api/debug/session/${this.sessionId}/meta`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...patch, source: 'v4_session' }),
      });
    } catch (err) {
      console.warn('[sessionDiagnostic] updateMeta failed:', err);
    }
  }

  private startFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => void this.flush(), 2000);
  }

  log(event: DiagnosticEvent): void {
    if (!this.sessionId) {
      this.pendingBeforeSession.push(event);
      if (this.pendingBeforeSession.length > 200) {
        this.pendingBeforeSession.shift();
      }
      if (Object.keys(this.startMeta).length > 0) {
        void this.ensureStarted(this.startMeta);
      }
      return;
    }
    this.buffer.push(event);
    const urgent = event.type === 'session_start'
      || event.type === 'session_end'
      || event.type === 'tick_change'
      || event.type === 'connection';
    if (urgent || this.buffer.length >= 20) void this.flush();
  }

  private flushViaWebSocket(batch: DiagnosticEvent[]): boolean {
    const ws = this.boundWs;
    if (!ws || ws.readyState !== WebSocket.OPEN || !this.sessionId || batch.length === 0) {
      return false;
    }
    try {
      ws.send(JSON.stringify({
        type: 'SESSION_EVENTS',
        session_id: this.sessionId,
        events: batch,
      }));
      return true;
    } catch (err) {
      console.warn('[sessionDiagnostic] WS flush error:', err);
      return false;
    }
  }

  async flush(): Promise<void> {
    if (!this.sessionId || this.buffer.length === 0) return;
    const batch = this.buffer.splice(0, this.buffer.length);
    if (this.flushViaWebSocket(batch)) return;
    try {
      const res = await fetch(`${API_BASE}/api/debug/session/${this.sessionId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: batch }),
      });
      const data = await res.json().catch(() => ({})) as { ok?: boolean };
      if (!res.ok || data.ok === false) {
        console.warn('[sessionDiagnostic] flush failed:', res.status, batch.length, 'events', data);
        if (!this.flushViaWebSocket(batch)) this.buffer.unshift(...batch);
      }
    } catch (err) {
      console.warn('[sessionDiagnostic] flush error:', err);
      if (this.flushViaWebSocket(batch)) return;
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
    if (this.flushViaWebSocket(batch)) return;
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
