import type { MonsterId } from '../monsters/MonsterDefinition';
import type { NpcId } from '../npcs/NpcDefinition';

/**
 * Tutorial Quest 05 "Mutant Wolf Hunt" (Roland) - data and pure state rules (no Phaser, no storage), unit-tested.
 *
 *   NOT_STARTED --start--> HUNTING (potion training completed) --kill x5--> READY_TO_TURN_IN
 *     --turnIn--> TURN_IN_DIALOGUE --complete--> COMPLETED
 *
 * Only kills made while HUNTING count, one per kill credit, capped at the target. The 150 EXP are paid with
 * the `complete` step, which is only ever accepted once (QuestRewards).
 */
export const TUTORIAL_QUEST_05 = {
  id: 'tutorial_05_mutant_wolf_hunt',
  npcId: 'roland_01' as NpcId,
  completeDialogueId: 'roland_wolf_hunt_done',
  target: { monsterId: 'mutant_wolf' as MonsterId, count: 5 },
} as const;

export const QUEST05_STATES = ['NOT_STARTED', 'HUNTING', 'READY_TO_TURN_IN', 'TURN_IN_DIALOGUE', 'COMPLETED'] as const;
export type Quest05State = (typeof QUEST05_STATES)[number];

export interface Quest05Progress {
  state: Quest05State;
  /** Mutant Wolves defeated since the quest started (0 to the target). */
  kills: number;
}

export type Quest05Event = 'start' | 'kill' | 'turnIn' | 'cancelTurnIn' | 'complete';

const TRANSITIONS: Readonly<Record<Exclude<Quest05Event, 'kill'>, { from: Quest05State; to: Quest05State }>> = {
  start: { from: 'NOT_STARTED', to: 'HUNTING' },
  turnIn: { from: 'READY_TO_TURN_IN', to: 'TURN_IN_DIALOGUE' },
  cancelTurnIn: { from: 'TURN_IN_DIALOGUE', to: 'READY_TO_TURN_IN' },
  complete: { from: 'TURN_IN_DIALOGUE', to: 'COMPLETED' },
};

const TARGET = TUTORIAL_QUEST_05.target.count;

export function createQuest05(): Quest05Progress {
  return { state: 'NOT_STARTED', kills: 0 };
}

/** Applies an event; returns the new progress, or null when it is not valid now. Never mutates `p`. */
export function applyQuest05(p: Quest05Progress, event: Quest05Event): Quest05Progress | null {
  if (event === 'kill') {
    if (p.state !== 'HUNTING') return null;
    const kills = Math.min(TARGET, p.kills + 1);
    return { state: kills >= TARGET ? 'READY_TO_TURN_IN' : 'HUNTING', kills };
  }
  const t = TRANSITIONS[event];
  if (p.state !== t.from) return null;
  return { state: t.to, kills: event === 'start' ? 0 : p.kills };
}

/** Roland is waiting for the turn-in (dotted path, click to talk). */
export function isQuest05AtRoland(p: Quest05Progress): boolean {
  return p.state === 'READY_TO_TURN_IN' || p.state === 'TURN_IN_DIALOGUE';
}

/** The kill counter is shown. */
export function isQuest05Tracking(p: Quest05Progress): boolean {
  return p.state === 'HUNTING' || p.state === 'READY_TO_TURN_IN' || p.state === 'TURN_IN_DIALOGUE';
}

/** Stored data -> valid progress; the counter is clamped to 0..5 and 5 kills always mean "return to Roland". */
export function restoreQuest05(raw: unknown): Quest05Progress {
  if (typeof raw !== 'object' || raw === null) return createQuest05();
  const d = raw as { state?: unknown; kills?: unknown };
  if (!QUEST05_STATES.includes(d.state as Quest05State)) return createQuest05();
  const kills = typeof d.kills === 'number' && Number.isFinite(d.kills) ? Math.min(TARGET, Math.max(0, Math.floor(d.kills))) : 0;
  switch (d.state as Quest05State) {
    case 'NOT_STARTED':
      return createQuest05();
    case 'HUNTING':
      return kills >= TARGET ? { state: 'READY_TO_TURN_IN', kills: TARGET } : { state: 'HUNTING', kills };
    case 'READY_TO_TURN_IN':
    case 'TURN_IN_DIALOGUE':
      return { state: 'READY_TO_TURN_IN', kills: TARGET };
    case 'COMPLETED':
      return { state: 'COMPLETED', kills: TARGET };
  }
}
