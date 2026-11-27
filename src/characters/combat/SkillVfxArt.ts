import redStab from '../../../public/assets/vfx/player/skills/drifter_red_stab/vfx_drifter_red_stab_metadata.json';
import type { ActionDirection } from '../../core/Direction';
import { CHARACTER_CANVAS_ROOT } from '../CharacterSheetLayout';

/**
 * Skill VFX drawn ON the attacker (pure, unit-tested), read from the approved Sprite Forge VFX in public/assets
 * (sheet and metadata copied unchanged from approved/vfx/<id>/ - the sheet's sha256 is in its metadata).
 *
 * The Drifter's red stab (vfx_drifter_red_stab, 4 x 64x64 per facing, rows SE SW NE NW; SW / NW are the exact
 * mirrors) belongs to the Drifter's attack skill only. Forge rule: its frame is drawn with its top-left at the
 * character frame's top-left plus a per-facing, per-gender offset (both 64x64 frames, same origin) - so on the
 * character's ground root it uses the origin root - offset, at the character sprite's scale. Its F2 (the peak) is
 * meant to show on the thrust's hit frame: the game's hit frame (the global frame-4 rule) keeps that alignment.
 */
export type SkillVfxGender = 'male' | 'female';

export interface SkillVfxArt {
  id: string;
  key: string;
  url: string;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  /** Sheet rows = facings, in this order. */
  rows: readonly ActionDirection[];
  frameDurationsMs: readonly number[];
  /** 1-based frame that lines up with the attack's hit frame. */
  peakFrame: number;
  /** Per gender and facing: the VFX frame's top-left relative to the character frame's top-left (px). */
  offsets: Record<SkillVfxGender, Record<ActionDirection, readonly [number, number]>>;
  /** The sha256 of the approved sheet (the copy in public must match). */
  sheetSha256: string;
}

const offsetsOf = (g: SkillVfxGender): Record<ActionDirection, readonly [number, number]> => {
  const o = redStab.attach.offsets[g];
  return { SE: o.SE.offset as [number, number], SW: o.SW.offset as [number, number], NE: o.NE.offset as [number, number], NW: o.NW.offset as [number, number] };
};

export const DRIFTER_RED_STAB: SkillVfxArt = {
  id: redStab.id,
  key: 'vfx.player.drifter_red_stab',
  url: `assets/vfx/player/skills/drifter_red_stab/${redStab.sheet.file}`,
  frameWidth: redStab.frameSize.width,
  frameHeight: redStab.frameSize.height,
  frames: redStab.frameCount,
  rows: redStab.sheet.rowOrder as ActionDirection[],
  frameDurationsMs: redStab.frameDurationsMs,
  peakFrame: redStab.attach.timing.vfxPeakFrame,
  offsets: { male: offsetsOf('male'), female: offsetsOf('female') },
  sheetSha256: redStab.sheet.sha256,
};

/** The skill VFX of an attack (only the Drifter's attack skill has one; basic attacks none). */
export function skillVfxOf(attackId: string): SkillVfxArt | null {
  return attackId === 'drifter_lv1' ? DRIFTER_RED_STAB : null;
}

export const skillVfxAnimKey = (art: SkillVfxArt, facing: ActionDirection): string => `${art.key}.${facing}`;

/**
 * Sprite origin (0..1) of the VFX so that, placed on the character's ground root at the character's scale, its frame's
 * top-left sits at the character frame's top-left + offset (the forge attach rule).
 */
export function skillVfxOrigin(art: SkillVfxArt, gender: SkillVfxGender, facing: ActionDirection): { x: number; y: number } {
  const [dx, dy] = art.offsets[gender][facing];
  return { x: (CHARACTER_CANVAS_ROOT.x - dx) / art.frameWidth, y: (CHARACTER_CANVAS_ROOT.y - dy) / art.frameHeight };
}

/**
 * When the VFX starts, from the start of the swing: its peak frame on the attack's hit moment (`impactDelayMs`, already
 * at the swing's speed). `speed`: the swing's ASPD playback speed - the VFX plays at it too.
 */
export function skillVfxDelayMs(art: SkillVfxArt, impactDelayMs: number, speed: number): number {
  const lead = art.frameDurationsMs.slice(0, art.peakFrame - 1).reduce((s, ms) => s + ms, 0) / (speed > 0 ? speed : 1);
  return Math.max(0, impactDelayMs - lead);
}
