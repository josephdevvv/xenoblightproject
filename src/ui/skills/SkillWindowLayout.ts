import type { Rect } from '../passiveTree/PassiveTreeLayout';

/**
 * Skill window layout - pure, unit-tested. A narrow window in the Inventory style: the class's skills as a list,
 * the selected skill's details below it, CLOSE in the footer. All coordinates except `window` are relative to
 * the window's top-left corner.
 */
export interface SkillWindowLayout {
  /** On the screen. */
  window: Rect;
  title: Rect;
  panels: { list: Rect; detail: Rect };
  /** Each panel's caption, and the rule under it, from the panel's top-left corner. */
  caption: { x: number; y: number; rule: number };
  rows: readonly Rect[];
  /** Inside a row: the icon well, the name and the learned / locked line. */
  row: { icon: Rect; textX: number; nameY: number; stateY: number };
  detail: {
    icon: Rect;
    textX: number;
    nameY: number;
    stateY: number;
    descriptionY: number;
    effectY: number;
    cooldownY: number;
    textWidth: number;
    /** ASSIGN HOTKEY. */
    button: Rect;
  };
  footer: Rect;
  hint: { x: number; y: number };
  close: Rect;
}

export const SKILL_WINDOW_WIDTH = 360;
const FRAME = 4;
const GAP = 4;
const HEADER = 36;
const FOOTER = 32;
const CAPTION = 26;
const PAD = 12;
export const SKILL_ROW_HEIGHT = 40;
const ROW_GAP = 4;
const ICON = 40;
export const SKILL_LINE_HEIGHT = 14;
const DESCRIPTION_LINES = 2;
const BUTTON = { width: 150, height: 22 } as const;
const CLOSE = { width: 96, height: 22 } as const;

export function skillWindowLayout(screenWidth: number, screenHeight: number, rowCount: number): SkillWindowLayout {
  const w = SKILL_WINDOW_WIDTH;
  const inner = w - FRAME * 2;
  const title: Rect = [FRAME, FRAME, inner, HEADER];
  const listY = FRAME + HEADER + GAP;
  const n = Math.max(1, rowCount);
  const listH = CAPTION + n * SKILL_ROW_HEIGHT + (n - 1) * ROW_GAP + 10;
  const list: Rect = [FRAME, listY, inner, listH];
  const rows = Array.from({ length: rowCount }, (_, i): Rect => [FRAME + PAD - 2, listY + CAPTION + i * (SKILL_ROW_HEIGHT + ROW_GAP), inner - (PAD - 2) * 2, SKILL_ROW_HEIGHT]);

  const detailY = listY + listH + GAP;
  const icon: Rect = [FRAME + PAD, detailY + CAPTION, ICON, ICON];
  const descriptionY = icon[1] + ICON + 8;
  const effectY = descriptionY + DESCRIPTION_LINES * SKILL_LINE_HEIGHT + 6;
  const cooldownY = effectY + SKILL_LINE_HEIGHT;
  const buttonY = cooldownY + SKILL_LINE_HEIGHT + 10;
  const detailH = buttonY + BUTTON.height + 10 - detailY;
  const detail: Rect = [FRAME, detailY, inner, detailH];

  const footerY = detailY + detailH + GAP;
  const footer: Rect = [FRAME, footerY, inner, FOOTER];
  const h = footerY + FOOTER + FRAME;
  const x = Math.max(0, Math.floor((screenWidth - w) / 2));
  const y = Math.max(0, Math.floor((screenHeight - h) / 2));
  return {
    window: [x, y, w, h],
    title,
    panels: { list, detail },
    caption: { x: PAD, y: 8, rule: CAPTION - 6 },
    rows,
    row: { icon: [2, 2, SKILL_ROW_HEIGHT - 4, SKILL_ROW_HEIGHT - 4], textX: SKILL_ROW_HEIGHT + 8, nameY: 5, stateY: 22 },
    detail: {
      icon,
      textX: icon[0] + ICON + 10,
      nameY: icon[1] + 4,
      stateY: icon[1] + 23,
      descriptionY,
      effectY,
      cooldownY,
      textWidth: inner - PAD * 2,
      button: [Math.floor((w - BUTTON.width) / 2), buttonY, BUTTON.width, BUTTON.height],
    },
    footer,
    hint: { x: FRAME + PAD, y: footerY + Math.floor(FOOTER / 2) },
    close: [w - FRAME - 6 - CLOSE.width, footerY + Math.floor((FOOTER - CLOSE.height) / 2), CLOSE.width, CLOSE.height],
  };
}
