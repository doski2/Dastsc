/**
 * Long-running sidecar: stdin/stdout NDJSON for backend AUTO (Fase 2).
 * One request line in, one response line out.
 *
 *   npx tsx nexus-agent/scripts/backend-sidecar.ts
 */
import readline from 'node:readline';
import { stdin, stdout } from 'node:process';
import { isBrakeApplied, tickAgent } from '../src/index';
import type { BrakePlanProfile, CommandProfile, SnapshotBrakeContext } from '../src/brake/types';
import type { BrakeStatsByNotch } from '../src/brake/types';
import { TelemetryHub } from '@nexus/kernel';
import type { GradientSignMode, NormalizerProfile, PolicyMode, WsMessage } from '@nexus/kernel';

const hub = new TelemetryHub();

interface SidecarProfile {
  id?: string;
  physics_config?: BrakePlanProfile['physics_config'];
  specs?: BrakePlanProfile['specs'];
  mappings?: Record<string, string>;
  agent_config?: BrakePlanProfile['agent_config'];
}

function toBrakePlanProfile(profile: SidecarProfile | null | undefined): BrakePlanProfile | null {
  if (!profile?.specs?.notches_throttle_brake?.length) return null;
  return {
    physics_config: profile.physics_config,
    specs: profile.specs,
    agent_config: profile.agent_config,
  };
}

function toCommandProfile(profile: SidecarProfile | null | undefined): CommandProfile | null {
  if (!profile) return null;
  return {
    physics_config: profile.physics_config,
    specs: profile.specs,
    mappings: profile.mappings,
    agent_config: profile.agent_config,
  };
}

function reply(payload: Record<string, unknown>): void {
  stdout.write(`${JSON.stringify(payload)}\n`);
}

function handleConfig(body: Record<string, unknown>): void {
  const profile = body.profile as SidecarProfile | null | undefined;
  hub.setProfile((profile ?? null) as NormalizerProfile | null);
  const gradientSign = body.gradientSign as GradientSignMode | undefined;
  hub.setGradientSign(gradientSign);
  reply({ ok: true, op: 'config' });
}

function handleReset(): void {
  hub.reset();
  reply({ ok: true, op: 'reset' });
}

function handleTick(body: Record<string, unknown>): void {
  const telemetry = body.telemetry as WsMessage | undefined;
  const policyMode = (body.policyMode as PolicyMode | undefined) ?? 'SUGGEST';
  const gameLinked = body.gameLinked !== false;
  const profile = body.profile as SidecarProfile | null | undefined;
  const brakeStats = (body.brakeStats as BrakeStatsByNotch | undefined) ?? {};

  if (!telemetry || typeof telemetry !== 'object') {
    reply({ ok: false, error: 'missing_telemetry' });
    return;
  }

  const message: WsMessage = {
    type: 'TELEMETRY',
    ...telemetry,
    gameLinked,
  };

  const snapshot = hub.ingestMessage(message, gameLinked, profile?.id ?? null);
  if (!snapshot) {
    reply({ ok: false, error: 'normalize_failed' });
    return;
  }

  const brakeCtx: SnapshotBrakeContext = {
    profile: toBrakePlanProfile(profile),
    commandProfile: toCommandProfile(profile),
    brakeStats,
  };

  const agent = tickAgent(snapshot, policyMode, brakeCtx);
  const stillBraking = isBrakeApplied(snapshot, brakeCtx.commandProfile);

  reply({
    ok: true,
    op: 'tick',
    snapshot,
    agent,
    stillBraking,
  });
}

const rl = readline.createInterface({ input: stdin, crlfDelay: Infinity });

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const body = JSON.parse(trimmed) as Record<string, unknown>;
    const op = body.op;
    if (op === 'config') {
      handleConfig(body);
    } else if (op === 'reset') {
      handleReset();
    } else if (op === 'tick') {
      handleTick(body);
    } else {
      reply({ ok: false, error: 'unknown_op' });
    }
  } catch (err) {
    reply({
      ok: false,
      error: err instanceof Error ? err.message : 'parse_error',
    });
  }
});

rl.on('close', () => {
  process.exit(0);
});
