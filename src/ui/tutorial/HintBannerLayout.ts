/**
 * Upper-centre banners (tutorial hints and short notifications) - pure layout, unit-tested. A banner is a translucent
 * dark box with a thin gold frame: [icon] [text], sized to its text, centred on the screen. Banners stack downward
 * from ~22 % of the screen height with a small gap. Whole pixels only.
 */
export const HINT_BANNER = {
  /** Top edge of the first banner as a share of the screen height (the reference's marked area: ~22 % down). */
  topRatio: 0.215,
  height: 28,
  padX: 10,
  iconGap: 8,
  /** Between stacked banners. */
  gap: 4,
} as const;

/** Notification timing: a short fade in, 3 s on screen, a smooth fade out; the banners below glide up. */
export const BANNER_TIMING = {
  fadeInMs: 150,
  showMs: 3000,
  fadeOutMs: 400,
  shiftMs: 220,
  /** At most this many temporary notifications at once (the oldest goes first). */
  maxNotices: 4,
} as const;

/**
 * Banner icons: '#' outline (silver), 'l' gold, '.' empty.
 *   mouse      the left button lit (left-click hint)
 *   lock       a padlock (locked feature)
 *   quest      a gold page with "!" (quest accepted)
 *   done       a gold check mark (quest completed)
 */
export const BANNER_ICONS = {
  mouse: [
    '...#####...',
    '..#lll#..#.',
    '.#llll#...#',
    '.#llll#...#',
    '.#llll#...#',
    '.#########.',
    '.#.......#.',
    '.#.......#.',
    '.#.......#.',
    '.#.......#.',
    '..#.....#..',
    '...#####...',
    '...........',
  ],
  lock: [
    '...#####...',
    '..#.....#..',
    '..#.....#..',
    '..#.....#..',
    '.#########.',
    '.#lllllll#.',
    '.#lll#lll#.',
    '.#lll#lll#.',
    '.#lllllll#.',
    '.#lllllll#.',
    '.#########.',
  ],
  quest: [
    '.#########.',
    '.#lll#lll#.',
    '.#lll#lll#.',
    '.#lll#lll#.',
    '.#lll#lll#.',
    '.#lllllll#.',
    '.#lll#lll#.',
    '.#lllllll#.',
    '.#########.',
  ],
  done: [
    '..........l',
    '.........ll',
    '........ll.',
    'l......ll..',
    'll....ll...',
    '.ll..ll....',
    '..llll.....',
    '...ll......',
  ],
} as const satisfies Record<string, readonly string[]>;

export type BannerIcon = keyof typeof BANNER_ICONS;

/** The left-click hint's mouse (kept for its tests). */
export const MOUSE_ICON: readonly string[] = BANNER_ICONS.mouse;
export const MOUSE_ICON_SIZE = { width: MOUSE_ICON[0].length, height: MOUSE_ICON.length } as const;
/** Every icon gets the same slot, so texts line up. */
const ICON_SLOT = 11;

export interface HintBannerLayout {
  /** The frame on the screen. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Top-left of the icon (a mouse-sized icon). */
  iconX: number;
  iconY: number;
  /** Left edge and vertical centre of the text. */
  textX: number;
  textY: number;
}

/** One banner with its top edge at `top`. */
export function bannerFrame(screenWidth: number, top: number, textWidth: number): HintBannerLayout {
  const { height, padX, iconGap } = HINT_BANNER;
  const width = Math.min(screenWidth - 16, Math.ceil(padX * 2 + ICON_SLOT + iconGap + textWidth));
  const x = Math.round((screenWidth - width) / 2);
  const y = Math.round(top);
  return {
    x,
    y,
    width,
    height,
    iconX: x + padX,
    iconY: y + Math.floor((height - MOUSE_ICON_SIZE.height) / 2),
    textX: x + padX + ICON_SLOT + iconGap,
    textY: y + Math.floor(height / 2),
  };
}

/** The first banner (the left-click hint's place). */
export function hintBannerLayout(screenWidth: number, screenHeight: number, textWidth: number): HintBannerLayout {
  return bannerFrame(screenWidth, firstBannerTop(screenHeight), textWidth);
}

export function firstBannerTop(screenHeight: number): number {
  return Math.round(screenHeight * HINT_BANNER.topRatio);
}

/** Top edges of `count` stacked banners: one under the other, never overlapping. */
export function stackTops(screenHeight: number, count: number): number[] {
  const first = firstBannerTop(screenHeight);
  return Array.from({ length: count }, (_, i) => first + i * (HINT_BANNER.height + HINT_BANNER.gap));
}

/** Where an icon's own pixels start inside the banner's icon slot (centred both ways). */
export function iconOffset(icon: BannerIcon): { x: number; y: number } {
  const rows = BANNER_ICONS[icon];
  return { x: Math.floor((ICON_SLOT - rows[0].length) / 2), y: Math.floor((HINT_BANNER.height - rows.length) / 2) };
}
