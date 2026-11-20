import type Phaser from 'phaser';

const segmenter: { segment(text: string): Iterable<{ segment: string }> } | null =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new (Intl as unknown as { Segmenter: new (locale?: string, options?: object) => { segment(text: string): Iterable<{ segment: string }> } }).Segmenter(undefined, { granularity: 'grapheme' })
    : null;

/**
 * Splits text into user-perceived characters, so a Thai consonant keeps its vowels / tone marks
 * (e.g. "ตั้ง" is 2 graphemes, not 4 code units).
 */
export function graphemes(text: string): string[] {
  if (segmenter) return [...segmenter.segment(text)].map((s) => s.segment);
  // Fallback: attach combining marks (\p{M}) to the previous character.
  const out: string[] = [];
  for (const ch of text) {
    if (/\p{M}/u.test(ch) && out.length > 0) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}

/** Sets `value`, shortened with ".." (never inside a grapheme) until it fits `maxWidth`. */
export function fitText(text: Phaser.GameObjects.Text, value: string, maxWidth: number): void {
  text.setText(value);
  if (text.width <= maxWidth) return;
  const parts = graphemes(value);
  let n = parts.length;
  while (n > 1 && text.width > maxWidth) text.setText(`${parts.slice(0, --n).join('')}..`);
}
