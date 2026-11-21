import type { CharacterData, LocalizedMessage } from '../data/CharacterData';
import { DEBUG_AVAILABLE } from '../systems/performance/DebugSnapshot';
import { computeDerivedStats, type DerivedStats } from './DerivedStats';
import { applyDerivedBonus, combineDerivedBonuses, type DerivedBonus } from './DerivedBonuses';
import { passiveDerivedBonus, sanitizePassiveProgress, syncLevelRewards } from '../passives/PassiveProgress';
import { PassiveSaveStore } from '../passives/PassiveSaveStore';
import type { StatAllocationDraft } from './StatAllocation';
import { addExp } from '../progression/LevelProgression';
import { applyLevelUp, cloneStatus, createInitialStatus, STATUS_RULES, totalStats, type CharacterStatus, type StatBlock } from './StatTypes';
import { StatusSaveStore } from './StatusSaveStore';

/**
 * Development-only tools (test stat points). Available in `npm run dev`, or in a production build
 * only when the URL contains ?debug - never shown to normal players.
 */
export const STATUS_DEV_TOOLS_ENABLED = DEBUG_AVAILABLE;

type Listener = (character: CharacterData) => void;
const listeners = new Set<Listener>();

/**
 * The single place that reads and changes a character's status: loading, confirming allocations,
 * future level-ups and dev grants all go through here and are saved immediately.
 */
export const CharacterStatusService = {
  /**
   * Attaches the saved status to a character (or a fresh level-1 status for a new name) and saves
   * it, so a new character persists right away. An unreadable save is backed up, never discarded.
   */
  loadInto(character: CharacterData): CharacterStatus {
    const result = StatusSaveStore.load(character.name);
    let status: CharacterStatus;
    if (result.kind === 'loaded') {
      status = result.status;
      if (result.repaired.length > 0) console.warn(`[status] repaired save for "${character.name}":`, result.repaired);
    } else {
      if (result.kind === 'invalid') {
        console.warn(`[status] unreadable save for "${character.name}" (${result.reason}); kept a backup and started fresh`);
        StatusSaveStore.backupInvalid(character.name);
      }
      status = createInitialStatus();
    }
    normalizeExp(status);
    character.status = status;
    StatusSaveStore.save(character.name, status);
    loadPassives(character);
    return status;
  },

  /**
   * Derived stats: formulas from level + TOTAL main stats, then every derived-stat bonus source
   * (passive tree now, equipment later) applied once on top.
   */
  derived(character: CharacterData): DerivedStats {
    return applyDerivedBonus(computeDerivedStats(character.status.level, totalStats(character.status)), derivedBonus(character));
  },

  /** Derived stats if the base stats were `base` (Status window preview), with the same bonuses. */
  previewDerived(character: CharacterData, base: StatBlock): DerivedStats {
    const status = character.status;
    return applyDerivedBonus(computeDerivedStats(status.level, totalStats({ ...status, base })), derivedBonus(character));
  },

  /** Tells listeners the character changed outside this service (passive upgrade / reset). */
  refresh(character: CharacterData): void {
    notify(character);
  },

  /** Validates and applies a staged allocation; returns a localizable error on failure. */
  confirmAllocation(character: CharacterData, draft: StatAllocationDraft): LocalizedMessage | null {
    const result = draft.commit(character.status);
    if (!result.ok) return result.error;
    character.status = result.status;
    StatusSaveStore.save(character.name, character.status);
    notify(character);
    return null;
  },

  /** Sets the level directly (dev / tests): awards 3 points per level gained. */
  setLevel(character: CharacterData, level: number): number {
    const next = cloneStatus(character.status);
    const awarded = applyLevelUp(next, level);
    if (awarded > 0) {
      character.status = next;
      StatusSaveStore.save(character.name, next);
      syncPassiveRewards(character);
      notify(character);
    }
    return awarded;
  },

  /** Adds EXP (monster kills); levels up as often as earned (3 stat points per level). Returns levels gained. */
  gainExp(character: CharacterData, amount: number): number {
    const next = cloneStatus(character.status);
    const r = addExp(next.level, next.exp, amount, STATUS_RULES.maxLevel);
    if (r.levelsGained > 0) applyLevelUp(next, r.level);
    next.exp = r.exp;
    character.status = next;
    StatusSaveStore.save(character.name, next);
    if (r.levelsGained > 0) syncPassiveRewards(character);
    notify(character);
    return r.levelsGained;
  },

  /** DEV ONLY: adds free stat points for testing. No-op when dev tools are disabled. */
  devGrantPoints(character: CharacterData, points: number): boolean {
    if (!STATUS_DEV_TOOLS_ENABLED || !Number.isInteger(points) || points <= 0) return false;
    const next = cloneStatus(character.status);
    next.statPoints += points;
    character.status = next;
    StatusSaveStore.save(character.name, next);
    notify(character);
    return true;
  },

  onChange(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/**
 * Saved EXP must be progress below the current level's requirement. A save from before the EXP curve
 * changed may hold more: those level-ups are applied now (same rewards as normal level-ups), the rest
 * carries over. Nothing is lost and nothing is granted twice.
 */
function normalizeExp(status: CharacterStatus): void {
  const r = addExp(status.level, status.exp, 0, STATUS_RULES.maxLevel);
  if (r.levelsGained > 0) applyLevelUp(status, r.level);
  status.exp = r.exp;
}

/** Every derived-stat bonus source of a character, combined (passives only for now). */
function derivedBonus(character: CharacterData): DerivedBonus {
  return combineDerivedBonuses(passiveDerivedBonus(character.passives));
}

/** Loads (and repairs) the passive progress, granting any level rewards still owed, and saves it. */
function loadPassives(character: CharacterData): void {
  const result = PassiveSaveStore.load(character.name);
  if (result.kind === 'invalid') {
    console.warn(`[passives] unreadable save for "${character.name}" (${result.reason}); kept a backup and started fresh`);
    PassiveSaveStore.backupInvalid(character.name);
  }
  const { progress, repaired } = sanitizePassiveProgress(result.kind === 'loaded' ? result.data : null, character.status.level);
  if (result.kind === 'loaded' && repaired.length > 0) console.warn(`[passives] repaired save for "${character.name}":`, repaired);
  character.passives = progress;
  PassiveSaveStore.save(character.name, progress);
}

/** Level-ups grant Drifter passive points (1 per level up to 10), each level only once. */
function syncPassiveRewards(character: CharacterData): void {
  if (!character.passives) return;
  if (syncLevelRewards(character.passives, character.status.level) > 0) PassiveSaveStore.save(character.name, character.passives);
}

function notify(character: CharacterData): void {
  for (const l of listeners) l(character);
}
