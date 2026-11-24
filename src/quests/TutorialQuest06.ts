import type { MonsterId } from '../monsters/MonsterDefinition';
import type { NpcId } from '../npcs/NpcDefinition';

/**
 * Tutorial Quest 06 "Dark Avian Hunt" (Roland) - data and pure state rules (no Phaser, no storage), unit-tested.
 *
 *   NOT_STARTED --offer--> OFFERED (Mutant Wolf hunt turned in) --talk--> INTRO_DIALOGUE (lines 1-10)
 *   --scrollGiven--> SCROLL_TUTORIAL (lines 11-13: learn Power Thrust, open Skills, put it on the hotbar)
 *   --skillAssigned--> SKILL_ASSIGNED --finalTalk--> FINAL_DIALOGUE (line 14) --startHunt--> HUNTING
 *   --kill x10--> READY_TO_TURN_IN --turnIn--> TURN_IN_DIALOGUE (6 lines; clicking through line 1 pays 150 EXP + the
 *   Heal Skill Scroll, once) --complete--> COMPLETED (which offers Quest 07; its acceptance ends the same talk)
 *
 * The Power Thrust scroll is given once by its grant id when line 10 is clicked through. SCROLL_TUTORIAL's
 * steps come from what is really open, selected and learned (scrollTutorialStep).
 */
export const TUTORIAL_QUEST_06 = {
  id: 'tutorial_06_dark_avian_hunt',
  npcId: 'roland_01' as NpcId,
  introDialogueId: 'roland_avian_intro',
  /** 0-based step of the intro that shows the Dark Avian (line 9). */
  previewStep: 8,
  guideDialogueIds: { learn: 'roland_avian_scroll', openSkills: 'roland_avian_skills', assign: 'roland_avian_hotkey' },
  finalDialogueId: 'roland_avian_go',
  turnInDialogueId: 'roland_avian_done',
  /** Paid with the 150 EXP when line 1 of the turn-in talk is clicked through. */
  healScroll: { grantId: 'quest:tutorial_06_dark_avian_hunt:heal_scroll', itemId: 'scroll_heal', quantity: 1 },
  reward: { grantId: 'quest:tutorial_06_dark_avian_hunt', itemId: 'scroll_power_thrust', quantity: 1 },
  skillId: 'drifter_lv1',
  target: { monsterId: 'dark_avian' as MonsterId, count: 10 },
} as const;

export const QUEST06_STATES = ['NOT_STARTED', 'OFFERED', 'INTRO_DIALOGUE', 'SCROLL_TUTORIAL', 'SKILL_ASSIGNED', 'FINAL_DIALOGUE', 'HUNTING', 'READY_TO_TURN_IN', 'TURN_IN_DIALOGUE', 'COMPLETED'] as const;
export type Quest06State = (typeof QUEST06_STATES)[number];

export interface Quest06Progress {
  state: Quest06State;
  /** Dark Avians defeated since the hunt started (0 to the target). */
  kills: number;
}

export type Quest06Event = 'offer' | 'talk' | 'cancelTalk' | 'scrollGiven' | 'skillAssigned' | 'finalTalk' | 'cancelFinal' | 'startHunt' | 'kill' | 'turnIn' | 'cancelTurnIn' | 'complete';

const TRANSITIONS: Readonly<Record<Exclude<Quest06Event, 'kill'>, { from: Quest06State; to: Quest06State }>> = {
  offer: { from: 'NOT_STARTED', to: 'OFFERED' },
  talk: { from: 'OFFERED', to: 'INTRO_DIALOGUE' },
  cancelTalk: { from: 'INTRO_DIALOGUE', to: 'OFFERED' },
  scrollGiven: { from: 'INTRO_DIALOGUE', to: 'SCROLL_TUTORIAL' },
  skillAssigned: { from: 'SCROLL_TUTORIAL', to: 'SKILL_ASSIGNED' },
  finalTalk: { from: 'SKILL_ASSIGNED', to: 'FINAL_DIALOGUE' },
  cancelFinal: { from: 'FINAL_DIALOGUE', to: 'SKILL_ASSIGNED' },
  startHunt: { from: 'FINAL_DIALOGUE', to: 'HUNTING' },
  turnIn: { from: 'READY_TO_TURN_IN', to: 'TURN_IN_DIALOGUE' },
  cancelTurnIn: { from: 'TURN_IN_DIALOGUE', to: 'READY_TO_TURN_IN' },
  complete: { from: 'TURN_IN_DIALOGUE', to: 'COMPLETED' },
};

const TARGET = TUTORIAL_QUEST_06.target.count;

export function createQuest06(): Quest06Progress {
  return { state: 'NOT_STARTED', kills: 0 };
}

/** Applies an event; returns the new progress, or null when it is not valid now. Never mutates `p`. */
export function applyQuest06(p: Quest06Progress, event: Quest06Event): Quest06Progress | null {
  if (event === 'kill') {
    if (p.state !== 'HUNTING') return null;
    const kills = Math.min(TARGET, p.kills + 1);
    return { state: kills >= TARGET ? 'READY_TO_TURN_IN' : 'HUNTING', kills };
  }
  const t = TRANSITIONS[event];
  if (p.state !== t.from) return null;
  return { state: t.to, kills: event === 'startHunt' ? 0 : p.kills };
}

/** Roland has something to say about this quest (dotted path, click to talk / turn in). */
export function isQuest06AtRoland(p: Quest06Progress): boolean {
  return ['OFFERED', 'INTRO_DIALOGUE', 'SKILL_ASSIGNED', 'FINAL_DIALOGUE', 'READY_TO_TURN_IN', 'TURN_IN_DIALOGUE'].includes(p.state);
}

export function isQuest06Tracking(p: Quest06Progress): boolean {
  return p.state === 'HUNTING' || p.state === 'READY_TO_TURN_IN' || p.state === 'TURN_IN_DIALOGUE';
}

export type ScrollTutorialStep = 'openInventory' | 'selectScroll' | 'useScroll' | 'openSkills' | 'selectSkill' | 'assignSkill' | 'chooseSlot';

export interface ScrollTutorialView {
  /** Power Thrust is learned. */
  learned: boolean;
  /** The bag holds the scroll. */
  hasScroll: boolean;
  inventoryOpen: boolean;
  /** The selected Inventory slot holds the scroll. */
  scrollSelected: boolean;
  skillsOpen: boolean;
  /** Power Thrust is selected in the Skill window. */
  skillSelected: boolean;
  assignOpen: boolean;
}

/** What the scroll tutorial asks for now - always from what is really open, selected and learned. */
export function scrollTutorialStep(p: Quest06Progress, v: ScrollTutorialView): ScrollTutorialStep | null {
  if (p.state !== 'SCROLL_TUTORIAL') return null;
  if (!v.learned) {
    if (!v.hasScroll) return null; // never a dead end
    if (!v.inventoryOpen) return 'openInventory';
    return v.scrollSelected ? 'useScroll' : 'selectScroll';
  }
  if (!v.skillsOpen) return v.assignOpen ? null : 'openSkills';
  if (v.assignOpen) return 'chooseSlot';
  return v.skillSelected ? 'assignSkill' : 'selectSkill';
}

/** Roland's guide line for a step (dialogue 11, 12 or 13). */
export function scrollGuideOf(step: ScrollTutorialStep): keyof typeof TUTORIAL_QUEST_06.guideDialogueIds {
  if (step === 'openInventory' || step === 'selectScroll' || step === 'useScroll') return 'learn';
  return step === 'openSkills' ? 'openSkills' : 'assign';
}

/**
 * Stored data -> valid progress. A conversation that was cut off starts over while the scroll was not given;
 * once it was, the tutorial goes on. The counter is clamped to 0..10; 10 kills mean "return to Roland".
 */
export function restoreQuest06(raw: unknown, scrollGiven: boolean): Quest06Progress {
  if (typeof raw !== 'object' || raw === null) return createQuest06();
  const d = raw as { state?: unknown; kills?: unknown };
  if (!QUEST06_STATES.includes(d.state as Quest06State)) return createQuest06();
  const kills = typeof d.kills === 'number' && Number.isFinite(d.kills) ? Math.min(TARGET, Math.max(0, Math.floor(d.kills))) : 0;
  switch (d.state as Quest06State) {
    case 'INTRO_DIALOGUE':
      return { state: scrollGiven ? 'SCROLL_TUTORIAL' : 'OFFERED', kills: 0 };
    case 'FINAL_DIALOGUE':
      return { state: 'SKILL_ASSIGNED', kills: 0 };
    case 'HUNTING':
      return kills >= TARGET ? { state: 'READY_TO_TURN_IN', kills: TARGET } : { state: 'HUNTING', kills };
    case 'TURN_IN_DIALOGUE':
      // a turn-in talk cut off before its reward: it waits to be turned in again
      return { state: 'READY_TO_TURN_IN', kills: TARGET };
    case 'READY_TO_TURN_IN':
    case 'COMPLETED':
      return { state: d.state as Quest06State, kills: TARGET };
    default:
      return { state: d.state as Quest06State, kills: 0 };
  }
}
