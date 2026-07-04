import type { TelemetryData } from '../../core/TelemetryContext';
import { PhysicsRow } from './UiPrimitives';

interface PhysicsHubPanelProps {
  data: TelemetryData;
}

export function PhysicsHubPanel({ data }: PhysicsHubPanelProps) {
  const amperage = data.Ammeter || data.Amperage;

  return (
    <div className="p-4 bg-white/5 border border-white/5 rounded-sm flex-1">
      <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-4 font-mono">
        Physics Hub
      </h3>
      <div className="space-y-3">
        <PhysicsRow
          label="Amperage"
          value={amperage}
          unit={data.AmperageUnit}
          color={amperage >= 0 ? 'text-yellow-500' : 'text-cyan-400'}
        />
        <PhysicsRow label="Tractive" value={data.TractiveEffort} unit="kN" color="text-yellow-500" />
        <PhysicsRow
          label="Traction %"
          value={data.TractionPercent}
          unit="%"
          color={data.TractionPercent >= 0 ? 'text-yellow-500' : 'text-cyan-400'}
        />
        <PhysicsRow label="Braking" value={data.BrakingEffort} unit="kN" color="text-orange-400" />
        <PhysicsRow
          label="Brake Cyl"
          value={data.BrakeCylinderPressure}
          unit={data.PressureUnit}
        />
      </div>
    </div>
  );
}
