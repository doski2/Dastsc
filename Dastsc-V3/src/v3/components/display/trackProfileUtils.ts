import { TelemetryData } from '../../core/TelemetryContext';
import { METERS_TO_MILES } from './brakingCurveUtils';

export const VIEW_RANGE_M = 8000;
export const NEAR_RANGE_M = 3000;
export const FAR_RANGE_M = 5000;
export const TRACK_PADDING_START = 25;
export const TRACK_PADDING_END = 20;
export const MAX_GRADIENT_OFFSET_PX = 60;

export const SIGNAL_ASPECT_COLORS: Record<string, string> = {
  DANGER: '#ef4444',
  CAUTION: '#fbbf24',
  ADV_CAUTION: '#f59e0b',
  CLEAR: '#22c55e',
  PROCEED: '#3b82f6',
};

const MPH_SCALE_MARKERS = [0, 402.34, 804.67, 1609.34, 3218.69, 4828.03, 6437.38, 8046.72];
const METRIC_SCALE_MARKERS = [0, 100, 500, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 7000, 8000];

export interface SpeedLimitMarker {
  speed: number;
  distance: number;
}

export interface TrackDrawInput {
  width: number;
  height: number;
  gradient: number;
  lateralG: number;
  speedUnit: TelemetryData['SpeedUnit'];
  stationDistance: number;
  stationName: string;
  signalDistance: number;
  signalAspect: string;
  upcomingLimits: SpeedLimitMarker[];
}

export function getScaleMarkers(isMph: boolean): number[] {
  return isMph ? MPH_SCALE_MARKERS : METRIC_SCALE_MARKERS;
}

/** Escala no lineal: 0–3 km = mitad del ancho, 3–8 km = la otra mitad. */
export function distanceToTrackX(distanceM: number, canvasWidth: number): number {
  const availableWidth = canvasWidth - (TRACK_PADDING_START + TRACK_PADDING_END);
  let relativeX = 0;

  if (distanceM <= NEAR_RANGE_M) {
    relativeX = (distanceM / NEAR_RANGE_M) * (availableWidth * 0.5);
  } else {
    const extra = Math.min(FAR_RANGE_M, distanceM - NEAR_RANGE_M);
    relativeX = availableWidth * 0.5 + (extra / FAR_RANGE_M) * (availableWidth * 0.5);
  }

  return TRACK_PADDING_START + relativeX;
}

export function trackPointY(
  distanceM: number,
  centerY: number,
  gradient: number,
  lateralG: number,
  viewRange: number = VIEW_RANGE_M,
): number {
  const progress = distanceM / viewRange;
  const gradientOffset = Math.max(
    -MAX_GRADIENT_OFFSET_PX,
    Math.min(MAX_GRADIENT_OFFSET_PX, gradient * 3.5),
  );
  const curvatureIntensity = lateralG * 100;
  const curveOffset = progress ** 1.5 * curvatureIntensity;
  return centerY - gradientOffset * progress + curveOffset;
}

export function gradientTrackColor(gradient: number): string {
  if (gradient < 0) return '#f87171';
  if (gradient > 0) return '#4ade80';
  return '#22d3ee';
}

export function formatTrackDistance(
  meters: number | undefined,
  speedUnit: TelemetryData['SpeedUnit'],
): string {
  if (meters === undefined || meters < 0) return '---';
  if (speedUnit === 'MPH') {
    return `${(meters * METERS_TO_MILES).toFixed(2)}mi`;
  }
  return meters < 1000 ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(1)}km`;
}

export function formatScaleMarkerLabel(meters: number, isMph: boolean): string {
  if (meters === 0) return '0';
  if (isMph) {
    const miles = meters * METERS_TO_MILES;
    return miles < 1 ? `${miles.toFixed(2)}mi` : `${Math.round(miles)}mi`;
  }
  return meters < 1000 ? `${meters}m` : `${meters / 1000}km`;
}

export function gradeRatioLabel(gradientPercent: number): string {
  const abs = Math.abs(gradientPercent);
  if (abs <= 0) return '';
  const ratio = Math.round(100 / abs);
  return ratio > 0 ? `(1:${ratio})` : '';
}

export function visibleUpcomingLimits(
  limits: SpeedLimitMarker[],
  viewRange: number = VIEW_RANGE_M,
  maxCount = 3,
): SpeedLimitMarker[] {
  return limits
    .filter(l => l.distance > 0 && l.distance < viewRange)
    .slice(0, maxCount);
}

export function drawTrackProfile(ctx: CanvasRenderingContext2D, input: TrackDrawInput): void {
  const {
    width,
    height,
    gradient,
    lateralG,
    speedUnit,
    stationDistance,
    stationName,
    signalDistance,
    signalAspect,
    upcomingLimits,
  } = input;

  const centerY = height / 2;
  const coreColor = gradientTrackColor(gradient);
  const isMph = speedUnit === 'MPH';

  const getX = (m: number) => distanceToTrackX(m, width);
  const getY = (m: number) => trackPointY(m, centerY, gradient, lateralG);

  ctx.save();

  ctx.beginPath();
  const segments = 60;
  for (let i = 0; i <= segments; i++) {
    const m = (i / segments) * VIEW_RANGE_M;
    const x = getX(m);
    const y = getY(m);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.lineWidth = 3;
  ctx.strokeStyle = coreColor;
  ctx.stroke();

  const gradVal = Math.abs(gradient);
  const gradIcon = gradient > 0 ? '▲' : gradient < 0 ? '▼' : '';
  const ratioLabel = gradeRatioLabel(gradient);

  ctx.fillStyle = coreColor;
  ctx.font = 'bold 13px JetBrains Mono';
  ctx.fillText(`${gradIcon} ${gradVal.toFixed(2)}% ${ratioLabel}`, 45, centerY - 25);

  ctx.save();
  ctx.strokeStyle = '#22d3ee';
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.5;
  ctx.font = 'bold 10px JetBrains Mono';
  ctx.textAlign = 'center';

  for (const m of getScaleMarkers(isMph)) {
    const x = getX(m);
    const yBase = centerY + 15;
    ctx.beginPath();
    ctx.moveTo(x, yBase);
    ctx.lineTo(x, yBase + 10);
    ctx.stroke();
    ctx.fillText(formatScaleMarkerLabel(m, isMph), x, yBase + 22);
  }
  ctx.restore();

  if (stationDistance >= 0 && stationDistance < VIEW_RANGE_M) {
    const xStop = getX(stationDistance);
    const yStop = getY(stationDistance);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(xStop, yStop - 25);
    ctx.lineTo(xStop, yStop + 25);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.fillText(stationName, xStop, yStop - 35);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText(formatTrackDistance(stationDistance, speedUnit), xStop, yStop + 35);
  }

  if (signalDistance > 0 && signalDistance < VIEW_RANGE_M) {
    const xSig = getX(signalDistance);
    const ySig = getY(signalDistance);
    const color = SIGNAL_ASPECT_COLORS[signalAspect] || '#fff';

    ctx.beginPath();
    ctx.moveTo(xSig, ySig);
    ctx.lineTo(xSig, ySig - 60);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.stroke();

    ctx.fillStyle = '#111';
    ctx.fillRect(xSig - 10, ySig - 95, 20, 35);

    const drawLight = (yOff: number, isActive: boolean) => {
      ctx.fillStyle = isActive ? color : '#222';
      ctx.beginPath();
      ctx.arc(xSig, ySig - 95 + yOff, 4, 0, Math.PI * 2);
      ctx.fill();
    };

    drawLight(8, signalAspect === 'DANGER');
    drawLight(17, signalAspect === 'CAUTION' || signalAspect === 'ADV_CAUTION');
    drawLight(26, signalAspect === 'CLEAR' || signalAspect === 'PROCEED');

    ctx.fillStyle = color;
    ctx.font = 'bold 11px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.fillText(formatTrackDistance(signalDistance, speedUnit), xSig, ySig - 105);
  }

  for (const limit of visibleUpcomingLimits(upcomingLimits)) {
    const xL = getX(limit.distance);
    const yL = getY(limit.distance);

    ctx.save();
    ctx.translate(xL, yL);

    ctx.beginPath();
    ctx.arc(0, -45, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#000';
    ctx.font = 'bold 13px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.fillText(String(Math.round(limit.speed)), 0, -40);

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '9px Monospace';
    ctx.fillText(formatTrackDistance(limit.distance, speedUnit), 0, -65);

    ctx.restore();
  }

  ctx.fillStyle = '#f97316';
  ctx.beginPath();
  ctx.moveTo(10, centerY + 10);
  ctx.lineTo(25, centerY);
  ctx.lineTo(10, centerY - 10);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}
