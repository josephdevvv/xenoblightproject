import type { SlotRef } from '../inventory/InventorySlots';
import { bagIndexOf, type InventoryState } from '../inventory/InventoryState';
import type { NpcId } from '../npcs/NpcDefinition';

/**
 * Tutorial Quest 02 "Rusty Dagger" - data and pure state rules (no Phaser, no storage), unit-tested.
 *
 *   NOT_STARTED --start--> FIND_MATEUS --talk--> MATEUS_DIALOGUE --grantReward--> DAGGER_GRANTED
 *     --finishDialogue--> EQUIPMENT_TUTORIAL --complete--> COMPLETED
 *
 * It starts when Tutorial Quest 01 is over and the Passive Tree tutorial's node is unlocked. Every step is
 * only accepted from the state before it. The dagger itself is protected by its grant id, saved in the same
 * record as the item (InventoryService.grantOnce): whatever happens to the quest state, it is given once.
 * No EXP.
 */
export const TUTORIAL_QUEST_02 = {
  id: 'tutorial_02_rusty_dagger',
  npcId: 'city_guard_01' as NpcId,
  dialogueId: 'mateus_rusty_dagger',
  /** 0-based dialogue step the reward is given BEFORE (clicking on from the second line). */
  rewardBeforeStep: 2,
  reward: { grantId: 'quest:tutorial_02_rusty_dagger', itemId: 'weapon_rusty_dagger', quantity: 1 },
} as const;

export const QUEST02_STATES = ['NOT_STARTED', 'FIND_MATEUS', 'MATEUS_DIALOGUE', 'DAGGER_GRANTED', 'EQUIPMENT_TUTORIAL', 'COMPLETED'] as const;
export type Quest02State = (typeof QUEST02_STATES)[number];

export interface Quest02Progress {
  state: Quest02State;
}

export type Quest02Event = 'start' | 'talk' | 'cancelTalk' | 'grantReward' | 'finishDialogue' | 'complete';

const TRANSITIONS: Readonly<Record<Quest02Event, { from: Quest02State; to: Quest02State }>> = {
  start: { from: 'NOT_STARTED', to: 'FIND_MATEUS' },
  talk: { from: 'FIND_MATEUS', to: 'MATEUS_DIALOGUE' },
  cancelTalk: { from: 'MATEUS_DIALOGUE', to: 'FIND_MATEUS' },
  grantReward: { from: 'MATEUS_DIALOGUE', to: 'DAGGER_GRANTED' },
  finishDialogue: { from: 'DAGGER_GRANTED', to: 'EQUIPMENT_TUTORIAL' },
  complete: { from: 'EQUIPMENT_TUTORIAL', to: 'COMPLETED' },
};

export function createQuest02(): Quest02Progress {
  return { state: 'NOT_STARTED' };
}

/** Applies an event; returns the new progress, or null when it is not valid now. Never mutates `p`. */
export function applyQuest02(p: Quest02Progress, event: Quest02Event): Quest02Progress | null {
  const t = TRANSITIONS[event];
  return p.state === t.from ? { ...p, state: t.to } : null;
}

/** The player is sent to Mateus (dotted path): until the last line of the conversation. */
export function isQuest02AtMateus(p: Quest02Progress): boolean {
  return p.state === 'FIND_MATEUS' || p.state === 'MATEUS_DIALOGUE' || p.state === 'DAGGER_GRANTED';
}

export function isQuest02Completed(p: Quest02Progress): boolean {
  return p.state === 'COMPLETED';
}

/**
 * Stored data -> progress. A conversation that was cut off starts over while the dagger was not given yet;
 * once it was given the equipment tutorial follows (the conversation never runs a second time). Progress
 * that was lost although the dagger had been given counts as completed: nothing restarts.
 */
export function restoreQuest02(raw: unknown, rewardGiven: boolean): Quest02Progress {
  const stored = typeof raw === 'object' && raw !== null ? (raw as { state?: unknown }).state : undefined;
  if (!QUEST02_STATES.includes(stored as Quest02State) || stored === 'NOT_STARTED') return { state: rewardGiven ? 'COMPLETED' : 'NOT_STARTED' };
  if (stored === 'COMPLETED') return { state: 'COMPLETED' };
  if (stored === 'DAGGER_GRANTED' || stored === 'EQUIPMENT_TUTORIAL' || rewardGiven) return { state: 'EQUIPMENT_TUTORIAL' };
  return { state: 'FIND_MATEUS' };
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
