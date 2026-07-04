import type { TelemetryData } from '../../core/TelemetryContext';
import { formatDistance } from '../display/brakingCurveUtils';
import { formatControlPercent, reverserLabel } from './appUtils';
import { DataPoint } from './UiPrimitives';

interface AdaptiveTelemetryPanelProps {
  data: TelemetryData;
}

export function AdaptiveTelemetryPanel({ data }: AdaptiveTelemetryPanelProps) {
  return (
    <div className="p-4 bg-white/5 border border-white/5 rounded-sm shrink-0">
      <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-4 font-mono">
        Adaptive Telemetry Hub
      </h3>
      <div className="space-y-4">
        <div className="flex justify-between items-center border-b border-white/5 pb-2 mb-2">
          <span className="text-[11px] text-white/30 uppercase font-mono">Next Speed</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono font-bold text-yellow-500">
              {Math.round(data.NextSpeedLimit)} {data.SpeedUnit}
            </span>
            <span className="text-[11px] text-white/40 font-mono">
              in {formatDistance(data.DistToNextSpeedLimit, data.SpeedUnit)}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <DataPoint label="Reverser" value={reverserLabel(data.Reverser)} />
          <DataPoint label="Throttle" value={formatControlPercent(data.Throttle)} />
        </div>
        <DataPoint label="Train Brake" value={formatControlPercent(data.TrainBrake)} />
        <div className="grid grid-cols-2 gap-4">
          <DataPoint label="Train Length" value={`${data.TrainLength.toFixed(1)}m`} />
          <DataPoint
            label="Projected Dist"
            value={formatDistance(data.ProjectedBrakingDistance, data.SpeedUnit)}
          />
        </div>
      </div>
    </div>
  );
}
