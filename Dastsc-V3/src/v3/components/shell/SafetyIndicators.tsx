import { useMemo } from 'react';
import type { TelemetryData } from '../../core/TelemetryContext';
import { getSafetyAlerts } from '../display/speedometerUtils';

interface SafetyIndicatorsProps {
  data: TelemetryData;
}

export function SafetyIndicators({ data }: SafetyIndicatorsProps) {
  const alerts = useMemo(
    () => getSafetyAlerts(data),
    [data.AWS, data.AWSWarnCount, data.AWSReset, data.DSD, data.VigilAlarm, data.Vigilance, data.DVDAlarm],
  );

  const inactive = 'bg-white/5 border-white/5 text-white/10';

  return (
    <div className="flex gap-2 h-7">
      <div
        className={`px-4 flex items-center justify-center rounded-sm border transition-all duration-300 ${
          alerts.aws > 0
            ? 'bg-yellow-500/20 border-yellow-500 text-yellow-500 animate-pulse shadow-[0_0_10px_rgba(234,179,8,0.2)]'
            : inactive
        }`}
      >
        <span className="text-[11px] font-bold font-mono">AWS</span>
      </div>
      <div
        className={`px-4 flex items-center justify-center rounded-sm border transition-all duration-300 ${
          alerts.dsd
            ? 'bg-red-500/20 border-red-500 text-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.2)]'
            : inactive
        }`}
      >
        <span className="text-[11px] font-bold font-mono">DSD</span>
      </div>
      <div
        className={`px-4 flex items-center justify-center rounded-sm border transition-all duration-300 ${
          data.DRA ? 'bg-red-600/40 border-red-500 text-red-100' : inactive
        }`}
      >
        <span className="text-[11px] font-bold font-mono">DRA</span>
      </div>
      <div
        className={`px-4 flex items-center justify-center rounded-sm border transition-all duration-300 ${
          data.DoorsOpen.left || data.DoorsOpen.right
            ? 'bg-orange-500/20 border-orange-500 text-orange-500'
            : inactive
        }`}
      >
        <span className="text-[11px] font-bold font-mono uppercase">Doors</span>
      </div>
    </div>
  );
}
