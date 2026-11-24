/** 12 x 12 for the Gold display rows (the 16 x 16 reduced ~20 %, drawn on its own grid - make_gold_coin_12.mjs). */
const GOLD_ICON_HUD = { key: 'ui.gold.coin12', url: 'assets/ui/gold/gold_coin_12x12.png', size: 12 } as const;

/**
 * The Gold coin icon (art-source/ui/gold: a 32 x 32 pixel-art coin with a rose, after the supplied reference, its
 * 16 x 16 reduction - the same pixels, 2 x 2 blocks, no new colours - and a 12 x 12 version). Use these keys wherever
 * Gold is shown.
 */
export const GOLD_ICON = {
  /** The 32 x 32 master. */
  large: { key: 'ui.gold.coin32', url: 'assets/ui/gold/gold_coin_32x32.png', size: 32 },
  /** 16 x 16 for text rows. */
  small: { key: 'ui.gold.coin16', url: 'assets/ui/gold/gold_coin_16x16.png', size: 16 },
  /** 12 x 12: the HUD player panel and the Inventory header (GOLD_DISPLAY). */
  hud: GOLD_ICON_HUD,
} as const;

/** The icon that fits a row of `height` px at a whole-number scale (never a blurred fraction). */
export function goldIconFor(height: number): { key: string; scale: number } {
  if (height >= GOLD_ICON.large.size) return { key: GOLD_ICON.large.key, scale: Math.floor(height / GOLD_ICON.large.size) };
  return { key: GOLD_ICON.small.key, scale: Math.max(1, Math.floor(height / GOLD_ICON.small.size)) };
}

/** Gold as shown: whole number with thousands separators (1,234,567). */
export function formatGold(gold: number): string {
  return Math.max(0, Math.floor(gold)).toLocaleString('en-US');
}

/**
 * Gold shown as coin + amount (the HUD's player panel and the Inventory header share it): the 12 x 12 coin, then the
 * amount in the 'small' role, right-aligned. The digits' ink is measured in the UI font: rows 4-10 of a 16-px
 * 'small' text box, so the amount is placed by its ink, centred on the coin.
 */
export const GOLD_DISPLAY = {
  icon: GOLD_ICON_HUD,
  /** Coin to amount. */
  gap: 3,
  textRole: 'small',
  textColor: '#f0cc55',
  digitInkTop: 4,
  digitInkHeight: 7,
} as const;

export interface GoldDisplayLayout {
  /** Top-left of the coin. */
  iconX: number;
  iconY: number;
  /** The amount: right edge and top of its text box. */
  textRight: number;
  textY: number;
}

/** `right`: where the amount ends; `iconTop`: the coin's top row. Whole pixels. */
export function goldDisplayLayout(right: number, iconTop: number, textWidth: number): GoldDisplayLayout {
  const { icon, gap, digitInkTop, digitInkHeight } = GOLD_DISPLAY;
  const textRight = Math.round(right);
  const iconY = Math.round(iconTop);
  return {
    iconX: textRight - Math.ceil(textWidth) - gap - icon.size,
    iconY,
    textRight,
    textY: iconY + Math.ceil((icon.size - digitInkHeight) / 2) - digitInkTop,
  };
}
