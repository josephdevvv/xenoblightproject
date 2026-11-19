import {
  createInitialStatus,
  MAIN_STATS,
  pointsEarnedAtLevel,
  pointsSpent,
  STATUS_RULES,
  type CharacterStatus,
} from './StatTypes';

/**
 * TEMPORARY client-side persistence (localStorage). Not secure, not shared across devices - a
 * prototype until characters live on a server.
 *
 * - One key per character (`xenoblight.status.v1.<name>`), so reading or writing one character
 *   never touches another, and a corrupt record cannot break the others.
 * - Character identity in this prototype is the name (case-insensitive); see characterSaveKey().
 * - Only level, base stats and unspent points are stored. Bonus stats come from future equipment
 *   / passives and derived stats are always recalculated, so neither is saved.
 */

const KEY_PREFIX = 'xenoblight.status.v1.';
const SAVE_VERSION = 1;

interface SavedStatus {
  version: number;
  name: string;
  level: number;
  base: Record<string, number>;
  statPoints: number;
  updatedAt: number;
}

export type LoadResult =
  | { kind: 'missing' }
  | { kind: 'loaded'; status: CharacterStatus; repaired: string[] }
  | { kind: 'invalid'; reason: string };

/** Stable save key for a character name (trimmed, Unicode-normalised, case-insensitive). */
export function characterSaveKey(name: string): string {
  return KEY_PREFIX + encodeURIComponent(name.trim().normalize('NFC').toLocaleLowerCase());
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // e.g. blocked by browser privacy settings
  }
}

export const StatusSaveStore = {
  load(name: string): LoadResult {
    const store = storage();
    if (!store) return { kind: 'missing' };
    let raw: string | null;
    try {
      raw = store.getItem(characterSaveKey(name));
    } catch {
      return { kind: 'missing' };
    }
    if (raw === null) return { kind: 'missing' };

    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return { kind: 'invalid', reason: 'not valid JSON' };
    }
    if (typeof data !== 'object' || data === null) return { kind: 'invalid', reason: 'not an object' };
    return sanitize(data as Partial<SavedStatus>);
  },

  /** Returns false if the browser refused to store it (private mode, quota, ...). */
  save(name: string, status: CharacterStatus): boolean {
    const store = storage();
    if (!store) return false;
    const record: SavedStatus = {
      version: SAVE_VERSION,
      name: name.trim(),
      level: status.level,
      base: { ...status.base },
      statPoints: status.statPoints,
      updatedAt: Date.now(),
    };
    try {
      store.setItem(characterSaveKey(name), JSON.stringify(record));
      return true;
    } catch (e) {
      console.warn('[status] could not save status', e);
      return false;
    }
  },

  /** Keeps a copy of an unreadable record before it gets replaced, so nothing is silently lost. */
  backupInvalid(name: string): void {
    const store = storage();
    if (!store) return;
    try {
      const key = characterSaveKey(name);
      const raw = store.getItem(key);
      if (raw !== null) store.setItem(`${key}.invalid-backup`, raw);
    } catch {
      // ignore: backup is best-effort
    }
  },
};

/**
 * Turns whatever was stored into a valid status. Out-of-range or missing fields are repaired
 * field by field (reported in `repaired`); the record is only rejected when it is unusable.
 */
function sanitize(d: Partial<SavedStatus>): LoadResult {
  const repaired: string[] = [];
  const status = createInitialStatus();

  const level = Number(d.level);
  if (Number.isFinite(level)) {
    status.level = clampInt(level, STATUS_RULES.startingLevel, STATUS_RULES.maxLevel);
    if (status.level !== level) repaired.push('level');
  } else {
    repaired.push('level (missing)');
  }

  const base = typeof d.base === 'object' && d.base !== null ? d.base : null;
  if (!base) repaired.push('base stats (missing)');
  for (const stat of MAIN_STATS) {
    const v = Number(base?.[stat]);
    if (Number.isFinite(v)) {
      status.base[stat] = clampInt(v, STATUS_RULES.startingStat, STATUS_RULES.maxBaseStat);
      if (status.base[stat] !== v) repaired.push(stat);
    } else if (base) {
      repaired.push(`${stat} (missing)`);
    }
  }

  const points = Number(d.statPoints);
  if (Number.isFinite(points)) {
    status.statPoints = Math.max(0, Math.floor(points));
    if (status.statPoints !== points) repaired.push('statPoints');
  } else {
    repaired.push('statPoints (missing)');
  }

  if (!base && !Number.isFinite(level) && !Number.isFinite(points)) {
    return { kind: 'invalid', reason: 'no recognisable status fields' };
  }

  // Retroactive points: a character must own at least the points its level grants. If saved
  // points + spent points fall short (older save, earlier bug), the difference is restored.
  // Extra points (test grants, future rewards) are never taken away.
  const owed = pointsEarnedAtLevel(status.level) - (status.statPoints + pointsSpent(status));
  if (owed > 0) {
    status.statPoints += owed;
    repaired.push(`retroactive +${owed} points`);
  }
  return { kind: 'loaded', status, repaired };
}

function clampInt(v: number, min: number, max: number): number {
  return Math.min(Math.max(Math.floor(v), min), max);
}
