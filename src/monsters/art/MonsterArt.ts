import { ATTACK_IMPACT_FRAME } from '../../combat/AttackTiming';
import mutantWolf from './mutant_wolf.generated.json';
import voidMite from './void_mite.generated.json';

/**
 * Monster sprite sets from the delivered packs (art-source/monsters/<id>/), imported by
 * tools/import-monster-packs.mjs into one sheet per action (rows SE, SW, NE, NW) plus generated metadata:
 * frame sizes and counts, ground anchors per direction (measured from the art) and the attack VFX offset.
 * Timing and the frames that matter for combat (contact, red hit flash) are design data and live here.
 *
 * Visual only: nothing here is stats, AI or combat.
 */

/** The four isometric facings every monster sheet provides (row order of the imported sheets). */
export type MonsterFacing = 'SE' | 'SW' | 'NE' | 'NW';
export const MONSTER_FACINGS: readonly MonsterFacing[] = ['SE', 'SW', 'NE', 'NW'];

export type MonsterAction = 'idle' | 'walk' | 'attack' | 'hit' | 'death';
export const MONSTER_ACTIONS: readonly MonsterAction[] = ['idle', 'walk', 'attack', 'hit', 'death'];

export interface MonsterSheetMeta {
  file: string;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  /** Ground contact point (feet / root) inside a frame, per facing. */
  anchors: Record<MonsterFacing, { x: number; y: number }>;
}

export interface MonsterArtMeta {
  id: string;
  name: string;
  rows: MonsterFacing[];
  actions: Record<MonsterAction, MonsterSheetMeta>;
  vfx: {
    file: string;
    frameWidth: number;
    frameHeight: number;
    frames: number;
    /** Measured by the import (kept in the generated metadata; not used at runtime any more). */
    origins: Record<MonsterFacing, { x: number; y: number }>;
    /** Old attacker-relative offsets (import data only). Runtime: the VFX is drawn ON the target's body. */
    offsets: Record<MonsterFacing, { x: number; y: number }>;
  };
}

export interface MonsterActionTiming {
  frameRate: number;
  /** -1 = loop, 0 = play once (and hold the last frame). */
  repeat: number;
}

export interface MonsterArt {
  meta: MonsterArtMeta;
  /** Folder under /public. */
  basePath: string;
  timing: Record<MonsterAction, MonsterActionTiming>;
  /** 1-based attack frame on which the hit lands (global rule: frame 4). Damage and VFX happen here. */
  impactFrame: number;
  vfxFrameRate: number;
  /** 1-based hit-reaction frames tinted red to show damage. */
  hitTintFrames: readonly number[];
}

/** Multiplicative red: outlines stay dark, transparency is untouched. */
export const HIT_TINT = 0xff5050;

export const MONSTER_ART = {
  void_mite: {
    meta: voidMite as MonsterArtMeta,
    basePath: 'assets/monsters/void_mite/',
    timing: {
      idle: { frameRate: 1, repeat: -1 },
      walk: { frameRate: 8, repeat: -1 },
      attack: { frameRate: 10, repeat: 0 },
      hit: { frameRate: 12, repeat: 0 },
      death: { frameRate: 8, repeat: 0 },
    },
    impactFrame: ATTACK_IMPACT_FRAME,
    vfxFrameRate: 12,
    hitTintFrames: [1, 2],
  },
  mutant_wolf: {
    meta: mutantWolf as MonsterArtMeta,
    basePath: 'assets/monsters/mutant_wolf/',
    timing: {
      idle: { frameRate: 1, repeat: -1 },
      walk: { frameRate: 10, repeat: -1 },
      attack: { frameRate: 12, repeat: 0 },
      hit: { frameRate: 12, repeat: 0 },
      death: { frameRate: 8, repeat: 0 },
    },
    impactFrame: ATTACK_IMPACT_FRAME,
    vfxFrameRate: 14,
    hitTintFrames: [1, 2],
  },
} as const satisfies Record<string, MonsterArt>;

export type MonsterArtId = keyof typeof MONSTER_ART;

export const monsterSheetKey = (art: MonsterArtId, action: MonsterAction): string => `monster.${art}.${action}`;
export const monsterVfxKey = (art: MonsterArtId): string => `monster.${art}.vfx`;
export const monsterAnimKey = (art: MonsterArtId, action: MonsterAction, facing: MonsterFacing): string => `monster.${art}.${action}.${facing}`;
export const monsterVfxAnimKey = (art: MonsterArtId, facing: MonsterFacing): string => `monster.${art}.vfx.${facing}`;

/** Facing for a movement direction in tile space (screen x = dx - dy, screen y = dx + dy). */
export function facingForDirection(dx: number, dy: number, current: MonsterFacing): MonsterFacing {
  const sx = dx - dy;
  const sy = dx + dy;
  if (Math.abs(sx) < 1e-6 && Math.abs(sy) < 1e-6) return current;
  // On an exact screen axis keep the current side where it is still valid.
  const east = Math.abs(sx) < 1e-6 ? current === 'SE' || current === 'NE' : sx > 0;
  const south = Math.abs(sy) < 1e-6 ? current === 'SE' || current === 'SW' : sy > 0;
  return south ? (east ? 'SE' : 'SW') : east ? 'NE' : 'NW';
}
