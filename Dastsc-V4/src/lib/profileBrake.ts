import type { AgentConfig, BrakePlanProfile } from '@nexus/agent';
import type { ProfileCompleteness } from './profileCompleteness';

const API_BASE = 'http://localhost:8000';

export interface TrainProfileFields {
  id?: string;
  name?: string;
  extends?: string;
  brakes?: unknown;
  physics_config?: BrakePlanProfile['physics_config'];
  specs?: BrakePlanProfile['specs'];
  mappings?: Record<string, string>;
  fingerprint?: { required_controls?: string[] };
  agent_config?: AgentConfig;
  runtime?: {
    controller_limits?: Record<string, { min: number; max: number; current?: number }>;
    loco_names?: string[];
    profile_completeness?: ProfileCompleteness;
  };
}

export function isFullTrainProfile(
  profile: TrainProfileFields | null | undefined,
): profile is TrainProfileFields & Required<Pick<TrainProfileFields, 'specs'>> {
  return Boolean(profile?.specs?.notches_throttle_brake?.length);
}

export function toBrakePlanProfile(profile: TrainProfileFields | null | undefined): BrakePlanProfile | null {
  if (!profile) return null;
  return {
    physics_config: profile.physics_config,
    specs: profile.specs,
    agent_config: profile.agent_config,
  };
}

export function toCommandProfile(profile: TrainProfileFields | null | undefined) {
  if (!profile) return null;
  return {
    physics_config: profile.physics_config,
    specs: profile.specs,
    mappings: profile.mappings,
    agent_config: profile.agent_config,
  };
}

export function profileId(profile: TrainProfileFields | null | undefined): string {
  return profile?.id ?? profile?.name ?? '';
}

export function brakeApiUrl(path: string, profile?: string | null): string {
  const base = `${API_BASE}${path}`;
  if (!profile) return base;
  const sep = path.includes('?') ? '&' : '?';
  return `${base}${sep}profile=${encodeURIComponent(profile)}`;
}

export function brakeStatsUrl(profileIdValue: string | null): string {
  return brakeApiUrl('/api/brake/stats', profileIdValue);
}

export function profileDetailUrl(profileIdValue: string): string {
  return `${API_BASE}/api/profiles/${encodeURIComponent(profileIdValue)}`;
}
