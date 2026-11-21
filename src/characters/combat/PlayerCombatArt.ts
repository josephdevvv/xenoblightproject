import maleSpikeBlondeDrifter from '../../../public/assets/characters/male/spike_blonde/drifter/combat/male_spike_blonde_drifter_combat.json';
import impactVfx from '../../../public/assets/vfx/player/combat/impact.json';
import type { ActionDirection } from '../../core/Direction';

/**
 * Player combat sprite sheets and the shared player VFX, read from the Sprite Forge exports in
 * public/assets (game-combat-export@1 / game-vfx-export@1) - frame size, frame count, timing, loop, row
 * order and anchors come from that metadata, never assumed. The PNGs and JSON are approved exports: never
 * edited here (re-export from the forge).
 *
 * Only appearances with exported combat art are listed; every other appearance keeps the static / walk
 * visuals (combat still works - the timing of a hit never depends on the art, see PlayerAttacks).
 */

export type PlayerCombatAction = 'combat_idle' | 'dagger_thrust' | 'self_heal_cast' | 'hit_reaction';
export const PLAYER_COMBAT_ACTIONS: readonly PlayerCombatAction[] = ['combat_idle', 'dagger_thrust', 'self_heal_cast', 'hit_reaction'];

export interface PlayerCombatSheet {
  file: string;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  /** Sheet rows = facings, in this order. */
  rows: ActionDirection[];
  frameMs: number;
  /** -1 loop, 0 play once. */
  repeat: number;
  events: Record<string, unknown>;
}

export interface PlayerCombatSet {
  /** Export key (texture key prefix). */
  key: string;
  /** Character sprite id (same as the static / walk entry). */
  spriteId: string;
  /** Folder under /public. */
  basePath: string;
  actions: Record<PlayerCombatAction, PlayerCombatSheet>;
}

interface CombatExport {
  key: string;
  spriteId: string;
  basePath: string;
  actions: Record<string, { file: string; frameWidth: number; frameHeight: number; frames: number; rows: string[]; frameMs: number; repeat: number; events: Record<string, unknown> }>;
}

function fromExport(e: CombatExport): PlayerCombatSet {
  const actions = {} as Record<PlayerCombatAction, PlayerCombatSheet>;
  for (const action of PLAYER_COMBAT_ACTIONS) {
    const a = e.actions[action];
    if (!a) throw new Error(`${e.key}: combat export has no "${action}"`);
    actions[action] = { file: a.file, frameWidth: a.frameWidth, frameHeight: a.frameHeight, frames: a.frames, rows: a.rows as ActionDirection[], frameMs: a.frameMs, repeat: a.repeat, events: a.events };
  }
  return { key: e.key, spriteId: e.spriteId, basePath: e.basePath, actions };
}

/** Combat sets by character sprite id. */
export const PLAYER_COMBAT_SETS: Readonly<Record<string, PlayerCombatSet>> = Object.fromEntries(
  [maleSpikeBlondeDrifter as CombatExport].map((e) => [e.spriteId, fromExport(e)]),
);

export function combatSetFor(spriteId: string): PlayerCombatSet | null {
  return PLAYER_COMBAT_SETS[spriteId] ?? null;
}

export const playerCombatSheetKey = (set: PlayerCombatSet, action: PlayerCombatAction): string => `player.${set.key}.${action}`;
export const playerCombatAnimKey = (set: PlayerCombatSet, action: PlayerCombatAction, facing: ActionDirection): string => `player.${set.key}.${action}.${facing}`;

/** The shared grayscale on-hit VFX (Sprite Forge VFX library), as exported. */
export const PLAYER_IMPACT_VFX = {
  key: 'vfx.player.impact',
  animKey: 'vfx.player.impact.play',
  url: impactVfx.basePath + impactVfx.file,
  frameWidth: impactVfx.frameWidth,
  frameHeight: impactVfx.frameHeight,
  frames: impactVfx.frameCount,
  frameDurationsMs: impactVfx.timing.frameDurationsMs as readonly number[],
  loop: impactVfx.loop,
  /** Anchor = frame centre (the target's hit point). */
  origin: { x: impactVfx.anchor.originX, y: impactVfx.anchor.originY },
  scales: impactVfx.usage.scales,
} as const;
