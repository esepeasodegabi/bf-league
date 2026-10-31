import { DEFAULT_CONFIG } from '../engine/config.default.js';

export const DEFAULT_SETTINGS = {
  config: DEFAULT_CONFIG,
  capture: { classDurationMinutes: 45 },
  // Repositorio donde se suben los resultados (data/). Una GitHub Action publica la web.
  // El token NUNCA se sube al repositorio.
  github: { owner: 'esepeasodegabi', repo: 'bf-league', branch: 'main', token: '' },
};

function merge(base, over) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over ?? base;
  const out = { ...base };
  for (const k of Object.keys(over || {})) out[k] = merge(base[k], over[k]);
  return out;
}

export async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return merge(DEFAULT_SETTINGS, settings || {});
}

export async function saveSettings(settings) {
  await chrome.storage.local.set({ settings });
}
