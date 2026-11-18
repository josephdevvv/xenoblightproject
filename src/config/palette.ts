/**
 * Dark atmospheric palette. Greys dominate; the muted purple accent is used sparingly
 * (selection highlights, a few embers/runes, the primary button border).
 */
export const PALETTE = {
  void: '#060608',
  black: '#0b0b0d',
  ink: '#131316',
  charcoal: '#1b1b1f',
  ash: '#25252a',
  stone: '#34343a',
  slate: '#4a4a52',
  gray: '#6c6c75',
  silver: '#9a9aa3',
  pale: '#c4c4cb',
  white: '#e8e8ec',
  accent: '#6f5f8c',
  accentDim: '#44395a',
  accentLight: '#9686b3',
  error: '#b38a8a',
} as const;

/** Converts '#rrggbb' to the 0xRRGGBB integer form Phaser expects. */
export function toColorInt(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}
