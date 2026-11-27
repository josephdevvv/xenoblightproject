import { emptyDerivedBonus, type DerivedBonus } from '../status/DerivedBonuses';
import {
  CLASS_CHANGE_PASSIVE_POINTS,
  DRIFTER_TREE,
  levelRewardPoints,
  PASSIVE_TREES,
  passiveNode,
  type PassiveTreeDefinition,
  type PassiveTreeId,
  type SkillModifierId,
} from './PassiveTree';

/**
 * A character's passive progress - pure rules (no Phaser, no storage), unit-tested.
 *
 * Points are SEPARATE from stat points. Drifter level rewards: 1 point per level from 1 to 10, granted
 * once per level (`rewardedLevel` remembers the last rewarded level, so reloading never pays twice).
 * Each rank costs 1 point; a node needs rank >= 1 in the node before it (branch starters need the
 * mandatory center), so the first point can only go to the center. Only the ACTIVE tree's ranks give
 * bonuses: a future class change switches `activeTree`, the Drifter ranks stop applying and the new
 * tree receives its one-time points (changeClassTree - prepared, not reachable yet).
 */

export interface PassiveTreeProgress {
  /** Rank per node id (missing = 0). */
  ranks: Record<string, number>;
  /** Points this tree has received (Drifter: level rewards; a future class: the one-time grant). */
  earned: number;
}

export type PassiveTutorialState = 'pending' | 'done';

export interface PassiveProgress {
  activeTree: PassiveTreeId;
  trees: Partial<Record<PassiveTreeId, PassiveTreeProgress>>;
  /** Highest level whose Drifter passive point has been granted (0 = none yet, max 10). */
  rewardedLevel: number;
  /** Trees that already received their one-time class-change points. */
  classGrants: PassiveTreeId[];
  /** First-point tutorial (open the tree, select and unlock the center). */
  tutorial: PassiveTutorialState;
}

export type PassiveUpgradeError = 'unknownNode' | 'inactiveTree' | 'maxRank' | 'requires' | 'noPoints';

export type SkillModifiers = Record<SkillModifierId, number>;

export function createPassiveProgress(): PassiveProgress {
  return { activeTree: 'drifter', trees: { drifter: { ranks: {}, earned: 0 } }, rewardedLevel: 0, classGrants: [], tutorial: 'pending' };
}

export function clonePassiveProgress(p: PassiveProgress): PassiveProgress {
  const trees: PassiveProgress['trees'] = {};
  for (const [id, t] of Object.entries(p.trees) as [PassiveTreeId, PassiveTreeProgress][]) trees[id] = { ranks: { ...t.ranks }, earned: t.earned };
  return { activeTree: p.activeTree, trees, rewardedLevel: p.rewardedLevel, classGrants: [...p.classGrants], tutorial: p.tutorial };
}

export function activeTreeDefinition(p: PassiveProgress): PassiveTreeDefinition {
  return PASSIVE_TREES[p.activeTree];
}

function treeProgress(p: PassiveProgress, treeId: PassiveTreeId): PassiveTreeProgress {
  let t = p.trees[treeId];
  if (!t) {
    t = { ranks: {}, earned: 0 };
    p.trees[treeId] = t;
  }
  return t;
}

export function rankOf(p: PassiveProgress, nodeId: string, treeId: PassiveTreeId = p.activeTree): number {
  return p.trees[treeId]?.ranks[nodeId] ?? 0;
}

export function spentPoints(p: PassiveProgress, treeId: PassiveTreeId = p.activeTree): number {
  const t = p.trees[treeId];
  if (!t) return 0;
  return Object.values(t.ranks).reduce((sum, r) => sum + r, 0);
}

/** Unspent passive points of a tree (the active one by default). */
export function availablePoints(p: PassiveProgress, treeId: PassiveTreeId = p.activeTree): number {
  return Math.max(0, (p.trees[treeId]?.earned ?? 0) - spentPoints(p, treeId));
}

export function isCenterUnlocked(p: PassiveProgress, tree: PassiveTreeDefinition = activeTreeDefinition(p)): boolean {
  return rankOf(p, tree.centerId, tree.id) >= 1;
}

/**
 * Grants the Drifter level rewards owed up to `level` (1 point per level 1..10), each level once.
 * Returns the number of points granted now (0 when already rewarded).
 */
export function syncLevelRewards(p: PassiveProgress, level: number): number {
  const target = levelRewardPoints(DRIFTER_TREE, level);
  if (!Number.isFinite(target) || target <= p.rewardedLevel) return 0;
  const granted = target - p.rewardedLevel;
  treeProgress(p, DRIFTER_TREE.id).earned += granted;
  p.rewardedLevel = target;
  return granted;
}

/** null = the node can be upgraded now; otherwise why not. Validated on every upgrade. */
export function checkUpgrade(p: PassiveProgress, nodeId: string, treeId: PassiveTreeId = p.activeTree): PassiveUpgradeError | null {
  const tree = PASSIVE_TREES[treeId];
  const node = tree ? passiveNode(tree, nodeId) : undefined;
  if (!node) return 'unknownNode';
  if (treeId !== p.activeTree) return 'inactiveTree';
  if (rankOf(p, nodeId, treeId) >= node.maxRank) return 'maxRank';
  if (node.requires && rankOf(p, node.requires, treeId) < 1) return 'requires';
  if (availablePoints(p, treeId) < 1) return 'noPoints';
  return null;
}

export type PassiveUpgradeResult = { ok: true; progress: PassiveProgress } | { ok: false; error: PassiveUpgradeError };

/** Spends 1 point on `nodeId` (active tree). Never mutates `p`. */
export function upgradeNode(p: PassiveProgress, nodeId: string): PassiveUpgradeResult {
  const error = checkUpgrade(p, nodeId);
  if (error) return { ok: false, error };
  const next = clonePassiveProgress(p);
  const t = treeProgress(next, next.activeTree);
  t.ranks[nodeId] = (t.ranks[nodeId] ?? 0) + 1;
  if (isCenterUnlocked(next)) next.tutorial = 'done';
  return { ok: true, progress: next };
}

/**
 * Free reset of the OPTIONAL nodes of the active tree: every node except the mandatory center goes back
 * to rank 0 and its points are refunded (the center stays unlocked). Never mutates `p`.
 */
export function resetOptionalNodes(p: PassiveProgress): { progress: PassiveProgress; refunded: number } {
  const next = clonePassiveProgress(p);
  const tree = activeTreeDefinition(next);
  const t = treeProgress(next, tree.id);
  let refunded = 0;
  for (const [id, rank] of Object.entries(t.ranks)) {
    if (id === tree.centerId) continue;
    refunded += rank;
    delete t.ranks[id];
  }
  return { progress: next, refunded };
}

/** Derived-stat bonuses of the ACTIVE tree (a class change makes the old tree's ranks stop applying). */
export function passiveDerivedBonus(p: PassiveProgress | undefined): DerivedBonus {
  const bonus = emptyDerivedBonus();
  if (!p) return bonus;
  const tree = activeTreeDefinition(p);
  for (const node of tree.nodes) {
    const rank = rankOf(p, node.id, tree.id);
    if (rank <= 0) continue;
    for (const e of node.effects) {
      if (e.kind === 'flat') bonus.flat[e.stat] = (bonus.flat[e.stat] ?? 0) + e.amount * rank;
      else if (e.kind === 'maxHpPercent') bonus.maxHpPercent += e.amount * rank;
    }
  }
  return bonus;
}

/**
 * Skill modifiers of the active tree: Power Strike - single-target attack skill damage % (Power Thrust), Recovery -
 * HP heal amount % (Heal). Applied by CombatSystem (the skill's hit) and skillHealAmount (the heal).
 */
export function passiveSkillModifiers(p: PassiveProgress | undefined): SkillModifiers {
  const mods: SkillModifiers = { singleTargetSkillDamagePercent: 0, healPercent: 0 };
  if (!p) return mods;
  const tree = activeTreeDefinition(p);
  for (const node of tree.nodes) {
    const rank = rankOf(p, node.id, tree.id);
    for (const e of node.effects) if (e.kind === 'skill' && rank > 0) mods[e.modifier] += e.amount * rank;
  }
  return mods;
}

/**
 * The Heal skill: Recovery multiplies the ORIGINAL heal amount (30 % of Max HP at Recovery rank 2 -> 36 %).
 * Cooldowns and SP costs are not affected.
 */
export function modifiedHealPercent(baseHealPercent: number, mods: SkillModifiers): number {
  return baseHealPercent * (1 + mods.healPercent / 100);
}

/** Single-target attack skills (Power Thrust): the damage it dealt x (1 + Power Strike %). */
export function modifiedSkillDamage(baseDamage: number, mods: SkillModifiers): number {
  return baseDamage * (1 + mods.singleTargetSkillDamagePercent / 100);
}

/**
 * PREPARED for the future Class 1 change (no class change exists yet): switches the active tree - the
 * previous tree's ranks stay saved but stop applying - and grants the new tree its one-time points.
 * Changing to a tree that already received its grant never grants again. Never mutates `p`.
 */
export function changeClassTree(p: PassiveProgress, treeId: PassiveTreeId): PassiveProgress {
  const next = clonePassiveProgress(p);
  if (treeId === next.activeTree) return next;
  next.activeTree = treeId;
  const t = treeProgress(next, treeId);
  if (!next.classGrants.includes(treeId)) {
    t.earned += CLASS_CHANGE_PASSIVE_POINTS;
    next.classGrants.push(treeId);
  }
  return next;
}

/** Tutorial guidance step: open the window, select the center, unlock it - or nothing. */
export type PassiveTutorialStep = 'open' | 'select' | 'unlock' | null;

export function tutorialStep(p: PassiveProgress, windowOpen: boolean, selectedId: string | null): PassiveTutorialStep {
  const tree = activeTreeDefinition(p);
  if (p.tutorial === 'done' || isCenterUnlocked(p, tree) || availablePoints(p) < 1) return null;
  if (!windowOpen) return 'open';
  return selectedId === tree.centerId ? 'unlock' : 'select';
}

/**
 * Turns stored data (any shape, any age) into valid progress for a character at `level`. Fields are
 * repaired one by one and listed in `repaired`:
 *  - ranks are clamped to each node's max rank; a node whose predecessor has rank 0 is refunded;
 *  - Drifter's earned points always equal its rewarded levels (1 per level 1..10);
 *  - if more points are spent than earned (tampered / corrupt data), optional nodes are reset first,
 *    then the center;
 *  - missing level rewards are granted (older saves / new feature), never twice.
 */
export function sanitizePassiveProgress(raw: unknown, level: number): { progress: PassiveProgress; repaired: string[] } {
  const repaired: string[] = [];
  const p = createPassiveProgress();
  const d = typeof raw === 'object' && raw !== null ? (raw as Partial<Record<keyof PassiveProgress, unknown>>) : null;
  if (!d) {
    repaired.push('missing');
  } else {
    if (typeof d.activeTree === 'string' && d.activeTree in PASSIVE_TREES) p.activeTree = d.activeTree as PassiveTreeId;
    else if (d.activeTree !== undefined) repaired.push('activeTree');

    const rewarded = Number(d.rewardedLevel ?? 0);
    p.rewardedLevel = Number.isFinite(rewarded) ? Math.min(Math.max(Math.floor(rewarded), 0), DRIFTER_TREE.levelRewardsUntil) : 0;
    if (p.rewardedLevel !== rewarded) repaired.push('rewardedLevel');

    if (Array.isArray(d.classGrants)) p.classGrants = d.classGrants.filter((id): id is PassiveTreeId => typeof id === 'string' && id in PASSIVE_TREES);

    const trees = typeof d.trees === 'object' && d.trees !== null ? (d.trees as Record<string, unknown>) : {};
    for (const tree of Object.values(PASSIVE_TREES)) {
      const rawTree = typeof trees[tree.id] === 'object' && trees[tree.id] !== null ? (trees[tree.id] as { ranks?: unknown; earned?: unknown }) : null;
      const t = treeProgress(p, tree.id);
      const earned = Number(rawTree?.earned ?? 0);
      t.earned = Number.isFinite(earned) ? Math.max(0, Math.floor(earned)) : 0;
      const ranks = typeof rawTree?.ranks === 'object' && rawTree.ranks !== null ? (rawTree.ranks as Record<string, unknown>) : {};
      for (const node of tree.nodes) {
        const v = Number(ranks[node.id] ?? 0);
        const clamped = Number.isFinite(v) ? Math.min(Math.max(Math.floor(v), 0), node.maxRank) : 0;
        if (clamped !== v) repaired.push(`${tree.id}.${node.id}`);
        if (clamped > 0) t.ranks[node.id] = clamped;
      }
      // prerequisites, in step order (a predecessor always has a lower step)
      for (const node of [...tree.nodes].sort((a, b) => a.step - b.step)) {
        if ((t.ranks[node.id] ?? 0) > 0 && node.requires && (t.ranks[node.requires] ?? 0) < 1) {
          delete t.ranks[node.id];
          repaired.push(`${tree.id}.${node.id} (prerequisite)`);
        }
      }
    }
    if (d.tutorial === 'done') p.tutorial = 'done';
  }

  // Drifter's points are exactly its level rewards.
  const drifter = treeProgress(p, DRIFTER_TREE.id);
  if (drifter.earned !== p.rewardedLevel) {
    if (d) repaired.push('drifter.earned');
    drifter.earned = p.rewardedLevel;
  }
  syncLevelRewards(p, level);

  for (const tree of Object.values(PASSIVE_TREES)) {
    if (spentPoints(p, tree.id) <= (p.trees[tree.id]?.earned ?? 0)) continue;
    const t = treeProgress(p, tree.id);
    for (const id of Object.keys(t.ranks)) if (id !== tree.centerId) delete t.ranks[id];
    if (spentPoints(p, tree.id) > t.earned) t.ranks = {};
    repaired.push(`${tree.id} (overspent: reset)`);
  }
  if (isCenterUnlocked(p)) p.tutorial = 'done';
  return { progress: p, repaired };
}
