import type { CharacterData } from '../data/CharacterData';
import { QuestService } from './QuestService';
import { TUTORIAL_QUEST_01 } from './TutorialQuest01';
import { TUTORIAL_QUEST_02 } from './TutorialQuest02';
import { TUTORIAL_QUEST_03 } from './TutorialQuest03';
import { TUTORIAL_QUEST_04 } from './TutorialQuest04';
import { TUTORIAL_QUEST_05 } from './TutorialQuest05';
import { TUTORIAL_QUEST_06 } from './TutorialQuest06';
import { TUTORIAL_QUEST_07 } from './TutorialQuest07';

/**
 * When a quest counts as ACCEPTED (for the "Quest accepted: ..." notice) - pure, unit-tested. A quest is accepted
 * once its giver's talk is over and the player has the task (offers and the talks themselves do not count); every
 * later state counts too, so stepping back inside a quest (a cut-off talk) never announces it twice. Completion
 * comes from QuestService.onCompleted.
 */
const NOT_YET: Readonly<Record<string, readonly string[]>> = {
  [TUTORIAL_QUEST_01.id]: ['NOT_STARTED'],
  [TUTORIAL_QUEST_02.id]: ['NOT_STARTED', 'FIND_MATEUS', 'MATEUS_DIALOGUE'],
  [TUTORIAL_QUEST_03.id]: ['NOT_STARTED', 'OFFERED', 'ACCEPT_DIALOGUE'],
  [TUTORIAL_QUEST_04.id]: ['NOT_STARTED', 'OFFERED', 'INTRO_DIALOGUE'],
  [TUTORIAL_QUEST_05.id]: ['NOT_STARTED'],
  [TUTORIAL_QUEST_06.id]: ['NOT_STARTED', 'OFFERED', 'INTRO_DIALOGUE'],
  [TUTORIAL_QUEST_07.id]: ['NOT_STARTED', 'OFFERED'],
};

export const NOTICE_QUEST_IDS: readonly string[] = Object.keys(NOT_YET);

function stateOf(character: CharacterData, questId: string): string {
  switch (questId) {
    case TUTORIAL_QUEST_01.id:
      return QuestService.quest01(character).state;
    case TUTORIAL_QUEST_02.id:
      return QuestService.quest02(character).state;
    case TUTORIAL_QUEST_03.id:
      return QuestService.quest03(character).state;
    case TUTORIAL_QUEST_04.id:
      return QuestService.quest04(character).state;
    case TUTORIAL_QUEST_05.id:
      return QuestService.quest05(character).state;
    case TUTORIAL_QUEST_06.id:
      return QuestService.quest06(character).state;
    default:
      return QuestService.quest07(character).state;
  }
}

export function isQuestAccepted(character: CharacterData, questId: string): boolean {
  return !(NOT_YET[questId] ?? []).includes(stateOf(character, questId));
}

/**
 * Watches one character's quests and reports each newly accepted quest once. Starts from the state at creation (a
 * loaded save announces nothing it already had).
 */
export class QuestAcceptWatcher {
  private readonly accepted = new Set<string>();

  constructor(private readonly character: CharacterData) {
    for (const id of NOTICE_QUEST_IDS) if (isQuestAccepted(character, id)) this.accepted.add(id);
  }

  /** Quests accepted since the last call (in quest order). */
  newlyAccepted(): string[] {
    const out: string[] = [];
    for (const id of NOTICE_QUEST_IDS) {
      if (this.accepted.has(id) || !isQuestAccepted(this.character, id)) continue;
      this.accepted.add(id);
      out.push(id);
    }
    return out;
  }
}
