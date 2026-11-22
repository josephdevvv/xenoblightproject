import type { NpcId } from '../npcs/NpcDefinition';

/**
 * Tutorial Quest 01 "Find Mateus" - data and pure state rules (no Phaser, no storage), unit-tested.
 *
 *   NOT_STARTED --start--> FIND_MATEUS --talk--> TALKING_TO_MATEUS --finishDialogue--> DIALOGUE_COMPLETED
 *     --startPassiveTutorial--> PASSIVE_TUTORIAL_STARTED
 *
 * Every step is only accepted from the state before it, so the quest can never complete twice. A
 * conversation that was cut off (reload) goes back to FIND_MATEUS. No EXP reward is defined: the quest only
 * records whether a future reward was claimed (QuestService.claimReward).
 */
export const TUTORIAL_QUEST_01 = {
  id: 'tutorial_01_find_mateus',
  /** The existing NPC Mateus (NpcDefinition registry: position, art and display name come from there). */
  npcId: 'city_guard_01' as NpcId,
  dialogueId: 'mateus_first_meeting',
} as const;

export const QUEST01_STATES = ['NOT_STARTED', 'FIND_MATEUS', 'TALKING_TO_MATEUS', 'DIALOGUE_COMPLETED', 'PASSIVE_TUTORIAL_STARTED'] as const;
export type Quest01State = (typeof QUEST01_STATES)[number];

export interface Quest01Progress {
  state: Quest01State;
  /** Starts by itself when the character enters the map (new characters only). */
  autoStart: boolean;
  /** A future quest reward was paid (never twice). */
  rewardClaimed: boolean;
}

export type Quest01Event = 'start' | 'talk' | 'cancelTalk' | 'finishDialogue' | 'startPassiveTutorial';

const TRANSITIONS: Readonly<Record<Quest01Event, { from: Quest01State; to: Quest01State }>> = {
  start: { from: 'NOT_STARTED', to: 'FIND_MATEUS' },
  talk: { from: 'FIND_MATEUS', to: 'TALKING_TO_MATEUS' },
  cancelTalk: { from: 'TALKING_TO_MATEUS', to: 'FIND_MATEUS' },
  finishDialogue: { from: 'TALKING_TO_MATEUS', to: 'DIALOGUE_COMPLETED' },
  startPassiveTutorial: { from: 'DIALOGUE_COMPLETED', to: 'PASSIVE_TUTORIAL_STARTED' },
};

/** New characters get the quest automatically; characters from before the quest are left as they were. */
export function createQuest01(isNewCharacter: boolean): Quest01Progress {
  return { state: 'NOT_STARTED', autoStart: isNewCharacter, rewardClaimed: false };
}

/** Applies an event; returns the new progress, or null when it is not valid now. Never mutates `p`. */
export function applyQuest01(p: Quest01Progress, event: Quest01Event): Quest01Progress | null {
  const t = TRANSITIONS[event];
  if (p.state !== t.from) return null;
  if (event === 'start' && !p.autoStart) return null;
  return { ...p, state: t.to };
}

/** The conversation with Mateus is done. */
export function isQuest01Completed(p: Quest01Progress): boolean {
  return QUEST01_STATES.indexOf(p.state) >= QUEST01_STATES.indexOf('DIALOGUE_COMPLETED');
}

/** The objective is open (tracker, dotted path): until the last line of the conversation. */
export function isQuest01Active(p: Quest01Progress): boolean {
  return p.state === 'FIND_MATEUS' || p.state === 'TALKING_TO_MATEUS';
}

/**
 * When the existing Passive Tree tutorial may guide the player: after the conversation - or, for characters
 * that never had this quest, exactly as before.
 */
export function isPassiveTutorialOpen(p: Quest01Progress): boolean {
  return p.state === 'PASSIVE_TUTORIAL_STARTED' || (p.state === 'NOT_STARTED' && !p.autoStart);
}

/** Stored data -> valid progress. `null` = unusable. A conversation in progress starts over. */
export function sanitizeQuest01(raw: unknown): Quest01Progress | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const d = raw as Partial<Record<keyof Quest01Progress, unknown>>;
  if (!QUEST01_STATES.includes(d.state as Quest01State)) return null;
  const state = d.state === 'TALKING_TO_MATEUS' ? 'FIND_MATEUS' : (d.state as Quest01State);
  return { state, autoStart: d.autoStart === true, rewardClaimed: d.rewardClaimed === true };
}
