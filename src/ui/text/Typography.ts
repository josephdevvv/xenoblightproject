/**
 * Xenoblight typography: ONE UI font family for Thai and English, a fixed set of text roles, and
 * the font loading. Components pick a role (typo('label') ...) - never a family or a free size.
 *
 * Font: Kanit (Cadson Demak, SIL Open Font License 1.1 - public/assets/fonts/kanit/OFL.txt).
 * A sturdy, loopless Thai design with a matching geometric Latin: it stays readable at the game's
 * low internal resolution (960x480, scaled up with nearest-neighbour), keeps Thai vowels and tone
 * marks well separated, and suits a dark-fantasy game UI without being decorative.
 *
 * Files: Fontsource @fontsource/kanit 5.3.0 woff2 subsets (Thai + Latin) in weights 400 / 500 / 600,
 * ~100 KB in total, registered with unicode-range so each subset only loads where it is needed.
 * Text is drawn by the browser (canvas fillText), so Thai shaping is native. Text is NOT forced
 * into pixel snapping: crisp sprites stay nearest-neighbour, text stays smooth and readable.
 */
export const UI_FONT_FAMILY = 'Kanit';
/** Thai-capable fallbacks if the font files cannot load. */
export const FALLBACK_FONTS = '"Noto Sans Thai", "Leelawadee UI", Tahoma, "Thonburi", sans-serif';
export const UI_FONT_STACK = `"${UI_FONT_FAMILY}", ${FALLBACK_FONTS}`;

const FONT_DIR = 'assets/fonts/kanit';
const SUBSETS = {
  thai: 'U+02D7, U+0303, U+0331, U+0E01-0E5B, U+200C-200D, U+25CC',
  latin:
    'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
} as const;
const WEIGHTS = [400, 500, 600] as const;
export type FontWeight = (typeof WEIGHTS)[number];

export type TypographyRole = 'display' | 'heading' | 'section' | 'body' | 'button' | 'label' | 'number' | 'tooltip' | 'small';

/** Sizes are game pixels (960x480 canvas). */
export const TYPOGRAPHY: Readonly<Record<TypographyRole, { size: number; weight: FontWeight }>> = {
  /** Logo fallback / large banners. */
  display: { size: 28, weight: 600 },
  /** Screen and window titles. */
  heading: { size: 16, weight: 600 },
  /** Panel and section titles. */
  section: { size: 13, weight: 600 },
  /** Running text, descriptions, option values. */
  body: { size: 12, weight: 400 },
  /** Button captions. */
  button: { size: 12, weight: 500 },
  /** Field and row labels, names. */
  label: { size: 12, weight: 500 },
  /** Stat values and other numbers. */
  number: { size: 12, weight: 500 },
  /** Hover tooltips. */
  tooltip: { size: 11, weight: 400 },
  /** Hints, captions, dense lists (HUD, derived stats). */
  small: { size: 10, weight: 400 },
};

/**
 * Text used by Phaser to measure line height: Thai stacked marks (upper vowel + tone mark) and
 * below-vowels, so they are never clipped by the text canvas.
 */
export const TYPOGRAPHY_TEST_STRING = '|MÉqgyปั้ญฐูฎุ';

let loaded = false;

export function isUiFontLoaded(): boolean {
  return loaded;
}

/** Loads every subset before the game starts. Never rejects; falls back to system fonts on failure. */
export async function loadUiFonts(timeoutMs = 5000): Promise<boolean> {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') return false;
  const faces = WEIGHTS.flatMap((weight) =>
    (Object.keys(SUBSETS) as (keyof typeof SUBSETS)[]).map(
      (subset) => new FontFace(UI_FONT_FAMILY, `url(${FONT_DIR}/kanit-${subset}-${weight}.woff2)`, { weight: String(weight), unicodeRange: SUBSETS[subset], display: 'swap' }),
    ),
  );
  try {
    const result = await Promise.race([
      Promise.all(faces.map((f) => f.load())),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (!result) {
      console.warn('[font] UI font load timed out; using fallback fonts');
      return false;
    }
    for (const face of result) document.fonts.add(face);
    loaded = true;
    return true;
  } catch (e) {
    console.warn('[font] UI font failed to load; using fallback fonts', e);
    return false;
  }
}
