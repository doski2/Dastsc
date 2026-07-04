import { TelemetryData } from '../../core/TelemetryContext';
import { BrakeNotch, TrainProfile } from './brakingCurveUtils';

export interface SafetyAlerts {
  aws: number;
  dsd: boolean;
  isWarning: boolean;
}

export interface GaugeDrawInput {
  speedDisplay: number;
  projectedSpeed: number;
  combinedControl: number;
  lateralG: number;
  gForce: number;
  maxSpeed: number;
}

export const DEFAULT_MAX_SPEED = 140;
export const DEFAULT_NOTCH_LABELS = ['P7', 'P1', 'N', 'B1', 'B9'] as const;

const GAUGE_START = 0.75 * Math.PI;
const GAUGE_SWEEP = 1.5 * Math.PI;

export function getCombinedControl(
  raw: Pick<TelemetryData, 'CombinedControl' | 'Throttle' | 'TrainBrake'>,
): number {
  return raw.CombinedControl !== 0 ? raw.CombinedControl : raw.Throttle - raw.TrainBrake;
}

export function getSafetyAlerts(
  raw: Pick<TelemetryData, 'AWS' | 'AWSWarnCount' | 'AWSReset' | 'DSD' | 'VigilAlarm' | 'Vigilance' | 'DVDAlarm'>,
): SafetyAlerts {
  const awsVal = Number(raw.AWS || 0);
  const awsCount = Number(raw.AWSWarnCount || 0);
  const awsReset = Number(raw.AWSReset || 0);

  let isAwsActive = awsVal > 1 || awsCount > 0;
  if (awsReset > 0) isAwsActive = false;

  const dsdVal =
    Number(raw.DSD || 0) ||
    Number(raw.VigilAlarm || 0) ||
    Number(raw.Vigilance || 0) ||
    Number(raw.DVDAlarm || 0);

  const isDsdActive = dsdVal > 0.01;

  return {
    aws: isAwsActive ? 2 : 0,
    dsd: isDsdActive,
    isWarning: isAwsActive || isDsdActive,
  };
}

export function getActiveNotchLabel(combinedVal: number, notches?: BrakeNotch[]): string {
  if (notches?.length) {
    return notches.reduce((prev, curr) =>
      Math.abs(curr.value - combinedVal) < Math.abs(prev.value - combinedVal) ? curr : prev,
    ).label;
  }
  if (combinedVal > 0.05) return combinedVal > 0.8 ? 'P7' : 'P1';
  if (combinedVal < -0.05) return Math.abs(combinedVal) > 0.8 ? 'B9' : 'B1';
  return 'N';
}

export function getDisplayNotchLabels(notches?: BrakeNotch[]): string[] {
  if (!notches?.length) return [...DEFAULT_NOTCH_LABELS];
  return [...notches]
    .sort((a, b) => b.value - a.value)
    .map(n => n.label);
}

export function computeTailProgress(
  tailIsActive: boolean,
  trainLength: number,
  tailDistance: number,
): number {
  if (!tailIsActive || trainLength <= 0) return 0;
  return Math.max(0, Math.min(100, (1 - tailDistance / trainLength) * 100));
}

export function getSpeedometerContainerClass(alerts: SafetyAlerts): string {
  const base =
    'relative flex flex-col items-center justify-center h-[280px] bg-[#0b0b0b] min-w-[340px] border rounded-sm overflow-hidden transition-all duration-300';

  if (alerts.dsd) {
    return `${base} border-red-600/60 bg-red-950/60 shadow-[inset_0_0_80px_rgba(220,38,38,0.5)] scale-[1.01]`;
  }
  if (alerts.aws >= 2) {
    return `${base} border-orange-600/60 bg-orange-950/60 shadow-[inset_0_0_80px_rgba(234,88,12,0.5)] scale-[1.01]`;
  }
  return `${base} border-white/5`;
}

export function warningTone(
  alerts: SafetyAlerts,
  dsdClass: string,
  awsClass: string,
  normalClass: string,
): string {
  if (!alerts.isWarning) return normalClass;
  return alerts.dsd ? dsdClass : awsClass;
}

export function maxSpeedForProfile(profile: TrainProfile | null | undefined): number {
  return profile?.specs?.max_speed ?? DEFAULT_MAX_SPEED;
}

export function drawSpeedometerGauge(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  input: GaugeDrawInput,
): void {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.max(30, Math.min(width, height) * 0.4);
  const { speedDisplay, projectedSpeed, combinedControl, lateralG, gForce, maxSpeed } = input;

  ctx.save();

  ctx.setLineDash([2, 4]);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 15;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, GAUGE_START, GAUGE_START + GAUGE_SWEEP);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 2;
  const tickCount = 10;
  for (let i = 0; i <= tickCount; i++) {
    const angle = GAUGE_START + (i / tickCount) * GAUGE_SWEEP;
    ctx.beginPath();
    ctx.moveTo(centerX + Math.cos(angle) * (radius - 5), centerY + Math.sin(angle) * (radius - 5));
    ctx.lineTo(centerX + Math.cos(angle) * (radius + 5), centerY + Math.sin(angle) * (radius + 5));
    ctx.stroke();

    if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '9px Monospace';
      ctx.textAlign = 'center';
      const val = Math.round((i / tickCount) * maxSpeed);
      ctx.fillText(
        String(val),
        centerX + Math.cos(angle) * (radius - 20),
        centerY + Math.sin(angle) * (radius - 20) + 4,
      );
    }
  }

  const speedPercent = Math.min(speedDisplay / maxSpeed, 1);
  const endAngle = GAUGE_START + speedPercent * GAUGE_SWEEP;
  const projectedPercent = Math.min(projectedSpeed / maxSpeed, 1);
  const projAngle = GAUGE_START + projectedPercent * GAUGE_SWEEP;

  ctx.strokeStyle = projectedSpeed > speedDisplay ? 'rgba(34, 211, 238, 0.2)' : 'rgba(249, 115, 22, 0.2)';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius + 5, Math.min(endAngle, projAngle), Math.max(endAngle, projAngle));
  ctx.stroke();

  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius + 5, GAUGE_START, endAngle);
  ctx.stroke();

  const ctrlPercent = Math.max(-1, Math.min(1, combinedControl));
  const arcWidth = 0.4 * Math.PI;

  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius - 10, 1.5 * Math.PI - arcWidth / 2, 1.5 * Math.PI + arcWidth / 2);
  ctx.stroke();

  if (ctrlPercent !== 0) {
    ctx.strokeStyle = ctrlPercent > 0 ? '#22d3ee' : '#f97316';
    ctx.beginPath();
    const startA = 1.5 * Math.PI;
    const endA = 1.5 * Math.PI + ctrlPercent * (arcWidth / 2);
    ctx.arc(centerX, centerY, radius - 10, Math.min(startA, endA), Math.max(startA, endA));
    ctx.stroke();
  }

  const gX = centerX - radius + 10;
  const gY = centerY + radius - 20;
  const gR = 20;

  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath();
  ctx.arc(gX, gY, gR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(gX - gR, gY);
  ctx.lineTo(gX + gR, gY);
  ctx.moveTo(gX, gY - gR);
  ctx.lineTo(gX, gY + gR);
  ctx.stroke();

  ctx.fillStyle = '#22d3ee';
  ctx.beginPath();
  ctx.arc(gX - lateralG * 15, gY + gForce * 15, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '8px JetBrains Mono';
  ctx.textAlign = 'center';
  ctx.fillText(`L:${(lateralG * 10 || 0).toFixed(2)} Lon:${(gForce * 10).toFixed(2)}`, gX, gY + gR + 10);

  ctx.restore();
}
