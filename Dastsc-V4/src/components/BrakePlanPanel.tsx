import type { AgentBrakeContext, AgentTick, BrakePlanStep, DisplaySpeedUnit, TelemetrySnapshot } from '@nexus/kernel';
import { formatDistance } from '@nexus/kernel';
import type { BrakeStatsByNotch } from '@nexus/agent';
import type { StationDistanceDebug } from '../hooks/useStationDistanceDebug';

import type { CabOverride } from '../lib/agentSettings';

interface BrakePlanPanelProps {
  tick: AgentTick;
  snapshot: TelemetrySnapshot;
  speedUnit: DisplaySpeedUnit;
  brakeStats: BrakeStatsByNotch;
  stationDebug?: StationDistanceDebug | null;
  cabOverride: CabOverride;
  onCabOverrideChange: (override: CabOverride) => void;
}

const TARGET_LABEL: Record<AgentBrakeContext['targetKind'], string> = {
  STATION: 'Estación',
  SPEED_LIMIT: 'Límite',
  SIGNAL: 'Señal',
};

function gradientLabel(permille: number): string {
  if (Math.abs(permille) < 0.5) return 'Plano';
  const arrow = permille > 0 ? '↑' : '↓';
  const sign = permille > 0 ? '+' : '';
  const pct = permille / 10;
  return `${arrow} ${sign}${permille.toFixed(1)}‰ (${sign}${pct.toFixed(2)}%)`;
}

function gradeRatioLabel(permille: number): string {
  const pct = Math.abs(permille) / 10;
  if (pct < 0.05) return 'plano';
  const ratio = Math.round(100 / pct);
  return `1:${ratio}`;
}

function reverserLabel(reverser: number): string {
  if (reverser > 0.05) return 'FOR';
  if (reverser < -0.05) return 'REV';
  return 'NEU';
}

function GradientDebugPanel({
  snapshot,
  cabOverride,
  onCabOverrideChange,
}: {
  snapshot: TelemetrySnapshot;
  cabOverride: CabOverride;
  onCabOverrideChange: (override: CabOverride) => void;
}) {
  const cabInverted = snapshot.gradient !== 0
    && snapshot.rawGradient !== 0
    && Math.sign(snapshot.gradient) !== Math.sign(snapshot.rawGradient);
  const overrideActive = cabOverride !== 'auto';
  return (
    <div className="rounded border border-white/5 bg-black/20 p-2 space-y-2">
      <div className="text-[9px] uppercase text-white/30 font-mono">Gradiente / cabina</div>
      <div className="flex flex-wrap gap-1">
        {(['auto', 1, 2] as const).map(option => (
          <button
            key={String(option)}
            type="button"
            onClick={() => onCabOverrideChange(option)}
            className={`rounded px-2 py-0.5 text-[10px] font-mono border transition-colors ${
              cabOverride === option
                ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200'
                : 'border-white/10 text-white/40 hover:text-white/70'
            }`}
          >
            {option === 'auto' ? 'Auto' : `Cab ${option}`}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] font-mono text-white/50">
        <span>Plan: {gradientLabel(snapshot.gradient)}</span>
        <span>Raw juego: {gradientLabel(snapshot.rawGradient)}</span>
        <span>Cabina: {snapshot.activeCab}{overrideActive ? ' (manual)' : ''}</span>
        <span>Reverser: {reverserLabel(snapshot.reverser)}</span>
        <span className="col-span-2 text-white/40">Rampa UK: {gradeRatioLabel(snapshot.rawGradient)}</span>
        <span className="col-span-2 text-white/30">
          {overrideActive
            ? 'Cabina forzada manualmente — útil si TSC no detecta el cambio (plugin global)'
            : cabInverted
              ? 'Auto: cabina detectada — signo de gradiente corregido'
              : 'Auto: conduce unos segundos en cab 2 (FOR) para detectar; luego se recuerda al parar'}
        </span>
      </div>
    </div>
  );
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

export function BrakePlanPanel({
  tick,
  snapshot,
  speedUnit,
  brakeStats,
  stationDebug,
  cabOverride,
  onCabOverrideChange,
}: BrakePlanPanelProps) {
  const ctx = tick.brakeContext;
  const steps = tick.brakePlan;

  if (!ctx || !steps?.length) {
    return (
      <section className="rounded-lg border border-white/5 bg-nexus-raised p-4 space-y-3">
        <div className="text-[10px] uppercase text-white/30 font-mono mb-1">Validación frenado</div>
        <p className="text-xs text-white/40">
          Acércate a un límite o estación para ver el plan de muescas.
        </p>
        <GradientDebugPanel
          snapshot={snapshot}
          cabOverride={cabOverride}
          onCabOverrideChange={onCabOverrideChange}
        />
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

      <GradientDebugPanel
        snapshot={snapshot}
        cabOverride={cabOverride}
        onCabOverrideChange={onCabOverrideChange}
      />

      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded border border-white/5 p-2">
          <div className="text-[9px] uppercase text-white/30 font-mono">Margen reacción</div>
          <div className="text-sm font-mono text-white tabular-nums">{ctx.reactionMarginM.toFixed(0)} m</div>
        </div>
        <div className="rounded border border-white/5 p-2">
          <div className="text-[9px] uppercase text-white/30 font-mono">Muesca activa</div>
          <div className="text-sm font-mono text-cyan-300 tabular-nums">{ctx.activeNotch ?? '—'}</div>
        </div>
      </div>

      {ctx.targetKind === 'STATION' && (snapshot.station.anchorM != null || stationDebug?.has_anchor) && (
        <div className="rounded border border-white/5 bg-black/20 p-2 space-y-1">
          <div className="text-[9px] uppercase text-white/30 font-mono">Leg estación (OCR + odómetro)</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] font-mono text-white/50">
            {snapshot.station.anchorM != null && (
              <span>Ancla OCR: {formatDistance(snapshot.station.anchorM, speedUnit)}</span>
            )}
            {snapshot.station.traveledM != null && (
              <span>Recorrido: {snapshot.station.traveledM.toFixed(0)} m</span>
            )}
            {snapshot.station.nearCorrected && (
              <span className="text-cyan-300/80 col-span-2">Corrección cerca estación aplicada</span>
            )}
            {snapshot.station.driftM != null && (
              <span className="col-span-2">
                Deriva OCR: {snapshot.station.driftM > 0 ? '+' : ''}{snapshot.station.driftM.toFixed(0)} m
              </span>
            )}
            {stationDebug?.sample_count != null && (
              <span className="col-span-2 text-white/30">
                Muestras: {stationDebug.sample_count}
                {stationDebug.samples.length > 0 && (
                  <> · última {stationDebug.samples[stationDebug.samples.length - 1]?.event}</>
                )}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
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
        Distancia a estación: OCR al cerrar puertas, luego odómetro. Δ≈0 → momento de frenar.
      </p>
    </section>
  );
}
