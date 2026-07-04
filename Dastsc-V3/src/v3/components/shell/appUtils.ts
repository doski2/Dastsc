import type { LucideIcon } from 'lucide-react';
import { Activity, Cpu, Settings, ShieldCheck } from 'lucide-react';

export const APP_VERSION = '3.0.0-PROTOTYPE';

export type AppTabId = 'PILOT' | 'IA' | 'SAFETY' | 'CONFIG';

export interface AppTab {
  id: AppTabId;
  icon: LucideIcon;
  label: string;
}

export const APP_TABS: AppTab[] = [
  { id: 'PILOT', icon: Activity, label: 'PILOT HUD' },
  { id: 'IA', icon: Cpu, label: 'IA ASSIST' },
  { id: 'SAFETY', icon: ShieldCheck, label: 'SYSTEM LOG' },
  { id: 'CONFIG', icon: Settings, label: 'CONFIG' },
];

export function isImplementedTab(tab: AppTabId): tab is 'PILOT' | 'CONFIG' {
  return tab === 'PILOT' || tab === 'CONFIG';
}

export function linkStatusLabel(isConnected: boolean): string {
  return isConnected ? 'Link Active' : 'Link Offline';
}

export function signalAspectTextClass(aspect: string): string {
  switch (aspect) {
    case 'DANGER':
      return 'text-red-500';
    case 'CLEAR':
    case 'PROCEED':
      return 'text-green-500';
    default:
      return 'text-yellow-500';
  }
}

export function reverserLabel(reverser: number): string {
  if (reverser > 0) return 'FOR';
  if (reverser < 0) return 'REV';
  return 'NEU';
}

export function formatControlPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function resolveTrainTitle(
  profileName: string | undefined,
  locoName: string,
): string {
  return profileName || locoName || 'SELECT TRAIN';
}
