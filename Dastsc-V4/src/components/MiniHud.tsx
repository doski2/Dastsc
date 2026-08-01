import { formatSpeed } from '@nexus/kernel';
import type { DisplaySpeedUnit } from '@nexus/kernel';

interface MiniHudProps {
  speed: number;
  speedUnit: DisplaySpeedUnit;
  limit: number;
  tailActive: boolean;
}

export function MiniHud({ speed, speedUnit, limit, tailActive }: MiniHudProps) {
  return (
    <section className="grid grid-cols-3 gap-4">
      <div className="rounded border border-white/5 bg-nexus-raised p-4 text-center">
        <div className="text-[10px] uppercase text-white/30 font-mono mb-1">Velocidad</div>
        <div className="text-2xl font-mono font-bold text-white tabular-nums">
          {formatSpeed(speed)}
          <span className="text-xs text-white/40 ml-1">{speedUnit}</span>
        </div>
      </div>
      <div className="rounded border border-white/5 bg-nexus-raised p-4 text-center">
        <div className="text-[10px] uppercase text-white/30 font-mono mb-1">Límite actual</div>
        <div className="text-2xl font-mono font-bold text-yellow-400/90 tabular-nums">
          {Math.round(limit)}
          <span className="text-xs text-white/40 ml-1">{speedUnit}</span>
        </div>
      </div>
      <div className="rounded border border-white/5 bg-nexus-raised p-4 text-center">
        <div className="text-[10px] uppercase text-white/30 font-mono mb-1">Cola</div>
        <div className={`text-2xl font-mono font-bold ${tailActive ? 'text-amber-400' : 'text-white/20'}`}>
          {tailActive ? 'ON' : '—'}
        </div>
      </div>
    </section>
  );
}
