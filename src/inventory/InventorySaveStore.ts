import { characterNameKey } from '../status/StatusSaveStore';
import type { InventoryState } from './InventoryState';

/**
 * Inventory + equipment persistence - same TEMPORARY client-side save system as the status, passives and
 * quests: localStorage, one key per character name (`xenoblight.inventory.v1.<name>`). Items, worn equipment
 * and received one-time grants are ONE record, written in one step. Other saves are never touched.
 */
const KEY_PREFIX = 'xenoblight.inventory.v1.';
const SAVE_VERSION = 1;

export function inventorySaveKey(name: string): string {
  return KEY_PREFIX + characterNameKey(name);
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export type InventoryLoadResult = { kind: 'missing' } | { kind: 'loaded'; data: unknown } | { kind: 'invalid'; reason: string };

export const InventorySaveStore = {
  load(name: string): InventoryLoadResult {
    const store = storage();
    if (!store) return { kind: 'missing' };
    let raw: string | null;
    try {
      raw = store.getItem(inventorySaveKey(name));
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

  /** Returns false if nothing was stored (no storage, quota, ...). */
  save(name: string, state: InventoryState): boolean {
    const store = storage();
    if (!store) return false;
    try {
      store.setItem(inventorySaveKey(name), JSON.stringify({ version: SAVE_VERSION, name: name.trim(), ...state, updatedAt: Date.now() }));
      return true;
    } catch (e) {
      console.warn('[inventory] could not save the inventory', e);
      return false;
    }
  },

  /** Keeps a copy of an unreadable record before it is replaced. */
  backupInvalid(name: string): void {
    const store = storage();
    if (!store) return;
    try {
      const key = inventorySaveKey(name);
      const raw = store.getItem(key);
      if (raw !== null) store.setItem(`${key}.invalid-backup`, raw);
    } catch {
      // best effort
    }
  },
};

/** The saved inventory read again now, or null when there is none / it is unreadable. */
export function loadSavedInventory(name: string): unknown {
  const result = InventorySaveStore.load(name);
  return result.kind === 'loaded' ? result.data : null;
}
