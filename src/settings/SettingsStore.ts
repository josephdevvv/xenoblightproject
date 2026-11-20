import { DEFAULT_LANGUAGE, isLanguage, type Language } from '../i18n/languages';

/**
 * Player settings, saved in the browser (localStorage) - there is no account / server yet.
 * Only explicit player choices are stored; anything missing or invalid falls back to the default.
 * The browser / OS language is deliberately ignored: new players always start in Thai.
 */
export interface PlayerSettings {
  language: Language;
}

export const SETTINGS_STORAGE_KEY = 'xenoblight.settings.v1';

/** Minimal storage interface (localStorage in the game, an in-memory map in tests). */
export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function defaultSettings(): PlayerSettings {
  return { language: DEFAULT_LANGUAGE };
}

export function browserStorage(): SettingsStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // storage blocked by privacy settings
  }
}

export function loadSettings(storage: SettingsStorage | null = browserStorage()): PlayerSettings {
  const settings = defaultSettings();
  if (!storage) return settings;
  try {
    const raw = storage.getItem(SETTINGS_STORAGE_KEY);
    if (raw === null) return settings;
    const data: unknown = JSON.parse(raw);
    if (typeof data === 'object' && data !== null && isLanguage((data as { language?: unknown }).language)) {
      settings.language = (data as { language: Language }).language;
    }
  } catch {
    // Unreadable record: keep the defaults (it is overwritten on the next save).
  }
  return settings;
}

/** Returns false if the browser refused to store it. */
export function saveSettings(settings: PlayerSettings, storage: SettingsStorage | null = browserStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ version: 1, language: settings.language }));
    return true;
  } catch {
    return false;
  }
}
