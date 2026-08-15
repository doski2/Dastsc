import type { HorizonEvent, TelemetrySnapshot } from '@nexus/kernel';
import {
  describeLimitChain,
  formatLimitChainHint,
  secondUpcomingLimit,
} from '@nexus/kernel';
import { signalRequiresFullStop } from './brake/signalUtils';

export function buildHorizon(snapshot: TelemetrySnapshot): HorizonEvent[] {
  const events: HorizonEvent[] = [];

  if (snapshot.signaling.distanceM > 0 && snapshot.signaling.aspect !== 'UNKNOWN') {
    const stop = signalRequiresFullStop(snapshot.signaling.aspect);
    events.push({
      id: 'signal-next',
      kind: 'SIGNAL',
      distanceM: snapshot.signaling.distanceM,
      label: snapshot.signaling.aspect,
      requiredAction: stop ? 'STOP' : 'REDUCE_SPEED',
      priority: stop ? 90 : 70,
    });
  }

  if (snapshot.limits.next && snapshot.limits.next.distanceM > 0) {
    events.push({
      id: 'limit-next',
      kind: 'SPEED_LIMIT',
      distanceM: snapshot.limits.next.distanceM,
      label: `Siguiente límite → ${Math.round(snapshot.limits.next.speed)} ${snapshot.speedUnit}`,
      targetSpeedDisplay: snapshot.limits.next.speed,
      requiredAction: 'REDUCE_SPEED',
      priority: 80,
    });

    const chain = describeLimitChain(snapshot.limits, snapshot.speedUnit);
    const second = secondUpcomingLimit(snapshot.limits);
    if (second && second.distanceM > 0) {
      events.push({
        id: 'limit-next-2',
        kind: 'SPEED_LIMIT',
        distanceM: second.distanceM,
        label: chain
          ? formatLimitChainHint(chain, snapshot.speedUnit)
          : `2.º límite → ${Math.round(second.speed)} ${snapshot.speedUnit}`,
        targetSpeedDisplay: second.speed,
        requiredAction: 'REDUCE_SPEED',
        priority: chain?.clustered ? 85 : 72,
      });
    }
  }

  if (snapshot.station.distanceM > 0) {
    events.push({
      id: 'station-next',
      kind: 'STATION_STOP',
      distanceM: snapshot.station.distanceM,
      label: snapshot.station.nameOcr || 'Estación',
      requiredAction: 'STOP',
      priority: 40,
    });
  }

  if (snapshot.tail.active) {
    events.push({
      id: 'tail-clear',
      kind: 'TAIL_CLEAR',
      distanceM: snapshot.tail.distanceM,
      label: 'Cola en tránsito',
      priority: 50,
    });
  }

  if (snapshot.safety.aws || snapshot.safety.dsd) {
    events.push({
      id: 'safety-alert',
      kind: 'SAFETY',
      distanceM: 0,
      label: snapshot.safety.dsd ? 'DSD' : 'AWS',
      requiredAction: snapshot.safety.dsd ? 'ACK_DSD' : 'ACK_AWS',
      priority: 100,
    });
  }

  return events
    .filter(e => e.distanceM >= 0)
    .sort((a, b) => a.distanceM - b.distanceM || b.priority - a.priority)
    .slice(0, 5);
}
