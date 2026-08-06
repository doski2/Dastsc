/** Parsea ETA OCR tipo "14:38" a minutos desde medianoche. */
export function parseEtaMinutes(eta: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(eta.trim());
  if (!match) return null;
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function minutesUntilEta(eta: string, now = new Date()): number | null {
  const etaMinutes = parseEtaMinutes(eta);
  if (etaMinutes == null) return null;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  let diff = etaMinutes - nowMinutes;
  if (diff < -12 * 60) diff += 24 * 60;
  return diff;
}

/**
 * Segundos de holgura respecto al horario (+ = llegamos pronto, - = vamos tarde).
 */
export function scheduleSlackSec(
  distanceM: number,
  speedMs: number,
  eta: string | undefined,
  now = new Date(),
): number | null {
  if (!eta?.trim() || speedMs < 0.5 || distanceM <= 0) return null;

  const etaMinutes = minutesUntilEta(eta, now);
  if (etaMinutes == null) return null;

  return etaMinutes * 60 - distanceM / speedMs;
}

/**
 * Escala el margen de reacción según horario.
 * <1 con holgura (frena más tarde); >1 si vamos tarde (frena antes).
 */
export function scheduleReactionScale(
  distanceM: number,
  speedMs: number,
  eta: string | undefined,
  now = new Date(),
): number {
  const slackSec = scheduleSlackSec(distanceM, speedMs, eta, now);
  if (slackSec == null) return 1;

  if (slackSec > 60) return Math.max(0.5, 1 - slackSec / 150);
  if (slackSec > 30) return Math.max(0.62, 1 - slackSec / 170);
  if (slackSec > 15) return Math.max(0.78, 1 - slackSec / 200);

  if (slackSec < -30) return Math.min(1.4, 1 - slackSec / 70);
  if (slackSec < -15) return Math.min(1.2, 1 - slackSec / 90);
  return 1;
}

/**
 * Metros extra de coast antes del punto de aplicación cuando llegamos pronto.
 */
export function scheduleCoastAllowanceM(
  distanceM: number,
  speedMs: number,
  eta: string | undefined,
  now = new Date(),
): number {
  const slackSec = scheduleSlackSec(distanceM, speedMs, eta, now);
  if (slackSec == null || slackSec <= 8 || speedMs < 0.5) return 0;

  const slackDistM = slackSec * speedMs;
  if (slackSec > 90) return Math.min(slackDistM * 0.48, 480);
  if (slackSec > 45) return Math.min(slackDistM * 0.38, 340);
  if (slackSec > 20) return Math.min(slackDistM * 0.28, 220);
  if (slackSec > 10) return Math.min(slackDistM * 0.15, 120);
  return 0;
}
