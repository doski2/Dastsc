import { motion } from 'framer-motion';
import type { TelemetryData } from '../../core/TelemetryContext';
import { BrakingCurve } from '../display/BrakingCurve';
import { Speedometer } from '../display/Speedometer';
import { TrackProfile } from '../display/TrackProfile';
import { AdaptiveTelemetryPanel } from './AdaptiveTelemetryPanel';
import { PhysicsHubPanel } from './PhysicsHubPanel';
import { PilotInfoBar } from './PilotInfoBar';

interface PilotHudTabProps {
  data: TelemetryData;
  isConnected: boolean;
}

export function PilotHudTab({ data, isConnected }: PilotHudTabProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col gap-0 h-full"
    >
      <div className="h-[220px] relative">
        <TrackProfile />
        <PilotInfoBar data={data} isConnected={isConnected} />
      </div>

      <div className="grid grid-cols-3 gap-4 flex-1 p-4">
        <div className="flex flex-col gap-4">
          <Speedometer />
          <PhysicsHubPanel data={data} />
        </div>

        <BrakingCurve />

        <div className="flex flex-col gap-4 overflow-hidden">
          <AdaptiveTelemetryPanel data={data} />
        </div>
      </div>
    </motion.div>
  );
}
