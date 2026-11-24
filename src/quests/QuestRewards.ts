import type { CharacterData } from '../data/CharacterData';
import { InventoryService } from '../inventory/InventoryService';
import type { GrantError } from '../inventory/InventoryState';
import { questExpReward } from '../progression/QuestExpBudget';
import { CharacterStatusService } from '../status/CharacterStatusService';
import { QuestService } from './QuestService';
import { TUTORIAL_QUEST_02 } from './TutorialQuest02';
import { TUTORIAL_QUEST_03 } from './TutorialQuest03';
import { TUTORIAL_QUEST_05 } from './TutorialQuest05';
import { TUTORIAL_QUEST_06 } from './TutorialQuest06';
import { TUTORIAL_QUEST_07 } from './TutorialQuest07';
import { GoldService } from '../economy/GoldService';

/** EXP a quest paid: the amount and the levels it gained (for the EXP / LEVEL UP feedback). */
export interface QuestExpPaid {
  exp: number;
  levels: number;
}

/** A turn-in: paid, or why nothing happened (the quest stays ready to turn in). */
export type QuestTurnIn = ({ ok: true } & QuestExpPaid) | { ok: false; error: 'notReady' | Exclude<GrantError, 'alreadyGranted'> };

/**
 * Quest rewards (EXP amounts from TUTORIAL_QUEST_EXP_BUDGET), paid through the normal EXP and item systems.
 * Each reward belongs to one quest step that is accepted only once - taken first, then paid - so repeated
 * clicks, a second conversation or a loaded save can never pay it again. Items go first, by their grant id:
 * if they cannot be given (bag full) the quest is NOT completed and no EXP is paid - it can be turned in again.
 */
export const QuestRewards = {
  /** Tutorial Quest 02, before the second line of the turn-in conversation: 100 EXP. null = nothing was paid now. */
  quest02(character: CharacterData): QuestExpPaid | null {
    return pay(character, TUTORIAL_QUEST_02.id, () => QuestService.advance02(character, 'grantExp'));
  },

  /** Tutorial Quest 03, when the completion conversation ends: Red Healing Potion x20, then 200 EXP; completed. */
  quest03(character: CharacterData): QuestTurnIn {
    if (QuestService.quest03(character).state !== 'TURN_IN_DIALOGUE') return { ok: false, error: 'notReady' };
    const given = InventoryService.grantOnce(character, TUTORIAL_QUEST_03.reward);
    if (given !== null && given !== 'alreadyGranted') return { ok: false, error: given };
    const paid = pay(character, TUTORIAL_QUEST_03.id, () => QuestService.advance03(character, 'complete'));
    return paid ? { ok: true, ...paid } : { ok: false, error: 'notReady' };
  },

  /** Tutorial Quest 06, clicking through line 1 of Roland's turn-in talk: the Heal Skill Scroll, then 150 EXP; completed. */
  quest06(character: CharacterData): QuestTurnIn {
    if (QuestService.quest06(character).state !== 'TURN_IN_DIALOGUE') return { ok: false, error: 'notReady' };
    const given = InventoryService.grantOnce(character, TUTORIAL_QUEST_06.healScroll);
    if (given !== null && given !== 'alreadyGranted') return { ok: false, error: given };
    const paid = pay(character, TUTORIAL_QUEST_06.id, () => QuestService.advance06(character, 'complete'));
    return paid ? { ok: true, ...paid } : { ok: false, error: 'notReady' };
  },

  /**
   * Tutorial Quest 07, clicking through line 1 of Roland's Lv 10 talk: 1,000 Gold. The quest step is taken first
   * (once), so a second click, a second conversation or a loaded save never pays again. The Gold paid now (0 = none).
   */
  quest07(character: CharacterData): number {
    if (!QuestService.advance07(character, 'reward')) return 0;
    return GoldService.add(character, TUTORIAL_QUEST_07.goldReward);
  },

  /** Tutorial Quest 05, when Roland's completion conversation ends: 150 EXP; completed. */
  quest05(character: CharacterData): QuestTurnIn {
    const paid = pay(character, TUTORIAL_QUEST_05.id, () => QuestService.advance05(character, 'complete'));
    return paid ? { ok: true, ...paid } : { ok: false, error: 'notReady' };
  },
};

function pay(character: CharacterData, questId: string, claim: () => boolean): QuestExpPaid | null {
  if (!claim()) return null;
  const exp = questExpReward(questId);
  return { exp, levels: exp > 0 ? CharacterStatusService.gainExp(character, exp) : 0 };
}
