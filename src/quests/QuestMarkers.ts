import type { CharacterData } from '../data/CharacterData';
import type { NpcId } from '../npcs/NpcDefinition';
import { QuestService } from './QuestService';
import { TUTORIAL_QUEST_02 } from './TutorialQuest02';
import { TUTORIAL_QUEST_03 } from './TutorialQuest03';
import { TUTORIAL_QUEST_04 } from './TutorialQuest04';
import { TUTORIAL_QUEST_05 } from './TutorialQuest05';
import { TUTORIAL_QUEST_06 } from './TutorialQuest06';
import { isQuest07Ready, TUTORIAL_QUEST_07 } from './TutorialQuest07';
import { TUTORIAL_QUEST_01 } from './TutorialQuest01';

/**
 * Which quest marker an NPC shows above its head (no Phaser, unit-tested). Always derived from the
 * character's quest state: nothing about markers is stored, in the session or in save files.
 *
 *   available      yellow !   the NPC has a new quest
 *   inProgress     gray ->    the quest was accepted, its objectives are not done yet
 *   completed      green check mark   the quest's objectives are completed
 *   null           no marker  (not offered yet, fully resolved, no quest at all)
 *
 * A normal quest goes available -> inProgress -> completed -> null.
 */
export type QuestMarkerType = 'available' | 'inProgress' | 'completed';

/**
 * What one quest asks for. 'completedKept' = fully resolved, but the quest's design keeps the green check
 * mark: it is only shown while no quest of the NPC asks for anything else.
 */
export type QuestMarkerState = QuestMarkerType | 'completedKept';

/** An NPC's quests can ask for different markers at once: the first of these that any of them asks for wins. */
export const QUEST_MARKER_PRIORITY: readonly QuestMarkerState[] = ['completed', 'available', 'inProgress', 'completedKept'];

/** One quest of one NPC. New quests only need an entry in QUEST_MARKER_SOURCES. */
export interface QuestMarkerSource {
  npcId: NpcId;
  marker(character: CharacterData): QuestMarkerState | null;
}

/** Yellow ! until the first conversation is over, then the gray arrow until Tutorial Quest 02 is available. */
function quest01Marker(character: CharacterData): QuestMarkerState | null {
  const quest = QuestService.quest01(character);
  switch (quest.state) {
    case 'NOT_STARTED':
      return quest.autoStart ? 'available' : null;
    case 'FIND_MATEUS':
    case 'TALKING_TO_MATEUS':
      return 'available';
    case 'DIALOGUE_COMPLETED':
      return 'inProgress';
    case 'PASSIVE_TUTORIAL_STARTED':
      return QuestService.isFirstPassiveUnlocked(character) ? null : 'inProgress';
  }
}

/**
 * Yellow ! until the dagger was received, the gray arrow until it is worn, the check mark until it was turned
 * in, the gray arrow during the Status tutorial; nothing once that is done.
 */
function quest02Marker(character: CharacterData): QuestMarkerState | null {
  switch (QuestService.quest02(character).state) {
    case 'NOT_STARTED':
      return QuestService.canStart02(character) ? 'available' : null;
    case 'FIND_MATEUS':
    case 'MATEUS_DIALOGUE':
      return 'available';
    case 'DAGGER_GRANTED':
    case 'EQUIPMENT_TUTORIAL':
      return 'inProgress';
    case 'COMPLETED':
    case 'TURN_IN_DIALOGUE':
      return 'completed';
    case 'REWARDED':
    case 'STATUS_TUTORIAL':
      return 'inProgress';
    case 'TURNED_IN':
      return null;
  }
}

/** Yellow ! until accepted, the gray arrow while hunting, the check mark at 5/5 until turned in; then nothing. */
function quest03Marker(character: CharacterData): QuestMarkerState | null {
  switch (QuestService.quest03(character).state) {
    case 'NOT_STARTED':
      return QuestService.canStart03(character) ? 'available' : null;
    case 'OFFERED':
    case 'ACCEPT_DIALOGUE':
      return 'available';
    case 'HUNTING':
      return 'inProgress';
    case 'READY_TO_TURN_IN':
    case 'TURN_IN_DIALOGUE':
      return 'completed';
    case 'COMPLETED':
      return null;
  }
}

/** Roland: yellow ! until the potion training was accepted, then the gray arrow until it is over. */
function quest04Marker(character: CharacterData): QuestMarkerState | null {
  switch (QuestService.quest04(character).state) {
    case 'NOT_STARTED':
      return QuestService.quest03(character).state === 'COMPLETED' ? 'available' : null;
    case 'OFFERED':
    case 'INTRO_DIALOGUE':
      return 'available';
    case 'POTION_TUTORIAL':
    case 'HOTKEY_ASSIGNED':
    case 'FINAL_DIALOGUE':
      return 'inProgress';
    case 'COMPLETED':
      return null;
  }
}

/** Roland: the gray arrow while hunting, the check mark at 5/5 until turned in; then nothing. */
function quest05Marker(character: CharacterData): QuestMarkerState | null {
  switch (QuestService.quest05(character).state) {
    case 'NOT_STARTED':
      return QuestService.quest04(character).state === 'COMPLETED' ? 'inProgress' : null;
    case 'HUNTING':
      return 'inProgress';
    case 'READY_TO_TURN_IN':
    case 'TURN_IN_DIALOGUE':
      return 'completed';
    case 'COMPLETED':
      return null;
  }
}

/** Roland: yellow ! until the Dark Avian hunt is accepted, the gray arrow through the tutorial and the hunt, the check mark at 10/10. */
function quest06Marker(character: CharacterData): QuestMarkerState | null {
  switch (QuestService.quest06(character).state) {
    case 'NOT_STARTED':
      return QuestService.quest05(character).state === 'COMPLETED' ? 'available' : null;
    case 'OFFERED':
    case 'INTRO_DIALOGUE':
      return 'available';
    case 'SCROLL_TUTORIAL':
    case 'SKILL_ASSIGNED':
    case 'FINAL_DIALOGUE':
    case 'HUNTING':
      return 'inProgress';
    case 'READY_TO_TURN_IN':
    case 'TURN_IN_DIALOGUE':
      return 'completed';
    case 'COMPLETED':
      return null;
  }
}

/** Roland: yellow ! while Reach Level 10 is offered, the gray arrow below Lv 10, the check mark from Lv 10 until turned in. */
function quest07Marker(character: CharacterData): QuestMarkerState | null {
  const quest = QuestService.quest07(character);
  switch (quest.state) {
    case 'NOT_STARTED':
      return QuestService.quest06(character).state === 'COMPLETED' ? 'available' : null;
    case 'OFFERED':
      return 'available';
    case 'ACTIVE':
      return isQuest07Ready(quest, character.status.level) ? 'completed' : 'inProgress';
    case 'TURN_IN_DIALOGUE':
    case 'REWARDED':
      return 'completed';
    case 'COMPLETED':
      return null;
  }
}

export const QUEST_MARKER_SOURCES: readonly QuestMarkerSource[] = [
  { npcId: TUTORIAL_QUEST_01.npcId, marker: quest01Marker },
  { npcId: TUTORIAL_QUEST_02.npcId, marker: quest02Marker },
  { npcId: TUTORIAL_QUEST_03.npcId, marker: quest03Marker },
  { npcId: TUTORIAL_QUEST_04.npcId, marker: quest04Marker },
  { npcId: TUTORIAL_QUEST_05.npcId, marker: quest05Marker },
  { npcId: TUTORIAL_QUEST_06.npcId, marker: quest06Marker },
  { npcId: TUTORIAL_QUEST_07.npcId, marker: quest07Marker },
];

/** The one marker an NPC shows for this character now. */
export function npcQuestMarker(character: CharacterData, npcId: NpcId, sources: readonly QuestMarkerSource[] = QUEST_MARKER_SOURCES): QuestMarkerType | null {
  let best: QuestMarkerState | null = null;
  for (const source of sources) {
    if (source.npcId !== npcId) continue;
    const marker = source.marker(character);
    if (marker && (best === null || QUEST_MARKER_PRIORITY.indexOf(marker) < QUEST_MARKER_PRIORITY.indexOf(best))) best = marker;
  }
  return best === 'completedKept' ? 'completed' : best;
}
