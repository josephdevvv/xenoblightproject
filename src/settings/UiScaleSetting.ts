import { clampUiScale } from '../ui/layout/UiScale';
import { browserStorage, loadSettings, saveSettings, type SettingsStorage } from './SettingsStore';

/**
 * The in-game UI scale (percent, 100-150, step 5): saved with the other player settings (the language), read once and
 * kept in memory; a change is saved and announced at once (the in-game UI rebuilds at the new size - no reload).
 */
let current: number | null = null;
let storage: SettingsStorage | null | undefined;
const listeners = new Set<(percent: number) => void>();

/** Tests: an in-memory store (null = none). */
export function useUiScaleStorage(store: SettingsStorage | null): void {
  storage = store;
  current = null;
}

export function getUiScale(): number {
  if (current === null) current = loadSettings(storage === undefined ? browserStorage() : storage).uiScale;
  return current;
}

/** Sets, saves and announces a new scale (snapped to a step, 100-150). Returns the value now in use. */
export function setUiScale(percent: number): number {
  const next = clampUiScale(percent);
  if (next === getUiScale()) return next;
  current = next;
  const store = storage === undefined ? browserStorage() : storage;
  const settings = loadSettings(store);
  settings.uiScale = next;
  saveSettings(settings, store);
  for (const fn of [...listeners]) fn(next);
  return next;
}

export function onUiScaleChange(fn: (percent: number) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
