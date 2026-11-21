import { characterNameKey } from '../status/StatusSaveStore';
import type { PassiveProgress } from './PassiveProgress';

/**
 * Passive progress persistence - same TEMPORARY client-side save system as the status
 * (StatusSaveStore): localStorage, one key per character name (`xenoblight.passives.v1.<name>`), so the
 * status record and older saves stay exactly as they were. Stores node ranks per tree, earned points,
 * the rewarded level and the tutorial state; available points are recalculated (earned - spent), so they
 * can never drift. Loading is repaired by sanitizePassiveProgress().
 */

const KEY_PREFIX = 'xenoblight.passives.v1.';
const SAVE_VERSION = 1;

export function passiveSaveKey(name: string): string {
  return KEY_PREFIX + characterNameKey(name);
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export type PassiveLoadResult = { kind: 'missing' } | { kind: 'loaded'; data: unknown } | { kind: 'invalid'; reason: string };

export const PassiveSaveStore = {
  load(name: string): PassiveLoadResult {
    const store = storage();
    if (!store) return { kind: 'missing' };
    let raw: string | null;
    try {
      raw = store.getItem(passiveSaveKey(name));
    } catch {
      return { kind: 'missing' };
    }
    if (raw === null) return { kind: 'missing' };
    try {
      const data: unknown = JSON.parse(raw);
      if (typeof data !== 'object' || data === null) return { kind: 'invalid', reason: 'not an object' };
      return { kind: 'loaded', data };
    } catch {
      return { kind: 'invalid', reason: 'not valid JSON' };
    }
  },

  save(name: string, progress: PassiveProgress): boolean {
    const store = storage();
    if (!store) return false;
    try {
      store.setItem(passiveSaveKey(name), JSON.stringify({ version: SAVE_VERSION, name: name.trim(), ...progress, updatedAt: Date.now() }));
      return true;
    } catch (e) {
      console.warn('[passives] could not save passive progress', e);
      return false;
    }
  },

  /** Keeps a copy of an unreadable record before it is replaced. */
  backupInvalid(name: string): void {
    const store = storage();
    if (!store) return;
    try {
      const key = passiveSaveKey(name);
      const raw = store.getItem(key);
      if (raw !== null) store.setItem(`${key}.invalid-backup`, raw);
    } catch {
      // best effort
    }
  },
};
