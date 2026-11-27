import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { CHARACTER_SPRITE_MANIFEST, isApprovedCharacterSprite } from '../src/assets/CharacterSpriteManifest';
import { getCharacterSpriteId } from '../src/characters/CharacterAssetIds';
import { combatSetFor, PLAYER_COMBAT_ACTIONS, PLAYER_OPTIONAL_COMBAT_ACTIONS } from '../src/characters/combat/PlayerCombatArt';
import { createCharacterData, restoreCharacterData } from '../src/data/CharacterData';
import {
  allStarterAppearances,
  allTrialAppearances,
  STARTER_HAIRSTYLE_IDS,
  STARTER_OUTFIT_ID,
  starterHairColors,
  TRIAL_OUTFIT_IDS,
  trialAppearance,
} from '../src/data/StarterCharacters';
import { initLanguage, setLanguage, t } from '../src/i18n';
import { labels } from '../src/i18n/labels';
import { canCycle, cycleIndex, SELECTOR_ARROW_WIDTH, selectorRowLayout, selectorRowYs } from '../src/ui/selector/SelectorCycle';
import { readPng } from './helpers/png';

const PUBLIC = path.join(process.cwd(), 'public');
const read = (file: string): string => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
const COLOURS = ['blonde', 'black', 'silver', 'brown', 'red'];
const NEW_FEMALE = ['bob', 'ponytail', 'twin_buns', 'fluffy_curls', 'long_side_part'];

test('selector arrows: one step left / right, wrapping at both ends; a single option cannot cycle', () => {
  assert.equal(cycleIndex(0, 1, 7), 1);
  assert.equal(cycleIndex(6, 1, 7), 0, 'right from the last = the first');
  assert.equal(cycleIndex(0, -1, 7), 6, 'left from the first = the last');
  assert.equal(cycleIndex(1, -1, 2), 0);
  assert.equal(cycleIndex(0, 1, 1), 0);
  assert.equal(cycleIndex(-1, 1, 5), 0, 'an unknown current option starts from the first');
  assert.equal(cycleIndex(3, 1, 0), 0);
  assert.equal(cycleIndex(Number.NaN, 1, 5), 1);
  // every option is reached, in order, in both directions
  for (const n of [2, 5, 6, 7]) {
    let i = 0;
    const right = Array.from({ length: n }, () => (i = cycleIndex(i, 1, n)));
    assert.deepEqual(right, [...Array.from({ length: n - 1 }, (_, k) => k + 1), 0]);
    const left = Array.from({ length: n }, () => (i = cycleIndex(i, -1, n)));
    assert.deepEqual(left, Array.from({ length: n }, (_, k) => n - 1 - k));
  }
  assert.equal(canCycle(1), false);
  assert.equal(canCycle(0), false);
  assert.equal(canCycle(2), true);
});

test('selector row layout: arrows at both ends, the value centred between them; rows evenly spaced', () => {
  const l = selectorRowLayout(260, 28);
  assert.equal(l.arrowWidth, SELECTOR_ARROW_WIDTH);
  assert.equal(l.leftArrowX, -l.rightArrowX, 'mirrored around the centre');
  assert.equal(l.leftArrowX - l.arrowWidth / 2, -130, 'left arrow starts at the left edge');
  assert.equal(l.rightArrowX + l.arrowWidth / 2, 130, 'right arrow ends at the right edge');
  assert.equal(l.valueWidth, 260 - 2 * SELECTOR_ARROW_WIDTH);
  assert.ok(selectorRowLayout(80, 28).arrowWidth <= 20, 'a narrow bar keeps room for the value');
  const ys = selectorRowYs(146, 44, 5);
  assert.deepEqual(ys, [146, 190, 234, 278, 322]);
  assert.ok(ys.every((y, i) => i === 0 || y - ys[i - 1]! === 44), 'the same gap between every row');
});

test('female starters: Bald + 6 hairstyles, each hairstyle in all 5 colours, with approved Drifter and base art on disk', () => {
  assert.deepEqual(STARTER_HAIRSTYLE_IDS.female, ['bald', 'straight_bangs', ...NEW_FEMALE]);
  for (const hairstyleId of NEW_FEMALE) {
    assert.deepEqual(starterHairColors(hairstyleId), COLOURS, hairstyleId);
    assert.ok(!STARTER_HAIRSTYLE_IDS.male.includes(hairstyleId), `${hairstyleId} is female only`);
    for (const hairColorId of COLOURS) {
      for (const outfitId of TRIAL_OUTFIT_IDS) {
        const id = getCharacterSpriteId({ gender: 'female', hairstyleId, hairColorId, outfitId });
        const entry = CHARACTER_SPRITE_MANIFEST[id];
        assert.ok(entry && isApprovedCharacterSprite(id), `${id} approved`);
        const standing = readPng(path.join(PUBLIC, entry.standing));
        assert.deepEqual([standing.width, standing.height], [256, 128], `${id} static 8 directions`);
        const walk = readPng(path.join(PUBLIC, entry.walk!));
        assert.deepEqual([walk.width, walk.height], [384, 512], `${id} walk 6 x 8`);
      }
    }
  }
});

test('female combat art: every new hairstyle / colour has all approved combat animations, 4 facings each', () => {
  for (const hairstyleId of NEW_FEMALE) {
    for (const hairColorId of COLOURS) {
      const id = getCharacterSpriteId({ gender: 'female', hairstyleId, hairColorId, outfitId: STARTER_OUTFIT_ID });
      const set = combatSetFor(id);
      assert.ok(set, `${id} has combat art`);
      assert.equal(set.basePath, `assets/characters/female/${hairstyleId}_${hairColorId}/drifter/combat/`);
      const sheets = [...PLAYER_COMBAT_ACTIONS.map((a) => [a, set.actions[a]] as const), ...PLAYER_OPTIONAL_COMBAT_ACTIONS.map((a) => [a, set.optional[a]] as const)];
      for (const [action, sheet] of sheets) {
        assert.ok(sheet, `${id}: ${action} exported`);
        assert.deepEqual(sheet.rows, ['SE', 'SW', 'NE', 'NW'], `${id} ${action} facings`);
        const png = readPng(path.join(PUBLIC, set.basePath, sheet.file));
        assert.deepEqual([png.width, png.height], [sheet.frames * sheet.frameWidth, 4 * sheet.frameHeight], `${id} ${action} sheet size`);
      }
      // the same clip timing as every other appearance (hit frame, cast lock)
      assert.equal(set.actions.dagger_thrust.frameMs, 100);
      assert.equal(set.actions.self_heal_cast.frames * set.actions.self_heal_cast.frameMs, 800);
    }
  }
});

test('Trial Outfit: a preview only - every starter look has art for each trial outfit; the character starts in Drifter', () => {
  assert.deepEqual(TRIAL_OUTFIT_IDS, ['drifter', 'basic']);
  assert.equal(TRIAL_OUTFIT_IDS[0], STARTER_OUTFIT_ID, 'the starter outfit is shown first');
  const starters = allStarterAppearances();
  assert.equal(allTrialAppearances().length, starters.length * TRIAL_OUTFIT_IDS.length);
  for (const look of allTrialAppearances()) {
    const id = getCharacterSpriteId(look);
    assert.ok(isApprovedCharacterSprite(id), `${id} approved`);
    assert.ok(fs.existsSync(path.join(PUBLIC, CHARACTER_SPRITE_MANIFEST[id]!.standing)), `${id} standing sheet on disk`);
  }
  const bob = starters.find((a) => a.gender === 'female' && a.hairstyleId === 'bob' && a.hairColorId === 'red')!;
  assert.deepEqual(trialAppearance(bob, 'basic'), { ...bob, outfitId: 'basic' });
  assert.deepEqual(trialAppearance(bob, 'no_such_outfit'), bob, 'an unknown outfit = the starter outfit');
  assert.equal(bob.outfitId, 'drifter', 'the selection itself is never changed by the preview');
  // creating a character ignores the trial outfit: gender, hairstyle and colour only
  const created = createCharacterData('Trial', { gender: 'female', hairstyleId: 'bob', hairColorId: 'red' });
  assert.deepEqual(created.appearance, { gender: 'female', hairstyleId: 'bob', hairColorId: 'red', outfitId: 'drifter' });
});

test('save / load: every female starter look comes back unchanged, and so do older looks', () => {
  for (const appearance of allStarterAppearances().filter((a) => a.gender === 'female')) {
    const created = createCharacterData('Saved', { gender: 'female', hairstyleId: appearance.hairstyleId, hairColorId: appearance.hairColorId });
    assert.deepEqual(created.appearance, appearance);
    const restored = restoreCharacterData(JSON.parse(JSON.stringify(created)));
    assert.deepEqual(restored.appearance, appearance, `${getCharacterSpriteId(appearance)} round trip`);
  }
  // looks saved before this export are restored exactly as they were (no starter rule is re-applied)
  for (const old of [
    { gender: 'female', hairstyleId: 'straight_bangs', hairColorId: 'silver', outfitId: 'drifter' },
    { gender: 'female', hairstyleId: 'bald', hairColorId: 'none', outfitId: 'drifter' },
    { gender: 'male', hairstyleId: 'long_middle_part', hairColorId: 'brown', outfitId: 'drifter' },
    { gender: 'male', hairstyleId: 'mohawk', hairColorId: 'blonde', outfitId: 'basic' },
  ] as const) {
    const restored = restoreCharacterData({ name: 'Old', appearance: { ...old }, classId: 'drifter', createdAt: 1 });
    assert.deepEqual(restored.appearance, old);
    assert.ok(isApprovedCharacterSprite(getCharacterSpriteId(restored.appearance)));
  }
});

test('creation screen: four arrow selector rows wired to the preview; names in Thai and English', () => {
  const scene = read('src/scenes/CharacterCreationScene.ts');
  for (const [field, handler, key] of [
    ['genderRow', 'cycleGender', 'creation.gender'],
    ['hairstyleRow', 'cycleHairstyle', 'creation.hairstyle'],
    ['hairColorRow', 'cycleHairColor', 'creation.hairColor'],
    ['outfitRow', 'cycleTrialOutfit', 'creation.trialOutfit'],
  ] as const) {
    assert.match(scene, new RegExp(`this\\.${field} = selector\\(\\w+, \\(delta\\) => this\\.${handler}\\(delta\\)\\);`), `${field} uses the shared selector row`);
    assert.match(scene, new RegExp(`row\\(\\w+, '0\\d', '${key}'\\);`), `${key} label`);
    assert.match(scene, new RegExp(`this\\.${field}\\.setValue\\(`), `${field} shows the current value`);
  }
  // one bar size and one gap for every row; the name field continues the column
  assert.match(scene, /selectorRowYs\(SELECTOR\.firstY, SELECTOR\.step, 5\)/);
  assert.match(scene, /new SelectorRow\(this, SELECTOR\.x, y, \{ width: SELECTOR\.width, height: SELECTOR\.height, onCycle \}\)/);
  assert.match(scene, /new TextInputField\(this, SELECTOR\.x, nameY, \{\s*width: SELECTOR\.width,/);
  // the preview follows every change at once and wears the trial outfit; the created character does not
  assert.match(scene, /const shown = trialAppearance\(this\.appearance, this\.trialOutfitId\);\s*this\.preview\?\.setAppearance\(shown\);/);
  assert.match(scene, /createCharacterData\(name, \{ gender: this\.appearance\.gender, hairstyleId: this\.appearance\.hairstyleId, hairColorId: this\.appearance\.hairColorId \}\)/);
  assert.doesNotMatch(scene, /genderButtons|hairstyleButtons|hairColorButtons/, 'the old button grids are gone');
  // the row itself: the owner cycles, a single option is inert
  const row = read('src/ui/SelectorRow.ts');
  assert.match(row, /if \(wasPressed && this\.cyclable\) this\.options\.onCycle\(delta\);/);
  assert.match(row, /this\.cyclable = canCycle\(count\);/);

  initLanguage({ getItem: () => null, setItem: () => undefined });
  assert.deepEqual([t('creation.trialOutfit'), ...NEW_FEMALE.map((h) => labels.hairstyle(h)), labels.outfit('basic')], ['ลองชุด', 'บ็อบ', 'หางม้า', 'สองมวย', 'ลอนฟู', 'ยาวตรงแสกข้าง', 'แก้ผ้า']);
  setLanguage('en');
  assert.deepEqual([t('creation.trialOutfit'), ...NEW_FEMALE.map((h) => labels.hairstyle(h)), labels.outfit('basic')], ['Trial Outfit', 'Bob', 'Ponytail', 'Twin Buns', 'Fluffy Curls', 'Long Side Part', 'Basic Wraps']);
  setLanguage('th');
});
