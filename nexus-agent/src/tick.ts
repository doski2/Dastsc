import type { AgentAction, AgentBrakeContext, AgentTick, BrakePlanStep, PolicyMode, TelemetrySnapshot, Urgency } from '@nexus/kernel';
import { formatDistance, formatSpeed } from '@nexus/kernel';
import { applyZoneMarginM, isInApplyZone, LIMIT_PLANNING_HORIZON_M } from './brake/physics';
import { planBrakeForLimit, planBrakeForStation, toAgentBrakeContext, toKernelBrakeSteps } from './brake/planBrake';
import type { BrakePlan, BrakePlanProfile, SnapshotBrakeContext } from './brake/types';
import { resolveSuggestedAction } from './command/commandBus';
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
  speedMs: number,
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
  const applyZoneM = applyZoneMarginM(speedMs, step.applyAtRemainingM);
  const pastDue = step.distStart < -applyZoneM;
  const applyNow = step.applyNow || isInApplyZone(step.distStart, applyZoneM);

  if (applyNow || pastDue) {
    const headline = plan.targetKind === 'STATION' && step.phase === 'stop'
      ? `${step.notch} — parada final`
      : `${step.notch} — aplicar ahora`;
    return {
      headline,
      detail: plan.targetKind === 'STATION' && step.phase === 'stop'
        ? `Andén a ${plan.distanceToTargetM.toFixed(0)} m · reducir a 0 ${speedUnit}`
        : `Frenada ${step.distanceM.toFixed(0)} m + ${plan.reactionMarginM.toFixed(0)} m margen${learned}`,
      urgency: pastDue ? 'critical' : 'warn',
    };
  }

  const distLabel = formatDistance(step.metersUntilActionM, speedUnit);
  return {
    headline: `${step.notch} en ~${distLabel}`,
    detail: `Objetivo a ${formatDistance(plan.distanceToTargetM, speedUnit)} · quedan ${step.applyAtRemainingM.toFixed(0)} m${learned}`,
    urgency: step.metersUntilActionM < 300 ? 'warn' : 'info',
  };
}

function resolveActiveBrakePlan(
  snapshot: TelemetrySnapshot,
  brakeCtx: SnapshotBrakeContext,
): { plan: BrakePlan | null; brakePlan?: BrakePlanStep[]; brakeContext?: AgentBrakeContext } {
  const ctx = {
    profile: brakeCtx.profile ?? DEFAULT_BRAKE_PROFILE,
    brakeStats: brakeCtx.brakeStats,
  };

  const limit = snapshot.limits.next;
  const stationDist = snapshot.station.distanceM;

  const limitPlan =
    limit && limit.distanceM > 0 && limit.distanceM < LIMIT_PLANNING_HORIZON_M
      ? planBrakeForLimit(snapshot, ctx)
      : null;

  const stationPlan =
    stationDist >= 0 && stationDist < 1500
      ? planBrakeForStation(snapshot, ctx)
      : null;

  const wrap = (plan: BrakePlan) => ({
    plan,
    brakePlan: toKernelBrakeSteps(plan),
    brakeContext: toAgentBrakeContext(plan, snapshot.gradient),
  });

  if (limitPlan?.activeStep && stationPlan?.activeStep && limit) {
    if (limit.distanceM <= stationDist) return wrap(limitPlan);
    return wrap(stationPlan);
  }
  if (limitPlan?.activeStep) return wrap(limitPlan);
  if (stationPlan?.activeStep) return wrap(stationPlan);

  return { plan: null };
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
  brakeContext?: AgentBrakeContext;
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

  if (snapshot.station.distanceM >= 0 && snapshot.station.distanceM < 1500) {
    const marginM = snapshot.station.distanceM;
    const plan = planBrakeForStation(snapshot, {
      profile: brakeCtx.profile ?? DEFAULT_BRAKE_PROFILE,
      brakeStats: brakeCtx.brakeStats,
    });
    if (plan?.activeStep) {
      const action = formatBrakeAction(plan, snapshot.speedUnit, snapshot.speedMs);
      const station = snapshot.station.nameOcr || 'estación';
      const scheduleHint = snapshot.station.eta
        ? ` · horario ${snapshot.station.eta}`
        : '';
      return {
        headline: `${station}: ${action.headline}`,
        detail: snapshot.station.eta
          ? `${action.detail}${scheduleHint}`
          : action.detail,
        urgency: action.urgency,
        marginM: plan.activeStep.metersUntilActionM || marginM,
        brakePlan: toKernelBrakeSteps(plan),
        brakeContext: toAgentBrakeContext(plan, snapshot.gradient),
      };
    }
    return {
      headline: `Aproximación a ${snapshot.station.nameOcr || 'estación'}`,
      detail: snapshot.station.eta
        ? `Horario ${snapshot.station.eta} · prepare frenada de estación`
        : 'Prepare frenada de estación.',
      urgency: 'info',
      marginM,
    };
  }

  const limit = horizon.find(e => e.kind === 'SPEED_LIMIT');
  if (limit && limit.distanceM < LIMIT_PLANNING_HORIZON_M) {
    const marginM = limit.distanceM;
    const target = limit.targetSpeedDisplay ?? snapshot.limits.effective;
    const plan = planBrakeForLimit(snapshot, {
      profile: brakeCtx.profile ?? DEFAULT_BRAKE_PROFILE,
      brakeStats: brakeCtx.brakeStats,
    });
    if (plan?.activeStep) {
      const action = formatBrakeAction(plan, snapshot.speedUnit, snapshot.speedMs);
      return {
        ...action,
        marginM: plan.activeStep.metersUntilActionM || marginM,
        brakePlan: toKernelBrakeSteps(plan),
        brakeContext: toAgentBrakeContext(plan, snapshot.gradient),
      };
    }
    return {
      headline: `Reducir a ${Math.round(target)} ${snapshot.speedUnit} en ~${formatDistance(marginM, snapshot.speedUnit)}`,
      detail: `Límite ${Math.round(snapshot.limits.effective)} → ${Math.round(target)} ${snapshot.speedUnit} · gradiente ${snapshot.gradient > 0 ? '+' : ''}${(snapshot.gradient / 10).toFixed(2)}%`,
      urgency: marginM < 300 ? 'warn' : 'info',
      marginM,
    };
  }

  return {
    headline: 'Circulación supervisada',
    detail: `Velocidad ${formatSpeed(snapshot.speedDisplay)} ${snapshot.speedUnit} · límite actual ${Math.round(snapshot.limits.effective)}`,
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
  const brakePresentation = resolveActiveBrakePlan(snapshot, brakeCtx);
  const picked = pickHeadline(snapshot, horizon, brakeCtx);
  const hasSafetyEvent = horizon.some(e => e.kind === 'SAFETY');
  const suggestedAction = resolveSuggestedAction(
    mode,
    brakePresentation.plan,
    brakeCtx.commandProfile,
    snapshot,
    hasSafetyEvent,
  );

  let blockedReason: string | undefined;
  if (!snapshot.connected) {
    blockedReason = 'Sin enlace con backend';
  } else if (mode === 'AUTO' && hasSafetyEvent) {
    blockedReason = 'AUTO suspendido — evento SAFETY';
  }

  return {
    t: snapshot.t,
    mode,
    headline: picked.headline,
    detail: picked.detail,
    urgency: picked.urgency,
    marginM: picked.marginM,
    marginS: estimateMarginS(picked.marginM, snapshot.speedMs),
    horizon,
    brakePlan: brakePresentation.brakePlan ?? picked.brakePlan,
    brakeContext: brakePresentation.brakeContext ?? picked.brakeContext,
    suggestedAction,
    blockedReason,
  };
}
