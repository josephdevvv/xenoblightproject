import { isTouchMode } from '../platform/DeviceMode';
import { clampUiScale, defaultUiScale } from '../ui/layout/UiScale';
import { browserStorage, loadSettings, saveSettings, type SettingsStorage } from './SettingsStore';

/**
 * The in-game UI scale (percent, from 100, step 5): the player's choice, saved with the other player settings (the
 * language), or - never chosen - the default of the platform detected at startup (mobile 120 %, desktop 100 %). Read
 * once and kept in memory; a change is saved and announced at once (the in-game UI rebuilds at the new size - no reload).
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
  if (current === null) current = loadSettings(storage === undefined ? browserStorage() : storage).uiScale ?? defaultUiScale(isTouchMode());
  return current;
}

/** Sets, saves (as the player's own choice) and announces a new scale (snapped to a step). Returns the value now in use. */
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
