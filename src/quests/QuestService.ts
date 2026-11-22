import type { CharacterData } from '../data/CharacterData';
import { QuestSaveStore } from './QuestSaveStore';
import {
  applyQuest01,
  createQuest01,
  isPassiveTutorialOpen,
  isQuest01Completed,
  sanitizeQuest01,
  TUTORIAL_QUEST_01,
  type Quest01Event,
  type Quest01Progress,
} from './TutorialQuest01';

/** A character's quests by quest id. Entries of quests this build does not know are kept as stored. */
export interface QuestLog {
  tutorial_01_find_mateus: Quest01Progress;
  [otherQuestId: string]: unknown;
}

type ChangeListener = (character: CharacterData) => void;
type CompletedListener = (character: CharacterData, questId: string) => void;
const changeListeners = new Set<ChangeListener>();
const completedListeners = new Set<CompletedListener>();

/**
 * The single place that reads and changes quest progress: every step goes through the pure rules, is saved
 * at once and announced.
 *
 * FUTURE EXP (not decided - nothing is paid now): listen to onCompleted (or check canClaimReward after a
 * load), and only when claimReward() returns true call CharacterStatusService.gainExp. The claim is saved
 * before it returns, so a reward can never be paid twice.
 */
export const QuestService = {
  /** Attaches the saved quests. `isNewCharacter` = the name had no saved status before. */
  loadInto(character: CharacterData, isNewCharacter: boolean): void {
    const result = QuestSaveStore.load(character.name);
    if (result.kind === 'invalid') {
      console.warn(`[quests] unreadable save for "${character.name}" (${result.reason}); kept a backup`);
      QuestSaveStore.backupInvalid(character.name);
    }
    const stored = result.kind === 'loaded' ? result.quests : {};
    const quest = sanitizeQuest01(stored[TUTORIAL_QUEST_01.id]) ?? createQuest01(isNewCharacter);
    character.quests = { ...stored, tutorial_01_find_mateus: quest };
    QuestSaveStore.save(character.name, character.quests);
  },

  quest01(character: CharacterData): Quest01Progress {
    return character.quests?.tutorial_01_find_mateus ?? createQuest01(false);
  },

  /** Applies a quest step. False when it is not valid now (nothing changes). */
  advance(character: CharacterData, event: Quest01Event): boolean {
    if (!character.quests) return false;
    const before = this.quest01(character);
    const next = applyQuest01(before, event);
    if (!next) return false;
    commit(character, next);
    if (isQuest01Completed(next) && !isQuest01Completed(before)) for (const l of completedListeners) l(character, TUTORIAL_QUEST_01.id);
    return true;
  },

  isPassiveTutorialOpen(character: CharacterData): boolean {
    return isPassiveTutorialOpen(this.quest01(character));
  },

  canClaimReward(character: CharacterData): boolean {
    const q = this.quest01(character);
    return isQuest01Completed(q) && !q.rewardClaimed;
  },

  /** True exactly once per character, after the quest is completed. Pays nothing itself. */
  claimReward(character: CharacterData): boolean {
    if (!character.quests || !this.canClaimReward(character)) return false;
    commit(character, { ...this.quest01(character), rewardClaimed: true });
    return true;
  },

  onChange(listener: ChangeListener): () => void {
    changeListeners.add(listener);
    return () => changeListeners.delete(listener);
  },

  /** Fired once per character when a quest is completed (after it was saved). */
  onCompleted(listener: CompletedListener): () => void {
    completedListeners.add(listener);
    return () => completedListeners.delete(listener);
  },
};

function commit(character: CharacterData, quest: Quest01Progress): void {
  character.quests = { ...character.quests, tutorial_01_find_mateus: quest };
  QuestSaveStore.save(character.name, character.quests);
  for (const l of changeListeners) l(character);
}
