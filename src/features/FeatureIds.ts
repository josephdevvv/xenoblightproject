import type { Quest03State } from '../quests/TutorialQuest03';
import type { Quest07Progress } from '../quests/TutorialQuest07';

/**
 * Features the tutorial unlocks - pure rules + the one place that records them, unit-tested. Until its tutorial step
 * is reached a feature's controls stay locked (a click or its hotkey only says so). Unlocks are kept in the save
 * file ("unlocks", optional when reading) and never taken back; older saves are unlocked from their quest progress.
 *
 *   navigate     the quest tracker's Navigate - from the Navigate tutorial (Mateus's last quest turned in)
 *   autoCombat   Auto Combat (AUTO button, X) - from the Auto Combat tutorial (Reach Level 10, after the potion one)
 */
export const FEATURES = ['navigate', 'autoCombat'] as const;
export type FeatureId = (typeof FEATURES)[number];

export function isFeatureId(v: unknown): v is FeatureId {
  return typeof v === 'string' && (FEATURES as readonly string[]).includes(v);
}

/** Stored data -> the unlocked features this build knows (unknown or repeated entries dropped). */
export function sanitizeUnlocks(raw: unknown): { state: FeatureId[]; dropped: string[] } {
  if (raw === undefined || raw === null) return { state: [], dropped: [] };
  if (!Array.isArray(raw)) return { state: [], dropped: ['unlocks'] };
  const state = [...new Set(raw.filter(isFeatureId))];
  return { state, dropped: state.length === raw.length ? [] : ['unlocks'] };
}

/** The quest progress at which each feature's tutorial step is reached. */
export function unlockedByProgress(feature: FeatureId, quest03: Quest03State, quest07: Quest07Progress): boolean {
  switch (feature) {
    case 'navigate':
      return quest03 === 'COMPLETED';
    case 'autoCombat':
      return (quest07.state === 'ACTIVE' && quest07.potionTutorialDone) || quest07.state === 'TURN_IN_DIALOGUE' || quest07.state === 'REWARDED' || quest07.state === 'COMPLETED';
  }
}
