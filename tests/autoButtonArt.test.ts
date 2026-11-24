import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AUTO_ARROW_PHASES,
  AUTO_ARROW_STEP_MS,
  AUTO_BUTTON_STATES,
  AUTO_ICON_SIZE,
  AUTO_PALETTES,
  autoArrowPhase,
  autoArrowPixels,
  autoBasePixels,
  autoButtonState,
} from '../src/ui/hud/AutoButtonArt';
import { AUTO_BUTTON, HOTBAR_SLOT } from '../src/ui/hud/HotbarLayout';

const S = AUTO_ICON_SIZE;
const at = (px: Uint8ClampedArray, x: number, y: number): number[] => Array.from(px.slice((y * S + x) * 4, (y * S + x) * 4 + 4));

test('art: a round badge - transparent corners, gold ring, dark disc, hard pixels, fits the button', () => {
  assert.ok(S % 2 === 1 && S <= AUTO_BUTTON.width && S <= HOTBAR_SLOT.height, 'odd size (a centre pixel), inside the button');
  for (const state of AUTO_BUTTON_STATES) {
    const base = autoBasePixels(state);
    for (const [x, y] of [[0, 0], [S - 1, 0], [0, S - 1], [S - 1, S - 1]]) assert.equal(at(base, x, y)[3], 0, `${state}: transparent corner`);
    for (let i = 3; i < base.length; i += 4) assert.ok(base[i] === 0 || base[i] === 255, `${state}: hard alpha`);
    const c = (S - 1) / 2;
    const ring = at(base, c, 0);
    const disc = at(base, c, c);
    assert.equal(ring[3], 255, 'the ring reaches the top edge');
    assert.ok(ring[0] + ring[1] + ring[2] > disc[0] + disc[1] + disc[2], `${state}: the ring is lighter than the disc`);
    // round: the same distance from the centre in four directions is filled the same way
    for (const r of [0, 2, 5, 16]) {
      const filled = [at(base, c, r), at(base, c, S - 1 - r), at(base, r, c), at(base, S - 1 - r, c)].map((p) => p[3]);
      assert.equal(new Set(filled).size, 1, `${state} r=${r}`);
    }
  }
  const gold = AUTO_PALETTES.normal.ring;
  assert.ok(gold[0] > gold[2] + 60 && gold[1] > gold[2], 'gold (warm), not gray');
  const gray = AUTO_PALETTES.disabled.ring;
  assert.ok(Math.max(...gray) - Math.min(...gray) < 12, 'disabled: gray');
});

test('arrows: two arcs with heads; only "on" turns (8 phases over half a turn); the centre stays free for AUTO', () => {
  for (const state of AUTO_BUTTON_STATES) {
    const a = autoArrowPixels(state, 0);
    let count = 0;
    for (let i = 3; i < a.length; i += 4) if (a[i]) count++;
    assert.ok(count > 60 && count < 220, `${state}: ${count} arrow pixels`);
    const c = (S - 1) / 2;
    for (let y = c - 4; y <= c + 4; y++) for (let x = c - 9; x <= c + 9; x++) assert.equal(at(a, x, y)[3], 0, 'the text area stays clear');
  }
  const frames = Array.from({ length: AUTO_ARROW_PHASES }, (_, p) => Buffer.from(autoArrowPixels('on', p)).toString('base64'));
  assert.equal(new Set(frames).size, AUTO_ARROW_PHASES, 'every phase differs');
  assert.equal(Buffer.from(autoArrowPixels('on', AUTO_ARROW_PHASES)).toString('base64'), frames[0], 'and repeats');
});

test('states: disabled > on > hover > normal; the arrows turn only while on, from the clock', () => {
  assert.equal(autoButtonState(true, true, false), 'disabled');
  assert.equal(autoButtonState(true, true, true), 'on');
  assert.equal(autoButtonState(false, true, true), 'hover');
  assert.equal(autoButtonState(false, false, true), 'normal');
  assert.equal(autoArrowPhase('normal', 12_345), 0);
  assert.equal(autoArrowPhase('on', 0), 0);
  assert.equal(autoArrowPhase('on', AUTO_ARROW_STEP_MS * 3 + 1), 3);
  assert.equal(autoArrowPhase('on', AUTO_ARROW_STEP_MS * (AUTO_ARROW_PHASES + 2)), 2);
});
