import { describe, expect, it } from 'vitest';
import { resolveAgentConfig } from './agentConfig';

describe('resolveAgentConfig', () => {
  it('uses code defaults without profile', () => {
    const cfg = resolveAgentConfig(null);
    expect(cfg.station.dwellMaxDistanceM).toBe(80);
    expect(cfg.station.releaseBlockSpeedMs).toBe(2.5);
    expect(cfg.brake.releaseMarginKmh).toBe(3);
  });

  it('merges profile overrides', () => {
    const cfg = resolveAgentConfig({
      agent_config: {
        station: { dwell_max_distance_m: 100, release_block_speed_ms: 3 },
        brake: { release_margin_kmh: 5 },
      },
    });
    expect(cfg.station.dwellMaxDistanceM).toBe(100);
    expect(cfg.station.departureSpeedMs).toBe(5);
    expect(cfg.station.releaseBlockSpeedMs).toBe(3);
    expect(cfg.brake.releaseMarginKmh).toBe(5);
    expect(cfg.brake.brakePositionThreshold).toBe(0.05);
  });
});
