import type { Point } from '../core/types';
import type { HotbarState } from '../hotbar/Hotbar';
import type { MonsterId } from '../monsters/MonsterDefinition';
import { isSkillId, SKILL_DEFINITIONS, SKILL_IDS, type SkillId } from '../skills/SkillDefinitions';
import type { AutoPlaySettings } from './AutoPlaySettings';

/**
 * Auto Play decisions - pure (no Phaser), unit-tested. The controller turns them into the game's own commands
 * (CombatSystem.attack / useSkill, GameScene.useItem), so every combat rule stays the same as in manual play.
 */

/** A monster as Auto Play sees it. */
export interface AutoCandidate<T = unknown> {
  ref: T;
  monsterId: MonsterId;
  position: Point;
  alive: boolean;
  /** Fighting the player right now (it chases / attacks after being provoked). */
  engaged: boolean;
}

export interface TargetQuery<T> {
  me: Point;
  /** Centre of the hunting circle (radius mode). */
  anchor: Point;
  settings: AutoPlaySettings;
  candidates: readonly AutoCandidate<T>[];
  /** The target now (manual or automatic). */
  current: T | null;
  /** The monster that last swung at the player, while it is fresh. */
  attacker: T | null;
}

const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Inside the hunting area (always, on the whole map). */
export function inHuntingArea(p: Point, anchor: Point, settings: AutoPlaySettings): boolean {
  return settings.range.mode === 'map' || dist(p, anchor) <= settings.range.radius;
}

function nearest<T>(me: Point, list: readonly AutoCandidate<T>[]): AutoCandidate<T> | null {
  let best: AutoCandidate<T> | null = null;
  for (const c of list) if (!best || dist(me, c.position) < dist(me, best.position)) best = c;
  return best;
}

/**
 * The monster to fight now:
 *   1. "retaliate": the monster that just hit the player (any type, any range);
 *   2. "counter-attack": the nearest monster already fighting the player (any type);
 *   3. the current target while it lives (no switching mid-fight - a manual choice is kept too);
 *   4. the NEAREST living monster of a selected type inside the hunting area.
 * null = nothing to fight (idle).
 */
export function chooseTarget<T>(q: TargetQuery<T>): AutoCandidate<T> | null {
  const alive = q.candidates.filter((c) => c.alive);
  const byRef = (ref: T | null): AutoCandidate<T> | null => (ref === null ? null : (alive.find((c) => c.ref === ref) ?? null));
  if (q.settings.retaliate) {
    const attacker = byRef(q.attacker);
    if (attacker) return attacker;
  }
  if (q.settings.counterAttackers) {
    const engaged = byRef(q.current)?.engaged ? byRef(q.current) : nearest(q.me, alive.filter((c) => c.engaged));
    if (engaged) return engaged;
  }
  const current = byRef(q.current);
  if (current) return current;
  const selected = new Set(q.settings.monsters);
  return nearest(q.me, alive.filter((c) => selected.has(c.monsterId) && inHuntingArea(c.position, q.anchor, q.settings)));
}

/**
 * The ATTACK rotation, in priority order: ONLY attack skills on the hotbar (never items / potions, never Heal -
 * healing is a recovery option), learned; ordered by `skillOrder`, the rest in hotbar order. Switched-off skills are
 * still listed here (the window shows them); the controller leaves them out.
 */
export function autoSkillList(hotbar: HotbarState, learned: (id: SkillId) => boolean, settings: AutoPlaySettings): SkillId[] {
  const onBar: SkillId[] = [];
  for (const e of hotbar) if (e?.type === 'skill' && isSkillId(e.skillId) && SKILL_DEFINITIONS[e.skillId].kind === 'attack' && !onBar.includes(e.skillId)) onBar.push(e.skillId);
  const rank = (id: SkillId): number => {
    const i = settings.skillOrder.indexOf(id);
    return i < 0 ? settings.skillOrder.length + onBar.indexOf(id) : i;
  };
  return onBar.filter((id) => learned(id)).sort((a, b) => rank(a) - rank(b));
}

/** The order the settings window shows (every hotbar skill, switched off ones included). */
export function displayedSkillOrder(hotbar: HotbarState, settings: AutoPlaySettings): SkillId[] {
  return autoSkillList(hotbar, () => true, settings);
}

/** Moves the skill at `from` to `to` (drag and drop) - the new `skillOrder`. */
export function moveSkill(order: readonly SkillId[], from: number, to: number): SkillId[] {
  const next = [...order];
  if (from < 0 || from >= next.length) return next;
  const [id] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, id);
  return next;
}

/** Self-heal skills the character has learned (hotbar or not) - the Heal Skill recovery option picks from these. */
export function healSkillOptions(learned: (id: SkillId) => boolean): SkillId[] {
  return SKILL_IDS.filter((id) => SKILL_DEFINITIONS[id].kind === 'heal' && learned(id));
}

/** The heal skill recovery uses: the chosen one while it is learned, else the first learned; null = none. */
export function resolveHealSkill(chosen: SkillId | null, options: readonly SkillId[]): SkillId | null {
  return chosen !== null && options.includes(chosen) ? chosen : (options[0] ?? null);
}

/** HP at or below the threshold (percent of max HP). */
export function lowHp(hp: number, maxHp: number, percent: number): boolean {
  return maxHp > 0 && hp < maxHp && (hp / maxHp) * 100 <= percent;
}
