import type { NpcId } from '../npcs/NpcDefinition';
import type { DialogueId } from './Dialogues';

/**
 * The two gate guards at Dawnkeep (data, pure, unit-tested). Both ask the same question with the same two answers;
 * the answer picks the rest of the talk. Only Sonny's "Roland sent me" branch does something: it opens the portal
 * (once - PortalService). Jack is flavour only: never a quest, never a reward.
 */
export const GATE_ANSWERS = ['dialogueChoices.fromRoland', 'dialogueChoices.justWalking'] as const;

export interface GateTalk {
  npcId: NpcId;
  /** Lines up to and including the question. */
  intro: DialogueId;
  /** The step (0-based) of `intro` that asks the question. */
  questionStep: number;
  /** The rest of the talk for each answer (same order as GATE_ANSWERS). */
  branches: readonly [DialogueId, DialogueId];
  /** Answer index whose talk opens the portal when it ends; null = none. */
  opensPortalOn: number | null;
}

export const GATE_TALKS: Readonly<Record<'sonny' | 'jack', GateTalk>> = {
  sonny: { npcId: 'city_guard_sonny', intro: 'sonny_gate', questionStep: 1, branches: ['sonny_from_roland', 'sonny_just_walking'], opensPortalOn: 0 },
  jack: { npcId: 'city_guard_jack', intro: 'jack_gate', questionStep: 0, branches: ['jack_from_roland', 'jack_just_walking'], opensPortalOn: null },
};

/** The gate talk of an NPC (always talkable, whatever the quests say), or null. */
export function gateTalkOf(npcId: string): GateTalk | null {
  return Object.values(GATE_TALKS).find((g) => g.npcId === npcId) ?? null;
}
