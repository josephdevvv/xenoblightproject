import type { CharacterData } from '../data/CharacterData';
import { QuestService } from '../quests/QuestService';
import { FEATURES, unlockedByProgress, type FeatureId } from './FeatureIds';

export { FEATURES, isFeatureId, sanitizeUnlocks, unlockedByProgress, type FeatureId } from './FeatureIds';

/** Records feature unlocks (rules: FeatureIds). */
type Listener = (character: CharacterData, feature: FeatureId) => void;
const listeners = new Set<Listener>();

export const FeatureService = {
  isUnlocked(character: CharacterData, feature: FeatureId): boolean {
    return character.unlocks?.includes(feature) ?? false;
  },

  /** Records an unlock (once). True when it was new. */
  unlock(character: CharacterData, feature: FeatureId): boolean {
    if (this.isUnlocked(character, feature)) return false;
    character.unlocks = [...(character.unlocks ?? []), feature];
    for (const l of listeners) l(character, feature);
    return true;
  },

  /** Unlocks every feature whose tutorial step the quest progress has reached. Safe to call at any time. */
  sync(character: CharacterData): void {
    const q03 = QuestService.quest03(character).state;
    const q07 = QuestService.quest07(character);
    for (const f of FEATURES) if (unlockedByProgress(f, q03, q07)) this.unlock(character, f);
  },

  onUnlock(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
