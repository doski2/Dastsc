import type { AgentBrakeContext, AgentTick, BrakePlanStep, DisplaySpeedUnit } from '@nexus/kernel';
import { formatDistance } from '@nexus/kernel';
import type { BrakeStatsByNotch } from '@nexus/agent';

interface BrakePlanPanelProps {
  tick: AgentTick;
  speedUnit: DisplaySpeedUnit;
  brakeStats: BrakeStatsByNotch;
}

const TARGET_LABEL: Record<AgentBrakeContext['targetKind'], string> = {
  STATION: 'Estación',
  SPEED_LIMIT: 'Límite',
};

function gradientLabel(permille: number): string {
  if (Math.abs(permille) < 0.5) return 'Plano';
  const sign = permille > 0 ? '+' : '';
  return `${sign}${permille.toFixed(1)}‰`;
}

function stepRowClass(step: BrakePlanStep, activeNotch: string | null): string {
  if (step.applyNow || step.notch === activeNotch) {
    return 'bg-cyan-500/10 border-cyan-500/40';
  }
  if (step.distStart != null && step.distStart < -150) {
    return 'bg-red-500/10 border-red-500/30';
  }
  return 'border-white/5';
}

export function BrakePlanPanel({ tick, speedUnit, brakeStats }: BrakePlanPanelProps) {
  const ctx = tick.brakeContext;
  const steps = tick.brakePlan;

  if (!ctx || !steps?.length) {
    return (
      <section className="rounded-lg border border-white/5 bg-nexus-raised p-4">
        <div className="text-[10px] uppercase text-white/30 font-mono mb-1">Validación frenado</div>
        <p className="text-xs text-white/40">
          Acércate a un límite o estación para ver el plan de muescas.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-white/5 bg-nexus-raised p-4 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="text-[10px] uppercase text-white/30 font-mono">Validación frenado</div>
        <div className="text-[10px] font-mono text-white/40 uppercase">
          {TARGET_LABEL[ctx.targetKind]} · {formatDistance(ctx.distanceToTargetM, speedUnit)}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded border border-white/5 p-2">
          <div className="text-[9px] uppercase text-white/30 font-mono">Gradiente</div>
          <div className="text-sm font-mono text-white tabular-nums">{gradientLabel(ctx.gradientPermille)}</div>
        </div>
        <div className="rounded border border-white/5 p-2">
          <div className="text-[9px] uppercase text-white/30 font-mono">Margen reacción</div>
          <div className="text-sm font-mono text-white tabular-nums">{ctx.reactionMarginM.toFixed(0)} m</div>
        </div>
        <div className="rounded border border-white/5 p-2">
          <div className="text-[9px] uppercase text-white/30 font-mono">Muesca activa</div>
          <div className="text-sm font-mono text-cyan-300 tabular-nums">{ctx.activeNotch ?? '—'}</div>
        </div>
      </div>

      <div className="space-y-1">
        {steps.map(step => {
          const stats = brakeStats[step.notch];
          const learned = step.usingLearned && stats;
          return (
            <div
              key={step.notch}
              className={`grid grid-cols-[3rem_1fr_5rem_5rem] gap-2 items-center rounded border px-2 py-1.5 text-xs font-mono ${stepRowClass(step, ctx.activeNotch)}`}
            >
              <span className="font-semibold text-white">{step.notch}</span>
              <span className="text-white/50 truncate">
                {step.applyNow
                  ? 'Aplicar ahora'
                  : step.metersUntilActionM != null
                    ? `en ~${formatDistance(step.metersUntilActionM, speedUnit)}`
                    : '—'}
                {step.distStart != null && (
                  <span className="text-white/25 ml-2">Δ{step.distStart.toFixed(0)} m</span>
                )}
              </span>
              <span className="text-right text-white/40 tabular-nums">{step.distanceM.toFixed(0)} m</span>
              <span className={`text-right tabular-nums ${learned ? 'text-emerald-400/90' : 'text-white/25'}`}>
                {learned ? `${stats.avg_decel.toFixed(2)} n=${stats.samples}` : 'teórico'}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-white/30 leading-relaxed">
        Compara el headline con la sensación real. Δ≈0 → momento de frenar. Verde = decel aprendida.
      </p>
    </section>
  );
}
