import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { HAIR_COLORS, HAIRSTYLES, OUTFITS } from '../src/data/AppearanceCatalog';
import { getCharacterSpriteId } from '../src/characters/CharacterAssetIds';
import { CHARACTER_SPRITE_MANIFEST } from '../src/assets/CharacterSpriteManifest';
import { SPRITE_FORGE_CHARACTER_VARIANTS } from '../src/assets/SpriteForgeCharacters';

const PUBLIC = path.join(process.cwd(), 'public');

/** PNG width/height from the IHDR chunk. */
function pngSize(file: string): { width: number; height: number } {
  const b = fs.readFileSync(file);
  assert.equal(b.toString('ascii', 12, 16), 'IHDR', `${file} is not a PNG`);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

test('Sprite Forge exports: 114 approved variants, each resolvable by appearance', () => {
  assert.equal(SPRITE_FORGE_CHARACTER_VARIANTS.length, 114);
  const keys = SPRITE_FORGE_CHARACTER_VARIANTS.map((v) => v.key).sort();
  assert.deepEqual(keys, [
    'female_bald_base', 'female_bald_drifter',
    ...['bob', 'fluffy_curls', 'long_side_part', 'ponytail', 'straight_bangs', 'twin_buns'].flatMap((hs) => ['black', 'blonde', 'brown', 'red', 'silver'].flatMap((c) => [`female_${hs}_${c}_base`, `female_${hs}_${c}_drifter`])),
    'male_bald_base', 'male_bald_drifter',
    ...['black', 'blonde', 'brown', 'red', 'silver'].flatMap((c) => [`male_long_middle_part_${c}_base`, `male_long_middle_part_${c}_drifter`]),
    ...['black', 'blonde', 'brown', 'red', 'silver'].flatMap((c) => [`male_middle_part_${c}_base`, `male_middle_part_${c}_drifter`]),
    ...['black', 'blonde', 'brown', 'red', 'silver'].flatMap((c) => [`male_side_swept_${c}_base`, `male_side_swept_${c}_drifter`]),
    ...['black', 'blonde', 'brown', 'red', 'silver'].flatMap((c) => [`male_slicked_back_${c}_base`, `male_slicked_back_${c}_drifter`]),
    ...['black', 'blonde', 'brown', 'red', 'silver'].flatMap((c) => [`male_spike_${c}_base`, `male_spike_${c}_drifter`]),
  ]);
  for (const v of SPRITE_FORGE_CHARACTER_VARIANTS) {
    const id = getCharacterSpriteId({ ...v.appearance });
    assert.equal(id, v.spriteId);
    assert.deepEqual(CHARACTER_SPRITE_MANIFEST[id], { standing: v.standing, walk: v.walk }, `${id} registered with static + walk`);
    // the selectable catalog options exist (bald: any catalog colour resolves to the same art)
    assert.ok(HAIRSTYLES[v.appearance.gender].some((h) => h.id === v.appearance.hairstyleId), `${v.appearance.hairstyleId} selectable`);
    assert.ok(OUTFITS.some((o) => o.id === v.appearance.outfitId), `${v.appearance.outfitId} selectable`);
    const colours = v.appearance.hairstyleId === 'bald' ? HAIR_COLORS.map((c) => c.id) : [v.appearance.hairColorId];
    for (const c of colours) {
      const sid = getCharacterSpriteId({ ...v.appearance, hairColorId: c });
      assert.deepEqual(CHARACTER_SPRITE_MANIFEST[sid], { standing: v.standing, walk: v.walk }, `${sid} resolves to ${v.key}`);
    }
  }
});

test('Sprite Forge exports: files exist with the game sheet sizes (64x64 frames)', () => {
  for (const v of SPRITE_FORGE_CHARACTER_VARIANTS) {
    assert.deepEqual(pngSize(path.join(PUBLIC, v.standing)), { width: 256, height: 128 }, `${v.key} static 4x2`);
    assert.deepEqual(pngSize(path.join(PUBLIC, v.walk)), { width: 384, height: 512 }, `${v.key} walk 6x8`);
    const info = JSON.parse(fs.readFileSync(path.join(PUBLIC, v.info), 'utf8'));
    assert.equal(info.walk.frames, 48);
    assert.equal(info.walk.frameMs, 125);
    assert.equal(v.frameMs, 125);
    const meta = JSON.parse(fs.readFileSync(path.join(PUBLIC, info.walk.metadata), 'utf8'));
    assert.equal(meta.frames.length, 48);
    assert.equal(meta.frameMs, 125);
    assert.deepEqual(meta.layout.order, ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW']);
  }
});
