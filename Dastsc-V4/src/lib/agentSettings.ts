import type { PolicyMode } from '@nexus/kernel';
import type { GradientSignMode } from '@nexus/kernel';

const POLICY_KEY = 'nexus-v4-policy-mode';
const PROFILE_KEY = 'nexus-v4-profile-selection';
const GRADIENT_SIGN_KEY = 'nexus-v4-gradient-sign';
const LEGACY_CAB_KEY = 'nexus-v4-cab-override';

export type { GradientSignMode };

export function loadPolicyMode(): PolicyMode {
  const stored = localStorage.getItem(POLICY_KEY);
  if (stored === 'SUGGEST' || stored === 'ARM' || stored === 'AUTO') return stored;
  return 'SUGGEST';
}

export function savePolicyMode(mode: PolicyMode): void {
  localStorage.setItem(POLICY_KEY, mode);
}

/** `'AUTO'` o id de perfil manual. */
export function loadProfileSelection(): string {
  return localStorage.getItem(PROFILE_KEY) ?? 'AUTO';
}

export function saveProfileSelection(selection: string): void {
  localStorage.setItem(PROFILE_KEY, selection);
}

export function loadGradientSign(): GradientSignMode {
  const stored = localStorage.getItem(GRADIENT_SIGN_KEY);
  if (stored === '+' || stored === '-') return stored;
  // Migración mínima: cab 2 solía invertir → probar −
  const legacyCab = localStorage.getItem(LEGACY_CAB_KEY);
  if (legacyCab === '2') return '-';
  return '+';
}

export function saveGradientSign(mode: GradientSignMode): void {
  localStorage.setItem(GRADIENT_SIGN_KEY, mode);
}
