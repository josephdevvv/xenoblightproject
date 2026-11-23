import type { SlotRef } from '../inventory/InventorySlots';
import { bagIndexOf, type InventoryState } from '../inventory/InventoryState';
import type { NpcId } from '../npcs/NpcDefinition';
import { pointsSpent, type CharacterStatus } from '../status/StatTypes';

/**
 * Tutorial Quest 02 "Rusty Dagger" - data and pure state rules (no Phaser, no storage), unit-tested.
 *
 *   NOT_STARTED --start--> FIND_MATEUS --talk--> MATEUS_DIALOGUE --grantReward--> DAGGER_GRANTED
 *     --finishDialogue--> EQUIPMENT_TUTORIAL --complete--> COMPLETED (dagger worn: back to Mateus)
 *     --turnIn--> TURN_IN_DIALOGUE --grantExp--> REWARDED --finishTurnIn--> STATUS_TUTORIAL
 *     --statAllocated--> TURNED_IN
 *
 * It starts when Tutorial Quest 01 is over and the Passive Tree tutorial's node is unlocked. Every step is
 * only accepted from the state before it. The dagger itself is protected by its grant id, saved in the same
 * record as the item (InventoryService.grantOnce): whatever happens to the quest state, it is given once.
 * The 100 EXP are paid with the grantExp step, which is only ever accepted once (QuestRewards).
 */
export const TUTORIAL_QUEST_02 = {
  id: 'tutorial_02_rusty_dagger',
  npcId: 'city_guard_01' as NpcId,
  dialogueId: 'mateus_rusty_dagger',
  /** 0-based dialogue step the reward is given BEFORE (clicking on from the second line). */
  rewardBeforeStep: 2,
  reward: { grantId: 'quest:tutorial_02_rusty_dagger', itemId: 'weapon_rusty_dagger', quantity: 1 },
  /** Conversation when the dagger is worn; the EXP are paid BEFORE its second step. */
  turnInDialogueId: 'mateus_rusty_dagger_turn_in',
  expBeforeStep: 1,
} as const;

export const QUEST02_STATES = [
  'NOT_STARTED',
  'FIND_MATEUS',
  'MATEUS_DIALOGUE',
  'DAGGER_GRANTED',
  'EQUIPMENT_TUTORIAL',
  'COMPLETED',
  'TURN_IN_DIALOGUE',
  'REWARDED',
  'STATUS_TUTORIAL',
  'TURNED_IN',
] as const;
export type Quest02State = (typeof QUEST02_STATES)[number];

export interface Quest02Progress {
  state: Quest02State;
  /** STATUS_TUTORIAL: stat points spent when it began - it ends when one more is spent. */
  statPointsSpentAtStart?: number;
}

export type Quest02Event = 'start' | 'talk' | 'cancelTalk' | 'grantReward' | 'finishDialogue' | 'complete' | 'turnIn' | 'cancelTurnIn' | 'grantExp' | 'finishTurnIn' | 'statAllocated';

const TRANSITIONS: Readonly<Record<Quest02Event, { from: Quest02State; to: Quest02State }>> = {
  start: { from: 'NOT_STARTED', to: 'FIND_MATEUS' },
  talk: { from: 'FIND_MATEUS', to: 'MATEUS_DIALOGUE' },
  cancelTalk: { from: 'MATEUS_DIALOGUE', to: 'FIND_MATEUS' },
  grantReward: { from: 'MATEUS_DIALOGUE', to: 'DAGGER_GRANTED' },
  finishDialogue: { from: 'DAGGER_GRANTED', to: 'EQUIPMENT_TUTORIAL' },
  complete: { from: 'EQUIPMENT_TUTORIAL', to: 'COMPLETED' },
  turnIn: { from: 'COMPLETED', to: 'TURN_IN_DIALOGUE' },
  cancelTurnIn: { from: 'TURN_IN_DIALOGUE', to: 'COMPLETED' },
  grantExp: { from: 'TURN_IN_DIALOGUE', to: 'REWARDED' },
  finishTurnIn: { from: 'REWARDED', to: 'STATUS_TUTORIAL' },
  statAllocated: { from: 'STATUS_TUTORIAL', to: 'TURNED_IN' },
};

export function createQuest02(): Quest02Progress {
  return { state: 'NOT_STARTED' };
}

/**
 * Applies an event; returns the new progress, or null when it is not valid now. Never mutates `p`.
 * `spentNow`: stat points the character has spent (recorded when the Status tutorial begins).
 */
export function applyQuest02(p: Quest02Progress, event: Quest02Event, spentNow = 0): Quest02Progress | null {
  const t = TRANSITIONS[event];
  if (p.state !== t.from) return null;
  return t.to === 'STATUS_TUTORIAL' ? { state: t.to, statPointsSpentAtStart: spentNow } : { state: t.to };
}

/** Mateus has something to say about this quest (dotted path, click to talk): until the last line of each conversation. */
export function isQuest02AtMateus(p: Quest02Progress): boolean {
  return ['FIND_MATEUS', 'MATEUS_DIALOGUE', 'DAGGER_GRANTED', 'COMPLETED', 'TURN_IN_DIALOGUE', 'REWARDED'].includes(p.state);
}

/** The objective (dagger worn) is done - also after it was turned in. */
export function isQuest02Completed(p: Quest02Progress): boolean {
  return QUEST02_STATES.indexOf(p.state) >= QUEST02_STATES.indexOf('COMPLETED');
}

/** Turned in, Status tutorial included: nothing of this quest is left. */
export function isQuest02TurnedIn(p: Quest02Progress): boolean {
  return p.state === 'TURNED_IN';
}

/**
 * The Status tutorial is done: a stat point was spent since it began. A character with no point to spend
 * could never finish it, so it ends at once for them (no free points are given).
 */
export function isStatusTutorialDone(p: Quest02Progress, status: CharacterStatus): boolean {
  if (p.state !== 'STATUS_TUTORIAL') return false;
  return pointsSpent(status) > (p.statPointsSpentAtStart ?? pointsSpent(status)) || status.statPoints <= 0;
}

/**
 * Stored data -> progress. A conversation that was cut off starts over while its reward was not given yet;
 * once it was given what follows begins (the conversation never runs a second time). Progress that was lost
 * although the dagger had been given counts as turned in: nothing restarts and nothing is paid again.
 */
export function restoreQuest02(raw: unknown, rewardGiven: boolean, spentNow = 0): Quest02Progress {
  const d = typeof raw === 'object' && raw !== null ? (raw as { state?: unknown; statPointsSpentAtStart?: unknown }) : {};
  const stored = d.state;
  if (!QUEST02_STATES.includes(stored as Quest02State) || stored === 'NOT_STARTED') return { state: rewardGiven ? 'TURNED_IN' : 'NOT_STARTED' };
  switch (stored as Quest02State) {
    case 'COMPLETED':
    case 'TURN_IN_DIALOGUE':
      return { state: 'COMPLETED' };
    case 'REWARDED':
      return { state: 'STATUS_TUTORIAL', statPointsSpentAtStart: spentNow };
    case 'STATUS_TUTORIAL': {
      const start = d.statPointsSpentAtStart;
      const valid = typeof start === 'number' && Number.isInteger(start) && start >= 0 && start <= spentNow;
      return { state: 'STATUS_TUTORIAL', statPointsSpentAtStart: valid ? start : spentNow };
    }
    case 'TURNED_IN':
      return { state: 'TURNED_IN' };
  }
  if (stored === 'DAGGER_GRANTED' || stored === 'EQUIPMENT_TUTORIAL' || rewardGiven) return { state: 'EQUIPMENT_TUTORIAL' };
  return { state: 'FIND_MATEUS' };
}

export type StatusTutorialStep = 'openStatus' | 'chooseStat' | 'confirmStat';

/** What the Status tutorial asks for now - always from what is really open and selected. */
export function statusTutorialStep(p: Quest02Progress, windowOpen: boolean, pointsSelected: boolean): StatusTutorialStep | null {
  if (p.state !== 'STATUS_TUTORIAL') return null;
  if (!windowOpen) return 'openStatus';
  return pointsSelected ? 'confirmStat' : 'chooseStat';
}

/** The dagger is worn. */
export function isDaggerEquipped(inventory: InventoryState | undefined): boolean {
  return inventory?.equipment.weapon?.itemId === TUTORIAL_QUEST_02.reward.itemId;
}

export type EquipmentTutorialStep = 'openInventory' | 'selectItem' | 'equipItem';

/** What the equipment tutorial asks for now - always from what is really open, selected and worn. */
export function equipmentTutorialStep(p: Quest02Progress, inventory: InventoryState | undefined, windowOpen: boolean, selected: SlotRef | null): EquipmentTutorialStep | null {
  if (p.state !== 'EQUIPMENT_TUTORIAL' || isDaggerEquipped(inventory)) return null;
  const index = bagIndexOf(inventory, TUTORIAL_QUEST_02.reward.itemId);
  if (index < 0) return null;
  if (!windowOpen) return 'openInventory';
  return selected?.kind === 'bag' && selected.index === index ? 'equipItem' : 'selectItem';
}
