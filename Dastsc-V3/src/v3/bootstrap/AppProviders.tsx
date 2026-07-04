import type { ReactNode } from 'react';
import { TelemetryProvider } from '../core/TelemetryContext';

interface AppProvidersProps {
  children: ReactNode;
}

/** Composición de providers globales del HUD. */
export function AppProviders({ children }: AppProvidersProps) {
  return <TelemetryProvider>{children}</TelemetryProvider>;
}
