import type { CharacterData } from '../data/CharacterData';
import { questExpReward } from '../progression/QuestExpBudget';
import { CharacterStatusService } from '../status/CharacterStatusService';
import { QuestService } from './QuestService';
import { TUTORIAL_QUEST_02 } from './TutorialQuest02';
import { TUTORIAL_QUEST_03 } from './TutorialQuest03';

/** EXP a quest paid: the amount and the levels it gained (for the EXP / LEVEL UP feedback). */
export interface QuestExpPaid {
  exp: number;
  levels: number;
}

/**
 * Quest EXP (amounts from TUTORIAL_QUEST_EXP_BUDGET), paid through the normal EXP system. Each reward belongs
 * to one quest step that is accepted only once - taken first, then paid - so repeated clicks, a second
 * conversation or a loaded save can never pay it again. null = nothing was paid now.
 */
export const QuestRewards = {
  /** Tutorial Quest 02, before the second line of the turn-in conversation: 100 EXP. */
  quest02(character: CharacterData): QuestExpPaid | null {
    return pay(character, TUTORIAL_QUEST_02.id, () => QuestService.advance02(character, 'grantExp'));
  },

  /** Tutorial Quest 03, when the completion conversation ends: 200 EXP, quest completed. */
  quest03(character: CharacterData): QuestExpPaid | null {
    return pay(character, TUTORIAL_QUEST_03.id, () => QuestService.advance03(character, 'complete'));
  },
};

function pay(character: CharacterData, questId: string, claim: () => boolean): QuestExpPaid | null {
  if (!claim()) return null;
  const exp = questExpReward(questId);
  return { exp, levels: exp > 0 ? CharacterStatusService.gainExp(character, exp) : 0 };
}
