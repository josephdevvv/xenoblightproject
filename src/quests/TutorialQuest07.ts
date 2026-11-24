import type { NpcId } from '../npcs/NpcDefinition';

/**
 * Tutorial Quest 07 "Reach Level 10" (Roland) - data and pure rules (no Phaser, no storage), unit-tested.
 *
 *   NOT_STARTED --offer--> OFFERED (Dark Avian hunt turned in) --accept--> ACTIVE (the end of Roland's turn-in talk:
 *   80 HP + 50 SP potions, once) - the objective follows the character's level
 *   ACTIVE at Lv 10+ (ready: green check mark, dotted path to Roland) --turnIn--> TURN_IN_DIALOGUE (4 lines)
 *     --reward--> REWARDED (clicking through line 1: 1,000 Gold - this step is taken once, so it pays once)
 *     --complete--> COMPLETED (the last line) - the dotted path then leads to Sonny at the north gate (nothing more
 *   in this build: no Sonny / Jack conversations, no next quest).
 *   A turn-in talk cut off before the reward goes back to ACTIVE; one cut off after it resumes at line 2.
 *
 * While ACTIVE two short tutorials run, one after the other, each finished once (kept in the save file):
 *   1. potion hotkey: Inventory button > the SP potion > ASSIGN HOTKEY (straight onto W) > CLOSE;
 *   2. Auto Combat: its button > monsters, skills, combat, range, recovery (a Roland line each) > START.
 * Their steps come from what is really open / selected / assigned, so a reload or a closed window never softlocks.
 */
export const TUTORIAL_QUEST_07 = {
  id: 'tutorial_07_reach_level_10',
  npcId: 'roland_01' as NpcId,
  targetLevel: 10,
  /** Roland's Lv 10 talk (4 lines); clicking through line 1 (before line 2) pays the Gold. */
  turnInDialogueId: 'roland_level10_done',
  /** Lines 2-4 of it, when it was cut off after the reward. */
  resumeDialogueId: 'roland_level10_done_rest',
  rewardBeforeStep: 1,
  goldReward: 1000,
  /** Where the dotted path leads once the quest is completed: Sonny, the north gate guard. */
  nextNpcId: 'city_guard_sonny' as NpcId,
  /** Lines 2-6 of Roland's turn-in talk, when it was cut off after the reward (the offer still waits). */
  offerDialogueId: 'roland_level10_offer',
  supplies: [
    { grantId: 'quest:tutorial_07_reach_level_10:hp_potions', itemId: 'consumable_red_healing_potion', quantity: 80 },
    { grantId: 'quest:tutorial_07_reach_level_10:sp_potions', itemId: 'consumable_sp_recovery_potion', quantity: 50 },
  ],
  spPotionItemId: 'consumable_sp_recovery_potion',
  /** Roland's line for each information step of the Auto Combat tutorial. */
  autoGuideDialogueIds: {
    monsters: 'roland_auto_monsters',
    skills: 'roland_auto_skills',
    options: 'roland_auto_options',
    range: 'roland_auto_range',
    recovery: 'roland_auto_recovery',
  },
} as const;

export const QUEST07_STATES = ['NOT_STARTED', 'OFFERED', 'ACTIVE', 'TURN_IN_DIALOGUE', 'REWARDED', 'COMPLETED'] as const;
export type Quest07State = (typeof QUEST07_STATES)[number];

export interface Quest07Progress {
  state: Quest07State;
  potionTutorialDone: boolean;
  autoTutorialDone: boolean;
}

export type Quest07Event = 'offer' | 'accept' | 'potionTutorialDone' | 'autoTutorialDone' | 'turnIn' | 'cancelTurnIn' | 'reward' | 'complete';

export function createQuest07(): Quest07Progress {
  return { state: 'NOT_STARTED', potionTutorialDone: false, autoTutorialDone: false };
}

/** Applies an event (level: the character's level, for the turn-in); the new progress, or null when it is not valid now. Never mutates p. */
export function applyQuest07(p: Quest07Progress, event: Quest07Event, level = 0): Quest07Progress | null {
  switch (event) {
    case 'offer':
      return p.state === 'NOT_STARTED' ? { ...p, state: 'OFFERED' } : null;
    case 'accept':
      return p.state === 'OFFERED' ? { ...p, state: 'ACTIVE' } : null;
    case 'potionTutorialDone':
      return p.state === 'ACTIVE' && !p.potionTutorialDone ? { ...p, potionTutorialDone: true } : null;
    case 'autoTutorialDone':
      // the Auto Combat tutorial comes after the potion one
      return p.state === 'ACTIVE' && p.potionTutorialDone && !p.autoTutorialDone ? { ...p, autoTutorialDone: true } : null;
    case 'turnIn':
      return isQuest07Ready(p, level) ? { ...p, state: 'TURN_IN_DIALOGUE' } : null;
    case 'cancelTurnIn':
      return p.state === 'TURN_IN_DIALOGUE' ? { ...p, state: 'ACTIVE' } : null;
    case 'reward':
      return p.state === 'TURN_IN_DIALOGUE' ? { ...p, state: 'REWARDED' } : null;
    case 'complete':
      return p.state === 'REWARDED' ? { ...p, state: 'COMPLETED' } : null;
  }
}

/** Level 10 reached while the quest runs: ready to be turned in to Roland. */
export function isQuest07Ready(p: Quest07Progress, level: number): boolean {
  return p.state === 'ACTIVE' && level >= TUTORIAL_QUEST_07.targetLevel;
}

/** Roland has something to say (dotted path, click to talk): the offer, or the Lv 10 turn-in (and its rest). */
export function isQuest07AtRoland(p: Quest07Progress, level: number): boolean {
  return p.state === 'OFFERED' || p.state === 'TURN_IN_DIALOGUE' || p.state === 'REWARDED' || isQuest07Ready(p, level);
}

/** Completed: the dotted path leads on to Sonny at the north gate. */
export function isQuest07ToSonny(p: Quest07Progress): boolean {
  return p.state === 'COMPLETED';
}

export type PotionHotkeyStep = 'openInventory' | 'selectSp' | 'assign' | 'closeInventory';

export interface PotionHotkeyView {
  /** The bag holds the SP potion. */
  spInBag: boolean;
  /** W already holds the SP potion. */
  wHasSp: boolean;
  inventoryOpen: boolean;
  /** The selected Inventory slot holds the SP potion. */
  spSelected: boolean;
}

/** The potion hotkey tutorial's step now - null = nothing to do (done, or not running). */
export function potionHotkeyStep(p: Quest07Progress, v: PotionHotkeyView): PotionHotkeyStep | null {
  if (p.state !== 'ACTIVE' || p.potionTutorialDone) return null;
  if (v.wHasSp) return v.inventoryOpen ? 'closeInventory' : null;
  if (!v.spInBag) return null; // never a dead end: without the potion there is nothing to teach
  if (!v.inventoryOpen) return 'openInventory';
  return v.spSelected ? 'assign' : 'selectSp';
}

/** The potion hotkey tutorial is over now (to be recorded): running, and no step is left. */
export function potionHotkeyFinished(p: Quest07Progress, v: PotionHotkeyView): boolean {
  return p.state === 'ACTIVE' && !p.potionTutorialDone && potionHotkeyStep(p, v) === null;
}

export const AUTO_INFO_STEPS = ['monsters', 'skills', 'options', 'range', 'recovery'] as const;
export type AutoInfoStep = (typeof AUTO_INFO_STEPS)[number];
export type AutoTutorialStep = 'open' | AutoInfoStep | 'start';

/**
 * The Auto Combat tutorial's step now. `infoIndex`: how many information lines were clicked through (0-5; it lives
 * in memory only - after a reload the lines start again, which never blocks anything). null = not running.
 */
export function autoTutorialStep(p: Quest07Progress, windowOpen: boolean, infoIndex: number): AutoTutorialStep | null {
  if (p.state !== 'ACTIVE' || !p.potionTutorialDone || p.autoTutorialDone) return null;
  if (!windowOpen) return 'open';
  return infoIndex < AUTO_INFO_STEPS.length ? AUTO_INFO_STEPS[Math.max(0, infoIndex)] : 'start';
}

/**
 * Stored data -> valid progress (unknown states start over; the tutorial flags are kept from ACTIVE on). A turn-in
 * talk saved before its reward goes back to ACTIVE (nothing was paid; Roland can be asked again).
 */
export function restoreQuest07(raw: unknown): Quest07Progress {
  if (typeof raw !== 'object' || raw === null) return createQuest07();
  const d = raw as { state?: unknown; potionTutorialDone?: unknown; autoTutorialDone?: unknown };
  if (!QUEST07_STATES.includes(d.state as Quest07State)) return createQuest07();
  const stored = d.state as Quest07State;
  const state: Quest07State = stored === 'TURN_IN_DIALOGUE' ? 'ACTIVE' : stored;
  if (state === 'NOT_STARTED' || state === 'OFFERED') return { state, potionTutorialDone: false, autoTutorialDone: false };
  const potion = d.potionTutorialDone === true;
  return { state, potionTutorialDone: potion, autoTutorialDone: potion && d.autoTutorialDone === true };
}
