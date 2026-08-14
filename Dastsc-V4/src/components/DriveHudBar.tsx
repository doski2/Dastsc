import { formatDistance, formatSpeed, type DisplaySpeedUnit, type TelemetrySnapshot } from '@nexus/kernel';

interface DriveHudBarProps {
  snapshot: TelemetrySnapshot;
}

function Metric({
  label,
  value,
  unit,
  tone = 'default',
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: 'default' | 'limit' | 'tail' | 'next';
}) {
  const valueClass =
    tone === 'limit'
      ? 'text-yellow-300'
      : tone === 'tail'
        ? 'text-amber-400'
        : tone === 'next'
          ? 'text-cyan-300/90'
          : 'text-white';

  return (
    <div className="min-w-0 flex-1 px-3 py-2 border-r border-white/5 last:border-r-0">
      <div className="text-[9px] uppercase tracking-wider text-white/35 font-mono truncate">
        {label}
      </div>
      <div className={`text-xl sm:text-2xl font-mono font-bold tabular-nums leading-tight ${valueClass}`}>
        {value}
        {unit && <span className="text-[10px] font-normal text-white/35 ml-1">{unit}</span>}
      </div>
    </div>
  );
}

export function DriveHudBar({ snapshot }: DriveHudBarProps) {
  const unit: DisplaySpeedUnit = snapshot.speedUnit;
  const next = snapshot.limits.next;
  const tail = snapshot.tail;

  const nextLabel = next
    ? `${Math.round(next.speed)} ${unit}`
    : '—';
  const nextDetail = next
    ? formatDistance(next.distanceM, unit)
    : '';

  const tailValue = tail.active
    ? formatDistance(Math.max(0, tail.distanceM), unit)
    : '—';
  const tailSub = tail.active && tail.seconds > 0
    ? `${tail.seconds.toFixed(0)} s`
    : tail.active
      ? 'ON'
      : '';

  return (
    <section
      className="shrink-0 border-b border-white/5 bg-nexus-raised/95 backdrop-blur-sm"
      aria-label="Telemetría en marcha"
    >
      <div className="max-w-3xl mx-auto w-full flex items-stretch">
        <Metric
          label="Velocidad"
          value={formatSpeed(snapshot.speedDisplay)}
          unit={unit}
        />
        <Metric
          label="Límite"
          value={String(Math.round(snapshot.limits.effective))}
          unit={unit}
          tone="limit"
        />
        <div className="min-w-0 flex-1 px-3 py-2 border-r border-white/5">
          <div className="text-[9px] uppercase tracking-wider text-white/35 font-mono truncate">
            Próx. límite
          </div>
          <div className="text-xl sm:text-2xl font-mono font-bold tabular-nums leading-tight text-cyan-300/90">
            {nextLabel}
          </div>
          {nextDetail && (
            <div className="text-[10px] font-mono text-white/40 tabular-nums truncate">
              en {nextDetail}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 px-3 py-2">
          <div className="text-[9px] uppercase tracking-wider text-white/35 font-mono truncate">
            Cola
          </div>
          <div
            className={`text-xl sm:text-2xl font-mono font-bold tabular-nums leading-tight ${
              tail.active ? 'text-amber-400' : 'text-white/25'
            }`}
          >
            {tailValue}
          </div>
          {tailSub && (
            <div className="text-[10px] font-mono text-amber-400/70 tabular-nums">
              {tailSub}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
