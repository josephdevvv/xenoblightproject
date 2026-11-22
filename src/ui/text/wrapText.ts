type Segmenter = { segment(text: string): Iterable<{ segment: string }> };
const words: Segmenter | null =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new (Intl as unknown as { Segmenter: new (locale?: string, options?: object) => Segmenter }).Segmenter('th', { granularity: 'word' })
    : null;

/**
 * Breaks text into lines no wider than `maxWidth`, between words. Thai has no spaces between words, so
 * the word boundaries come from Intl.Segmenter (spaces where it is missing). The text itself is never
 * changed: joining the lines gives the original string back. Pure - `measure` supplies the pixel width.
 */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const segments = words ? [...words.segment(text)].map((s) => s.segment) : text.split(/(?<= )/);
  const lines: string[] = [];
  let line = '';
  for (const segment of segments) {
    // trailing spaces / punctuation never start a new line
    const breakable = line !== '' && /[\p{L}\p{N}]/u.test(segment);
    if (breakable && measure((line + segment).trimEnd()) > maxWidth) {
      lines.push(line);
      line = segment;
    } else {
      line += segment;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}
