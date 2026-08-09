import { TelemetryData } from './telemetryTypes';
import { NormalizerProfile, SimulatorRawInput } from './dataNormalizerUtils';

export const TELEMETRY_WS_URL = 'ws://localhost:8000/ws/telemetry';
export const WS_RECONNECT_MS = 500;

export interface ProfileSummary {
  id: string;
  name?: string;
  visuals?: {
    unit?: string;
    color?: string;
    pressure_unit?: 'PSI' | 'BAR';
  };
  nexus?: {
    tier?: 'genre' | 'train' | 'generic';
    genre?: string;
    hidden?: boolean;
    auto_priority?: number;
  };
}

export type WsMessage = Record<string, unknown> & {
  type?: string;
  available_profiles?: ProfileSummary[];
  active_profile?: ProfileSummary | null;
  active_profile_id?: string | null;
  data?: WsMessage;
  isConnected?: boolean;
  gameLinked?: boolean;
};

export function isTelemetryMessage(message: WsMessage): boolean {
  return message.type === 'TELEMETRY' || message.type === 'DATA';
}

export function extractRawTelemetry(message: WsMessage): WsMessage | null {
  if (message.type === 'DATA') {
    return message.data ?? null;
  }
  if (message.type === 'TELEMETRY') {
    return message;
  }
  return null;
}

export function profileIdsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

export function findProfileById(
  profiles: ProfileSummary[],
  profileId: string | null | undefined,
): ProfileSummary | null {
  if (!profileId) return null;
  const target = profileId.toLowerCase();
  return profiles.find(p => p.id.toLowerCase() === target) ?? null;
}

export function resolveIncomingProfile(
  message: WsMessage,
  profiles: ProfileSummary[],
): ProfileSummary | null {
  if (message.active_profile) return message.active_profile;
  const incomingId = message.active_profile_id ?? null;
  return findProfileById(profiles, incomingId);
}

export function mergeTelemetryUpdate(
  raw: WsMessage,
  normalized: Partial<TelemetryData>,
  prev: TelemetryData,
  timestamp: number,
): TelemetryData {
  return {
    ...prev,
    ...normalized,
    LocoName: String(raw.LocoName ?? normalized.LocoName ?? prev.LocoName),
    location: String(raw.location ?? raw.Location ?? normalized.location ?? prev.location),
    Timestamp: timestamp,
  };
}

export function toSimulatorRawInput(raw: WsMessage): SimulatorRawInput {
  return raw as SimulatorRawInput;
}
