import React, { useCallback, useMemo, useState } from 'react';
import { useTelemetrySmoothing } from '../../hooks/useTelemetrySmoothing';
import { useTelemetry } from '../../core/TelemetryContext';
import { CanvasLayer } from './CanvasLayer';
import { useBrakeLearning } from '../../hooks/useBrakeLearning';
import { useBrakeStats } from '../../hooks/useBrakeStats';
import {
  APPLY_NOW_MARGIN_M,
  BrakeEvent,
  CurveMode,
  DEFAULT_HUD_MAX_BRAKE_DECEL,
  DEFAULT_MAX_BRAKE_DECEL,
  METERS_TO_MILES,
  TrainProfile,
  brakeApiUrl,
  computeBrakeParams,
  computeETA,
  computeRecommendedBrake,
  displaySpeedToMs,
  findRecommendedNotch,
  formatActionLabel,
  formatDistance,
  formatOdometer,
  getEffectiveDistance,
  getTargetInfo,
  msToDisplaySpeed,
  profileId,
} from './brakingCurveUtils';

const MODE_COLORS = {
  DYNAMIC: { curve: '#22d3ee', glow: 'rgba(34, 211, 238, 0.8)' },
  SIGNAL: { curve: '#f87171', glow: 'rgba(248, 113, 113, 0.8)' },
  LIMIT: { curve: '#fbbf24', glow: 'rgba(251, 191, 36, 0.8)' },
} as const;

export const BrakingCurve: React.FC = () => {
  const { smooth, raw, isConnected, activeProfile } = useTelemetrySmoothing();
  const { resetLocalState } = useTelemetry();
  const [mode, setMode] = useState<CurveMode>('DYNAMIC');
  const [showHistory, setShowHistory] = useState(false);
  const [brakeHistory, setBrakeHistory] = useState<BrakeEvent[]>([]);
  const [customMiles, setCustomMiles] = useState('');

  const profile = activeProfile as TrainProfile | null;
  const brakeStats = useBrakeStats(profile);
  useBrakeLearning(raw, activeProfile);

  const effectiveDist = useMemo(
    () => getEffectiveDistance(mode, raw, customMiles),
    [mode, customMiles, raw.StationDistance, raw.DistToNextSignal, raw.DistToNextSpeedLimit],
  );

  const info = useMemo(
    () => getTargetInfo(mode, raw, effectiveDist, customMiles),
    [mode, raw, effectiveDist, customMiles],
  );

  const brakeParams = useMemo(
    () => computeBrakeParams(mode, raw, info, profile, brakeStats),
    [mode, raw, info, profile, brakeStats],
  );

  const computedETA = useMemo(
    () => computeETA(raw, effectiveDist),
    [raw.Speed, raw.TimeOfDay, raw.StationETA, effectiveDist],
  );

  const scheduledTime = raw.StationScheduled || null;
  const distLabel = useCallback(
    (m: number) => formatDistance(m, raw.SpeedUnit),
    [raw.SpeedUnit],
  );

  const drawGraph = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (!isConnected) return;

    const padding = 45;
    const topPadding = 60;
    const graphWidth = width - padding * 1.5;
    const graphHeight = height - (padding + topPadding);

    ctx.save();
    ctx.translate(padding, topPadding);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.font = '9px JetBrains Mono';
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';

    let targetDist = raw.ProjectedBrakingDistance || 500;
    if (mode === 'DYNAMIC') targetDist = effectiveDist ?? targetDist;
    else if (mode === 'SIGNAL') targetDist = raw.DistToNextSignal;
    else targetDist = raw.DistToNextSpeedLimit;

    for (let i = 0; i <= 4; i++) {
      const ratio = i / 4;
      const y = graphHeight - graphHeight * ratio;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(graphWidth, y);
      ctx.stroke();

      if (smooth.speedDisplay > 0) {
        ctx.fillText(String(Math.round(smooth.speedDisplay * ratio)), -10, y + 3);
      }

      const x = graphWidth * ratio;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, graphHeight);
      ctx.stroke();

      const distAtX = targetDist * ratio;
      ctx.save();
      ctx.textAlign = 'center';
      const label = raw.SpeedUnit === 'MPH'
        ? (distAtX * METERS_TO_MILES).toFixed(2)
        : distAtX < 1000
          ? String(Math.round(distAtX))
          : (distAtX / 1000).toFixed(2);
      ctx.fillText(label, x, graphHeight + 15);
      ctx.restore();
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillText(raw.SpeedUnit || 'km/h', -10, -5);
    ctx.textAlign = 'right';
    ctx.fillText(raw.SpeedUnit === 'MPH' ? 'mi' : 'm/km', graphWidth, graphHeight + 28);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, graphHeight);
    ctx.lineTo(graphWidth, graphHeight);
    ctx.stroke();

    const colors = MODE_COLORS[mode];
    let targetSpeedMS = 0;
    let targetSpeedDisplay = 0;

    if (mode === 'SIGNAL') {
      targetDist = raw.DistToNextSignal;
    } else if (mode === 'LIMIT') {
      targetDist = raw.DistToNextSpeedLimit;
      targetSpeedDisplay = raw.NextSpeedLimit;
      targetSpeedMS = displaySpeedToMs(raw.NextSpeedLimit, raw.SpeedUnit);
    }

    const currentSpeedMS = raw.Speed;
    const currentAmps = raw.Ammeter !== undefined ? raw.Ammeter : raw.Amperage;
    const dynamicEffort = currentAmps < 0 ? Math.abs(currentAmps) : 0;
    const pneumaticEffort = raw.BrakingEffort || 0;
    const rawTE = raw.TractiveEffort || 0;
    const totalAppliedEffort = rawTE < 0
      ? Math.abs(rawTE)
      : pneumaticEffort + dynamicEffort * 0.5;

    const maxDecel = profile?.physics_config?.max_braking_decel ?? DEFAULT_HUD_MAX_BRAKE_DECEL;
    const recommendedBrake = computeRecommendedBrake(
      currentSpeedMS,
      targetSpeedMS,
      targetDist,
      raw,
      maxDecel,
    );

    if (currentSpeedMS > 0 && targetDist > 0) {
      ctx.beginPath();
      ctx.moveTo(0, 0);

      const points = 50;
      for (let i = 1; i <= points; i++) {
        const t = i / points;
        const x = t * graphWidth;
        const speedRatio = smooth.speedDisplay > 0 ? targetSpeedDisplay / smooth.speedDisplay : 0;
        const yBase = (1 - Math.sqrt(1 - t)) * graphHeight;
        ctx.lineTo(x, yBase * (1 - speedRatio));
      }

      ctx.shadowBlur = 10;
      ctx.shadowColor = colors.glow;
      ctx.strokeStyle = colors.curve;
      ctx.lineWidth = 2;
      ctx.stroke();

      const gradient = ctx.createLinearGradient(0, 0, 0, graphHeight);
      gradient.addColorStop(0, colors.curve + '1A');
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.lineTo(graphWidth, graphHeight);
      ctx.lineTo(0, graphHeight);
      ctx.fill();

      if (recommendedBrake > 1) {
        const recommendedNotch = findRecommendedNotch(
          recommendedBrake,
          profile?.specs?.notches_throttle_brake,
        );

        ctx.save();
        ctx.translate(graphWidth - 80, 20);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '8px JetBrains Mono';
        ctx.textAlign = 'right';
        ctx.fillText(recommendedNotch ? `REC. NOTCH: ${recommendedNotch}` : 'REC. BRAKE', 75, 0);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(0, 5, 75, 4);
        ctx.fillStyle = colors.curve;
        ctx.shadowBlur = 5;
        ctx.shadowColor = colors.curve;
        ctx.fillRect(0, 5, (recommendedBrake / 100) * 75, 4);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px JetBrains Mono';
        ctx.fillText(`${Math.round(recommendedBrake)}%`, 75, 22);
        ctx.fillStyle = raw.Amperage < 0 ? '#4ade80' : 'rgba(255,255,255,0.3)';
        ctx.font = '7px JetBrains Mono';
        ctx.fillText(
          `${Math.round(totalAppliedEffort)}kN | ${Math.round(raw.Amperage)}${raw.AmperageUnit}`,
          75,
          32,
        );
        ctx.restore();
      }
    }

    if (mode === 'LIMIT' || mode === 'SIGNAL') {
      const targetY = smooth.speedDisplay > 0
        ? graphHeight * (1 - targetSpeedDisplay / smooth.speedDisplay)
        : graphHeight;

      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = colors.curve + '66';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, targetY);
      ctx.lineTo(graphWidth, targetY);
      ctx.stroke();
      ctx.fillStyle = colors.curve;
      ctx.font = 'bold 9px JetBrains Mono';
      ctx.textAlign = 'left';
      ctx.fillText(`${Math.round(targetSpeedDisplay)} ${raw.SpeedUnit}`, 5, targetY - 5);
      ctx.restore();
    }

    if (raw.ActiveCab === 2 && raw.TrainLength > 0 && targetDist > 5) {
      const noseX = (raw.TrainLength / targetDist) * graphWidth;
      if (noseX > 0 && noseX < graphWidth) {
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(255, 120, 120, 0.4)';
        ctx.beginPath();
        ctx.moveTo(noseX, 0);
        ctx.lineTo(noseX, graphHeight);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 120, 120, 0.8)';
        ctx.font = 'bold 9px JetBrains Mono';
        ctx.fillText('TRAIN NOSE', noseX + 4, 15);
        ctx.restore();
      }
    }

    const endY = smooth.speedDisplay > 0
      ? graphHeight * (1 - targetSpeedDisplay / smooth.speedDisplay)
      : graphHeight;
    ctx.fillStyle = colors.curve;
    ctx.beginPath();
    ctx.arc(graphWidth, endY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }, [isConnected, raw, smooth.speedDisplay, mode, effectiveDist, profile]);

  const toggleBrakeHistory = async () => {
    if (!showHistory) {
      const id = profileId(profile);
      try {
        const res = await fetch(brakeApiUrl('/api/brake/events?limit=20', id || null));
        const data = await res.json();
        setBrakeHistory(data.events ?? []);
      } catch {
        setBrakeHistory([]);
      }
    }
    setShowHistory(h => !h);
  };

  const handleReset = () => {
    resetLocalState();
    setCustomMiles('');
  };

  const progressPct = Math.max(0, Math.min(100, (1 - (info.dist ?? 0) / 5000) * 100));

  return (
    <div className="relative flex-1 bg-white/[0.02] border border-white/5 rounded-sm overflow-hidden flex flex-col min-h-[300px]">
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-10 pointer-events-none">
        <div className="flex flex-col gap-1 pointer-events-auto max-w-[60%]">
          <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] font-mono leading-none flex items-center gap-2">
            Braking Curve // {mode}
            {raw.ActiveCab === 2 && (
              <span className="px-1 py-0.5 bg-yellow-500/20 border border-yellow-400/40 text-yellow-300 text-[8px] font-black rounded-xs leading-none">
                CAB 2 · REAR
              </span>
            )}
          </span>
          <span className={`text-[14px] font-mono font-bold drop-shadow-[0_0_8px_rgba(34,211,238,0.4)] truncate ${
            mode === 'DYNAMIC' ? 'text-cyan-400' : mode === 'SIGNAL' ? 'text-red-400' : 'text-amber-400'
          }`}>
            {info.label} // <span className="text-white">{distLabel(info.dist ?? 0)}</span>
            {mode === 'DYNAMIC' && raw.StationDistance > 0 && (
              <span className="ml-1.5 px-1 py-0.5 bg-cyan-500/15 border border-cyan-500/30 text-cyan-400/70 text-[7px] font-black rounded-xs leading-none align-middle">OCR</span>
            )}
            <span className="ml-2 text-[10px] opacity-40">[{info.val}]</span>
          </span>

          <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mt-1 mb-2">
            <div
              className={`h-full transition-all duration-500 ${
                mode === 'DYNAMIC' ? 'bg-cyan-500' : mode === 'SIGNAL' ? 'bg-red-500' : 'bg-amber-500'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {mode === 'DYNAMIC' && (scheduledTime || computedETA) && (
            <div className="flex flex-col gap-0.5 bg-black/70 border border-cyan-500/25 rounded-sm px-2 py-1 max-w-[95%]">
              <span className="text-[7px] text-cyan-500/50 font-black uppercase tracking-widest shrink-0">ETA INFO</span>
              {brakeParams && (
                <div className="flex gap-2 flex-wrap text-[8px] font-mono">
                  <span className="text-white/30">
                    BRAKE DIST: <strong className="text-red-300/60">{Math.round(brakeParams.needed)}m</strong>
                  </span>
                </div>
              )}
              <div className="flex gap-2 flex-wrap text-[8px] font-mono mt-0.5">
                {scheduledTime && (
                  <span className="text-white/40">
                    @ <strong className="text-green-300/70">{scheduledTime}</strong>
                  </span>
                )}
                {scheduledTime && computedETA && <span className="text-white/20">·</span>}
                {computedETA && (
                  <span className="text-white/40">
                    ETA <strong className={raw.StationETA ? 'text-yellow-300/70' : 'text-white/50'}>{computedETA}</strong>
                  </span>
                )}
              </div>
            </div>
          )}

          {brakeParams && brakeParams.isRealTarget && brakeParams.dist > -500 && (
            <div className="mt-16 flex flex-col bg-black/80 p-2.5 border-l-2 border-amber-500 backdrop-blur-md gap-2 shadow-xl ring-1 ring-white/5">
              <div className="flex justify-between items-center mb-0.5">
                <span className="text-[10px] text-amber-500 font-black uppercase tracking-[0.15em] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Braking Sequence
                </span>
                <span className="text-[9px] font-mono text-white/50 uppercase">
                  Target: {distLabel(effectiveDist ?? 0)}
                </span>
              </div>

              {[...brakeParams.steps].reverse().map((step, i) => {
                const distUntilAction = step.distStart;
                const isApplyNow = distUntilAction <= APPLY_NOW_MARGIN_M && distUntilAction >= -APPLY_NOW_MARGIN_M;
                const isPassed = distUntilAction < -APPLY_NOW_MARGIN_M;
                const isUpcoming = distUntilAction > APPLY_NOW_MARGIN_M;

                const learnedDecel = step.usingLearned ? brakeStats[step.notch]?.avg_decel : null;
                const estimatedDecel = step.fraction * (profile?.physics_config?.max_braking_decel ?? DEFAULT_MAX_BRAKE_DECEL);
                const decelDisplay = learnedDecel
                  ? `${learnedDecel.toFixed(2)} m/s²`
                  : `~${estimatedDecel.toFixed(2)} m/s²`;

                return (
                  <div
                    key={`${step.notch}-${step.phase}`}
                    className={`group relative flex items-center gap-3 px-3 py-2 rounded-sm border transition-all duration-300 ${
                      isApplyNow
                        ? 'border-amber-400/60 bg-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.1)]'
                        : isPassed
                          ? 'border-green-500/20 bg-white/[0.01] opacity-40'
                          : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.05]'
                    }`}
                  >
                    <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-sm ${
                      isApplyNow ? 'bg-amber-400' : isPassed ? 'bg-green-500/50' : 'bg-white/10'
                    }`} />

                    <div className="flex flex-col min-w-[75px]">
                      <span className={`text-[11px] font-black font-mono tracking-tighter leading-none ${
                        isApplyNow ? 'text-amber-300 animate-pulse' : isPassed ? 'text-green-400/70' : 'text-white/80'
                      }`}>
                        {formatActionLabel(distUntilAction, raw.Speed, raw.SpeedUnit)}
                      </span>
                      <span className="text-[7px] font-mono text-white/20 mt-1 leading-none">
                        {formatOdometer(raw.TripDistance + distUntilAction, raw.SpeedUnit)}
                      </span>
                    </div>

                    <div className="w-px h-7 bg-white/10 shrink-0" />

                    <div className="flex flex-col min-w-[38px]">
                      <span className="text-[7px] text-white/30 font-black uppercase tracking-widest leading-none mb-1">NOTCH</span>
                      <span className={`text-[15px] font-black font-mono leading-none ${
                        isApplyNow ? 'text-amber-300 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]' : isPassed ? 'text-green-400/60' : 'text-white/60'
                      }`}>
                        {step.notch}
                      </span>
                    </div>

                    <div className="w-px h-7 bg-white/10 shrink-0" />

                    <div className="flex flex-col flex-1 gap-1.5">
                      <div className="flex justify-between items-center">
                        <span className={`text-[9px] font-black font-mono ${isApplyNow ? 'text-amber-400' : 'text-white/30'}`}>
                          {decelDisplay}
                        </span>
                        {step.usingLearned ? (
                          <div className="flex items-center gap-0.5 bg-violet-500/10 px-1 rounded-xs border border-violet-500/20">
                            <span className="text-[7px] text-violet-400 font-black tracking-tighter">✦ {step.samples}×</span>
                          </div>
                        ) : (
                          <span className="text-[7px] text-white/15 font-bold italic">EST</span>
                        )}
                      </div>
                      <div className="relative h-1 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${
                            isApplyNow ? 'bg-gradient-to-r from-amber-600 to-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                            : isPassed ? 'bg-green-500/40'
                            : 'bg-white/20'
                          }`}
                          style={{ width: `${step.fraction * 100}%` }}
                        />
                      </div>
                    </div>

                    {isUpcoming && distUntilAction < 800 && (
                      <div className="absolute bottom-0 left-1 right-1 h-[1px] bg-white/5 overflow-hidden">
                        <div
                          className="h-full bg-amber-500/40 transition-all duration-300"
                          style={{ width: `${Math.max(0, 100 - distUntilAction / 8)}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {brakeParams && brakeParams.dist <= 0 && (
            <div className="mt-20 flex flex-col bg-red-600/20 p-2 border-l-2 border-red-500 animate-pulse">
              <span className="text-[9px] text-red-500 font-black uppercase">OVERSPEED RISK</span>
              <span className="text-[12px] text-white font-mono font-bold">APPLY BRAKE NOW!</span>
            </div>
          )}
        </div>

        <div className="flex gap-1.5 pointer-events-auto flex-wrap justify-end items-center">
          {mode === 'DYNAMIC' && (
            <div className="flex items-center gap-1 bg-black/60 border border-white/10 rounded-sm px-1.5 py-0.5">
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={customMiles}
                onChange={e => setCustomMiles(e.target.value)}
                className="w-14 text-center text-[9px] font-mono rounded bg-white/5 border border-white/10 px-1 py-0.5 text-white outline-none placeholder:text-white/10"
              />
              <span className="text-[7px] text-white/30 font-bold uppercase">mi</span>
              {customMiles && (
                <button
                  type="button"
                  onClick={() => setCustomMiles('')}
                  className="text-white/20 hover:text-white transition-colors text-[10px] leading-none"
                  title="Clear"
                >×</button>
              )}
            </div>
          )}
          {(['DYNAMIC', 'SIGNAL', 'LIMIT'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-2 py-1 rounded-xs border text-[9px] font-black uppercase tracking-tighter transition-all ${
                mode === m
                  ? m === 'DYNAMIC'
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                    : m === 'SIGNAL'
                      ? 'bg-red-500/20 border-red-500/50 text-red-400'
                      : 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                  : 'bg-white/5 border-white/5 text-white/30 hover:bg-white/10'
              }`}
            >
              {m === 'DYNAMIC' ? 'Dynamic' : m === 'SIGNAL' ? 'Signal' : 'Limit'}
            </button>
          ))}
          <button
            type="button"
            onClick={handleReset}
            className="px-2 py-1 rounded-xs border text-[9px] font-black uppercase tracking-tighter transition-all bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20"
            title="Resetea el estado local del navegador"
          >
            Reset
          </button>
        </div>
      </div>

      {showHistory && (
        <div className="absolute bottom-10 left-2 z-30 w-72 max-h-80 overflow-y-auto bg-black/90 border border-violet-500/30 rounded-sm shadow-xl backdrop-blur-md">
          <div className="sticky top-0 bg-black/95 px-3 py-1.5 border-b border-white/10 flex justify-between items-center">
            <span className="text-[9px] text-violet-400 font-black uppercase tracking-widest">Brake Events Log</span>
            <span className="text-[8px] text-white/30 font-mono">{brakeHistory.length} entries</span>
          </div>
          {brakeHistory.length === 0 ? (
            <div className="px-3 py-4 text-[9px] text-white/30 font-mono text-center">
              No events yet — drive and brake normally
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {[...brakeHistory].reverse().map((ev, i) => (
                <div key={i} className="px-3 py-2 flex flex-col gap-0.5 hover:bg-white/[0.03] transition-colors">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black font-mono text-white/70">
                      {ev.start_speed_ms != null
                        ? `${msToDisplaySpeed(ev.start_speed_ms, raw.SpeedUnit).toFixed(0)} → ${msToDisplaySpeed(ev.end_speed_ms ?? 0, raw.SpeedUnit).toFixed(0)} ${raw.SpeedUnit}`
                        : '—'}
                    </span>
                    <span className={`px-1 py-0.5 text-[8px] font-black rounded-xs ${
                      ev.notch && ev.notch !== '?' ? 'bg-amber-500/20 text-amber-300' : 'bg-white/5 text-white/30'
                    }`}>
                      {ev.notch ?? '?'}
                    </span>
                  </div>
                  <div className="flex gap-2 text-[7px] font-mono text-white/30">
                    <span>AVG <strong className="text-cyan-400/70">{ev.avg_decel_ms2?.toFixed(2)}</strong> m/s²</span>
                    <span>MAX <strong className="text-red-400/70">{ev.max_decel_ms2?.toFixed(2)}</strong></span>
                    <span>{ev.duration_s?.toFixed(0)}s · {ev.distance_m ? `${Math.round(ev.distance_m)}m` : ''}</span>
                  </div>
                  <div className="flex gap-2 text-[7px] font-mono text-white/20">
                    {ev.gradient != null && <span>G: {ev.gradient > 0 ? '+' : ''}{ev.gradient.toFixed(1)}%</span>}
                    {ev.train_mass != null && ev.train_mass > 0 && <span>{Math.round(ev.train_mass)}t</span>}
                    {ev.loco && <span className="text-white/15 truncate max-w-[80px]">{ev.loco}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <CanvasLayer render={drawGraph} />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/[0.01] to-transparent h-20 w-full animate-scan pointer-events-none" />

      <div className="absolute bottom-1.5 left-4 right-4 flex justify-between items-end pointer-events-none z-10">
        <div className="flex flex-col items-start select-none pointer-events-auto">
          <button
            type="button"
            onClick={toggleBrakeHistory}
            className={`px-2 py-1 rounded-xs border text-[9px] font-black uppercase tracking-tighter transition-all ${
              showHistory ? 'bg-violet-500/20 border-violet-500/50 text-violet-400' : 'bg-white/5 border-white/5 text-white/30 hover:bg-white/10'
            }`}
            title="Historial de frenadas aprendidas"
          >
            Brake Log
          </button>
        </div>

        {raw.TrainMass > 0 && (
          <div className="text-right select-none flex flex-col items-end">
            <div className="bg-black/40 backdrop-blur-md p-1 rounded border border-white/5 flex gap-3 text-[8px] font-mono text-white/40 uppercase shadow-lg">
              <span>M: <strong className="text-white/60">{Math.round(raw.TrainMass)}t</strong></span>
              <span>L: <strong className="text-white/60">{Math.round(raw.TrainLength)}m</strong></span>
              <span>G: <strong className={
                raw.RawGradient > 0 ? 'text-green-400/60' : raw.RawGradient < 0 ? 'text-red-400/60' : 'text-white/60'
              }>{(raw.RawGradient || 0).toFixed(1)}%</strong></span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
