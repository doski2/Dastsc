import type { TelemetryData } from '../../core/TelemetryContext';
import { formatDistance, formatTripDistance } from '../display/brakingCurveUtils';
import { linkStatusLabel, signalAspectTextClass } from './appUtils';
import { SafetyIndicators } from './SafetyIndicators';

interface PilotInfoBarProps {
  data: TelemetryData;
  isConnected: boolean;
}

export function PilotInfoBar({ data, isConnected }: PilotInfoBarProps) {
  return (
    <div className="absolute bottom-0 left-0 right-0 h-10 bg-black/60 border-y border-white/5 backdrop-blur-md flex items-center px-6 justify-between">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-cyan-500 animate-pulse' : 'bg-red-500'
            }`}
          />
          <span className="text-xs font-mono text-white/60 tracking-tighter uppercase leading-none">
            {linkStatusLabel(isConnected)}
          </span>
        </div>
        <div className="text-sm font-mono leading-none">
          <span className="text-white/30">SIGNAL:</span>{' '}
          <span className={`font-bold ${signalAspectTextClass(data.NextSignalAspect)}`}>
            {data.NextSignalAspect} @ {formatDistance(data.DistToNextSignal, data.SpeedUnit)}
          </span>
        </div>
      </div>

      <SafetyIndicators data={data} />

      <div className="text-xs font-mono text-white/40 uppercase tracking-widest leading-none">
        TRIP: {formatTripDistance(data.TripDistance, data.SpeedUnit)} // Sta: {data.location}
      </div>
    </div>
  );
}
