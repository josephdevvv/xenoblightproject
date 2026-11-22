import { createInitialStatus, MAIN_STATS, pointsEarnedAtLevel, pointsSpent, STATUS_RULES, type CharacterStatus } from './StatTypes';

/**
 * The status part of a save file - pure. Only level, base stats, unspent points and EXP are kept; bonus stats
 * and derived stats are always recalculated.
 */
interface StatusRecord {
  level: number;
  base: Record<string, number>;
  statPoints: number;
  /** EXP towards the next level (missing = 0). */
  exp?: number;
}

export type StatusResult = { kind: 'loaded'; status: CharacterStatus; repaired: string[] } | { kind: 'invalid'; reason: string };

/**
 * Turns whatever was stored into a valid status. Out-of-range or missing fields are repaired
 * field by field (reported in `repaired`); the record is only rejected when it is unusable.
 */
export function parseSavedStatus(data: object): StatusResult {
  const d = data as Partial<StatusRecord>;
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

  const exp = Number(d.exp ?? 0);
  if (Number.isFinite(exp) && exp >= 0) status.exp = Math.floor(exp);
  else repaired.push('exp');

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
