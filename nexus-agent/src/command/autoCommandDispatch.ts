import type { AgentAction } from '@nexus/kernel';

/** Reintento NEU/OFF mientras el sim sigue frenado. */
export const AUTO_RELEASE_RETRY_MS = 2000;
/** Reassert de muesca si IPC one-shot no llegó o cilindro aún no responde. */
export const AUTO_APPLY_RETRY_MS = 500;

export interface AutoCommandDispatchState {
  lastKey: string | null;
  lastAtMs: number;
}

export function actionDispatchKey(action: AgentAction): string {
  return `${action.command}:${action.value.toFixed(4)}`;
}

export function isReleaseAction(action: AgentAction): boolean {
  return Math.abs(action.value) < 0.01;
}

/**
 * Decide si enviar AgentAction a SendCommand.
 * - Muesca nueva (B3→B2): inmediato.
 * - Misma muesca + freno confirmado en telemetría: no reenviar.
 * - Misma muesca + sim aún no frena: reassert cada AUTO_APPLY_RETRY_MS.
 * - OFF/NEU + stillBraking: reintentar cada AUTO_RELEASE_RETRY_MS.
 */
export function shouldDispatchAutoCommand(
  action: AgentAction,
  stillBraking: boolean,
  state: AutoCommandDispatchState,
  nowMs: number = Date.now(),
): { dispatch: boolean; next: AutoCommandDispatchState } {
  const key = actionDispatchKey(action);
  const isRelease = isReleaseAction(action);

  if (state.lastKey === key) {
    if (isRelease) {
      if (!stillBraking) {
        return { dispatch: false, next: state };
      }
      if (nowMs - state.lastAtMs < AUTO_RELEASE_RETRY_MS) {
        return { dispatch: false, next: state };
      }
    } else if (stillBraking) {
      return { dispatch: false, next: state };
    } else if (nowMs - state.lastAtMs < AUTO_APPLY_RETRY_MS) {
      return { dispatch: false, next: state };
    }
  }

  return {
    dispatch: true,
    next: { lastKey: key, lastAtMs: nowMs },
  };
}
