import type { CharacterData } from '../data/CharacterData';
import type { Quest01State } from '../quests/TutorialQuest01';
import type { Quest03State } from '../quests/TutorialQuest03';
import type { Quest04State } from '../quests/TutorialQuest04';

/**
 * One-time tutorial hints (banners that teach a control) - pure rules + the one place that records them, unit-tested.
 * A finished hint is kept in the save file ("hints", optional when reading) and never shown again.
 */
export const TUTORIAL_HINTS = ['click_to_move', 'navigate_to_roland'] as const;
export type TutorialHintId = (typeof TUTORIAL_HINTS)[number];

type Listener = (character: CharacterData, hint: TutorialHintId) => void;
const listeners = new Set<Listener>();

export function isHintId(v: unknown): v is TutorialHintId {
  return typeof v === 'string' && (TUTORIAL_HINTS as readonly string[]).includes(v);
}

/** Stored data -> the finished hints this build knows (unknown or repeated entries dropped). */
export function sanitizeHints(raw: unknown): { state: TutorialHintId[]; dropped: string[] } {
  if (raw === undefined || raw === null) return { state: [], dropped: [] };
  if (!Array.isArray(raw)) return { state: [], dropped: ['hints'] };
  const state = [...new Set(raw.filter(isHintId))];
  return { state, dropped: state.length === raw.length ? [] : ['hints'] };
}

/**
 * "Left-click to move and talk to NPCs": from the first entry into the world until Mateus's first conversation
 * begins (Tutorial Quest 01 still looking for him), once.
 */
export function showClickToMoveHint(quest01: Quest01State, done: boolean): boolean {
  return !done && (quest01 === 'NOT_STARTED' || quest01 === 'FIND_MATEUS');
}

/**
 * "Navigate" tutorial: Mateus's last quest (the Void Mite hunt) is turned in and Roland now offers the potion
 * training - the spotlight points at the quest tracker's Navigate button until it is clicked once.
 */
export function showNavigateHint(quest03: Quest03State, quest04: Quest04State, done: boolean): boolean {
  return !done && quest03 === 'COMPLETED' && quest04 === 'OFFERED';
}

export const HintService = {
  isDone(character: CharacterData, hint: TutorialHintId): boolean {
    return character.hints?.includes(hint) ?? false;
  },

  /** Records a hint as finished (once). True when it was new. */
  complete(character: CharacterData, hint: TutorialHintId): boolean {
    if (this.isDone(character, hint)) return false;
    character.hints = [...(character.hints ?? []), hint];
    for (const l of listeners) l(character, hint);
    return true;
  },

  onComplete(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
