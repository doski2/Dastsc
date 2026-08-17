import { DataNormalizer } from './DataNormalizer';
import type {
  GradientSignMode,
  NormalizerProfile,
  SimulatorRawInput,
} from './dataNormalizerUtils';
import { DEFAULT_TELEMETRY_DATA, type TelemetryData } from './telemetryTypes';
import {
  extractRawTelemetry,
  mergeTelemetryUpdate,
  toSimulatorRawInput,
  type WsMessage,
} from './telemetryHubUtils';
import { toTelemetrySnapshot } from './toSnapshot';
import type { TelemetrySnapshot } from './types';

export class TelemetryHub {
  private normalizer = new DataNormalizer();
  private prev: TelemetryData = { ...DEFAULT_TELEMETRY_DATA };
  private profile: NormalizerProfile | null = null;
  private gradientSign?: GradientSignMode;

  setProfile(profile: NormalizerProfile | null): void {
    this.profile = profile;
  }

  /** V4: signo manual (+ directo Lua, − invertir). Sin valor → lógica cabina legacy. */
  setGradientSign(mode: GradientSignMode | undefined): void {
    this.gradientSign = mode;
  }

  ingestRaw(
    raw: SimulatorRawInput,
    connected: boolean,
    profileId: string | null,
  ): TelemetrySnapshot {
    const normalized = this.normalizer.normalize(raw, this.prev, this.profile, {
      gradientSign: this.gradientSign,
    });
    const merged = mergeTelemetryUpdate(
      raw as WsMessage,
      normalized,
      this.prev,
      Date.now(),
    );
    this.prev = merged;
    return toTelemetrySnapshot(merged, connected, profileId);
  }

  ingestMessage(
    message: WsMessage,
    connected: boolean,
    profileId: string | null,
  ): TelemetrySnapshot | null {
    const raw = extractRawTelemetry(message);
    if (!raw) return null;
    return this.ingestRaw(toSimulatorRawInput(raw), connected, profileId);
  }

  reset(): void {
    this.normalizer.reset();
    this.prev = { ...DEFAULT_TELEMETRY_DATA };
  }
}
