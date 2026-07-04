import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../App';
import { AppProviders } from './AppProviders';
import { getAppRootElement } from './appMountUtils';

export function mountApp(): void {
  createRoot(getAppRootElement()).render(
    <StrictMode>
      <AppProviders>
        <App />
      </AppProviders>
    </StrictMode>,
  );
}
