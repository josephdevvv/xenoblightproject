import type { DerivedStats } from '../../status/DerivedStats';
import { MAIN_STATS, type MainStat } from '../../status/StatTypes';
import type { Rect } from '../passiveTree/PassiveTreeLayout';

/**
 * Status window layout - pure, unit-tested. Same window size, header, panels and footer as the Inventory, and
 * like it computed from the game's screen size (the canvas itself is scaled to the browser window). Whole
 * pixels; all coordinates except `window` are relative to the window's top-left corner.
 */

/** Display order of the main stats (the order they are stored in, MAIN_STATS, is not changed). */
export const STATUS_STAT_ORDER: readonly MainStat[] = ['str', 'agi', 'vit', 'int', 'dex', 'luk'];

export type SecondaryKey = keyof DerivedStats;
export type SecondarySectionId = 'vitals' | 'defense' | 'other' | 'offense';

/** Every derived stat once, in readable groups: two columns, top to bottom. */
export const SECONDARY_COLUMNS: readonly (readonly { id: SecondarySectionId; stats: readonly SecondaryKey[] }[])[] = [
  [
    { id: 'vitals', stats: ['maxHp', 'maxSp'] },
    { id: 'defense', stats: ['def', 'mdef', 'flee'] },
    { id: 'other', stats: ['materialFindBonus'] },
  ],
  [{ id: 'offense', stats: ['meleeAtk', 'rangedAtk', 'matk', 'hit', 'aspd', 'critRate', 'critDamage'] }],
];

export interface StatRowLayout {
  stat: MainStat;
  rect: Rect;
  labelX: number;
  /** Tops of the name and the description text. */
  nameY: number;
  descriptionY: number;
  descriptionRight: number;
  valueRight: number;
  valueY: number;
  plus: Rect;
}

export interface SecondarySectionLayout {
  id: SecondarySectionId;
  x: number;
  width: number;
  captionY: number;
  ruleY: number;
  rows: { key: SecondaryKey; y: number }[];
}

export interface StatusLayout {
  /** On the screen. */
  window: Rect;
  title: Rect;
  points: Rect;
  name: { x: number; y: number; right: number };
  panels: { primary: Rect; secondary: Rect };
  /** Each panel's caption, and the rule under it, from the panel's top-left corner. */
  caption: { x: number; y: number; rule: number };
  stats: StatRowLayout[];
  message: { x: number; y: number; width: number };
  sections: SecondarySectionLayout[];
  footer: Rect;
  summary: { x: number; y: number };
  buttons: { dev: Rect; reset: Rect; confirm: Rect; close: Rect };
}

/** Full size (960x480 game screen), as the Inventory. */
const FULL = { width: 720, height: 396 } as const;
const MARGIN = 12;
const FRAME = 4;
const HEADER = 36;
const FOOTER = 32;
const PANEL_GAP = 4;
const PANEL_PAD = 12;
const CAPTION = 26;
const STAT_PITCH = 43;
const STAT_GAP = 5;
const MIN_STAT_PITCH = 34;
const MESSAGE_HEIGHT = 18;
const SECTION_HEAD = 24;
const SECTION_GAP = 12;
const SECONDARY_PITCH = 23;
const COLUMN_GAP = 20;
const BUTTON = { height: 20, gap: 8, width: 98, small: 72 } as const;

export function statusLayout(screenWidth: number, screenHeight: number): StatusLayout {
  const w = Math.min(FULL.width, screenWidth - MARGIN * 2);
  const h = Math.min(FULL.height, screenHeight - MARGIN * 2);
  const window: Rect = [Math.floor((screenWidth - w) / 2), Math.floor((screenHeight - h) / 2), w, h];

  const top = HEADER;
  const panelH = h - HEADER - FOOTER - FRAME * 2;
  const inner = w - FRAME * 2 - PANEL_GAP;
  const left = Math.floor(inner * 0.42);
  const primary: Rect = [FRAME, top, left, panelH];
  const secondary: Rect = [FRAME + left + PANEL_GAP, top, inner - left, panelH];

  // Main stats: equal rows between the caption and the message line
  const roomH = panelH - CAPTION - MESSAGE_HEIGHT - 6;
  const pitch = Math.max(MIN_STAT_PITCH, Math.min(STAT_PITCH, Math.floor(roomH / STATUS_STAT_ORDER.length)));
  const rowH = pitch - STAT_GAP;
  const plusSize = Math.min(26, rowH - 6);
  const rowX = primary[0] + PANEL_PAD;
  const rowW = left - PANEL_PAD * 2;
  const stats = STATUS_STAT_ORDER.map((stat, i): StatRowLayout => {
    const y = top + CAPTION + 4 + i * pitch;
    const plusX = rowX + rowW - plusSize - Math.floor((rowH - plusSize) / 2);
    const textTop = y + Math.floor((rowH - 32) / 2);
    return {
      stat,
      rect: [rowX, y, rowW, rowH],
      labelX: rowX + 10,
      nameY: textTop,
      descriptionY: textTop + 15,
      descriptionRight: plusX - 62,
      valueRight: plusX - 12,
      valueY: y + Math.floor(rowH / 2),
      plus: [plusX, y + Math.floor((rowH - plusSize) / 2), plusSize, plusSize],
    };
  });

  // Secondary stats: sections in two columns
  const columns = SECONDARY_COLUMNS.length;
  const colW = Math.floor((secondary[2] - PANEL_PAD * 2 - COLUMN_GAP * (columns - 1)) / columns);
  const tallest = Math.max(...SECONDARY_COLUMNS.map((c) => c.reduce((n, s) => n + s.stats.length, 0)));
  const heads = Math.max(...SECONDARY_COLUMNS.map((c) => c.length));
  const areaH = panelH - CAPTION - 10;
  const rowPitch = Math.max(15, Math.min(SECONDARY_PITCH, Math.floor((areaH - heads * SECTION_HEAD - (heads - 1) * SECTION_GAP) / tallest)));
  const sections = SECONDARY_COLUMNS.flatMap((column, c): SecondarySectionLayout[] => {
    const x = secondary[0] + PANEL_PAD + c * (colW + COLUMN_GAP);
    let y = top + CAPTION + 4;
    return column.map((section) => {
      const layout: SecondarySectionLayout = {
        id: section.id,
        x,
        width: colW,
        captionY: y,
        ruleY: y + SECTION_HEAD - 5,
        rows: section.stats.map((key, i) => ({ key, y: y + SECTION_HEAD + i * rowPitch })),
      };
      y += SECTION_HEAD + section.stats.length * rowPitch + SECTION_GAP;
      return layout;
    });
  });

  const footer: Rect = [FRAME, top + panelH + FRAME, w - FRAME * 2, FOOTER];
  const buttonY = footer[1] + Math.floor((FOOTER - BUTTON.height) / 2);
  const closeX = w - FRAME - PANEL_PAD - BUTTON.width;
  const confirmX = closeX - BUTTON.gap - BUTTON.width;
  const resetX = confirmX - BUTTON.gap - BUTTON.width;
  const titleX = Math.floor((w - 198) / 2);
  return {
    window,
    title: [titleX, 5, 198, 27],
    points: [w - FRAME - PANEL_PAD - 130, 7, 130, 23],
    name: { x: FRAME + PANEL_PAD, y: 18, right: titleX - 8 },
    panels: { primary, secondary },
    caption: { x: PANEL_PAD, y: 4, rule: CAPTION - 4 },
    stats,
    message: { x: rowX, y: top + panelH - MESSAGE_HEIGHT - 2, width: rowW },
    sections,
    footer,
    summary: { x: FRAME + PANEL_PAD, y: footer[1] + Math.floor(FOOTER / 2) },
    buttons: {
      dev: [resetX - BUTTON.gap - BUTTON.small, buttonY, BUTTON.small, BUTTON.height],
      reset: [resetX, buttonY, BUTTON.width, BUTTON.height],
      confirm: [confirmX, buttonY, BUTTON.width, BUTTON.height],
      close: [closeX, buttonY, BUTTON.width, BUTTON.height],
    },
  };
}

/** The display order shows every main stat exactly once (checked by the tests). */
export function isCompleteStatOrder(order: readonly MainStat[]): boolean {
  return order.length === MAIN_STATS.length && MAIN_STATS.every((s) => order.includes(s));
}
