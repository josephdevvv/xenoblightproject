import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { SPRITE_FORGE_CHARACTER_VARIANTS } from '../src/assets/SpriteForgeCharacters';
import { walkSpriteIdOf } from '../src/characters/CharacterAssetIds';
import { BODY_MASTERS, bodyMasterOf, bodyNormalizeFor, CHARACTER_BODY_DISPLAY_HEIGHT } from '../src/characters/CharacterBodyMetrics';
import { readPng, type Rgba } from './helpers/png';

const PUBLIC = path.join(process.cwd(), 'public');
const FRAME = 64;

function frameRows(img: Rgba, col: number, row: number): { top: number; bottom: number; mask: string[] } {
  let top = -1;
  let bottom = -1;
  const mask: string[] = [];
  for (let y = 0; y < FRAME; y++) {
    let line = '';
    for (let x = 0; x < FRAME; x++) {
      const i = (((row * FRAME + y) * img.width) + col * FRAME + x) * 4;
      line += img.data[i + 3] >= 128 ? `${img.data[i]},${img.data[i + 1]},${img.data[i + 2]};` : '.;';
    }
    mask.push(line);
    if (line.replace(/\.;/g, '').length > 0) {
      if (top < 0) top = y;
      bottom = y;
    }
  }
  return { top, bottom, mask };
}

const variant = (key: string) => {
  const v = SPRITE_FORGE_CHARACTER_VARIANTS.find((x) => x.key === key);
  assert.ok(v, key);
  return v;
};

test('body master heights match the bald (hair-free) reference sheets', () => {
  for (const [id, master] of Object.entries(BODY_MASTERS)) {
    const f = frameRows(readPng(path.join(PUBLIC, master.referenceSheet)), 0, 0);
    assert.equal(f.bottom - f.top + 1, master.bodyHeight, `${id}: re-measure ${master.referenceSheet}`);
  }
});

test('every approved sheet (static + walk) has a body master and one shared scale', () => {
  for (const v of SPRITE_FORGE_CHARACTER_VARIANTS) {
    const master = bodyMasterOf(v.spriteId);
    assert.ok(master && BODY_MASTERS[master], `${v.key} has a known master`);
    assert.equal(bodyMasterOf(walkSpriteIdOf(v.spriteId)), master);
    assert.equal(bodyNormalizeFor(v.spriteId), bodyNormalizeFor(walkSpriteIdOf(v.spriteId)), `${v.key}: static == walk`);
  }
});

test('the haired reference (male mohawk blonde drifter) keeps its previous size; bald now matches it', () => {
  const mohawk = bodyNormalizeFor('char_male_mohawk_blonde_drifter')!;
  const bald = bodyNormalizeFor('char_male_bald_none_drifter')!;
  // Previous rule: 54 px / full figure height (mohawk 55 px with hair).
  assert.ok(Math.abs(mohawk - 54 / 55) < 1e-9, `mohawk x${mohawk}`);
  assert.equal(bald, mohawk);
  assert.ok(Math.abs(CHARACTER_BODY_DISPLAY_HEIGHT - 48.109) < 0.001);
});

const PAIRS: [string, string][] = [
  ['male_bald_drifter', 'male_spike_blonde_drifter'],
  ['female_bald_drifter', 'female_straight_bangs_blonde_drifter'],
  ['male_bald_base', 'male_spike_blonde_base'],
  ['female_bald_base', 'female_straight_bangs_blonde_base'],
  ...['blonde', 'black', 'silver', 'brown', 'red'].flatMap((c): [string, string][] => [['male_bald_drifter', `male_side_swept_${c}_drifter`], ['male_bald_base', `male_side_swept_${c}_base`]]),
  ...['black', 'silver', 'brown', 'red'].flatMap((c): [string, string][] => [
    ['male_bald_drifter', `male_spike_${c}_drifter`], ['male_bald_base', `male_spike_${c}_base`],
    ['female_bald_drifter', `female_straight_bangs_${c}_drifter`], ['female_bald_base', `female_straight_bangs_${c}_base`],
  ]),
];

for (const [baldKey, hairKey] of PAIRS) {
  test(`${baldKey} vs ${hairKey}: same body pixels, same scale, same foot baseline`, () => {
    const bald = variant(baldKey);
    const hair = variant(hairKey);
    assert.equal(bodyNormalizeFor(bald.spriteId), bodyNormalizeFor(hair.spriteId), 'same display scale');

    const bs = readPng(path.join(PUBLIC, bald.standing));
    const hs = readPng(path.join(PUBLIC, hair.standing));
    for (let i = 0; i < 8; i++) {
      const b = frameRows(bs, i % 4, Math.floor(i / 4));
      const h = frameRows(hs, i % 4, Math.floor(i / 4));
      assert.equal(h.bottom, b.bottom, `static frame ${i}: foot baseline`);
      // Hair only adds pixels above the head: hair never changes the body scale.
      assert.ok(h.top <= b.top, `static frame ${i}: hair is above the bald head`);
    }
    // Front frame: legs and torso (rows 26..63) are pixel-identical, so equal scale = equal legs.
    const bf = frameRows(bs, 0, 0);
    const hf = frameRows(hs, 0, 0);
    for (let y = 26; y < FRAME; y++) assert.equal(hf.mask[y], bf.mask[y], `front frame row ${y} (lower body)`);

    const bw = readPng(path.join(PUBLIC, bald.walk));
    const hw = readPng(path.join(PUBLIC, hair.walk));
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 6; c++) {
        assert.equal(frameRows(hw, c, r).bottom, frameRows(bw, c, r).bottom, `walk row ${r} frame ${c}: foot baseline`);
      }
    }
  });
}

test('report: normalisation values per variant', () => {
  const lines = SPRITE_FORGE_CHARACTER_VARIANTS.map((v) => {
    const f = frameRows(readPng(path.join(PUBLIC, v.standing)), 0, 0);
    const scale = bodyNormalizeFor(v.spriteId)!;
    const before = 54 / (f.bottom - f.top + 1);
    return `${v.key.padEnd(38)} master ${bodyMasterOf(v.spriteId)}  figure ${f.bottom - f.top + 1}px (top ${f.top}, feet ${f.bottom})  scale before x${before.toFixed(3)} -> now x${scale.toFixed(3)} (static = walk)`;
  });
  console.log(lines.join('\n'));
});
