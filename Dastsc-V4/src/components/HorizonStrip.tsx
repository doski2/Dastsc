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
      <section>
        <h2 className="text-[10px] font-mono uppercase tracking-widest text-white/30 mb-3">
          Horizonte
        </h2>
        <p className="text-white/20 text-sm font-mono">Sin eventos próximos</p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-[10px] font-mono uppercase tracking-widest text-white/30 mb-3">
        Horizonte
      </h2>
      <ul className="space-y-2">
        {events.map((event) => (
          <li
            key={event.id}
            className="flex items-center gap-3 font-mono text-sm text-white/70"
          >
            <span className="w-2 h-2 rounded-full bg-cyan-500/80 shrink-0" />
            <span className="text-white/40 w-20 shrink-0 tabular-nums">
              {formatDistance(event.distanceM, speedUnit)}
            </span>
            <span>{event.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
