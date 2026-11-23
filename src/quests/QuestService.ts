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
import type { MonsterId } from '../monsters/MonsterDefinition';
import { pointsSpent } from '../status/StatTypes';
import {
  applyQuest02,
  createQuest02,
  isDaggerEquipped,
  isQuest02Completed,
  isQuest02TurnedIn,
  isStatusTutorialDone,
  restoreQuest02,
  TUTORIAL_QUEST_02,
  type Quest02Event,
  type Quest02Progress,
} from './TutorialQuest02';
import { applyQuest03, createQuest03, restoreQuest03, TUTORIAL_QUEST_03, type Quest03Event, type Quest03Progress } from './TutorialQuest03';

/** A character's quests by quest id. Entries of quests this build does not know are kept as stored. */
export interface QuestLog {
  tutorial_01_find_mateus: Quest01Progress;
  tutorial_02_rusty_dagger: Quest02Progress;
  tutorial_03_void_mite_hunt: Quest03Progress;
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
 * Quest EXP is paid by QuestRewards, together with the one step of each quest that can only happen once.
 */
export const QuestService = {
  /** A new character's quests. */
  begin(character: CharacterData): void {
    character.quests = { tutorial_01_find_mateus: createQuest01(true), tutorial_02_rusty_dagger: createQuest02(), tutorial_03_void_mite_hunt: createQuest03() };
  },

  /** The quests of a save file (after the status and the inventory). Each record is checked; quests this build does not know are kept. */
  restore(character: CharacterData, stored: Readonly<Record<string, unknown>>): void {
    const quest = sanitizeQuest01(stored[TUTORIAL_QUEST_01.id]) ?? createQuest01(false);
    const spent = character.status ? pointsSpent(character.status) : 0;
    const quest02 = restoreQuest02(stored[TUTORIAL_QUEST_02.id], hasGrant(character.inventory, TUTORIAL_QUEST_02.reward.grantId), spent);
    const quest03 = restoreQuest03(stored[TUTORIAL_QUEST_03.id]);
    character.quests = { ...stored, tutorial_01_find_mateus: quest, tutorial_02_rusty_dagger: quest02, tutorial_03_void_mite_hunt: quest03 };
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
    const before = this.quest02(character);
    const next = applyQuest02(before, event, character.status ? pointsSpent(character.status) : 0);
    if (!next) return false;
    commit(character, { tutorial_02_rusty_dagger: next });
    if (isQuest02Completed(next) && !isQuest02Completed(before)) for (const l of completedListeners) l(character, TUTORIAL_QUEST_02.id);
    return true;
  },

  quest03(character: CharacterData): Quest03Progress {
    return character.quests?.tutorial_03_void_mite_hunt ?? createQuest03();
  },

  /** Applies a step of Tutorial Quest 03. False when it is not valid now (nothing changes). */
  advance03(character: CharacterData, event: Quest03Event): boolean {
    if (!character.quests) return false;
    const next = applyQuest03(this.quest03(character), event);
    if (!next) return false;
    commit(character, { tutorial_03_void_mite_hunt: next });
    if (next.state === 'COMPLETED') for (const l of completedListeners) l(character, TUTORIAL_QUEST_03.id);
    return true;
  },

  /** Tutorial Quest 03 can be offered: Tutorial Quest 02 is turned in, Status tutorial included. */
  canStart03(character: CharacterData): boolean {
    return isQuest02TurnedIn(this.quest02(character));
  },

  /** A monster the player got the kill credit for (CombatSystem: once per kill). True when it counted for a quest. */
  recordKill(character: CharacterData, monsterId: MonsterId): boolean {
    return monsterId === TUTORIAL_QUEST_03.target.monsterId && this.advance03(character, 'kill');
  },

  /** Every quest step that follows from what the character has done. Safe to call at any time. */
  sync(character: CharacterData): void {
    this.sync02(character);
    if (this.canStart03(character)) this.advance03(character, 'offer');
  },

  /** The Passive Tree tutorial's node is unlocked. */
  isFirstPassiveUnlocked(character: CharacterData): boolean {
    return character.passives !== undefined && isCenterUnlocked(character.passives);
  },

  /** Tutorial Quest 01 is over and the Passive Tree's first node is unlocked. */
  canStart02(character: CharacterData): boolean {
    return this.quest01(character).state === 'PASSIVE_TUTORIAL_STARTED' && this.isFirstPassiveUnlocked(character);
  },

  /**
   * The steps of Tutorial Quest 02 that follow from what the character has done: it starts when Tutorial
   * Quest 01 is over and the Passive Tree's first node is unlocked; the dagger is done when it is worn, and
   * the Status tutorial when a stat point was spent. Safe to call at any time.
   */
  sync02(character: CharacterData): void {
    if (this.canStart02(character)) this.advance02(character, 'start');
    if (isDaggerEquipped(character.inventory)) this.advance02(character, 'complete');
    if (character.status && isStatusTutorialDone(this.quest02(character), character.status)) this.advance02(character, 'statAllocated');
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

function commit(character: CharacterData, change: Partial<Pick<QuestLog, 'tutorial_01_find_mateus' | 'tutorial_02_rusty_dagger' | 'tutorial_03_void_mite_hunt'>>): void {
  character.quests = { ...character.quests!, ...change };
  for (const l of changeListeners) l(character);
}
