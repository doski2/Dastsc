export const APP_ROOT_ID = 'root';

export function getAppRootElement(): HTMLElement {
  const root = document.getElementById(APP_ROOT_ID);
  if (!root) {
    throw new Error(`[Nexus] Missing #${APP_ROOT_ID} — check index.html`);
  }
  return root;
}
