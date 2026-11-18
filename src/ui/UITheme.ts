import Phaser from 'phaser';
import { PALETTE, toColorInt } from '../config/palette';

export const UI_FONT = '"Lucida Console", Consolas, "Courier New", monospace';

type TextStyle = Phaser.Types.GameObjects.Text.TextStyle;

export function textStyle(size: number, color: string = PALETTE.pale, extra: TextStyle = {}): TextStyle {
  return { fontFamily: UI_FONT, fontSize: `${size}px`, color, ...extra };
}

export const UI_COLORS = {
  panelFill: toColorInt(PALETTE.ink),
  panelBorder: toColorInt(PALETTE.stone),
  panelCorner: toColorInt(PALETTE.gray),
  buttonFill: toColorInt(PALETTE.charcoal),
  buttonFillHover: toColorInt(PALETTE.ash),
  buttonFillSelected: toColorInt('#2a2a31'),
  buttonBorder: toColorInt(PALETTE.stone),
  buttonBorderHover: toColorInt(PALETTE.gray),
  buttonBorderSelected: toColorInt(PALETTE.pale),
  accent: toColorInt(PALETTE.accent),
  accentLight: toColorInt(PALETTE.accentLight),
} as const;
