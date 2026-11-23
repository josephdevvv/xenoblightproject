import type { MonsterId } from '../monsters/MonsterDefinition';
import type { NpcId } from '../npcs/NpcDefinition';

/**
 * Tutorial Quest 03 "Void Mite Hunt" - data and pure state rules (no Phaser, no storage), unit-tested.
 *
 *   NOT_STARTED --offer--> OFFERED --talk--> ACCEPT_DIALOGUE --accept--> HUNTING
 *     --kill x5--> READY_TO_TURN_IN --turnIn--> TURN_IN_DIALOGUE --complete--> COMPLETED
 *
 * Offered when Tutorial Quest 02 is turned in (Status tutorial done). Only kills made while HUNTING count,
 * one per kill credit, capped at the target. The 200 EXP are paid with the `complete` step - a step that is
 * only ever accepted once (QuestRewards).
 */
export const TUTORIAL_QUEST_03 = {
  id: 'tutorial_03_void_mite_hunt',
  npcId: 'city_guard_01' as NpcId,
  acceptDialogueId: 'mateus_void_mite_hunt',
  completeDialogueId: 'mateus_void_mite_hunt_done',
  /** 0-based step of the accept dialogue that shows the Void Mite picture. */
  previewStep: 0,
  target: { monsterId: 'voidmite' as MonsterId, count: 5 },
} as const;

export const QUEST03_STATES = ['NOT_STARTED', 'OFFERED', 'ACCEPT_DIALOGUE', 'HUNTING', 'READY_TO_TURN_IN', 'TURN_IN_DIALOGUE', 'COMPLETED'] as const;
export type Quest03State = (typeof QUEST03_STATES)[number];

export interface Quest03Progress {
  state: Quest03State;
  /** Void Mites defeated since the quest was accepted (0 to the target). */
  kills: number;
}

export type Quest03Event = 'offer' | 'talk' | 'cancelTalk' | 'accept' | 'kill' | 'turnIn' | 'cancelTurnIn' | 'complete';

const TRANSITIONS: Readonly<Record<Exclude<Quest03Event, 'kill'>, { from: Quest03State; to: Quest03State }>> = {
  offer: { from: 'NOT_STARTED', to: 'OFFERED' },
  talk: { from: 'OFFERED', to: 'ACCEPT_DIALOGUE' },
  cancelTalk: { from: 'ACCEPT_DIALOGUE', to: 'OFFERED' },
  accept: { from: 'ACCEPT_DIALOGUE', to: 'HUNTING' },
  turnIn: { from: 'READY_TO_TURN_IN', to: 'TURN_IN_DIALOGUE' },
  cancelTurnIn: { from: 'TURN_IN_DIALOGUE', to: 'READY_TO_TURN_IN' },
  complete: { from: 'TURN_IN_DIALOGUE', to: 'COMPLETED' },
};

const TARGET = TUTORIAL_QUEST_03.target.count;

export function createQuest03(): Quest03Progress {
  return { state: 'NOT_STARTED', kills: 0 };
}

/** Applies an event; returns the new progress, or null when it is not valid now. Never mutates `p`. */
export function applyQuest03(p: Quest03Progress, event: Quest03Event): Quest03Progress | null {
  if (event === 'kill') {
    if (p.state !== 'HUNTING') return null;
    const kills = Math.min(TARGET, p.kills + 1);
    return { state: kills >= TARGET ? 'READY_TO_TURN_IN' : 'HUNTING', kills };
  }
  const t = TRANSITIONS[event];
  if (p.state !== t.from) return null;
  return { state: t.to, kills: event === 'accept' ? 0 : p.kills };
}

/** Mateus has something to say about this quest (dotted path, click to talk). */
export function isQuest03AtMateus(p: Quest03Progress): boolean {
  return p.state === 'OFFERED' || p.state === 'ACCEPT_DIALOGUE' || p.state === 'READY_TO_TURN_IN' || p.state === 'TURN_IN_DIALOGUE';
}

/** The kill counter is shown (accepted, not turned in yet). */
export function isQuest03Tracking(p: Quest03Progress): boolean {
  return p.state === 'HUNTING' || p.state === 'READY_TO_TURN_IN' || p.state === 'TURN_IN_DIALOGUE';
}

/**
 * Stored data -> valid progress. A conversation that was cut off starts over (nothing is paid before its
 * end); the counter is clamped to 0..5, and 5 kills always mean "return to Mateus".
 */
export function restoreQuest03(raw: unknown): Quest03Progress {
  if (typeof raw !== 'object' || raw === null) return createQuest03();
  const d = raw as { state?: unknown; kills?: unknown };
  if (!QUEST03_STATES.includes(d.state as Quest03State)) return createQuest03();
  const stored = d.state as Quest03State;
  const kills = typeof d.kills === 'number' && Number.isFinite(d.kills) ? Math.min(TARGET, Math.max(0, Math.floor(d.kills))) : 0;
  switch (stored) {
    case 'NOT_STARTED':
    case 'OFFERED':
      return { state: stored, kills: 0 };
    case 'ACCEPT_DIALOGUE':
      return { state: 'OFFERED', kills: 0 };
    case 'HUNTING':
      return kills >= TARGET ? { state: 'READY_TO_TURN_IN', kills: TARGET } : { state: 'HUNTING', kills };
    case 'READY_TO_TURN_IN':
    case 'TURN_IN_DIALOGUE':
      return { state: 'READY_TO_TURN_IN', kills: TARGET };
    case 'COMPLETED':
      return { state: 'COMPLETED', kills: TARGET };
  }
}
