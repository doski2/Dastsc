import type { TelemetryData } from './telemetryTypes';

/** Campos mínimos para evaluar alarmas AWS/DSD (misma lógica que V3 speedometerUtils). */
export type SafetyTelemetryInput = Pick<
  TelemetryData,
  'AWS' | 'AWSWarnCount' | 'AWSReset' | 'DSD' | 'VigilAlarm' | 'Vigilance' | 'DVDAlarm'
>;

/**
 * AWS en TSC suele ser >0 en circulación normal (p. ej. 1 = verde/activo).
 * Solo alarma cuando AWS>1, hay contador de aviso, o DSD/vigilancia activos.
 */
export function resolveSafetyAlerts(data: SafetyTelemetryInput): { aws: boolean; dsd: boolean } {
  const awsVal = Number(data.AWS || 0);
  const awsCount = Number(data.AWSWarnCount || 0);
  const awsReset = Number(data.AWSReset || 0);

  let awsAlarm = awsVal > 1 || awsCount > 0;
  if (awsReset > 0) awsAlarm = false;

  const dsdVal =
    Number(data.DSD || 0) ||
    Number(data.VigilAlarm || 0) ||
    Number(data.Vigilance || 0) ||
    Number(data.DVDAlarm || 0);

  return {
    aws: awsAlarm,
    dsd: dsdVal > 0.01,
  };
}
