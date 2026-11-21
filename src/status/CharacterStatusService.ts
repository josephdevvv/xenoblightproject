import type { CharacterData, LocalizedMessage } from '../data/CharacterData';
import { DEBUG_AVAILABLE } from '../systems/performance/DebugSnapshot';
import { computeDerivedStats, type DerivedStats } from './DerivedStats';
import type { StatAllocationDraft } from './StatAllocation';
import { addExp } from '../combat/CombatRules';
import { applyLevelUp, cloneStatus, createInitialStatus, STATUS_RULES, totalStats, type CharacterStatus } from './StatTypes';
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
    character.status = status;
    StatusSaveStore.save(character.name, status);
    return status;
  },

  derived(character: CharacterData): DerivedStats {
    return computeDerivedStats(character.status.level, totalStats(character.status));
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

function notify(character: CharacterData): void {
  for (const l of listeners) l(character);
}
