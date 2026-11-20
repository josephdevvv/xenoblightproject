import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { TYPOGRAPHY, TYPOGRAPHY_TEST_STRING, UI_FONT_FAMILY, UI_FONT_STACK } from '../src/ui/text/Typography';

const ROOT = process.cwd();

test('UI font files and licence are shipped (Thai + Latin, 400/500/600)', () => {
  const dir = path.join(ROOT, 'public/assets/fonts/kanit');
  for (const subset of ['thai', 'latin']) {
    for (const weight of [400, 500, 600]) {
      const file = path.join(dir, `kanit-${subset}-${weight}.woff2`);
      assert.ok(fs.existsSync(file), file);
      assert.equal(fs.readFileSync(file).toString('ascii', 0, 4), 'wOF2', `${file} is woff2`);
    }
  }
  assert.match(fs.readFileSync(path.join(dir, 'OFL.txt'), 'utf8'), /SIL Open Font License/);
});

test('one font family with Thai-capable fallbacks; roles are readable sizes', () => {
  assert.equal(UI_FONT_FAMILY, 'Kanit');
  assert.ok(UI_FONT_STACK.startsWith('"Kanit"'));
  assert.match(UI_FONT_STACK, /Noto Sans Thai|Leelawadee|Tahoma/);
  for (const [role, spec] of Object.entries(TYPOGRAPHY)) assert.ok(spec.size >= 10, `${role} >= 10 px`);
  // Line height is measured with stacked Thai marks so they are never clipped.
  assert.match(TYPOGRAPHY_TEST_STRING, /ปั้/);
});

test('no leftover references to the old pixel font in source', () => {
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const file of walk(path.join(ROOT, 'src'))) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /ZF2ndPixelus|PixelFont|installPixelTextSnap/, file);
  }
});
