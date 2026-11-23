import { MONSTER_DEFINITIONS, type MonsterId } from '../monsters/MonsterDefinition';
import { isSkillId, type SkillId } from '../skills/SkillDefinitions';

/**
 * Auto Play settings - pure data + repair rules, unit-tested, kept in the save file (`autoPlay`, optional when
 * reading). Whether Auto Play is running is NOT saved: it always starts off.
 */
export type AutoPlayRangeMode = 'map' | 'radius';

/** One recovery option: on / off and its threshold (percent of the max value). */
export interface RecoveryRule {
  enabled: boolean;
  percent: number;
}

export interface AutoPlayRecovery {
  /** Healing potions from the bag when HP is at or below the threshold. */
  hpPotion: RecoveryRule;
  /** SP consumables when SP is at or below the threshold - prepared: no SP item exists yet, so it never acts. */
  spRecovery: RecoveryRule;
  /** A learned self-heal skill (null = the first one learned) when HP is at or below the threshold. */
  healSkill: RecoveryRule & { skillId: SkillId | null };
}

export interface AutoPlaySettings {
  /** Monster types it hunts. */
  monsters: readonly MonsterId[];
  /** Priority of the hotbar's attack skills (first = used first). Skills not listed follow in hotbar order. */
  skillOrder: readonly SkillId[];
  /** Hotbar skills Auto Play must not use. */
  skillsOff: readonly SkillId[];
  /** A monster that hits the player becomes the target at once (any type, any range). */
  retaliate: boolean;
  /** Monsters already fighting the player come before new targets (any type). */
  counterAttackers: boolean;
  range: { mode: AutoPlayRangeMode; radius: number };
  /** Recovery: separate from the attack skills, each with its own threshold; it comes before attacking. */
  recovery: AutoPlayRecovery;
}

export const AUTO_RADIUS = { min: 4, max: 18, step: 1, default: 10 } as const;
/** Every recovery threshold: 5-95 % in steps of 5. */
export const AUTO_RECOVERY_PERCENT = { min: 5, max: 95, step: 5 } as const;
export const RECOVERY_DEFAULTS = { hpPotion: 30, spRecovery: 30, healSkill: 50 } as const;
/** Kept for older callers: the HP potion slider's range. */
export const AUTO_POTION_PERCENT = { ...AUTO_RECOVERY_PERCENT, default: RECOVERY_DEFAULTS.hpPotion } as const;

const MONSTER_IDS = Object.keys(MONSTER_DEFINITIONS) as MonsterId[];

export function createAutoPlaySettings(): AutoPlaySettings {
  return {
    monsters: [...MONSTER_IDS],
    skillOrder: [],
    skillsOff: [],
    retaliate: true,
    counterAttackers: true,
    range: { mode: 'radius', radius: AUTO_RADIUS.default },
    recovery: {
      hpPotion: { enabled: true, percent: RECOVERY_DEFAULTS.hpPotion },
      spRecovery: { enabled: false, percent: RECOVERY_DEFAULTS.spRecovery },
      healSkill: { enabled: true, percent: RECOVERY_DEFAULTS.healSkill, skillId: null },
    },
  };
}

/** A value snapped to the step and clamped to [min, max]. */
export function snap(value: number, { min, max, step }: { min: number; max: number; step: number }): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round((value - min) / step) * step + min));
}

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];
const record = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});

/**
 * Stored data -> valid settings; anything unknown or out of range is repaired (and reported). Files from before the
 * recovery update kept one `potion: { enabled, hpPercent }` - it becomes the HP Potion rule.
 */
export function sanitizeAutoPlay(raw: unknown): { settings: AutoPlaySettings; repaired: string[] } {
  const base = createAutoPlaySettings();
  if (raw === undefined || raw === null) return { settings: base, repaired: [] };
  if (typeof raw !== 'object') return { settings: base, repaired: ['autoPlay'] };
  const d = raw as Record<string, unknown>;
  const repaired: string[] = [];
  const list = <T>(key: string, valid: (v: unknown) => v is T, fallback: readonly T[]): T[] => {
    const v = d[key];
    if (!Array.isArray(v)) {
      if (v !== undefined) repaired.push(`autoPlay.${key}`);
      return [...fallback];
    }
    const ok = unique(v.filter(valid));
    if (ok.length !== v.length) repaired.push(`autoPlay.${key}`);
    return ok;
  };
  const bool = (v: unknown, fallback: boolean, key: string): boolean => {
    if (typeof v === 'boolean') return v;
    if (v !== undefined) repaired.push(`autoPlay.${key}`);
    return fallback;
  };
  const percent = (v: unknown, fallback: number, key: string): number => {
    if (typeof v !== 'number') {
      if (v !== undefined) repaired.push(`autoPlay.${key}`);
      return fallback;
    }
    const p = snap(v, AUTO_RECOVERY_PERCENT);
    if (p !== v) repaired.push(`autoPlay.${key}`);
    return p;
  };
  const rule = (v: unknown, fallback: RecoveryRule, key: string): RecoveryRule => {
    const r = record(v);
    return { enabled: bool(r.enabled, fallback.enabled, `${key}.enabled`), percent: percent(r.percent, fallback.percent, `${key}.percent`) };
  };
  const isMonster = (v: unknown): v is MonsterId => typeof v === 'string' && v in MONSTER_DEFINITIONS;
  const range = record(d.range);
  const mode: AutoPlayRangeMode = range.mode === 'map' || range.mode === 'radius' ? range.mode : base.range.mode;
  const radius = typeof range.radius === 'number' ? snap(range.radius, AUTO_RADIUS) : base.range.radius;
  if (radius !== range.radius && range.radius !== undefined) repaired.push('autoPlay.range.radius');

  const r = record(d.recovery);
  // older files: the single potion setting is the HP Potion rule
  const oldPotion = record(d.potion);
  const hpSource = r.hpPotion !== undefined ? r.hpPotion : d.potion !== undefined ? { enabled: oldPotion.enabled, percent: oldPotion.hpPercent } : undefined;
  const heal = record(r.healSkill);
  const healRule = rule(r.healSkill, base.recovery.healSkill, 'recovery.healSkill');
  let skillId: SkillId | null = null;
  if (isSkillId(heal.skillId)) skillId = heal.skillId;
  else if (heal.skillId !== undefined && heal.skillId !== null) repaired.push('autoPlay.recovery.healSkill.skillId');

  return {
    settings: {
      monsters: list('monsters', isMonster, base.monsters),
      skillOrder: list('skillOrder', isSkillId, base.skillOrder),
      skillsOff: list('skillsOff', isSkillId, base.skillsOff),
      retaliate: bool(d.retaliate, base.retaliate, 'retaliate'),
      counterAttackers: bool(d.counterAttackers, base.counterAttackers, 'counterAttackers'),
      range: { mode, radius },
      recovery: {
        hpPotion: rule(hpSource, base.recovery.hpPotion, 'recovery.hpPotion'),
        spRecovery: rule(r.spRecovery, base.recovery.spRecovery, 'recovery.spRecovery'),
        healSkill: { ...healRule, skillId },
      },
    },
    repaired,
  };
}
