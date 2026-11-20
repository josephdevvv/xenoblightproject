import { cloneStatus, createStatBlock, MAIN_STATS, STATUS_RULES, type CharacterStatus, type MainStat, type StatBlock } from './StatTypes';
import type { LocalizedMessage } from '../data/CharacterData';

export type AllocationResult = { ok: true; status: CharacterStatus; spent: number } | { ok: false; error: LocalizedMessage };

/**
 * Staged ("pending") stat allocation for the Status window. Nothing touches the character until
 * `commit()`, which validates every limit again against the CURRENT status before applying.
 */
export class StatAllocationDraft {
  private pending: StatBlock = createStatBlock(0);

  constructor(private status: CharacterStatus) {}

  /** Points currently selected (pending, not yet spent). */
  get selected(): number {
    let n = 0;
    for (const stat of MAIN_STATS) n += this.pending[stat] * STATUS_RULES.costPerStat;
    return n;
  }

  /** Points the character would have left after confirming. */
  get remainingAfterConfirm(): number {
    return this.status.statPoints - this.selected;
  }

  pendingFor(stat: MainStat): number {
    return this.pending[stat];
  }

  /** Base value after the pending points would be applied. */
  previewBase(stat: MainStat): number {
    return this.status.base[stat] + this.pending[stat];
  }

  canAdd(stat: MainStat): boolean {
    return this.remainingAfterConfirm >= STATUS_RULES.costPerStat && this.previewBase(stat) < STATUS_RULES.maxBaseStat;
  }

  add(stat: MainStat): boolean {
    if (!this.canAdd(stat)) return false;
    this.pending[stat]++;
    return true;
  }

  hasPending(): boolean {
    return this.selected > 0;
  }

  /** Discard every pending point. */
  clear(): void {
    this.pending = createStatBlock(0);
  }

  /** Re-target the draft (e.g. after test points were granted); pending points are discarded. */
  reset(status: CharacterStatus): void {
    this.status = status;
    this.clear();
  }

  /**
   * Point the draft at an updated status (e.g. after test points were granted). Pending points are
   * kept only while they are still valid against it; otherwise they are discarded.
   */
  rebase(status: CharacterStatus): void {
    this.status = status;
    if (!this.commit(status).ok) this.clear();
  }

  /** Validates against `current` and returns the new status. Does not mutate anything. */
  commit(current: CharacterStatus): AllocationResult {
    const spent = this.selected;
    if (spent === 0) return { ok: false, error: { key: 'status.errors.noPointsSelected' } };
    for (const stat of MAIN_STATS) {
      const p = this.pending[stat];
      if (!Number.isInteger(p) || p < 0) return { ok: false, error: { key: 'status.errors.invalidPending', params: { stat: stat.toUpperCase() } } };
      if (current.base[stat] + p > STATUS_RULES.maxBaseStat) {
        return { ok: false, error: { key: 'status.errors.exceedsMax', params: { stat: stat.toUpperCase(), max: STATUS_RULES.maxBaseStat } } };
      }
    }
    if (spent > current.statPoints) return { ok: false, error: { key: 'status.errors.notEnoughPoints' } };

    const next = cloneStatus(current);
    for (const stat of MAIN_STATS) next.base[stat] += this.pending[stat];
    next.statPoints -= spent;
    return { ok: true, status: next, spent };
  }
}
