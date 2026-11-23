import type { CharacterData } from '../data/CharacterData';
import { QuestService } from './QuestService';
import { isQuest01Active, TUTORIAL_QUEST_01 } from './TutorialQuest01';
import { isQuest02AtMateus, TUTORIAL_QUEST_02 } from './TutorialQuest02';
import { isQuest03AtMateus, isQuest03Tracking, TUTORIAL_QUEST_03 } from './TutorialQuest03';
import { TUTORIAL_QUEST_04 } from './TutorialQuest04';
import { isQuest05Tracking, TUTORIAL_QUEST_05 } from './TutorialQuest05';
import { isQuest06Tracking, TUTORIAL_QUEST_06 } from './TutorialQuest06';

/** What the HUD quest tracker shows: quest name key, objective key under it, its parameters. */
export interface TrackedQuest {
  questId: string;
  objectiveKey: string;
  params?: Record<string, number>;
}

/** The quest the player is working on now (one at a time), or null. Pure: read from the quest state. */
export function trackedQuest(character: CharacterData): TrackedQuest | null {
  const quest02 = QuestService.quest02(character);
  const quest03 = QuestService.quest03(character);
  if (isQuest01Active(QuestService.quest01(character))) return { questId: TUTORIAL_QUEST_01.id, objectiveKey: 'objective' };
  if (isQuest02AtMateus(quest02)) return { questId: TUTORIAL_QUEST_02.id, objectiveKey: 'objective' };
  if (quest02.state === 'EQUIPMENT_TUTORIAL') return { questId: TUTORIAL_QUEST_02.id, objectiveKey: 'objectiveEquip' };
  if (quest02.state === 'STATUS_TUTORIAL') return { questId: TUTORIAL_QUEST_02.id, objectiveKey: 'objectiveStatus' };
  if (isQuest03Tracking(quest03)) return { questId: TUTORIAL_QUEST_03.id, objectiveKey: 'objectiveHunt', params: { count: quest03.kills, total: TUTORIAL_QUEST_03.target.count } };
  if (isQuest03AtMateus(quest03)) return { questId: TUTORIAL_QUEST_03.id, objectiveKey: 'objective' };
  const quest04 = QuestService.quest04(character).state;
  if (quest04 === 'OFFERED' || quest04 === 'INTRO_DIALOGUE') return { questId: TUTORIAL_QUEST_04.id, objectiveKey: 'objective' };
  if (quest04 === 'POTION_TUTORIAL') return { questId: TUTORIAL_QUEST_04.id, objectiveKey: 'objectiveTutorial' };
  if (quest04 === 'HOTKEY_ASSIGNED' || quest04 === 'FINAL_DIALOGUE') return { questId: TUTORIAL_QUEST_04.id, objectiveKey: 'objectiveReturn' };
  const quest05 = QuestService.quest05(character);
  if (isQuest05Tracking(quest05)) return { questId: TUTORIAL_QUEST_05.id, objectiveKey: 'objectiveHunt', params: { count: quest05.kills, total: TUTORIAL_QUEST_05.target.count } };
  const quest06 = QuestService.quest06(character);
  if (quest06.state === 'OFFERED' || quest06.state === 'INTRO_DIALOGUE') return { questId: TUTORIAL_QUEST_06.id, objectiveKey: 'objective' };
  if (quest06.state === 'SCROLL_TUTORIAL') return { questId: TUTORIAL_QUEST_06.id, objectiveKey: 'objectiveTutorial' };
  if (quest06.state === 'SKILL_ASSIGNED' || quest06.state === 'FINAL_DIALOGUE') return { questId: TUTORIAL_QUEST_06.id, objectiveKey: 'objectiveReturn' };
  if (isQuest06Tracking(quest06)) return { questId: TUTORIAL_QUEST_06.id, objectiveKey: 'objectiveHunt', params: { count: quest06.kills, total: TUTORIAL_QUEST_06.target.count } };
  return null;
}
