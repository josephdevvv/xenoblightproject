import { loadSettings, saveSettings, type SettingsStorage } from '../settings/SettingsStore';
import { en } from './en';
import { DEFAULT_LANGUAGE, isLanguage, LANGUAGES, type Language } from './languages';
import { th, type Messages } from './th';

/**
 * Localization: Thai (default) and English.
 *
 *   t('creation.title')                       -> current-language string
 *   t('hud.hp', { current: 120, max: 120 })   -> "HP 120/120"
 *   setLanguage('en')                         -> saves the choice and notifies listeners
 *   onLanguageChange(fn)                      -> UI re-renders its text (returns an unsubscribe)
 *
 * Missing keys: the Thai (primary) text is used; if Thai is missing too, the key itself is shown.
 * Either case is reported once per key in development and listed by findMissingTranslations().
 */
export { DEFAULT_LANGUAGE, LANGUAGES, isLanguage, type Language } from './languages';
export type { Messages } from './th';

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Every valid translation key ("status.stats.str.label", ...). */
export type TranslationKey = Leaves<Messages>;
export type TranslationParams = Record<string, string | number>;

const DICTIONARIES: Readonly<Record<Language, Messages>> = { th, en };

let current: Language = DEFAULT_LANGUAGE;
/** Touch (mobile) wording: `touch.<key>` overrides `<key>` where it exists (set once at startup in touch mode). */
let touchWording = false;
let storage: SettingsStorage | null | undefined;
const listeners = new Set<(language: Language) => void>();
const reported = new Set<string>();

/** Reads the saved preference (Thai if none or invalid). Call once at startup. */
export function initLanguage(store?: SettingsStorage | null): Language {
  storage = store;
  current = loadSettings(store === undefined ? undefined : store).language;
  syncDocumentLanguage();
  return current;
}

export function getLanguage(): Language {
  return current;
}

/** Switches language, saves it, and notifies listeners. Invalid values are ignored. */
export function setLanguage(language: Language): void {
  if (!isLanguage(language) || language === current) return;
  current = language;
  const settings = loadSettings(storage === undefined ? undefined : storage);
  settings.language = language;
  saveSettings(settings, storage === undefined ? undefined : storage);
  syncDocumentLanguage();
  for (const listener of [...listeners]) listener(language);
}

export function onLanguageChange(listener: (language: Language) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Mobile: the touch controls' words (tap, the HP / SP buttons) instead of the mouse and keyboard's - see th.ts `touch`. */
export function setTouchWording(on: boolean): void {
  touchWording = on;
}

/** Translate a typed key. */
export function t(key: TranslationKey, params?: TranslationParams): string {
  return translate(key, params);
}

/**
 * Translate a key built at runtime (e.g. `appearance.hairstyle.${id}`). Same fallback rules as
 * t(); unknown keys are reported instead of failing.
 */
export function translate(key: string, params?: TranslationParams): string {
  let text = (touchWording && lookup(DICTIONARIES[current], `touch.${key}`)) || lookup(DICTIONARIES[current], key);
  if (text === undefined) {
    report(`missing "${key}" in ${current}`);
    text = lookup(DICTIONARIES[DEFAULT_LANGUAGE], key) ?? key;
  }
  return params ? interpolate(text, params, key) : text;
}

/** "{name}" placeholders; an unknown placeholder is left visible and reported. */
export function interpolate(text: string, params: TranslationParams, key = ''): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    if (Object.prototype.hasOwnProperty.call(params, name)) return String(params[name]);
    report(`missing param "${name}" for "${key}"`);
    return match;
  });
}

/** Keys present in one locale but not the other (development / test report). */
export function findMissingTranslations(): Record<Language, string[]> {
  const keys = {} as Record<Language, Set<string>>;
  for (const language of LANGUAGES) keys[language] = new Set(collectKeys(DICTIONARIES[language]));
  const result = {} as Record<Language, string[]>;
  for (const language of LANGUAGES) {
    const others = LANGUAGES.filter((l) => l !== language).flatMap((l) => [...keys[l]]);
    result[language] = [...new Set(others)].filter((k) => !keys[language].has(k)).sort();
  }
  return result;
}

export function collectKeys(node: unknown, prefix = ''): string[] {
  if (typeof node !== 'object' || node === null) return [];
  return Object.entries(node).flatMap(([k, v]) => (typeof v === 'string' ? [`${prefix}${k}`] : collectKeys(v, `${prefix}${k}.`)));
}

export function getDictionary(language: Language): Messages {
  return DICTIONARIES[language];
}

function lookup(dict: Messages, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

function report(message: string): void {
  if (reported.has(message)) return;
  reported.add(message);
  if (isDev()) console.warn(`[i18n] ${message}`);
}

function isDev(): boolean {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
}

function syncDocumentLanguage(): void {
  if (typeof document !== 'undefined') document.documentElement.lang = current;
}
