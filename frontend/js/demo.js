import { getJSON, postJSON } from './api.js';
import { identity } from './state.js';
import { setLanguage } from './i18n/index.js';

// Kept separate from product state so the entire guided shell disappears when
// /api/demo is not enabled. The production repo does not contain this module.
export const demo = { enabled: false, journeys: [], loading: false, error: null };

export async function loadDemo() {
  try {
    const result = await getJSON('/api/demo/brief', { timeout: 1200 });
    demo.enabled = result?.demo?.enabled === true;
    demo.journeys = result?.demo?.journeys || [];
  } catch {
    demo.enabled = false;
  }
  return demo.enabled;
}

export function homeScreen() { return demo.enabled ? 'DemoHome' : 'MainMenu'; }

export function enterHome(ctx, profile) {
  identity.profile = profile;
  if (setLanguage(profile.language)) return; // language switch reloads the page
  ctx.router.replace(homeScreen());
}

export async function startGuidedDemo(ctx) {
  if (demo.loading) return;
  demo.loading = true; demo.error = null; ctx.rerender();
  try {
    const result = await postJSON('/api/demo/start', {}, { timeout: 6000 });
    enterHome(ctx, result.user);
  } catch (err) {
    demo.error = err.message || 'Could not start demo.';
    demo.loading = false;
    ctx.rerender();
  }
}
