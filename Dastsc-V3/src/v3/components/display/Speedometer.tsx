import React, { useCallback, useMemo } from 'react';
import { useTelemetrySmoothing } from '../../hooks/useTelemetrySmoothing';
import { CanvasLayer } from './CanvasLayer';
import { formatDistance, TrainProfile } from './brakingCurveUtils';
import {
  computeTailProgress,
  drawSpeedometerGauge,
  getActiveNotchLabel,
  getCombinedControl,
  getDisplayNotchLabels,
  getSafetyAlerts,
  getSpeedometerContainerClass,
  maxSpeedForProfile,
  warningTone,
} from './speedometerUtils';
import './Speedometer.css';

/** HUD central: velocímetro circular, potencia/freno y G-Force. */
export const Speedometer: React.FC = () => {
  const { smooth, raw, isConnected, activeProfile } = useTelemetrySmoothing();
  const profile = activeProfile as TrainProfile | null;

  const alerts = useMemo(
    () => getSafetyAlerts(raw),
    [raw.AWS, raw.AWSWarnCount, raw.AWSReset, raw.DSD, raw.VigilAlarm, raw.Vigilance, raw.DVDAlarm],
  );

  const combinedControl = useMemo(
    () => getCombinedControl(raw),
    [raw.CombinedControl, raw.Throttle, raw.TrainBrake],
  );

  const activeNotch = useMemo(
    () => getActiveNotchLabel(combinedControl, profile?.specs?.notches_throttle_brake),
    [combinedControl, profile],
  );

  const displayNotches = useMemo(
    () => getDisplayNotchLabels(profile?.specs?.notches_throttle_brake),
    [profile],
  );

  const maxSpeed = useMemo(() => maxSpeedForProfile(profile), [profile]);

  const tailProgress = useMemo(
    () => computeTailProgress(raw.TailIsActive, raw.TrainLength, smooth.tailDistance),
    [raw.TailIsActive, raw.TrainLength, smooth.tailDistance],
  );

  const containerClass = useMemo(() => getSpeedometerContainerClass(alerts), [alerts]);

  const speedDelta = Math.abs(raw.ProjectedSpeed - smooth.speedDisplay);
  const isAccelerating = raw.ProjectedSpeed > smooth.speedDisplay;

  const drawGauge = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      if (!isConnected) return;
      drawSpeedometerGauge(ctx, width, height, {
        speedDisplay: smooth.speedDisplay,
        projectedSpeed: raw.ProjectedSpeed,
        combinedControl,
        lateralG: raw.LateralG || 0,
        gForce: raw.GForce,
        maxSpeed,
      });
    },
    [
      isConnected,
      smooth.speedDisplay,
      raw.ProjectedSpeed,
      raw.LateralG,
      raw.GForce,
      combinedControl,
      maxSpeed,
    ],
  );

  return (
    <div className={containerClass}>
      <CanvasLayer render={drawGauge} />

      {raw.ActiveCab === 2 && (
        <div className="absolute top-2 right-2 z-20 flex items-center gap-1 bg-yellow-500/15 border border-yellow-400/50 rounded-sm px-2 py-1">
          <span className="text-[8px] text-yellow-300 font-black uppercase tracking-widest leading-none">CAB 2</span>
          <span className="text-[7px] text-yellow-400/60 font-mono uppercase leading-none">REAR</span>
        </div>
      )}

      <div className="absolute top-4 flex flex-col gap-2 z-10 w-full items-center px-10">
        {alerts.dsd && (
          <div className="animate-pulse bg-red-600 text-white text-[10px] font-black px-6 py-1.5 rounded-sm shadow-[0_0_20px_rgba(220,38,38,0.6)] border-2 border-red-400 w-fit">
            DSD (DEADMAN) ALARM
          </div>
        )}
        {alerts.aws >= 2 && (
          <div className="animate-pulse bg-orange-600 text-white text-[10px] font-black px-6 py-1.5 rounded-sm shadow-[0_0_20px_rgba(234,88,12,0.6)] border-2 border-orange-400 w-fit">
            AWS WARNING - ACKNOWLEDGE
          </div>
        )}
      </div>

      <div className="absolute flex flex-col items-center pointer-events-none">
        <span className={`text-xs font-mono uppercase tracking-[0.2em] transition-colors ${warningTone(alerts, 'text-red-400', 'text-orange-400', 'text-white/20')}`}>
          {raw.SpeedUnit}
        </span>
        <div className="flex items-baseline">
          <span className={`text-6xl font-light leading-none transition-colors ${warningTone(alerts, 'text-red-500', 'text-orange-500', 'text-white/90')}`}>
            {smooth.speedDisplay.toFixed(1)}
          </span>
          <span className={`text-xl font-mono ml-1 ${isAccelerating ? 'text-cyan-500/40' : 'text-orange-500/40'}`}>
            {isAccelerating ? '▲' : '▼'}{speedDelta.toFixed(1)}
          </span>
        </div>
        <div className="mt-2 flex flex-col items-center">
          <span className={`text-xs font-mono font-bold transition-colors ${warningTone(alerts, 'text-red-400', 'text-orange-400', 'text-cyan-500/60')}`}>
            {raw.GForce >= 0 ? '+' : ''}{(raw.GForce * 10).toFixed(2)}G
          </span>
          <div className={`mt-1 px-3 py-1 rounded-full text-xs font-bold ${
            raw.SpeedDisplay > raw.SpeedLimit ? 'bg-red-500/30 text-red-400' : 'bg-white/10 text-white/50'
          }`}>
            LIMIT: {Math.round(raw.SpeedLimit)}
          </div>
        </div>
      </div>

      {raw.UpcomingLimits.length > 0 && (
        <div className="absolute left-16 top-1/2 -translate-y-1/2 flex flex-col gap-2 scale-90 border-l border-white/10 pl-2">
          {raw.UpcomingLimits.map((limit, i) => (
            <div
              key={`${limit.speed}-${limit.distance}-${i}`}
              className={`flex flex-col ${limit.speed < raw.SpeedLimit ? 'text-orange-400' : 'text-cyan-400/60'}`}
            >
              <span className="text-sm font-black font-mono leading-none">{Math.round(limit.speed)}</span>
              <span className="text-[8px] font-mono opacity-60">
                {formatDistance(limit.distance, raw.SpeedUnit)}
              </span>
            </div>
          ))}
        </div>
      )}

      {raw.TailIsActive && (
        <div className="absolute right-4 bottom-4 bg-amber-500/10 border border-amber-500/50 rounded-lg px-3 py-2">
          <div className="flex flex-col items-center gap-1">
            <span className="text-[9px] font-bold text-amber-300 uppercase">Tail Clearing</span>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-mono font-bold text-amber-200">{smooth.tailSeconds.toFixed(1)}s</span>
              <span className="text-[10px] font-mono text-amber-400/70">{smooth.tailDistance.toFixed(0)}m</span>
            </div>
            <div className="w-20 h-1.5 bg-amber-900/40 rounded-full overflow-hidden border border-amber-600/30">
              <div
                className="speedometer-tail-bar"
                style={{ '--tail-progress': `${tailProgress}%` } as React.CSSProperties}
              />
            </div>
          </div>
        </div>
      )}

      <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-1">
        {displayNotches.map((label, i) => (
          <div
            key={`${label}-${i}`}
            className={`text-[10px] font-mono px-1.5 py-0.5 border rounded-xs ${
              label === activeNotch
                ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10'
                : 'border-transparent text-white/10'
            }`}
          >
            {label}
          </div>
        ))}
      </div>
    </div>
  );
};
