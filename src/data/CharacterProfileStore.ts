import { browserStorage, type SettingsStorage } from '../settings/SettingsStore';
import { characterNameKey } from '../status/StatusSaveStore';
import type { Gender } from './AppearanceCatalog';
import type { CharacterAppearance } from './CharacterData';

/**
 * TEMPORARY client-side character profiles (localStorage) - who a character is: appearance and
 * class. Level / stats are saved separately (StatusSaveStore). Same identity rule: one record per
 * character name (case-insensitive). Replaced by server data later.
 *
 * Existing records are never rewritten by character creation: a saved character keeps its
 * appearance, class and outfit (see CharacterCreationScene.submit).
 */
export interface CharacterProfile {
  name: string;
  appearance: CharacterAppearance;
  classId: string;
  createdAt: number;
}

export type ProfileLoadResult = { kind: 'missing' } | { kind: 'loaded'; profile: CharacterProfile } | { kind: 'invalid'; reason: string };

const KEY_PREFIX = 'xenoblight.character.v1.';
/** Name of the last character that entered the game (pre-fills character creation after a reload). */
export const LAST_CHARACTER_KEY = 'xenoblight.lastCharacter.v1';
const VERSION = 1;
const GENDERS: readonly Gender[] = ['male', 'female'];

export function profileKey(name: string): string {
  return KEY_PREFIX + characterNameKey(name);
}

export const CharacterProfileStore = {
  load(name: string, storage: SettingsStorage | null = browserStorage()): ProfileLoadResult {
    if (!storage) return { kind: 'missing' };
    let raw: string | null;
    try {
      raw = storage.getItem(profileKey(name));
    } catch {
      return { kind: 'missing' };
    }
    if (raw === null) return { kind: 'missing' };
    try {
      return parseProfile(JSON.parse(raw));
    } catch {
      return { kind: 'invalid', reason: 'not valid JSON' };
    }
  },

  /** Saves a profile; returns false if the browser refused. */
  save(profile: CharacterProfile, storage: SettingsStorage | null = browserStorage()): boolean {
    if (!storage) return false;
    const record = {
      version: VERSION,
      name: profile.name.trim(),
      appearance: { ...profile.appearance },
      classId: profile.classId,
      createdAt: profile.createdAt,
      updatedAt: Date.now(),
    };
    try {
      storage.setItem(profileKey(profile.name), JSON.stringify(record));
      return true;
    } catch {
      return false;
    }
  },

  /** Keeps a copy of an unreadable record before it is replaced, so nothing is silently lost. */
  backupInvalid(name: string, storage: SettingsStorage | null = browserStorage()): void {
    if (!storage) return;
    try {
      const raw = storage.getItem(profileKey(name));
      if (raw !== null) storage.setItem(`${profileKey(name)}.invalid-backup`, raw);
    } catch {
      // best effort
    }
  },

  setLastPlayed(name: string, storage: SettingsStorage | null = browserStorage()): void {
    try {
      storage?.setItem(LAST_CHARACTER_KEY, name.trim());
    } catch {
      // best effort
    }
  },

  /** The last played character's profile, if both the pointer and the profile are valid. */
  loadLastPlayed(storage: SettingsStorage | null = browserStorage()): CharacterProfile | null {
    if (!storage) return null;
    let name: string | null = null;
    try {
      name = storage.getItem(LAST_CHARACTER_KEY);
    } catch {
      return null;
    }
    if (!name) return null;
    const result = CharacterProfileStore.load(name, storage);
    return result.kind === 'loaded' ? result.profile : null;
  },
};

function parseProfile(data: unknown): ProfileLoadResult {
  if (typeof data !== 'object' || data === null) return { kind: 'invalid', reason: 'not an object' };
  const d = data as Record<string, unknown>;
  const a = d.appearance as Record<string, unknown> | undefined;
  const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
  if (!text(d.name)) return { kind: 'invalid', reason: 'name missing' };
  if (!a || typeof a !== 'object') return { kind: 'invalid', reason: 'appearance missing' };
  if (!GENDERS.includes(a.gender as Gender)) return { kind: 'invalid', reason: 'unknown gender' };
  if (!text(a.hairstyleId) || !text(a.hairColorId) || !text(a.outfitId)) return { kind: 'invalid', reason: 'appearance incomplete' };
  if (!text(d.classId)) return { kind: 'invalid', reason: 'class missing' };
  return {
    kind: 'loaded',
    profile: {
      name: d.name,
      appearance: { gender: a.gender as Gender, hairstyleId: a.hairstyleId, hairColorId: a.hairColorId, outfitId: a.outfitId },
      classId: d.classId,
      createdAt: typeof d.createdAt === 'number' && Number.isFinite(d.createdAt) ? d.createdAt : Date.now(),
    },
  };
}
