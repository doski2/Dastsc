import type { AgentTick, BrakePlanStep, PolicyMode, TelemetrySnapshot, Urgency } from '@nexus/kernel';
import { formatDistance, formatSpeed } from '@nexus/kernel';
import { APPLY_NOW_MARGIN_M } from './brake/physics';
import { planBrakeForLimit, planBrakeForStation, toKernelBrakeSteps } from './brake/planBrake';
import type { BrakePlan, BrakePlanProfile, SnapshotBrakeContext } from './brake/types';
import { buildHorizon } from './horizon';

const DEFAULT_MODE: PolicyMode = 'SUGGEST';

const DEFAULT_BRAKE_PROFILE: BrakePlanProfile = {
  physics_config: { max_braking_decel: 1.1, brake_fill_time_s: 5 },
  specs: {
    notches_throttle_brake: [
      { value: -0.75, label: 'B3' },
      { value: -0.5, label: 'B2' },
      { value: -0.25, label: 'B1' },
    ],
  },
};

function estimateMarginS(distanceM: number, speedMs: number): number {
  return speedMs > 0.5 ? distanceM / speedMs : 0;
}

function formatBrakeAction(
  plan: BrakePlan,
  speedUnit: TelemetrySnapshot['speedUnit'],
): { headline: string; detail: string; urgency: Urgency } {
  const step = plan.activeStep;
  if (!step) {
    return {
      headline: 'Plan de frenado no disponible',
      detail: 'Velocidad o distancia fuera de rango del modelo.',
      urgency: 'warn',
    };
  }

  const learned = step.usingLearned ? ' · decel aprendida' : '';
  if (step.applyNow || step.distStart < -APPLY_NOW_MARGIN_M) {
    return {
      headline: `${step.notch} — aplicar ahora`,
      detail: `Frenada ${step.distanceM.toFixed(0)} m + ${plan.reactionMarginM.toFixed(0)} m margen${learned}`,
      urgency: step.distStart < -APPLY_NOW_MARGIN_M ? 'critical' : 'warn',
    };
  }

  const distLabel = formatDistance(step.metersUntilActionM, speedUnit);
  return {
    headline: `${step.notch} en ~${distLabel}`,
    detail: `Objetivo a ${formatDistance(plan.distanceToTargetM, speedUnit)} · quedan ${step.applyAtRemainingM.toFixed(0)} m${learned}`,
    urgency: step.metersUntilActionM < 300 ? 'warn' : 'info',
  };
}

function pickHeadline(
  snapshot: TelemetrySnapshot,
  horizon: ReturnType<typeof buildHorizon>,
  brakeCtx: SnapshotBrakeContext,
): {
  headline: string;
  detail: string;
  urgency: Urgency;
  marginM: number;
  brakePlan?: BrakePlanStep[];
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
    const plan = planBrakeForLimit(snapshot, {
      profile: brakeCtx.profile ?? DEFAULT_BRAKE_PROFILE,
      brakeStats: brakeCtx.brakeStats,
    });
    if (plan?.activeStep) {
      const action = formatBrakeAction(plan, snapshot.speedUnit);
      return {
        ...action,
        marginM: plan.activeStep.metersUntilActionM || marginM,
        brakePlan: toKernelBrakeSteps(plan),
      };
    }
    return {
      headline: `Reducir a ${Math.round(target)} ${snapshot.speedUnit} en ~${formatDistance(marginM, snapshot.speedUnit)}`,
      detail: `Límite ${Math.round(snapshot.limits.effective)} → ${Math.round(target)} ${snapshot.speedUnit} · gradiente ${snapshot.gradient > 0 ? '+' : ''}${snapshot.gradient.toFixed(1)}‰`,
      urgency: marginM < 300 ? 'warn' : 'info',
      marginM,
    };
  }

  if (snapshot.station.distanceM > 0 && snapshot.station.distanceM < 1500) {
    const marginM = snapshot.station.distanceM;
    const plan = planBrakeForStation(snapshot, {
      profile: brakeCtx.profile ?? DEFAULT_BRAKE_PROFILE,
      brakeStats: brakeCtx.brakeStats,
    });
    if (plan?.activeStep) {
      const action = formatBrakeAction(plan, snapshot.speedUnit);
      const station = snapshot.station.nameOcr || 'estación';
      return {
        headline: `${station}: ${action.headline}`,
        detail: snapshot.station.eta
          ? `${action.detail} · ETA ${snapshot.station.eta}`
          : action.detail,
        urgency: action.urgency,
        marginM: plan.activeStep.metersUntilActionM || marginM,
        brakePlan: toKernelBrakeSteps(plan),
      };
    }
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
  brakeCtx: SnapshotBrakeContext = {},
): AgentTick {
  const horizon = buildHorizon(snapshot);
  const { headline, detail, urgency, marginM, brakePlan } = pickHeadline(snapshot, horizon, brakeCtx);

  return {
    t: snapshot.t,
    mode,
    headline,
    detail,
    urgency,
    marginM,
    marginS: estimateMarginS(marginM, snapshot.speedMs),
    horizon,
    brakePlan,
    blockedReason: !snapshot.connected ? 'Sin enlace con backend' : undefined,
  };
}
