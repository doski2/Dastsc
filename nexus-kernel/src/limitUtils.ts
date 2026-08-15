/** Distancia máxima entre dos cartéles para tratarlos como cadena (p. ej. 75 → 25 en pocos m). */
export const LIMIT_CHAIN_CLUSTER_GAP_M = 350;

export interface SpeedLimitPoint {
  speed: number;
  distanceM: number;
}

export interface LimitChainInfo {
  first: SpeedLimitPoint;
  second: SpeedLimitPoint;
  gapM: number;
  clustered: boolean;
}

export function secondUpcomingLimit(
  limits: { upcoming: SpeedLimitPoint[] },
): SpeedLimitPoint | null {
  return limits.upcoming[1] ?? null;
}

export function limitChainGapM(first: SpeedLimitPoint, second: SpeedLimitPoint): number {
  return second.distanceM - first.distanceM;
}

export function isClusteredLimitChain(
  first: SpeedLimitPoint | null | undefined,
  second: SpeedLimitPoint | null | undefined,
  clusterGapM = LIMIT_CHAIN_CLUSTER_GAP_M,
): boolean {
  if (!first || !second) return false;
  if (first.distanceM <= 0 || second.distanceM <= 0) return false;
  const gap = limitChainGapM(first, second);
  return gap > 0 && gap <= clusterGapM;
}

export function describeLimitChain(
  limits: { next: SpeedLimitPoint | null; upcoming: SpeedLimitPoint[] },
  speedUnit: 'MPH' | 'km/h',
): LimitChainInfo | null {
  const first = limits.next;
  const second = secondUpcomingLimit(limits);
  if (!first || first.distanceM <= 0 || !second || second.distanceM <= 0) return null;
  const gapM = limitChainGapM(first, second);
  return {
    first,
    second,
    gapM,
    clustered: isClusteredLimitChain(first, second),
  };
}

/** Objetivo de frenada: salta al 2.º límite si está muy pegado y es más restrictivo. */
export function resolveChainedLimitTarget(
  limits: { next: SpeedLimitPoint | null; upcoming: SpeedLimitPoint[] },
): SpeedLimitPoint | null {
  const first = limits.next;
  if (!first || first.distanceM <= 0) return null;
  const second = secondUpcomingLimit(limits);
  if (second && isClusteredLimitChain(first, second) && second.speed < first.speed) {
    return second;
  }
  return first;
}

export function formatLimitChainHint(
  chain: LimitChainInfo,
  speedUnit: 'MPH' | 'km/h',
): string {
  const first = Math.round(chain.first.speed);
  const second = Math.round(chain.second.speed);
  const gap = Math.round(chain.gapM);
  if (chain.clustered && second < first) {
    return `Cadena: ${first}→${second} ${speedUnit} en +${gap} m — frenar hacia ${second}`;
  }
  return `2.º límite ${second} ${speedUnit} en +${gap} m`;
}
