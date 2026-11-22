import { characterNameKey } from '../status/StatusSaveStore';

/**
 * Quest progress persistence - same TEMPORARY client-side save system as the status and passives:
 * localStorage, one key per character name (`xenoblight.quests.v1.<name>`), one entry per quest id. Status
 * and passive records are never touched.
 */
const KEY_PREFIX = 'xenoblight.quests.v1.';
const SAVE_VERSION = 1;

export function questSaveKey(name: string): string {
  return KEY_PREFIX + characterNameKey(name);
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export type QuestLoadResult = { kind: 'missing' } | { kind: 'loaded'; quests: Record<string, unknown> } | { kind: 'invalid'; reason: string };

export const QuestSaveStore = {
  load(name: string): QuestLoadResult {
    const store = storage();
    if (!store) return { kind: 'missing' };
    let raw: string | null;
    try {
      raw = store.getItem(questSaveKey(name));
    } catch {
      return { kind: 'missing' };
    }
    if (raw === null) return { kind: 'missing' };
    try {
      const data = JSON.parse(raw) as { quests?: unknown } | null;
      if (typeof data !== 'object' || data === null || typeof data.quests !== 'object' || data.quests === null) return { kind: 'invalid', reason: 'no quests object' };
      return { kind: 'loaded', quests: data.quests as Record<string, unknown> };
    } catch {
      return { kind: 'invalid', reason: 'not valid JSON' };
    }
  },

  save(name: string, quests: Readonly<Record<string, unknown>>): boolean {
    const store = storage();
    if (!store) return false;
    try {
      store.setItem(questSaveKey(name), JSON.stringify({ version: SAVE_VERSION, name: name.trim(), quests, updatedAt: Date.now() }));
      return true;
    } catch (e) {
      console.warn('[quests] could not save quest progress', e);
      return false;
    }
  },

  /** Keeps a copy of an unreadable record before it is replaced. */
  backupInvalid(name: string): void {
    const store = storage();
    if (!store) return;
    try {
      const key = questSaveKey(name);
      const raw = store.getItem(key);
      if (raw !== null) store.setItem(`${key}.invalid-backup`, raw);
    } catch {
      // best effort
    }
  },
};
