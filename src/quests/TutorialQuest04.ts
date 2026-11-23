import type { NpcId } from '../npcs/NpcDefinition';

/**
 * Tutorial Quest 04 "Potion Training" (Roland) - data and pure state rules (no Phaser, no storage), unit-tested.
 *
 *   NOT_STARTED --offer--> OFFERED (Void Mite hunt turned in) --talk--> INTRO_DIALOGUE --finishIntro-->
 *   POTION_TUTORIAL --hotkeyAssigned--> HOTKEY_ASSIGNED --finalTalk--> FINAL_DIALOGUE --complete--> COMPLETED
 *
 * POTION_TUTORIAL's steps (open the Inventory, select the potion, the Use explanation, Assign Hotkey, choose a
 * slot) are derived from what is really open and selected (potionTutorialStep); only the end of the Use
 * explanation is recorded. No EXP and no items: completing it starts the Mutant Wolf hunt.
 */
export const TUTORIAL_QUEST_04 = {
  id: 'tutorial_04_potion_training',
  npcId: 'roland_01' as NpcId,
  potionItemId: 'consumable_red_healing_potion',
  introDialogueId: 'roland_potion_intro',
  /** One-line guide dialogues shown while the Inventory steps run. */
  guideDialogueIds: { selectPotion: 'roland_potion_select', explainUse: 'roland_potion_use', assignHotkey: 'roland_potion_hotkey' },
  finalDialogueId: 'roland_wolf_hunt',
  /** 0-based step of the final dialogue that shows the Mutant Wolf picture (its 8th line overall). */
  wolfPreviewStep: 2,
} as const;

export const QUEST04_STATES = ['NOT_STARTED', 'OFFERED', 'INTRO_DIALOGUE', 'POTION_TUTORIAL', 'HOTKEY_ASSIGNED', 'FINAL_DIALOGUE', 'COMPLETED'] as const;
export type Quest04State = (typeof QUEST04_STATES)[number];

export interface Quest04Progress {
  state: Quest04State;
  /** The Use explanation (dialogue 4) was clicked through. */
  useExplained: boolean;
}

export type Quest04Event = 'offer' | 'talk' | 'cancelTalk' | 'finishIntro' | 'explainUse' | 'hotkeyAssigned' | 'finalTalk' | 'cancelFinal' | 'complete';

const TRANSITIONS: Readonly<Record<Exclude<Quest04Event, 'explainUse'>, { from: Quest04State; to: Quest04State }>> = {
  offer: { from: 'NOT_STARTED', to: 'OFFERED' },
  talk: { from: 'OFFERED', to: 'INTRO_DIALOGUE' },
  cancelTalk: { from: 'INTRO_DIALOGUE', to: 'OFFERED' },
  finishIntro: { from: 'INTRO_DIALOGUE', to: 'POTION_TUTORIAL' },
  hotkeyAssigned: { from: 'POTION_TUTORIAL', to: 'HOTKEY_ASSIGNED' },
  finalTalk: { from: 'HOTKEY_ASSIGNED', to: 'FINAL_DIALOGUE' },
  cancelFinal: { from: 'FINAL_DIALOGUE', to: 'HOTKEY_ASSIGNED' },
  complete: { from: 'FINAL_DIALOGUE', to: 'COMPLETED' },
};

export function createQuest04(): Quest04Progress {
  return { state: 'NOT_STARTED', useExplained: false };
}

/** Applies an event; returns the new progress, or null when it is not valid now. Never mutates `p`. */
export function applyQuest04(p: Quest04Progress, event: Quest04Event): Quest04Progress | null {
  if (event === 'explainUse') return p.state === 'POTION_TUTORIAL' && !p.useExplained ? { ...p, useExplained: true } : null;
  // the hotkey only counts after the Use explanation (an assignment made before the tutorial never skips it)
  if (event === 'hotkeyAssigned' && !p.useExplained) return null;
  const t = TRANSITIONS[event];
  return p.state === t.from ? { ...p, state: t.to } : null;
}

/** Roland has something to say about this quest (dotted path, click to talk). */
export function isQuest04AtRoland(p: Quest04Progress): boolean {
  return p.state === 'OFFERED' || p.state === 'INTRO_DIALOGUE' || p.state === 'HOTKEY_ASSIGNED' || p.state === 'FINAL_DIALOGUE';
}

/** Using items is not allowed while the Inventory steps run (dialogue 4 only explains Use). */
export function isItemUseBlocked(p: Quest04Progress): boolean {
  return p.state === 'POTION_TUTORIAL';
}

export type PotionTutorialStep = 'openInventory' | 'selectPotion' | 'explainUse' | 'assignHotkey' | 'chooseSlot';

export interface PotionTutorialView {
  inventoryOpen: boolean;
  /** The selected Inventory slot holds the potion. */
  potionSelected: boolean;
  /** The hotkey assignment window is open. */
  assignOpen: boolean;
  /** The bag holds a potion. */
  hasPotion: boolean;
}

/** What the potion tutorial asks for now - always from what is really open and selected. */
export function potionTutorialStep(p: Quest04Progress, v: PotionTutorialView): PotionTutorialStep | null {
  if (p.state !== 'POTION_TUTORIAL' || !v.hasPotion) return null;
  if (!v.inventoryOpen) return 'openInventory';
  if (!v.potionSelected) return v.assignOpen ? null : 'selectPotion';
  if (!p.useExplained) return 'explainUse';
  return v.assignOpen ? 'chooseSlot' : 'assignHotkey';
}

/** Stored data -> valid progress. A conversation that was cut off starts over. */
export function restoreQuest04(raw: unknown): Quest04Progress {
  if (typeof raw !== 'object' || raw === null) return createQuest04();
  const d = raw as { state?: unknown; useExplained?: unknown };
  if (!QUEST04_STATES.includes(d.state as Quest04State)) return createQuest04();
  const stored = d.state as Quest04State;
  const state: Quest04State = stored === 'INTRO_DIALOGUE' ? 'OFFERED' : stored === 'FINAL_DIALOGUE' ? 'HOTKEY_ASSIGNED' : stored;
  const useExplained = state === 'HOTKEY_ASSIGNED' || state === 'COMPLETED' || (state === 'POTION_TUTORIAL' && d.useExplained === true);
  return { state, useExplained };
}
