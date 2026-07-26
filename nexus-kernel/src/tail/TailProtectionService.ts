import {
  createInitialTailProtectionState,
  tickTailProtection,
  type TailProtectionInput,
  type TailProtectionResult,
  type TailProtectionState,
} from './tailProtectionUtils';

export type { TailProtectionResult, TailProtectionState } from './tailProtectionUtils';

/** Estado mutable de protección de cola para el pipeline de señalización. */
export class TailProtectionService {
  private state: TailProtectionState = createInitialTailProtectionState();

  update(
    currentLimit: number,
    nextLimitSpeed: number,
    nextLimitDist: number,
    speedMS: number,
    dt: number,
    trainLength: number,
  ): TailProtectionResult {
    const input: TailProtectionInput = {
      currentLimit,
      nextLimitSpeed,
      nextLimitDist,
      speedMS,
      dt,
      trainLength,
    };
    const stepped = tickTailProtection(this.state, input);
    this.state = stepped.state;
    return stepped.result;
  }

  reset(): void {
    this.state = createInitialTailProtectionState();
  }
}
