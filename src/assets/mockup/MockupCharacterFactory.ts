import { MOCKUP_PIXEL_SCALE } from '../../config/constants';
import { PALETTE } from '../../config/palette';
import { DIRECTIONS, type Direction } from '../../core/Direction';
import { findHairColor } from '../../data/AppearanceCatalog';
import type { CharacterAppearance } from '../../data/CharacterData';
import {
  CHARACTER_FRAME_HEIGHT,
  CHARACTER_FRAME_WIDTH,
  CHARACTER_SHEET_COLUMNS,
  CHARACTER_SHEET_ROWS,
  characterFrameIndex,
} from '../../characters/CharacterSheetLayout';
import { mixHex, PixelCanvas } from './PixelCanvas';

/**
 * TEMPORARY mockup generator.
 *
 * Bakes ONE flat, self-contained sprite sheet per appearance (same contract as the future
 * pre-rendered art). It is an offline-style "art stand-in" only: at runtime the game always
 * draws a single sprite per character, never stacked body/hair/clothing layers.
 * Delete this file once production sheets exist for every appearance.
 */

/** Logical (pre-upscale) frame size. */
const F = CHARACTER_FRAME_WIDTH / MOCKUP_PIXEL_SCALE; // 32
const FH = CHARACTER_FRAME_HEIGHT / MOCKUP_PIXEL_SCALE; // 32

type View = 'front' | 'front3q' | 'side' | 'back3q' | 'back';
type HairLayer = 'back' | 'front';
type Fringe = 'none' | 'flat' | 'swept' | 'parted' | 'sidepart' | 'short' | 'curly';
type HairExtra = 'mohawk' | 'buzz' | 'buns' | 'ponytail' | 'curls' | 'slick';

/** Non-mirrored 3/4 and side views face screen-right; W/SW/NW are mirrored copies. */
const VIEW_BY_DIRECTION: Record<Direction, { view: View; mirror: boolean }> = {
  N: { view: 'back', mirror: false },
  NE: { view: 'back3q', mirror: false },
  E: { view: 'side', mirror: false },
  SE: { view: 'front3q', mirror: false },
  S: { view: 'front', mirror: false },
  SW: { view: 'front3q', mirror: true },
  W: { view: 'side', mirror: true },
  NW: { view: 'back3q', mirror: true },
};

interface HairSpec {
  /** Top row of the hair cap (head top is row 5; smaller = more volume). */
  top: number;
  /** Extra width on each side of the head. */
  vol: number;
  /** Last row reached by the hair (head ends at row 12, torso at row 21). */
  length: number;
  fringe: Fringe;
  extra?: HairExtra;
}

/** Rough silhouettes so each mockup hairstyle is recognisable. Keyed by hairstyle ID. */
const HAIR_SPECS: Record<string, HairSpec> = {
  // male
  mohawk: { top: 4, vol: 0, length: 9, fringe: 'none', extra: 'mohawk' },
  side_swept: { top: 3, vol: 0, length: 10, fringe: 'swept' },
  middle_part: { top: 3, vol: 0, length: 10, fringe: 'parted' },
  slicked_back: { top: 3, vol: 0, length: 10, fringe: 'none', extra: 'slick' },
  long_middle_part: { top: 3, vol: 0, length: 17, fringe: 'parted' },
  buzz_cut: { top: 4, vol: 0, length: 8, fringe: 'none', extra: 'buzz' },
  // female
  straight_bangs: { top: 3, vol: 0, length: 12, fringe: 'flat' },
  twin_buns: { top: 4, vol: 0, length: 9, fringe: 'short', extra: 'buns' },
  bob: { top: 3, vol: 1, length: 11, fringe: 'flat' },
  ponytail: { top: 4, vol: 0, length: 9, fringe: 'short', extra: 'ponytail' },
  fluffy_curls: { top: 2, vol: 1, length: 12, fringe: 'curly', extra: 'curls' },
  long_side_part: { top: 3, vol: 0, length: 18, fringe: 'sidepart' },
};
const FALLBACK_HAIR: HairSpec = HAIR_SPECS.side_swept;

const C = {
  outline: '#0a0a0d',
  skin: '#b3a497',
  skinShade: '#8c7f76',
  eye: '#141418',
  wrap: '#5e5d64',
  wrapShade: '#45444b',
  tunic: '#3b3b43',
  tunicShade: '#2b2b31',
  belt: '#18181c',
  buckle: '#8e8e97',
  pants: '#2c2c32',
  pantsShade: '#222227',
  boots: '#1c1c21',
  pad: '#56565e',
  glove: '#26262b',
  scarf: PALETTE.accentDim,
} as const;

interface Look {
  female: boolean;
  adventurer: boolean;
  hair: string;
  hairDark: string;
  hairLight: string;
  stubble: string;
}

interface Pose {
  bob: number;
  liftL: number;
  liftR: number;
  strideL: number;
  strideR: number;
  armL: number;
  armR: number;
}

/** Paints into one frame cell; handles horizontal mirroring and the vertical "bob" offset. */
class FramePainter {
  constructor(
    private readonly canvas: PixelCanvas,
    private readonly ox: number,
    private readonly oy: number,
    private readonly mirror: boolean,
    private readonly dy = 0,
  ) {}

  withBob(dy: number): FramePainter {
    return new FramePainter(this.canvas, this.ox, this.oy, this.mirror, dy);
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    if (w <= 0 || h <= 0) return;
    const lx = this.mirror ? F - x - w : x;
    this.canvas.rect(this.ox + lx, this.oy + y + this.dy, w, h, color);
  }

  /** Rectangle with the four corner pixels removed (reads as a round blob). */
  blob(x: number, y: number, w: number, h: number, color: string): void {
    this.rect(x + 1, y, w - 2, 1, color);
    this.rect(x, y + 1, w, h - 2, color);
    this.rect(x + 1, y + h - 1, w - 2, 1, color);
  }
}

/** Standing pose: the sheets are static directional frames (no idle / walk animation). */
const STANDING: Pose = { bob: 0, liftL: 0, liftR: 0, strideL: 0, strideR: 0, armL: 0, armR: 0 };

/** Logical rows the figure is shifted down so its feet land on the contract's y = 58 px. */
const FEET_OFFSET = 1;

export function createMockupCharacterSheet(appearance: CharacterAppearance): HTMLCanvasElement {
  const canvas = new PixelCanvas(CHARACTER_SHEET_COLUMNS * F, CHARACTER_SHEET_ROWS * FH);
  const look = resolveLook(appearance);
  const hair = HAIR_SPECS[appearance.hairstyleId] ?? FALLBACK_HAIR;

  for (const direction of DIRECTIONS) {
    const { view, mirror } = VIEW_BY_DIRECTION[direction];
    const index = characterFrameIndex(direction);
    const col = index % CHARACTER_SHEET_COLUMNS;
    const row = Math.floor(index / CHARACTER_SHEET_COLUMNS);
    drawCharacter(new FramePainter(canvas, col * F, row * FH + FEET_OFFSET, mirror), look, hair, view, STANDING);
  }

  canvas.outline(C.outline);
  drawShadows(canvas);
  return canvas.upscale(MOCKUP_PIXEL_SCALE);
}

function resolveLook(a: CharacterAppearance): Look {
  const hair = findHairColor(a.hairColorId).hex;
  return {
    female: a.gender === 'female',
    adventurer: a.outfitId === 'adventurer',
    hair,
    hairDark: mixHex(hair, '#000000', 0.35),
    hairLight: mixHex(hair, '#ffffff', 0.22),
    stubble: mixHex(hair, C.skin, 0.45),
  };
}

// ---------------------------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------------------------

function drawCharacter(p: FramePainter, look: Look, hair: HairSpec, view: View, pose: Pose): void {
  const u = p.withBob(pose.bob);
  if (view === 'side') {
    drawSide(p, u, look, hair, pose);
  } else {
    drawFrontal(p, u, look, hair, pose, view);
  }
}

function drawFrontal(p: FramePainter, u: FramePainter, look: Look, hair: HairSpec, pose: Pose, view: View): void {
  const back = view === 'back' || view === 'back3q';
  const turned = view === 'front3q' || view === 'back3q';

  drawHair(u, look, hair, view, 'back');

  drawLeg(p, look, 13 + pose.strideL, pose.bob, pose.liftL, turned && !back, false);
  drawLeg(p, look, 17 + pose.strideR, pose.bob, pose.liftR, turned && !back, false);

  // Torso
  const f = look.female;
  if (look.adventurer) {
    if (f) {
      u.rect(13, 13, 6, 6, C.tunic);
      u.rect(18, 13, 1, 6, C.tunicShade);
      u.rect(12, 19, 8, 3, C.tunic);
      u.rect(13, 18, 6, 1, C.belt);
    } else {
      u.rect(12, 13, 8, 9, C.tunic);
      u.rect(19, 13, 1, 9, C.tunicShade);
      u.rect(12, 18, 8, 1, C.belt);
    }
    u.rect(12, 21, 8, 1, C.tunicShade);
    if (!back) u.rect(turned ? 16 : 15, 18, 1, 1, C.buckle);
    u.rect(14, 13, 4, 1, C.scarf);
    if (back) u.rect(15, 14, 2, 3, C.scarf);
  } else {
    if (f) {
      u.rect(13, 13, 6, 6, C.skin);
      u.rect(18, 13, 1, 6, C.skinShade);
      u.rect(12, 19, 8, 1, C.skin);
      u.rect(13, 14, 6, 2, C.wrap);
    } else {
      u.rect(12, 13, 8, 7, C.skin);
      u.rect(19, 13, 1, 7, C.skinShade);
      if (!back) {
        u.rect(14, 15, 1, 1, C.skinShade);
        u.rect(17, 15, 1, 1, C.skinShade);
      }
    }
    u.rect(12, 19, 8, 3, C.wrap);
    u.rect(12, 21, 8, 1, C.wrapShade);
  }

  // Arms
  const leftArmX = (f ? 11 : 10) + (turned ? 1 : 0);
  const rightArmX = f ? 19 : 20;
  drawArm(u, look, leftArmX, pose.armL, false);
  drawArm(u, look, rightArmX, pose.armR, false);

  // Head
  u.rect(12, 5, 8, 8, C.skin);
  if (back) {
    u.rect(12, 12, 8, 1, C.skinShade);
    u.rect(11, 8, 1, 2, C.skin);
    u.rect(20, 8, 1, 2, C.skin);
  } else {
    u.rect(turned ? 12 : 19, 5, 1, 8, C.skinShade);
    if (!turned) {
      u.rect(11, 8, 1, 2, C.skin);
      u.rect(20, 8, 1, 2, C.skin);
    }
    const eyeL = turned ? 15 : 14;
    const eyeR = turned ? 18 : 17;
    u.rect(eyeL, 8, 1, 2, C.eye);
    u.rect(eyeR, 8, 1, 2, C.eye);
    u.rect(turned ? 16 : 15, 11, 2, 1, C.skinShade);
  }

  drawHair(u, look, hair, view, 'front');
}

function drawSide(p: FramePainter, u: FramePainter, look: Look, hair: HairSpec, pose: Pose): void {
  // Far arm and leg (drawn first, darker).
  drawArm(u, look, 15 + pose.armR, 0, true);
  drawLeg(p, look, 15 + pose.strideR, pose.bob, pose.liftR, true, true);
  drawLeg(p, look, 15 + pose.strideL, pose.bob, pose.liftL, true, false);

  const f = look.female;
  if (look.adventurer) {
    if (f) {
      u.rect(14, 13, 5, 6, C.tunic);
      u.rect(13, 19, 6, 3, C.tunic);
      u.rect(14, 18, 5, 1, C.belt);
    } else {
      u.rect(13, 13, 6, 9, C.tunic);
      u.rect(13, 18, 6, 1, C.belt);
    }
    u.rect(13, 21, 6, 1, C.tunicShade);
    u.rect(14, 13, 4, 1, C.scarf);
    u.rect(12, 14, 1, 2, C.scarf);
  } else {
    if (f) {
      u.rect(14, 13, 5, 6, C.skin);
      u.rect(14, 14, 5, 2, C.wrap);
    } else {
      u.rect(13, 13, 6, 7, C.skin);
    }
    u.rect(13, 19, 6, 3, C.wrap);
    u.rect(13, 21, 6, 1, C.wrapShade);
  }

  // Head (facing right)
  u.rect(12, 5, 8, 8, C.skin);
  u.rect(12, 5, 1, 8, C.skinShade);
  u.rect(15, 8, 1, 2, C.skinShade); // ear
  u.rect(18, 8, 1, 2, C.eye);
  u.rect(20, 9, 1, 1, C.skin); // nose
  u.rect(19, 11, 1, 1, C.skinShade);

  drawHair(u, look, hair, 'side', 'front');

  // Near arm
  drawArm(u, look, 15 + pose.armL, 0, false);
}

function drawLeg(p: FramePainter, look: Look, x: number, bob: number, lift: number, toe: boolean, dark: boolean): void {
  const top = 21 + bob;
  const bottom = 27 - lift;
  if (look.adventurer) {
    const bootTop = Math.max(top, bottom - 2);
    p.rect(x, top, 2, bootTop - top, dark ? C.pantsShade : C.pants);
    p.rect(x, bootTop, 2, bottom - bootTop + 1, C.boots);
    if (toe) p.rect(x + 2, bottom, 1, 1, C.boots);
  } else {
    const skin = dark ? C.skinShade : C.skin;
    p.rect(x, top, 2, bottom - top + 1, skin);
    if (!dark) p.rect(x + 1, top, 1, bottom - top + 1, C.skinShade);
    if (toe) p.rect(x + 2, bottom, 1, 1, skin);
  }
}

function drawArm(u: FramePainter, look: Look, x: number, swing: number, dark: boolean): void {
  const top = 13;
  const length = 6 + swing;
  const skin = dark ? C.skinShade : C.skin;
  if (look.adventurer) {
    u.rect(x, top, 2, 3, dark ? C.tunicShade : C.tunic);
    u.rect(x, top + 3, 2, length - 4, skin);
    u.rect(x, top + length - 1, 2, 1, C.glove);
    if (!look.female && !dark) u.rect(x, top, 2, 2, C.pad);
  } else {
    u.rect(x, top, 2, length, skin);
    u.rect(x, top + length - 1, 2, 1, C.skinShade);
  }
}

// ---------------------------------------------------------------------------------------------
// Hair (baked into the flat sheet; NOT a runtime layer)
// ---------------------------------------------------------------------------------------------

function drawHair(u: FramePainter, look: Look, spec: HairSpec, view: View, layer: HairLayer): void {
  const H = look.hair;
  const D = look.hairDark;
  const L = look.hairLight;
  const { top, vol, length, fringe, extra } = spec;
  const left = 12 - vol;
  const right = 19 + vol;
  const width = right - left + 1;
  const shortEnd = Math.min(length, 12);
  const isLong = length > 12;
  const frontal = view === 'front' || view === 'front3q';
  const backView = view === 'back' || view === 'back3q';

  if (layer === 'back') {
    // Hair that hangs behind the body when seen from the front.
    if (frontal && isLong) u.rect(left, 9, width, length - 8, D);
    if (view === 'front3q' && extra === 'ponytail') u.rect(10, 9, 2, 5, D);
    return;
  }

  // Shaved styles
  if (extra === 'buzz' || extra === 'mohawk') {
    if (view === 'side') {
      u.rect(12, 4, 8, 3, look.stubble);
      u.rect(12, 7, 3, 3, look.stubble);
    } else if (backView) {
      u.rect(12, 4, 8, 7, look.stubble);
    } else {
      u.rect(12, 4, 8, 3, look.stubble);
      u.rect(12, 7, 1, 2, look.stubble);
      u.rect(19, 7, 1, 2, look.stubble);
    }
    if (extra === 'mohawk') {
      if (view === 'side') {
        u.rect(12, top - 2, 7, 2, H);
        u.rect(13, top - 3, 1, 1, H);
        u.rect(15, top - 3, 1, 1, H);
        u.rect(17, top - 3, 1, 1, H);
        u.rect(12, top - 2, 7, 1, L);
      } else if (backView) {
        u.rect(15, top - 3, 2, 10, H);
        u.rect(15, top - 3, 1, 10, L);
      } else {
        const sx = view === 'front3q' ? 16 : 15;
        u.rect(sx, top - 3, 2, 4, H);
        u.rect(sx, top - 3, 1, 4, L);
      }
    }
    return;
  }

  if (view === 'side') {
    u.rect(left, top, 8 + vol, 7 - top, H);
    u.rect(left, 7, 3 + vol, shortEnd - 6, H);
    if (isLong) {
      u.rect(left, 7, 3 + vol, length - 6, H);
      u.rect(left, 9, 1, length - 8, D);
    }
    switch (fringe) {
      case 'flat':
        u.rect(17, 7, 3, 1, H);
        break;
      case 'swept':
        u.rect(17, 7, 3, 1, H);
        u.rect(19, 8, 1, 1, H);
        break;
      case 'parted':
        u.rect(18, 7, 2, 1, H);
        break;
      case 'sidepart':
        u.rect(18, 7, 2, 2, H);
        break;
      case 'short':
      case 'curly':
        u.rect(18, 7, 1, 1, H);
        break;
      case 'none':
        break;
    }
    u.rect(left + 2, top, 4, 1, L);
    if (extra === 'buns') u.blob(10, 2, 4, 4, H);
    if (extra === 'ponytail') {
      u.rect(11, 6, 1, 2, D);
      u.rect(9, 7, 2, 8, H);
      u.rect(9, 9, 1, 6, D);
    }
    if (extra === 'curls') {
      u.rect(left - 1, 5, 1, 2, H);
      u.rect(left - 1, 9, 1, 2, H);
      u.rect(14, top - 1, 2, 1, H);
      u.rect(17, top - 1, 2, 1, H);
    }
    if (extra === 'slick') u.rect(13, top + 1, 6, 1, L);
    return;
  }

  if (backView) {
    u.rect(left, top, width, shortEnd - top + 1, H);
    if (isLong) {
      u.rect(left, 7, width, length - 6, H);
      u.rect(left + 2, 9, 1, length - 9, D);
      u.rect(right - 2, 9, 1, length - 9, D);
    }
    u.rect(left + 2, top, 3, 1, L);
    if (extra === 'buns') {
      u.blob(9, 1, 4, 4, H);
      u.blob(19, 1, 4, 4, H);
    }
    if (extra === 'ponytail') {
      u.rect(15, 9, 2, 1, D);
      u.rect(15, 10, 2, 7, H);
      u.rect(16, 10, 1, 7, D);
    }
    if (extra === 'curls') {
      u.rect(left - 1, 6, 1, 2, H);
      u.rect(right + 1, 6, 1, 2, H);
      u.rect(left - 1, 10, 1, 2, H);
      u.rect(right + 1, 10, 1, 2, H);
      u.rect(13, shortEnd + 1, 2, 1, H);
      u.rect(17, shortEnd + 1, 2, 1, H);
    }
    if (extra === 'slick') {
      u.rect(13, top + 1, 6, 1, L);
      u.rect(left, shortEnd, width, 1, D);
    }
    return;
  }

  // Front / front three-quarter
  const turned = view === 'front3q';
  const fx = turned ? 1 : 0;
  u.rect(left, top, width, 7 - top, H);

  const lockEnd = isLong ? length : shortEnd;
  const leftLock = 1 + vol + (turned ? 1 : 0);
  const rightLock = turned ? vol : 1 + vol;
  u.rect(left, 7, leftLock, lockEnd - 6, H);
  u.rect(right - rightLock + 1, 7, rightLock, lockEnd - 6, H);
  if (isLong) u.rect(left, 9, 1, lockEnd - 8, D);

  switch (fringe) {
    case 'flat':
      u.rect(12, 7, 8, 1, H);
      break;
    case 'swept':
      u.rect(12, 7, 6 + fx, 1, H);
      u.rect(16 + fx, 8, 3 - fx, 1, H);
      break;
    case 'parted':
      u.rect(12, 7, 3, 1, H);
      u.rect(17 + fx, 7, 3 - fx, 1, H);
      u.rect(15 + fx, top, 1, 2, D);
      break;
    case 'sidepart':
      u.rect(12, 7, 5 + fx, 2, H);
      u.rect(17 + fx, top, 1, 2, D);
      break;
    case 'short':
      u.rect(13 + fx, 7, 3, 1, H);
      break;
    case 'curly':
      u.rect(12, 7, 2, 1, H);
      u.rect(15 + fx, 7, 2, 1, H);
      u.rect(18, 7, 2, 1, H);
      break;
    case 'none':
      break;
  }
  u.rect(left + 2, top, 3, 1, L);

  if (extra === 'buns') {
    u.blob(9, 1, 4, 4, H);
    u.blob(19, 1, 4, 4, H);
    u.rect(10, 2, 1, 1, L);
  }
  if (extra === 'curls') {
    u.rect(left - 1, 5, 1, 2, H);
    u.rect(left - 1, 9, 1, 2, H);
    u.rect(right + 1, 5, 1, 2, H);
    u.rect(right + 1, 9, 1, 2, H);
    u.rect(13, top - 1, 2, 1, H);
    u.rect(17, top - 1, 2, 1, H);
  }
  if (extra === 'slick') u.rect(13, top + 1, 6, 1, L);
}

// ---------------------------------------------------------------------------------------------
// Shadows (drawn underneath everything with destination-over)
// ---------------------------------------------------------------------------------------------

function drawShadows(canvas: PixelCanvas): void {
  const ctx = canvas.ctx;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  for (let row = 0; row < CHARACTER_SHEET_ROWS; row++) {
    for (let col = 0; col < CHARACTER_SHEET_COLUMNS; col++) {
      const ox = col * F;
      const oy = row * FH + FEET_OFFSET;
      for (let y = 26; y <= 29; y++) {
        for (let x = 9; x <= 22; x++) {
          const nx = (x + 0.5 - 16) / 6.5;
          const ny = (y + 0.5 - 27.8) / 1.7;
          if (nx * nx + ny * ny <= 1) ctx.fillRect(ox + x, oy + y, 1, 1);
        }
      }
    }
  }
  ctx.restore();
}
