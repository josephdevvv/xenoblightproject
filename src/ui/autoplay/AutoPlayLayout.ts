import { HOTBAR_SIZE } from '../../hotbar/Hotbar';
import type { Rect } from '../passiveTree/PassiveTreeLayout';

/**
 * Auto Play settings window - pure layout, unit-tested. Two columns like the reference: monsters and skills on the
 * left; combat options, hunting range and recovery on the right; status, bag and START / STOP at the bottom.
 * Everything except `window` is relative to the window's top-left corner; whole pixels only.
 */
export interface AutoPlayLayout {
  window: Rect;
  title: Rect;
  panels: { monsters: Rect; skills: Rect; options: Rect; range: Rect; recovery: Rect };
  caption: { x: number; y: number; rule: number };
  /** "All" / "None" at the right of the monster caption. */
  monsterButtons: readonly [Rect, Rect];
  monsterCards: readonly Rect[];
  /** Skill icon slots (as many as the hotbar) and the check box under each. */
  skillSlots: readonly Rect[];
  skillChecks: readonly Rect[];
  /** Toggle rows: check box + label start. */
  retaliate: Rect;
  counter: Rect;
  rangeModes: readonly [Rect, Rect];
  rangeSlider: Rect;
  rangeValue: { x: number; y: number };
  /** HP Potion, SP Recovery, Heal Skill: a toggle line, then its threshold slider and value. */
  recoveryRows: readonly RecoveryRowLayout[];
  /** Which learned heal skill (right of the Heal Skill toggle). */
  healPicker: Rect;
  footer: Rect;
  status: { x: number; y: number };
  bag: { x: number; y: number };
  startStop: Rect;
  close: Rect;
}

export interface RecoveryRowLayout {
  toggle: Rect;
  slider: Rect;
  value: { x: number; y: number };
}

export const RECOVERY_ROWS = ['hpPotion', 'spRecovery', 'healSkill'] as const;

export const AUTO_WINDOW = { width: 604, height: 372 } as const;
export const MONSTER_CARD = { width: 136, height: 38 } as const;
export const SKILL_SLOT = 32;
const FRAME = 4;
const GAP = 4;
const PAD = 12;
const HEADER = 30;
const FOOTER = 34;
const CAPTION = 26;
const COLUMN_LEFT = 300;
const CHECK = 10;

export function autoPlayLayout(screenWidth: number, screenHeight: number, monsterCount: number): AutoPlayLayout {
  const w = AUTO_WINDOW.width;
  const h = AUTO_WINDOW.height;
  const top = FRAME + HEADER + GAP;
  const bottom = h - FRAME - FOOTER - GAP;
  const leftX = FRAME;
  const rightX = FRAME + COLUMN_LEFT + GAP;
  const rightW = w - FRAME - rightX;

  const monstersH = 172;
  const monsters: Rect = [leftX, top, COLUMN_LEFT, monstersH];
  const skills: Rect = [leftX, top + monstersH + GAP, COLUMN_LEFT, bottom - (top + monstersH + GAP)];
  const options: Rect = [rightX, top, rightW, 64];
  const range: Rect = [rightX, options[1] + options[3] + GAP, rightW, 70];
  const recovery: Rect = [rightX, range[1] + range[3] + GAP, rightW, bottom - (range[1] + range[3] + GAP)];

  const cardTop = monsters[1] + CAPTION + 2;
  const monsterCards = Array.from({ length: monsterCount }, (_, i): Rect => [
    monsters[0] + PAD - 4 + (i % 2) * (MONSTER_CARD.width + 8),
    cardTop + Math.floor(i / 2) * (MONSTER_CARD.height + 4),
    MONSTER_CARD.width,
    MONSTER_CARD.height,
  ]);
  const btnW = 50;
  const monsterButtons: [Rect, Rect] = [
    [monsters[0] + monsters[2] - PAD - btnW * 2 - 4, monsters[1] + 5, btnW, 16],
    [monsters[0] + monsters[2] - PAD - btnW, monsters[1] + 5, btnW, 16],
  ];

  const slotGap = Math.floor((COLUMN_LEFT - PAD * 2 - HOTBAR_SIZE * SKILL_SLOT) / (HOTBAR_SIZE - 1));
  const slotTop = skills[1] + CAPTION + 6;
  const skillSlots = Array.from({ length: HOTBAR_SIZE }, (_, i): Rect => [skills[0] + PAD + i * (SKILL_SLOT + slotGap), slotTop, SKILL_SLOT, SKILL_SLOT]);
  const skillChecks = skillSlots.map(([x, y]): Rect => [x + (SKILL_SLOT - CHECK) / 2, y + SKILL_SLOT + 6, CHECK, CHECK]);

  const row = (panel: Rect, dy: number): Rect => [panel[0] + PAD, panel[1] + dy, panel[2] - PAD * 2, 14];
  const modeW = Math.floor((rightW - PAD * 2 - 6) / 2);
  const sliderW = rightW - PAD * 2 - 92;

  const footer: Rect = [FRAME, h - FRAME - FOOTER, w - FRAME * 2, FOOTER];
  const startW = 128;
  const closeW = 72;
  return {
    window: [Math.max(0, Math.floor((screenWidth - w) / 2)), Math.max(0, Math.floor((screenHeight - h) / 2)), w, h],
    title: [FRAME, FRAME, w - FRAME * 2, HEADER],
    panels: { monsters, skills, options, range, recovery },
    caption: { x: PAD, y: 8, rule: CAPTION - 4 },
    monsterButtons,
    monsterCards,
    skillSlots,
    skillChecks,
    retaliate: row(options, CAPTION + 2),
    counter: row(options, CAPTION + 20),
    rangeModes: [
      [range[0] + PAD, range[1] + CAPTION + 2, modeW, 18],
      [range[0] + PAD + modeW + 6, range[1] + CAPTION + 2, modeW, 18],
    ],
    rangeSlider: [range[0] + PAD, range[1] + CAPTION + 24, sliderW, 16],
    rangeValue: { x: range[0] + range[2] - PAD, y: range[1] + CAPTION + 32 },
    recoveryRows: RECOVERY_ROWS.map((_, i): RecoveryRowLayout => {
      const y = CAPTION + 2 + i * 38;
      return {
        toggle: row(recovery, y),
        slider: [recovery[0] + PAD, recovery[1] + y + 16, sliderW, 16],
        value: { x: recovery[0] + recovery[2] - PAD, y: recovery[1] + y + 24 },
      };
    }),
    healPicker: [recovery[0] + recovery[2] - PAD - 96, recovery[1] + CAPTION + 2 + 2 * 38 - 2, 96, 16],
    footer,
    status: { x: footer[0] + PAD, y: footer[1] + FOOTER / 2 },
    bag: { x: footer[0] + 150, y: footer[1] + FOOTER / 2 },
    startStop: [footer[0] + footer[2] - 8 - closeW - 8 - startW, footer[1] + 6, startW, 22],
    close: [footer[0] + footer[2] - 8 - closeW, footer[1] + 6, closeW, 22],
  };
}

/** Slider: the value at a pointer x on its track (snapped to the step). */
export function sliderValue(track: Rect, x: number, min: number, max: number, step: number): number {
  const t = Math.min(1, Math.max(0, (x - track[0]) / Math.max(1, track[2])));
  return Math.min(max, Math.max(min, Math.round((min + t * (max - min) - min) / step) * step + min));
}

/** Slider: x of the knob for a value. */
export function sliderX(track: Rect, value: number, min: number, max: number): number {
  return Math.round(track[0] + ((value - min) / Math.max(1, max - min)) * track[2]);
}

/** Drag and drop: the slot index a pointer x falls on (clamped to the filled slots). */
export function dropIndex(slots: readonly Rect[], x: number, filled: number): number {
  if (filled <= 0) return 0;
  let best = 0;
  for (let i = 0; i < filled; i++) if (Math.abs(x - (slots[i][0] + slots[i][2] / 2)) < Math.abs(x - (slots[best][0] + slots[best][2] / 2))) best = i;
  return best;
}
