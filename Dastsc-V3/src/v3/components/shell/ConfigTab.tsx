import { motion } from 'framer-motion';
import type { TelemetryData } from '../../core/TelemetryContext';
import { ProfileSelector } from '../display/ProfileSelector';
import { linkStatusLabel } from './appUtils';
import { DataPoint } from './UiPrimitives';

interface ConfigTabProps {
  data: TelemetryData;
  isConnected: boolean;
}

export function ConfigTab({ data, isConnected }: ConfigTabProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="h-full p-6 flex flex-col gap-6"
    >
      <div className="flex-1 grid grid-cols-2 gap-6">
        <ProfileSelector />

        <div className="flex flex-col gap-6">
          <div className="p-4 bg-white/5 border border-white/5 rounded-sm">
            <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-4 font-mono">
              System Parameters
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <DataPoint label="Speed Unit" value={data.SpeedUnit} />
              <DataPoint label="Pressure Unit" value={data.PressureUnit} />
              <DataPoint label="Telemetry Link" value={linkStatusLabel(isConnected)} />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
