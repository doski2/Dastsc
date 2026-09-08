import { describe, expect, it } from 'vitest';
import {
  AUTO_APPLY_RETRY_MS,
  AUTO_RELEASE_RETRY_MS,
  shouldDispatchAutoCommand,
  type AutoCommandDispatchState,
} from './autoCommandDispatch';

function emptyDispatchState(): AutoCommandDispatchState {
  return { lastKey: null, lastAtMs: 0 };
}

const applyB3 = { command: 'ThrottleAndBrake', value: -0.75, reason: 'B3' };
const applyB2 = { command: 'ThrottleAndBrake', value: -0.5, reason: 'B2' };
const release = { command: 'VirtualBrake', value: 0, reason: 'OFF' };

describe('shouldDispatchAutoCommand', () => {
  it('dispatches new apply immediately and dedups when brake confirmed', () => {
    let state = emptyDispatchState();
    const t0 = 1_000_000;

    const first = shouldDispatchAutoCommand(applyB3, false, state, t0);
    expect(first.dispatch).toBe(true);
    state = first.next;

    const dup = shouldDispatchAutoCommand(applyB3, true, state, t0 + 100);
    expect(dup.dispatch).toBe(false);
  });

  it('escalates B3 to B2 without waiting', () => {
    let state = emptyDispatchState();
    const t0 = 1_000_000;

    state = shouldDispatchAutoCommand(applyB3, true, state, t0).next;
    const escalate = shouldDispatchAutoCommand(applyB2, false, state, t0 + 50);
    expect(escalate.dispatch).toBe(true);
  });

  it('retries apply while sim has not applied brake yet', () => {
    let state = emptyDispatchState();
    const t0 = 1_000_000;

    state = shouldDispatchAutoCommand(applyB3, false, state, t0).next;
    expect(
      shouldDispatchAutoCommand(applyB3, false, state, t0 + AUTO_APPLY_RETRY_MS - 1).dispatch,
    ).toBe(false);
    expect(
      shouldDispatchAutoCommand(applyB3, false, state, t0 + AUTO_APPLY_RETRY_MS).dispatch,
    ).toBe(true);
  });

  it('retries release every 2s while still braking', () => {
    let state = emptyDispatchState();
    const t0 = 1_000_000;

    state = shouldDispatchAutoCommand(release, true, state, t0).next;
    expect(
      shouldDispatchAutoCommand(release, true, state, t0 + AUTO_RELEASE_RETRY_MS - 1).dispatch,
    ).toBe(false);
    expect(
      shouldDispatchAutoCommand(release, true, state, t0 + AUTO_RELEASE_RETRY_MS).dispatch,
    ).toBe(true);
  });

  it('stops release retry once brake is released', () => {
    let state = emptyDispatchState();
    const t0 = 1_000_000;

    state = shouldDispatchAutoCommand(release, true, state, t0).next;
    expect(
      shouldDispatchAutoCommand(release, false, state, t0 + AUTO_RELEASE_RETRY_MS).dispatch,
    ).toBe(false);
  });
});
