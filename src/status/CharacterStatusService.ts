import type { CharacterData, LocalizedMessage } from '../data/CharacterData';
import { DEBUG_AVAILABLE } from '../systems/performance/DebugAvailable';
import { computeDerivedStats, type DerivedStats } from './DerivedStats';
import { applyDerivedBonus, combineDerivedBonuses, type DerivedBonus } from './DerivedBonuses';
import { passiveDerivedBonus, sanitizePassiveProgress, syncLevelRewards } from '../passives/PassiveProgress';
import type { PassiveProgress } from '../passives/PassiveProgress';
import { equipmentDerivedBonus, type InventoryState } from '../inventory/InventoryState';
import { startingInventory } from '../items/StartingEquipment';
import { createHotbar, type HotbarState } from '../hotbar/Hotbar';
import { createSkills, type SkillsState } from '../skills/LearnedSkills';
import { createAutoPlaySettings, type AutoPlaySettings } from '../autoplay/AutoPlaySettings';
import { createPotionSlots, type PotionSlots } from '../hotbar/PotionSlots';
import { QuestService } from '../quests/QuestService';
import type { StatAllocationDraft } from './StatAllocation';
import { addExp } from '../progression/LevelProgression';
import { applyLevelUp, cloneStatus, createInitialStatus, STATUS_RULES, totalStats, type CharacterStatus, type StatBlock } from './StatTypes';

/**
 * Development-only tools (test stat points). Available in `npm run dev`, or in a production build
 * only when the URL contains ?debug - never shown to normal players.
 */
export const STATUS_DEV_TOOLS_ENABLED = DEBUG_AVAILABLE;

/** A character's checked progress from a save file. */
export interface SavedProgress {
  status: CharacterStatus;
  passives: PassiveProgress;
  quests: Readonly<Record<string, unknown>>;
  inventory: InventoryState;
  /** Absent = an empty hotbar. */
  hotbar?: HotbarState;
  /** Absent = nothing learned. */
  skills?: SkillsState;
  /** Absent = empty Q / W. */
  potionSlots?: PotionSlots;
  /** Absent = 0. */
  gold?: number;
  /** Absent = none finished. */
  hints?: readonly string[];
  /** Absent = none unlocked. */
  unlocks?: readonly string[];
  /** Absent = every portal locked. */
  portals?: Readonly<Partial<Record<string, string>>>;
  /** Absent = default Auto Play settings. */
  autoPlay?: AutoPlaySettings;
}

type Listener = (character: CharacterData) => void;
const listeners = new Set<Listener>();

/**
 * The single place that reads and changes a character's status: starting, restoring, confirming allocations,
 * level-ups and dev grants all go through here.
 *
 * Progress lives in memory, on the CharacterData, for as long as the session runs. Nothing is written to the
 * browser: the only way to keep it is an exported save file (src/save).
 */
export const CharacterStatusService = {
  /** A fresh character by the starting rules: level 1, the starting equipment worn, the first quest waiting. */
  startNew(character: CharacterData): void {
    character.status = createInitialStatus();
    character.passives = sanitizePassiveProgress(null, character.status.level).progress;
    character.inventory = startingInventory();
    character.hotbar = createHotbar();
    character.skills = createSkills();
    character.potionSlots = createPotionSlots();
    character.gold = 0;
    character.hints = [];
    character.unlocks = [];
    character.portals = {};
    character.autoPlay = createAutoPlaySettings();
    QuestService.begin(character);
  },

  /** The progress of a save file (already checked by SaveFile). Level rewards still owed are granted once. */
  restore(character: CharacterData, saved: SavedProgress): void {
    character.status = cloneStatus(saved.status);
    normalizeExp(character.status);
    character.passives = sanitizePassiveProgress(saved.passives, character.status.level).progress;
    character.inventory = saved.inventory;
    character.hotbar = saved.hotbar ?? createHotbar();
    character.skills = saved.skills ?? createSkills();
    character.potionSlots = saved.potionSlots ?? createPotionSlots();
    character.gold = saved.gold ?? 0;
    character.hints = [...(saved.hints ?? [])];
    character.unlocks = [...(saved.unlocks ?? [])];
    character.portals = { ...(saved.portals ?? {}) };
    character.autoPlay = saved.autoPlay ?? createAutoPlaySettings();
    QuestService.restore(character, saved.quests);
  },

  /**
   * Derived stats: formulas from level + TOTAL main stats, then every derived-stat bonus source
   * (passive tree, equipment) applied once on top.
   */
  derived(character: CharacterData): DerivedStats {
    return applyDerivedBonus(computeDerivedStats(character.status.level, totalStats(character.status)), derivedBonus(character));
  },

  /** Derived stats if the base stats were `base` (Status window preview), with the same bonuses. */
  previewDerived(character: CharacterData, base: StatBlock): DerivedStats {
    const status = character.status;
    return applyDerivedBonus(computeDerivedStats(status.level, totalStats({ ...status, base })), derivedBonus(character));
  },

  /** Tells listeners the character changed outside this service (passive upgrade / reset, equipment). */
  refresh(character: CharacterData): void {
    notify(character);
  },

  /** Validates and applies a staged allocation; returns a localizable error on failure. */
  confirmAllocation(character: CharacterData, draft: StatAllocationDraft): LocalizedMessage | null {
    const result = draft.commit(character.status);
    if (!result.ok) return result.error;
    character.status = result.status;
    notify(character);
    return null;
  },

  /** Sets the level directly (dev / tests): awards 3 points per level gained. */
  setLevel(character: CharacterData, level: number): number {
    const next = cloneStatus(character.status);
    const awarded = applyLevelUp(next, level);
    if (awarded > 0) {
      character.status = next;
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

/** Every derived-stat bonus source of a character, combined. */
function derivedBonus(character: CharacterData): DerivedBonus {
  return combineDerivedBonuses(passiveDerivedBonus(character.passives), equipmentDerivedBonus(character.inventory));
}

/** Level-ups grant Drifter passive points (1 per level up to 10), each level only once. */
function syncPassiveRewards(character: CharacterData): void {
  if (character.passives) syncLevelRewards(character.passives, character.status.level);
}

function notify(character: CharacterData): void {
  for (const l of listeners) l(character);
}
