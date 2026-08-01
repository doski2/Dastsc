import type { PolicyMode } from '@nexus/kernel';

const POLICY_KEY = 'nexus-v4-policy-mode';
const PROFILE_KEY = 'nexus-v4-profile-selection';

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
