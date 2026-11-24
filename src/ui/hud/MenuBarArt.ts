/**
 * The top-right menu bar's slot art - pure, unit-tested. The pack's PNG has its six slot frames off-centre (2 px from
 * the bar's left edge, 14 px from its right) with the three-bar icon baked into the last one, so the bar's inside is
 * repainted in code with the art's own three colours and the slots drawn centred with equal spacing.
 */

/** Colours sampled from 03_map_and_menu.png. */
export const MENU_ART = {
  fill: 0x0f0f12,
  border: 0xe5e5eb,
  highlight: 0x45454f,
} as const;

/** The bar in layer pixels of 03_map_and_menu (its PNG starts at reference x 1314). */
export const MENU_BAR = {
  layerRefX: 1314,
  /** Inside of the bar's 1-px frame, x 2..164. */
  innerLeft: 2,
  innerWidth: 163,
  /** Slot frames: 19 x 15 px with a 1-px border, top at layer y 4 (reference y 17). */
  slotWidth: 19,
  slotRefY: 17,
  slotRefWidth: 38,
  slotRefHeight: 30,
  count: 6,
} as const;

/** Left edges (layer px) of the slots: equal gaps between them and to both ends of the bar. */
export function menuSlotLefts(): number[] {
  const { innerLeft, innerWidth, slotWidth, count } = MENU_BAR;
  const gap = Math.floor((innerWidth - count * slotWidth) / (count + 1));
  const used = count * slotWidth + (count - 1) * gap;
  const start = innerLeft + Math.floor((innerWidth - used) / 2);
  return Array.from({ length: count }, (_, i) => start + i * (slotWidth + gap));
}

/** The pack's three-bar icon, as it was baked into the last slot: bars at these rows / columns of the slot frame. */
export const MORE_ICON = { rows: [3, 6, 9], fromCol: 10, toCol: 17 } as const;

/** Settings gear (11 x 11): eight teeth, a 3 x 3 hole. '#' = icon colour. */
export const GEAR_ICON: readonly string[] = [
  '....###....',
  '.##.###.##.',
  '.#########.',
  '..#######..',
  '####...####',
  '####...####',
  '####...####',
  '..#######..',
  '.#########.',
  '.##.###.##.',
  '....###....',
];
