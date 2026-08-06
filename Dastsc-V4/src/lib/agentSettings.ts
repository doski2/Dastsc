import type { PolicyMode } from '@nexus/kernel';

const POLICY_KEY = 'nexus-v4-policy-mode';
const PROFILE_KEY = 'nexus-v4-profile-selection';
const CAB_OVERRIDE_KEY = 'nexus-v4-cab-override';

export type CabOverride = 'auto' | 1 | 2;

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

export function loadCabOverride(): CabOverride {
  const stored = localStorage.getItem(CAB_OVERRIDE_KEY);
  if (stored === '1' || stored === '2') return Number(stored) as 1 | 2;
  return 'auto';
}

export function saveCabOverride(override: CabOverride): void {
  localStorage.setItem(CAB_OVERRIDE_KEY, String(override));
}
