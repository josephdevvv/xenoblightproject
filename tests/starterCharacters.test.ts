import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { CHARACTER_SPRITE_MANIFEST, isApprovedCharacterSprite } from '../src/assets/CharacterSpriteManifest';
import { getCharacterSpriteId } from '../src/characters/CharacterAssetIds';
import { CHARACTER_DIRECTION_FRAMES, CHARACTER_WALK_LAYOUT } from '../src/characters/CharacterSheetLayout';
import { DIRECTIONS } from '../src/core/Direction';
import { createCharacterData, createDefaultAppearance, restoreCharacterData } from '../src/data/CharacterData';
import { CharacterProfileStore, LAST_CHARACTER_KEY, profileKey } from '../src/data/CharacterProfileStore';
import {
  allStarterAppearances,
  STARTER_CLASS_ID,
  STARTER_HAIRSTYLE_IDS,
  starterAppearance,
  starterHairColors,
  starterHairstyles,
} from '../src/data/StarterCharacters';
import { initLanguage, setLanguage } from '../src/i18n';
import { labels } from '../src/i18n/labels';
import { t } from '../src/i18n';
import type { SettingsStorage } from '../src/settings/SettingsStore';

const PUBLIC = path.join(process.cwd(), 'public');

function memoryStorage(initial: Record<string, string> = {}): SettingsStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => void (data[k] = v) };
}

function pngSize(file: string): { width: number; height: number } {
  const b = fs.readFileSync(file);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

test('starter hairstyles per gender, Bald first (male: + Mohawk, Side Swept)', () => {
  assert.deepEqual(STARTER_HAIRSTYLE_IDS, { male: ['bald', 'mohawk', 'side_swept'], female: ['bald', 'straight_bangs'] });
  assert.deepEqual(starterHairstyles('male').map((h) => h.id), ['bald', 'mohawk', 'side_swept']);
  assert.deepEqual(starterHairstyles('female').map((h) => h.id), ['bald', 'straight_bangs']);
});

test('exactly the required starter appearances (Side Swept in all 5 colours)', () => {
  assert.deepEqual(starterHairColors('side_swept'), ['blonde', 'black', 'silver', 'brown', 'red']);
  assert.deepEqual(starterHairColors('mohawk'), ['blonde']);
  assert.deepEqual(starterHairColors('bald'), ['none']);
  assert.deepEqual(allStarterAppearances(), [
    { gender: 'male', hairstyleId: 'bald', hairColorId: 'none', outfitId: 'drifter' },
    { gender: 'male', hairstyleId: 'mohawk', hairColorId: 'blonde', outfitId: 'drifter' },
    ...['blonde', 'black', 'silver', 'brown', 'red'].map((c) => ({ gender: 'male', hairstyleId: 'side_swept', hairColorId: c, outfitId: 'drifter' })),
    { gender: 'female', hairstyleId: 'bald', hairColorId: 'none', outfitId: 'drifter' },
    { gender: 'female', hairstyleId: 'straight_bangs', hairColorId: 'blonde', outfitId: 'drifter' },
  ]);
});

test('each starter resolves to approved Drifter sheets that exist on disk', () => {
  const expected: Record<string, string> = {
    char_male_bald_none_drifter: 'male/bald/drifter/male_bald_drifter',
    char_male_mohawk_blonde_drifter: 'male/spike_blonde/drifter/male_spike_blonde_drifter',
    ...Object.fromEntries(['blonde', 'black', 'silver', 'brown', 'red'].map((c) => [`char_male_side_swept_${c}_drifter`, `male/side_swept_${c}/drifter/male_side_swept_${c}_drifter`])),
    char_female_bald_none_drifter: 'female/bald/drifter/female_bald_drifter',
    char_female_straight_bangs_blonde_drifter: 'female/straight_bangs_blonde/drifter/female_straight_bangs_blonde_drifter',
  };
  for (const appearance of allStarterAppearances()) {
    const id = getCharacterSpriteId(appearance);
    const entry = CHARACTER_SPRITE_MANIFEST[id];
    assert.ok(entry, `${id} registered`);
    assert.ok(isApprovedCharacterSprite(id), `${id} approved`);
    const base = `assets/characters/${expected[id]}`;
    assert.equal(entry.standing, `${base}_static_8dir.png`);
    // walk sheets may be a Sprite Forge revision (<key>_walk_8dir_rN.png), e.g. the r2 Male South walk face fix
    assert.match(entry.walk!, new RegExp(`^${base}_walk_8dir(_r\\d+)?\\.png$`));
    assert.deepEqual(pngSize(path.join(PUBLIC, entry.standing)), { width: 256, height: 128 }, `${id} static`);
    assert.deepEqual(pngSize(path.join(PUBLIC, entry.walk!)), { width: 384, height: 512 }, `${id} walk`);
  }
});

test('the game animation contract matches the exported metadata (8 dirs, 6 frames, 125 ms)', () => {
  for (const appearance of allStarterAppearances()) {
    const entry = CHARACTER_SPRITE_MANIFEST[getCharacterSpriteId(appearance)];
    const info = JSON.parse(fs.readFileSync(path.join(PUBLIC, entry.walk!.replace(/_walk_8dir(_r\d+)?\.png$/, '$1.json')), 'utf8'));
    assert.deepEqual(info.static.sheet.order, ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW']);
    for (const [i, d] of info.static.sheet.order.entries()) assert.equal(CHARACTER_DIRECTION_FRAMES[d as keyof typeof CHARACTER_DIRECTION_FRAMES], i);
    const meta = JSON.parse(fs.readFileSync(path.join(PUBLIC, info.walk.metadata), 'utf8'));
    assert.equal(meta.layout.columns, CHARACTER_WALK_LAYOUT.columns);
    assert.equal(meta.layout.rows, 8);
    assert.equal(meta.frameMs, 125);
    assert.equal(1000 / CHARACTER_WALK_LAYOUT.frameRate, meta.frameMs);
    for (const [row, d] of meta.layout.order.entries()) assert.equal(CHARACTER_WALK_LAYOUT.rows[d as keyof typeof CHARACTER_WALK_LAYOUT.rows], row);
    assert.equal(meta.layout.order.length, DIRECTIONS.length);
  }
});

test('the manifest only references files that exist (no broken paths)', () => {
  for (const [id, entry] of Object.entries(CHARACTER_SPRITE_MANIFEST)) {
    assert.ok(fs.existsSync(path.join(PUBLIC, entry.standing)), `${id}: ${entry.standing}`);
    if (entry.walk) assert.ok(fs.existsSync(path.join(PUBLIC, entry.walk)), `${id}: ${entry.walk}`);
  }
});

test('new characters are always Drifters with the fixed hair colour', () => {
  // Whatever else is passed in, only gender + hairstyle are taken from the caller.
  const tricky = { gender: 'male' as const, hairstyleId: 'mohawk', hairColorId: 'red', outfitId: 'adventurer' };
  const c = createCharacterData('Aria', tricky);
  assert.deepEqual(c.appearance, { gender: 'male', hairstyleId: 'mohawk', hairColorId: 'blonde', outfitId: 'drifter' });
  assert.equal(c.classId, STARTER_CLASS_ID);
  assert.equal(c.classId, 'drifter');
  // Side Swept: the chosen colour is kept when it is one of its 5 approved colours, otherwise its default (blonde).
  assert.equal(createCharacterData('Sora', { gender: 'male', hairstyleId: 'side_swept', hairColorId: 'red' }).appearance.hairColorId, 'red');
  assert.equal(createCharacterData('Sora', { gender: 'male', hairstyleId: 'side_swept', hairColorId: 'green' }).appearance.hairColorId, 'blonde');
  assert.equal(createCharacterData('Sora', { gender: 'male', hairstyleId: 'side_swept' }).appearance.hairColorId, 'blonde');
  assert.equal(createCharacterData('Bob', { gender: 'male', hairstyleId: 'bald', hairColorId: 'red' }).appearance.hairColorId, 'none');
  const bald = createCharacterData('Bob', { gender: 'female', hairstyleId: 'bald' });
  assert.deepEqual(bald.appearance, { gender: 'female', hairstyleId: 'bald', hairColorId: 'none', outfitId: 'drifter' });
  assert.equal(createDefaultAppearance().outfitId, 'drifter');
});

test('unavailable gender / hairstyle never produce an unsupported look', () => {
  assert.deepEqual(starterAppearance({ gender: 'male', hairstyleId: 'ponytail' }), starterAppearance({ gender: 'male', hairstyleId: 'mohawk' }));
  assert.equal(starterAppearance({ gender: 'female', hairstyleId: 'mohawk' }).hairstyleId, 'straight_bangs');
  assert.equal(starterAppearance({ gender: 'robot' as never, hairstyleId: 'bald' }).gender, 'male');
  for (const a of [starterAppearance({}), starterAppearance({ gender: 'female' })]) {
    assert.ok(CHARACTER_SPRITE_MANIFEST[getCharacterSpriteId(a)], getCharacterSpriteId(a));
  }
});

test('profiles: saved appearance + class persist and existing characters are restored unchanged', () => {
  const store = memoryStorage();
  const created = createCharacterData('Kaito', { gender: 'male', hairstyleId: 'bald' });
  assert.equal(CharacterProfileStore.save({ name: created.name, appearance: created.appearance, classId: created.classId, createdAt: created.createdAt }, store), true);
  CharacterProfileStore.setLastPlayed('Kaito', store);

  const loaded = CharacterProfileStore.load('  kaito ', store);
  assert.equal(loaded.kind, 'loaded');
  if (loaded.kind !== 'loaded') return;
  assert.deepEqual(loaded.profile.appearance, { gender: 'male', hairstyleId: 'bald', hairColorId: 'none', outfitId: 'drifter' });
  assert.equal(loaded.profile.classId, 'drifter');
  assert.equal(CharacterProfileStore.loadLastPlayed(store)?.name, 'Kaito');
  assert.equal(store.data[LAST_CHARACTER_KEY], 'Kaito');

  // Side Swept in every colour: saved, loaded and restored unchanged, and it resolves to its approved art.
  for (const c of starterHairColors('side_swept')) {
    const ss = createCharacterData(`Side ${c}`, { gender: 'male', hairstyleId: 'side_swept', hairColorId: c });
    assert.equal(CharacterProfileStore.save({ name: ss.name, appearance: ss.appearance, classId: ss.classId, createdAt: ss.createdAt }, store), true);
    const back = CharacterProfileStore.load(`side ${c}`, store);
    assert.equal(back.kind, 'loaded');
    if (back.kind !== 'loaded') return;
    assert.deepEqual(back.profile.appearance, { gender: 'male', hairstyleId: 'side_swept', hairColorId: c, outfitId: 'drifter' });
    const again = restoreCharacterData(back.profile);
    assert.deepEqual(again.appearance, back.profile.appearance);
    assert.ok(isApprovedCharacterSprite(getCharacterSpriteId(again.appearance)), `side_swept ${c} has approved art`);
  }

  // An existing character with a different class / outfit is restored as saved (not re-defaulted).
  const legacy = { name: 'Old', appearance: { gender: 'female' as const, hairstyleId: 'bob', hairColorId: 'red', outfitId: 'adventurer' }, classId: 'vanguard', createdAt: 123 };
  const restored = restoreCharacterData(legacy);
  assert.deepEqual(restored.appearance, legacy.appearance);
  assert.equal(restored.classId, 'vanguard');
  assert.equal(restored.createdAt, 123);
});

test('profiles: missing and invalid records are reported, never thrown', () => {
  const store = memoryStorage({ [profileKey('Broken')]: '{oops', [profileKey('Half')]: JSON.stringify({ name: 'Half', appearance: { gender: 'x' } }) });
  assert.equal(CharacterProfileStore.load('Nobody', store).kind, 'missing');
  assert.equal(CharacterProfileStore.load('Broken', store).kind, 'invalid');
  assert.equal(CharacterProfileStore.load('Half', store).kind, 'invalid');
  CharacterProfileStore.backupInvalid('Broken', store);
  assert.equal(store.data[`${profileKey('Broken')}.invalid-backup`], '{oops');
  assert.equal(CharacterProfileStore.load('x', null).kind, 'missing');
});

test('creation labels exist in Thai (default) and English', () => {
  initLanguage(memoryStorage());
  assert.deepEqual(
    [t('creation.gender'), labels.gender('male'), labels.gender('female'), t('creation.hairstyle'), labels.hairstyle('bald'), labels.hairstyle('mohawk'), labels.hairstyle('straight_bangs'), t('creation.outfitPreview'), labels.outfit('drifter')],
    ['เพศ', 'ชาย', 'หญิง', 'ทรงผม', 'หัวโล้น', 'โมฮอว์ก', 'หน้าม้าตรง', 'ตัวอย่างชุด', 'ดริฟเตอร์'],
  );
  setLanguage('en');
  assert.deepEqual(
    [t('creation.gender'), labels.gender('male'), labels.gender('female'), t('creation.hairstyle'), labels.hairstyle('bald'), labels.hairstyle('mohawk'), labels.hairstyle('straight_bangs'), t('creation.outfitPreview'), labels.outfit('drifter')],
    ['Gender', 'Male', 'Female', 'Hairstyle', 'Bald', 'Mohawk', 'Straight Bangs', 'Outfit Preview', 'Drifter'],
  );
  setLanguage('th');
});

test('hair colour row labels exist in Thai (default) and English', () => {
  initLanguage(memoryStorage());
  assert.deepEqual([t('creation.hairColor'), labels.hairstyle('side_swept'), labels.hairColor('silver')], ['สีผม', 'แสกปัด', 'เงิน/ขาว']);
  setLanguage('en');
  assert.deepEqual([t('creation.hairColor'), labels.hairstyle('side_swept'), labels.hairColor('silver')], ['Hair Colour', 'Side Swept', 'Silver']);
  setLanguage('th');
});
