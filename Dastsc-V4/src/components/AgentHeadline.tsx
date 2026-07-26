import type { AgentTick } from '@nexus/kernel';
import { formatDistance } from '@nexus/kernel';
import type { DisplaySpeedUnit } from '@nexus/kernel';

const URGENCY_BORDER: Record<AgentTick['urgency'], string> = {
  info: 'border-cyan-500/30',
  warn: 'border-amber-500/50',
  critical: 'border-red-500/70',
};

export function AgentHeadline({
  tick,
  speedUnit,
}: {
  tick: AgentTick;
  speedUnit: DisplaySpeedUnit;
}) {
  const marginLabel = tick.marginM < 5000
    ? `${formatDistance(tick.marginM, speedUnit)} · ${tick.marginS.toFixed(0)} s`
    : '—';

  return (
    <section
      className={`rounded-lg border bg-nexus-raised p-6 ${URGENCY_BORDER[tick.urgency]}`}
    >
      <div className="flex justify-between items-start gap-4 mb-3">
        <h1 className="text-xl font-semibold text-white leading-snug">{tick.headline}</h1>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase text-white/30 font-mono">Margen</div>
          <div className="text-lg font-mono text-amber-200 tabular-nums">{marginLabel}</div>
        </div>
      </div>
      <p className="text-sm text-white/50 leading-relaxed">{tick.detail}</p>
      {tick.blockedReason && (
        <p className="mt-3 text-xs font-mono text-red-400/80">{tick.blockedReason}</p>
      )}
    </section>
  );
}
