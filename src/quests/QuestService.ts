import type { CharacterData } from '../data/CharacterData';
import { hasGrant } from '../inventory/InventoryState';
import { isCenterUnlocked } from '../passives/PassiveProgress';
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
import { applyQuest02, createQuest02, isDaggerEquipped, isQuest02Completed, restoreQuest02, TUTORIAL_QUEST_02, type Quest02Event, type Quest02Progress } from './TutorialQuest02';

/** A character's quests by quest id. Entries of quests this build does not know are kept as stored. */
export interface QuestLog {
  tutorial_01_find_mateus: Quest01Progress;
  tutorial_02_rusty_dagger: Quest02Progress;
  [otherQuestId: string]: unknown;
}

type ChangeListener = (character: CharacterData) => void;
type CompletedListener = (character: CharacterData, questId: string) => void;
const changeListeners = new Set<ChangeListener>();
const completedListeners = new Set<CompletedListener>();

/**
 * The single place that reads and changes quest progress: every step goes through the pure rules and is
 * announced. Progress lives in memory and in exported save files only.
 *
 * FUTURE EXP (not decided - nothing is paid now): listen to onCompleted (or check canClaimReward after a
 * load), and only when claimReward() returns true call CharacterStatusService.gainExp. The claim is recorded
 * before it returns, so a reward can never be paid twice.
 */
export const QuestService = {
  /** A new character's quests. */
  begin(character: CharacterData): void {
    character.quests = { tutorial_01_find_mateus: createQuest01(true), tutorial_02_rusty_dagger: createQuest02() };
  },

  /** The quests of a save file (after the inventory). Each record is checked; quests this build does not know are kept. */
  restore(character: CharacterData, stored: Readonly<Record<string, unknown>>): void {
    const quest = sanitizeQuest01(stored[TUTORIAL_QUEST_01.id]) ?? createQuest01(false);
    const quest02 = restoreQuest02(stored[TUTORIAL_QUEST_02.id], hasGrant(character.inventory, TUTORIAL_QUEST_02.reward.grantId));
    character.quests = { ...stored, tutorial_01_find_mateus: quest, tutorial_02_rusty_dagger: quest02 };
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
    commit(character, { tutorial_01_find_mateus: next });
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
    commit(character, { tutorial_01_find_mateus: { ...this.quest01(character), rewardClaimed: true } });
    return true;
  },

  quest02(character: CharacterData): Quest02Progress {
    return character.quests?.tutorial_02_rusty_dagger ?? createQuest02();
  },

  /** Applies a step of Tutorial Quest 02. False when it is not valid now (nothing changes). */
  advance02(character: CharacterData, event: Quest02Event): boolean {
    if (!character.quests) return false;
    const next = applyQuest02(this.quest02(character), event);
    if (!next) return false;
    commit(character, { tutorial_02_rusty_dagger: next });
    if (isQuest02Completed(next)) for (const l of completedListeners) l(character, TUTORIAL_QUEST_02.id);
    return true;
  },

  /**
   * The steps of Tutorial Quest 02 that follow from what the character has done: it starts when Tutorial
   * Quest 01 is over and the Passive Tree's first node is unlocked, and ends when the dagger is worn. Safe to
   * call at any time.
   */
  sync02(character: CharacterData): void {
    if (this.quest01(character).state === 'PASSIVE_TUTORIAL_STARTED' && character.passives && isCenterUnlocked(character.passives)) this.advance02(character, 'start');
    if (isDaggerEquipped(character.inventory)) this.advance02(character, 'complete');
  },

  onChange(listener: ChangeListener): () => void {
    changeListeners.add(listener);
    return () => changeListeners.delete(listener);
  },

  /** Fired once per character when a quest is completed. */
  onCompleted(listener: CompletedListener): () => void {
    completedListeners.add(listener);
    return () => completedListeners.delete(listener);
  },
};

function commit(character: CharacterData, change: Partial<Pick<QuestLog, 'tutorial_01_find_mateus' | 'tutorial_02_rusty_dagger'>>): void {
  character.quests = { ...character.quests!, ...change };
  for (const l of changeListeners) l(character);
}
