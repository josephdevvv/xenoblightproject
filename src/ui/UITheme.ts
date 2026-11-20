import Phaser from 'phaser';
import { PALETTE, toColorInt } from '../config/palette';
import { TYPOGRAPHY, TYPOGRAPHY_TEST_STRING, UI_FONT_STACK, type TypographyRole } from './text/Typography';

/** CSS font stack for UI text (also used by DOM inputs). */
export const UI_FONT = UI_FONT_STACK;

type TextStyle = Phaser.Types.GameObjects.Text.TextStyle;

/**
 * Phaser text style for a typography role (src/ui/text/Typography.ts). The only way UI code picks a
 * font: family, size and weight come from the role, colour and extras (stroke, align, ...) from the
 * caller. No letter spacing: Thai vowels and tone marks must stay attached to their consonant.
 */
export function typo(role: TypographyRole, color: string = PALETTE.pale, extra: TextStyle = {}): TextStyle {
  const { size, weight } = TYPOGRAPHY[role];
  const { letterSpacing: _ignored, ...rest } = extra;
  return {
    fontFamily: UI_FONT,
    fontSize: `${size}px`,
    fontStyle: String(weight),
    color,
    testString: TYPOGRAPHY_TEST_STRING,
    ...rest,
  };
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
