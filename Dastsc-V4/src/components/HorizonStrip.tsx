import type { HorizonEvent } from '@nexus/kernel';
import { formatDistance, type DisplaySpeedUnit } from '@nexus/kernel';

export function HorizonStrip({
  events,
  speedUnit,
}: {
  events: HorizonEvent[];
  speedUnit: DisplaySpeedUnit;
}) {
  if (events.length === 0) {
    return (
      <section className="rounded-lg border border-white/5 bg-nexus-raised/50 px-3 py-2">
        <h2 className="text-[10px] font-mono uppercase tracking-widest text-white/30 mb-1">
          Horizonte
        </h2>
        <p className="text-white/20 text-xs font-mono">Sin eventos próximos</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-white/5 bg-nexus-raised/50 px-3 py-2">
      <h2 className="text-[10px] font-mono uppercase tracking-widest text-white/30 mb-2">
        Horizonte
      </h2>
      <ul className="space-y-1">
        {events.map((event) => {
          const isChainedLimit = event.id === 'limit-next-2' && event.label.includes('Cadena');
          return (
          <li
            key={event.id}
            className="flex items-center gap-2 font-mono text-xs text-white/70"
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                isChainedLimit ? 'bg-amber-400/90' : 'bg-cyan-500/80'
              }`}
            />
            <span className="text-white/40 w-20 shrink-0 tabular-nums">
              {formatDistance(event.distanceM, speedUnit)}
            </span>
            <span className={isChainedLimit ? 'text-amber-300/90' : undefined}>{event.label}</span>
          </li>
          );
        })}
      </ul>
    </section>
  );
}
