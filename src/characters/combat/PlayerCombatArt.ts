// Mohawk Blonde: r2 export (same 4 sheets, + the approved unarmed_punch).
import maleSpikeBlondeDrifter from '../../../public/assets/characters/male/spike_blonde/drifter/combat/male_spike_blonde_drifter_combat_r2.json';
import maleSpikeBlackDrifter from '../../../public/assets/characters/male/spike_black/drifter/combat/male_spike_black_drifter_combat.json';
import maleSpikeSilverDrifter from '../../../public/assets/characters/male/spike_silver/drifter/combat/male_spike_silver_drifter_combat.json';
import maleSpikeBrownDrifter from '../../../public/assets/characters/male/spike_brown/drifter/combat/male_spike_brown_drifter_combat.json';
import maleSpikeRedDrifter from '../../../public/assets/characters/male/spike_red/drifter/combat/male_spike_red_drifter_combat.json';
import femaleStraightBangsBlondeDrifter from '../../../public/assets/characters/female/straight_bangs_blonde/drifter/combat/female_straight_bangs_blonde_drifter_combat.json';
import femaleStraightBangsBlackDrifter from '../../../public/assets/characters/female/straight_bangs_black/drifter/combat/female_straight_bangs_black_drifter_combat.json';
import femaleStraightBangsSilverDrifter from '../../../public/assets/characters/female/straight_bangs_silver/drifter/combat/female_straight_bangs_silver_drifter_combat.json';
import femaleStraightBangsBrownDrifter from '../../../public/assets/characters/female/straight_bangs_brown/drifter/combat/female_straight_bangs_brown_drifter_combat.json';
import femaleStraightBangsRedDrifter from '../../../public/assets/characters/female/straight_bangs_red/drifter/combat/female_straight_bangs_red_drifter_combat.json';
import maleSideSweptBlondeDrifter from '../../../public/assets/characters/male/side_swept_blonde/drifter/combat/male_side_swept_blonde_drifter_combat.json';
import maleSideSweptBlackDrifter from '../../../public/assets/characters/male/side_swept_black/drifter/combat/male_side_swept_black_drifter_combat.json';
import maleSideSweptSilverDrifter from '../../../public/assets/characters/male/side_swept_silver/drifter/combat/male_side_swept_silver_drifter_combat.json';
import maleSideSweptBrownDrifter from '../../../public/assets/characters/male/side_swept_brown/drifter/combat/male_side_swept_brown_drifter_combat.json';
import maleSideSweptRedDrifter from '../../../public/assets/characters/male/side_swept_red/drifter/combat/male_side_swept_red_drifter_combat.json';
import maleMiddlePartBlondeDrifter from '../../../public/assets/characters/male/middle_part_blonde/drifter/combat/male_middle_part_blonde_drifter_combat.json';
import maleMiddlePartBlackDrifter from '../../../public/assets/characters/male/middle_part_black/drifter/combat/male_middle_part_black_drifter_combat.json';
import maleMiddlePartSilverDrifter from '../../../public/assets/characters/male/middle_part_silver/drifter/combat/male_middle_part_silver_drifter_combat.json';
import maleMiddlePartBrownDrifter from '../../../public/assets/characters/male/middle_part_brown/drifter/combat/male_middle_part_brown_drifter_combat.json';
import maleMiddlePartRedDrifter from '../../../public/assets/characters/male/middle_part_red/drifter/combat/male_middle_part_red_drifter_combat.json';
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
/**
 * Optional actions: loaded (sheet + per-facing animations) when the appearance's export has them, never required.
 * unarmed_punch = the Drifter unarmed basic attack; combat_stance = the 1-frame stance (female exports). Neither is used
 * by gameplay yet.
 */
export type PlayerOptionalCombatAction = 'unarmed_punch' | 'combat_stance';
export const PLAYER_OPTIONAL_COMBAT_ACTIONS: readonly PlayerOptionalCombatAction[] = ['unarmed_punch', 'combat_stance'];

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
  /** Optional actions present in this export. */
  optional: Partial<Record<PlayerOptionalCombatAction, PlayerCombatSheet>>;
}

interface CombatExport {
  key: string;
  spriteId: string;
  basePath: string;
  actions: Record<string, { file: string; frameWidth: number; frameHeight: number; frames: number; rows: string[]; frameMs: number; repeat: number; events: Record<string, unknown> }>;
}

function fromExport(e: CombatExport): PlayerCombatSet {
  const actions = {} as Record<PlayerCombatAction, PlayerCombatSheet>;
  const optional: Partial<Record<PlayerOptionalCombatAction, PlayerCombatSheet>> = {};
  for (const action of PLAYER_COMBAT_ACTIONS) {
    const a = e.actions[action];
    if (!a) throw new Error(`${e.key}: combat export has no "${action}"`);
    actions[action] = { file: a.file, frameWidth: a.frameWidth, frameHeight: a.frameHeight, frames: a.frames, rows: a.rows as ActionDirection[], frameMs: a.frameMs, repeat: a.repeat, events: a.events };
  }
  for (const action of PLAYER_OPTIONAL_COMBAT_ACTIONS) {
    const a = e.actions[action];
    if (a) optional[action] = { file: a.file, frameWidth: a.frameWidth, frameHeight: a.frameHeight, frames: a.frames, rows: a.rows as ActionDirection[], frameMs: a.frameMs, repeat: a.repeat, events: a.events };
  }
  return { key: e.key, spriteId: e.spriteId, basePath: e.basePath, actions, optional };
}

/** Combat sets by character sprite id. */
export const PLAYER_COMBAT_SETS: Readonly<Record<string, PlayerCombatSet>> = Object.fromEntries(
  [maleSpikeBlondeDrifter, maleSpikeBlackDrifter, maleSpikeSilverDrifter, maleSpikeBrownDrifter, maleSpikeRedDrifter, femaleStraightBangsBlondeDrifter, femaleStraightBangsBlackDrifter, femaleStraightBangsSilverDrifter, femaleStraightBangsBrownDrifter, femaleStraightBangsRedDrifter, maleSideSweptBlondeDrifter, maleSideSweptBlackDrifter, maleSideSweptSilverDrifter, maleSideSweptBrownDrifter, maleSideSweptRedDrifter, maleMiddlePartBlondeDrifter, maleMiddlePartBlackDrifter, maleMiddlePartSilverDrifter, maleMiddlePartBrownDrifter, maleMiddlePartRedDrifter].map((e) => e as CombatExport).map((e) => [e.spriteId, fromExport(e)]),
);

export function combatSetFor(spriteId: string): PlayerCombatSet | null {
  return PLAYER_COMBAT_SETS[spriteId] ?? null;
}

export const playerCombatSheetKey = (set: PlayerCombatSet, action: PlayerCombatAction | PlayerOptionalCombatAction): string => `player.${set.key}.${action}`;
export const playerCombatAnimKey = (set: PlayerCombatSet, action: PlayerCombatAction | PlayerOptionalCombatAction, facing: ActionDirection): string => `player.${set.key}.${action}.${facing}`;

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
