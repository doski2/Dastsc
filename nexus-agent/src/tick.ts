import type { AgentTick, PolicyMode, TelemetrySnapshot, Urgency } from '@nexus/kernel';
import { formatDistance, formatSpeed } from '@nexus/kernel';
import { buildHorizon } from './horizon';

const DEFAULT_MODE: PolicyMode = 'SUGGEST';

function estimateMarginS(distanceM: number, speedMs: number): number {
  return speedMs > 0.5 ? distanceM / speedMs : 0;
}

function pickHeadline(snapshot: TelemetrySnapshot, horizon: ReturnType<typeof buildHorizon>): {
  headline: string;
  detail: string;
  urgency: Urgency;
  marginM: number;
} {
  const safety = horizon.find(e => e.kind === 'SAFETY');
  if (safety) {
    return {
      headline: `${safety.label} — intervención requerida`,
      detail: 'Confirma el sistema de seguridad antes de continuar.',
      urgency: 'critical',
      marginM: 0,
    };
  }

  const limit = horizon.find(e => e.kind === 'SPEED_LIMIT');
  if (limit && limit.distanceM < 800) {
    const marginM = limit.distanceM;
    const target = limit.targetSpeedDisplay ?? snapshot.limits.effective;
    return {
      headline: `Reducir a ${Math.round(target)} ${snapshot.speedUnit} en ~${formatDistance(marginM, snapshot.speedUnit)}`,
      detail: `Límite ${Math.round(snapshot.limits.effective)} → ${Math.round(target)} ${snapshot.speedUnit} · gradiente ${snapshot.gradient > 0 ? '+' : ''}${snapshot.gradient.toFixed(1)}‰`,
      urgency: marginM < 300 ? 'warn' : 'info',
      marginM,
    };
  }

  if (snapshot.station.distanceM > 0 && snapshot.station.distanceM < 1500) {
    const marginM = snapshot.station.distanceM;
    return {
      headline: `Aproximación a ${snapshot.station.nameOcr || 'estación'}`,
      detail: snapshot.station.eta ? `ETA ${snapshot.station.eta}` : 'Prepare frenada de estación.',
      urgency: 'info',
      marginM,
    };
  }

  return {
    headline: 'Circulación supervisada',
    detail: `Velocidad ${formatSpeed(snapshot.speedDisplay)} ${snapshot.speedUnit} · límite ${Math.round(snapshot.limits.effective)}`,
    urgency: 'info',
    marginM: limit?.distanceM ?? 9999,
  };
}

export function tickAgent(
  snapshot: TelemetrySnapshot,
  mode: PolicyMode = DEFAULT_MODE,
): AgentTick {
  const horizon = buildHorizon(snapshot);
  const { headline, detail, urgency, marginM } = pickHeadline(snapshot, horizon);

  return {
    t: snapshot.t,
    mode,
    headline,
    detail,
    urgency,
    marginM,
    marginS: estimateMarginS(marginM, snapshot.speedMs),
    horizon,
    blockedReason: !snapshot.connected ? 'Sin enlace con backend' : undefined,
  };
}
