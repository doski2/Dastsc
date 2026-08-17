import type { AgentBrakeContext, AgentTick, BrakePlanStep, DisplaySpeedUnit, TelemetrySnapshot } from '@nexus/kernel';
import { formatDistance } from '@nexus/kernel';
import type { BrakeStatsByNotch, BrakeStatsEntry, SpeedBand } from '@nexus/agent';
import { speedBandFromMs } from '@nexus/agent';
import type { StationDistanceDebug } from '../hooks/useStationDistanceDebug';

import type { GradientSignMode } from '../lib/agentSettings';

interface BrakePlanPanelProps {
  tick: AgentTick;
  snapshot: TelemetrySnapshot;
  speedUnit: DisplaySpeedUnit;
  brakeStats: BrakeStatsByNotch;
  stationDebug?: StationDistanceDebug | null;
  gradientSign: GradientSignMode;
  onGradientSignChange: (mode: GradientSignMode) => void;
  /** Columna lateral en pantallas anchas — rejillas más verticales. */
  layout?: 'default' | 'sidebar';
}

const TARGET_LABEL: Record<AgentBrakeContext['targetKind'], string> = {
  STATION: 'Estación',
  SPEED_LIMIT: 'Límite',
  SIGNAL: 'Señal',
};

const BAND_LABEL: Record<SpeedBand, string> = {
  high: 'Alta',
  med: 'Media',
  low: 'Baja',
};

function formatGradientPermille(permille: number): string {
  const sign = permille > 0 ? '+' : permille < 0 ? '' : '';
  const pct = permille / 10;
  return `${sign}${permille.toFixed(1)}‰ (${sign}${pct.toFixed(2)}%)`;
}

function gradientTone(permille: number): 'up' | 'down' | 'flat' {
  if (permille > 0.5) return 'up';
  if (permille < -0.5) return 'down';
  return 'flat';
}

function GradientSignPanel({
  snapshot,
  gradientSign,
  onGradientSignChange,
}: {
  snapshot: TelemetrySnapshot;
  gradientSign: GradientSignMode;
  onGradientSignChange: (mode: GradientSignMode) => void;
}) {
  const planTone = gradientTone(snapshot.gradient);
  const planClass = planTone === 'up'
    ? 'text-amber-300/90'
    : planTone === 'down'
      ? 'text-emerald-300/90'
      : 'text-white/60';

  return (
    <div className="rounded border border-white/5 bg-black/20 p-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[9px] uppercase text-white/30 font-mono">Gradiente</div>
        <div className="flex gap-1">
          {(['+', '-'] as const).map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => onGradientSignChange(mode)}
              className={`rounded px-2 py-0.5 text-[10px] font-mono border transition-colors ${
                gradientSign === mode
                  ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200'
                  : 'border-white/10 text-white/40 hover:text-white/70'
              }`}
              title={mode === '+'
                ? 'Usar signo tal cual GetData (RawGradient)'
                : 'Invertir signo del RawGradient'}
            >
              {mode === '+' ? '+ directo' : '− invertir'}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
        <div className="rounded border border-white/5 bg-nexus-raised px-2 py-1.5">
          <div className="text-[8px] uppercase text-white/30 mb-0.5">Raw juego</div>
          <div className="text-white/70 tabular-nums">{formatGradientPermille(snapshot.rawGradient)}</div>
        </div>
        <div className="rounded border border-white/5 bg-nexus-raised px-2 py-1.5">
          <div className="text-[8px] uppercase text-white/30 mb-0.5">Plan freno</div>
          <div className={`tabular-nums ${planClass}`}>{formatGradientPermille(snapshot.gradient)}</div>
        </div>
      </div>
      <p className="text-[8px] text-white/25 leading-snug">
        + sube con Raw positivo · − invierte. Cabina TSC: {snapshot.activeCab} · Rev {reverserLabel(snapshot.reverser)}
      </p>
    </div>
  );
}

function reverserLabel(reverser: number): string {
  if (reverser > 0.05) return 'FOR';
  if (reverser < -0.05) return 'REV';
  return 'NEU';
}

function formatKn(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function formatBandCell(
  stats: BrakeStatsEntry | undefined,
  band: SpeedBand,
  currentBand: SpeedBand,
): string {
  const entry = stats?.by_speed?.[band];
  if (!entry?.samples) return '—';
  const active = band === currentBand ? '*' : '';
  return `${entry.avg_decel.toFixed(2)} n=${entry.samples}${active}`;
}

function stepRowClass(step: BrakePlanStep, activeNotch: string | null): string {
  if (step.applyNow || step.notch === activeNotch) {
    return 'bg-cyan-500/10 border-cyan-500/30';
  }
  if (step.distStart != null && step.distStart < -150) {
    return 'bg-red-500/10 border-red-500/25';
  }
  return 'border-white/5';
}

function LiveBrakeStrip({
  snapshot,
  sidebar,
}: {
  snapshot: TelemetrySnapshot;
  sidebar?: boolean;
}) {
  const band = speedBandFromMs(snapshot.speedMs);
  const { combined, position, tractiveKn, effortKn, cylinder } = snapshot.brake;
  const gridClass = sidebar
    ? 'grid-cols-2'
    : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6';

  return (
    <div className={`grid ${gridClass} gap-px rounded border border-white/5 bg-white/5 overflow-hidden text-[10px] font-mono`}>
      <MetricCell label="Palanca" value={`${(position * 100).toFixed(0)}%`} />
      <MetricCell label="Combined" value={combined.toFixed(2)} />
      <MetricCell
        label="Tracción kN"
        value={formatKn(tractiveKn)}
        tone={tractiveKn < -5 ? 'cyan' : tractiveKn > 5 ? 'amber' : undefined}
      />
      <MetricCell label="Effort est." value={`${effortKn.toFixed(0)} kN`} />
      <MetricCell label="Cilindro" value={`${cylinder.toFixed(0)}`} />
      <MetricCell label="Banda v" value={BAND_LABEL[band]} tone="cyan" />
    </div>
  );
}

function MetricCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'cyan' | 'amber';
}) {
  const valueClass = tone === 'cyan'
    ? 'text-cyan-300'
    : tone === 'amber'
      ? 'text-amber-300/90'
      : 'text-white/80';
  return (
    <div className="bg-nexus-raised px-2 py-1.5 min-w-0">
      <div className="text-[8px] uppercase text-white/30 truncate">{label}</div>
      <div className={`tabular-nums truncate ${valueClass}`}>{value}</div>
    </div>
  );
}

function PlanContextStrip({
  ctx,
  speedUnit,
  sidebar,
}: {
  ctx: AgentBrakeContext;
  speedUnit: DisplaySpeedUnit;
  sidebar?: boolean;
}) {
  return (
    <div className={`grid ${sidebar ? 'grid-cols-1' : 'grid-cols-3'} gap-px rounded border border-white/5 bg-white/5 overflow-hidden text-[10px] font-mono`}>
      <MetricCell label="Objetivo" value={`${TARGET_LABEL[ctx.targetKind]} · ${formatDistance(ctx.distanceToTargetM, speedUnit)}`} />
      <MetricCell label="Margen" value={`${ctx.reactionMarginM.toFixed(0)} m`} />
      <MetricCell label="Muesca activa" value={ctx.activeNotch ?? '—'} tone="cyan" />
    </div>
  );
}

function StationLegStrip({
  snapshot,
  stationDebug,
  speedUnit,
}: {
  snapshot: TelemetrySnapshot;
  stationDebug?: StationDistanceDebug | null;
  speedUnit: DisplaySpeedUnit;
}) {
  if (snapshot.station.anchorM == null && !stationDebug?.has_anchor) return null;

  const parts: string[] = [];
  if (snapshot.station.anchorM != null) {
    parts.push(`Ancla ${formatDistance(snapshot.station.anchorM, speedUnit)}`);
  }
  if (snapshot.station.traveledM != null) {
    parts.push(`Recorrido ${snapshot.station.traveledM.toFixed(0)} m`);
  }
  if (snapshot.station.driftM != null) {
    parts.push(`Deriva ${snapshot.station.driftM > 0 ? '+' : ''}${snapshot.station.driftM.toFixed(0)} m`);
  }
  if (snapshot.station.nearCorrected) parts.push('Corrección cerca');
  if (stationDebug?.sample_count != null) {
    parts.push(`Muestras ${stationDebug.sample_count}`);
  }

  return (
    <div className="rounded border border-white/5 bg-black/20 px-2 py-1.5 text-[10px] font-mono text-white/45">
      <span className="text-[8px] uppercase text-white/30 mr-2">Estación OCR</span>
      {parts.join(' · ')}
    </div>
  );
}

function BrakePlanTable({
  steps,
  ctx,
  speedUnit,
  brakeStats,
  currentBand,
}: {
  steps: BrakePlanStep[];
  ctx: AgentBrakeContext;
  speedUnit: DisplaySpeedUnit;
  brakeStats: BrakeStatsByNotch;
  currentBand: SpeedBand;
}) {
  return (
    <div className="rounded border border-white/5 overflow-x-auto">
      <table className="w-full text-[10px] font-mono border-collapse">
        <thead>
          <tr className="text-[8px] uppercase text-white/30 bg-black/30">
            <th className="text-left px-2 py-1 font-normal w-12">Muesca</th>
            <th className="text-left px-2 py-1 font-normal">Acción</th>
            <th className="text-right px-2 py-1 font-normal w-14">Dist</th>
            <th className="text-right px-2 py-1 font-normal w-16">Decel</th>
            <th className="text-right px-2 py-1 font-normal w-14" title="Alta velocidad ≥78 mph">H</th>
            <th className="text-right px-2 py-1 font-normal w-14" title="Media 18–78 mph">M</th>
            <th className="text-right px-2 py-1 font-normal w-14" title="Baja &lt;18 mph">B</th>
          </tr>
        </thead>
        <tbody>
          {steps.map(step => {
            const stats = brakeStats[step.notch];
            const learned = step.usingLearned && stats;
            const action = step.applyNow
              ? 'Ahora'
              : step.metersUntilActionM != null
                ? `~${formatDistance(step.metersUntilActionM, speedUnit)}`
                : '—';
            const delta = step.distStart != null ? ` Δ${step.distStart.toFixed(0)}m` : '';

            return (
              <tr
                key={step.notch}
                className={`border-t ${stepRowClass(step, ctx.activeNotch)}`}
              >
                <td className="px-2 py-1 font-semibold text-white">{step.notch}</td>
                <td className="px-2 py-1 text-white/50 truncate max-w-[140px]">
                  {action}
                  {delta && <span className="text-white/25">{delta}</span>}
                </td>
                <td className="px-2 py-1 text-right text-white/50 tabular-nums">
                  {step.distanceM.toFixed(0)} m
                </td>
                <td className={`px-2 py-1 text-right tabular-nums ${learned ? 'text-emerald-400/90' : 'text-white/25'}`}>
                  {learned
                    ? `${stats.avg_decel.toFixed(2)} n=${stats.samples}`
                    : 'teórico'}
                </td>
                <td className="px-2 py-1 text-right text-white/40 tabular-nums">
                  {formatBandCell(stats, 'high', currentBand)}
                </td>
                <td className="px-2 py-1 text-right text-white/40 tabular-nums">
                  {formatBandCell(stats, 'med', currentBand)}
                </td>
                <td className="px-2 py-1 text-right text-white/40 tabular-nums">
                  {formatBandCell(stats, 'low', currentBand)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function BrakePlanPanel({
  tick,
  snapshot,
  speedUnit,
  brakeStats,
  stationDebug,
  gradientSign,
  onGradientSignChange,
  layout = 'default',
}: BrakePlanPanelProps) {
  const ctx = tick.brakeContext;
  const steps = tick.brakePlan;
  const currentBand = speedBandFromMs(snapshot.speedMs);
  const sidebar = layout === 'sidebar';

  return (
    <section className="rounded-lg border border-white/5 bg-nexus-raised p-3 space-y-2 h-full xl:min-h-[min(100%,32rem)]">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase text-white/30 font-mono">Validación frenado</div>
        {ctx && (
          <div className="text-[9px] font-mono text-white/35 uppercase truncate">
            {TARGET_LABEL[ctx.targetKind]} · {formatDistance(ctx.distanceToTargetM, speedUnit)}
          </div>
        )}
      </div>

      <GradientSignPanel
        snapshot={snapshot}
        gradientSign={gradientSign}
        onGradientSignChange={onGradientSignChange}
      />

      <LiveBrakeStrip snapshot={snapshot} sidebar={sidebar} />

      {ctx && steps?.length ? (
        <>
          <PlanContextStrip
            ctx={ctx}
            speedUnit={speedUnit}
            sidebar={sidebar}
          />

          {ctx.targetKind === 'STATION' && (
            <StationLegStrip snapshot={snapshot} stationDebug={stationDebug} speedUnit={speedUnit} />
          )}

          <BrakePlanTable
            steps={steps}
            ctx={ctx}
            speedUnit={speedUnit}
            brakeStats={brakeStats}
            currentBand={currentBand}
          />
        </>
      ) : (
        <p className="text-[10px] font-mono text-white/40 px-1">
          Acércate a un límite o estación para ver el plan de muescas.
        </p>
      )}

      <p className="text-[9px] text-white/25 leading-snug">
        Bandas en mph · * = banda actual · Decel global si la banda tiene &lt;3 muestras.
        Δ≈0 → aplicar muesca.
      </p>
    </section>
  );
}
