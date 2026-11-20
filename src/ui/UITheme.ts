import Phaser from 'phaser';
import { PALETTE, toColorInt } from '../config/palette';
import { isPixelFontReady, PIXEL_FONT_METRICS, PIXEL_FONT_SIZE, PIXEL_TEXT_RESOLUTION, UI_FONT_STACK } from './text/PixelFont';

/** CSS font stack for UI text (pixel font first, Thai-capable fallbacks after). */
export const UI_FONT = UI_FONT_STACK;

type TextStyle = Phaser.Types.GameObjects.Text.TextStyle;

/**
 * Text style for all UI text. The pixel font is only crisp at its own grid size, so `size` picks a
 * scale instead of a free pixel size: below 20 -> 1x (5-px capitals, Thai with marks ~11 px tall),
 * 20 and above -> 2x. Hierarchy comes from colour, not size.
 *
 * `letterSpacing` is ignored on purpose: Phaser draws spaced text one UTF-16 unit at a time, which
 * separates Thai vowels and tone marks from their consonant. The pixel font has its own spacing.
 */
export function textStyle(size: number, color: string = PALETTE.pale, extra: TextStyle = {}): TextStyle {
  const scale = size >= 20 ? 2 : 1;
  const { letterSpacing: _ignored, fontStyle: _bold, ...rest } = extra;
  return {
    fontFamily: UI_FONT,
    fontSize: `${PIXEL_FONT_SIZE * scale}px`,
    color,
    // 4x + pixel snapping only for the pixel font; a fallback system font renders at 1x as usual.
    resolution: isPixelFontReady() ? PIXEL_TEXT_RESOLUTION : 1,
    metrics: {
      ascent: PIXEL_FONT_METRICS.ascent * scale,
      descent: PIXEL_FONT_METRICS.descent * scale,
      fontSize: PIXEL_FONT_METRICS.fontSize * scale,
    },
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
