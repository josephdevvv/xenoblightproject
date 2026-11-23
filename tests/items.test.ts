import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { createCharacterData } from '../src/data/CharacterData';
import { initLanguage, setLanguage } from '../src/i18n';
import { labels } from '../src/i18n/labels';
import { EMPTY_INVENTORY, EQUIPMENT_SLOTS, INVENTORY_SLOT_COUNT } from '../src/inventory/InventorySlots';
import { ITEM_CATALOG, itemDefinition, itemIconKey } from '../src/items/ItemCatalog';
import { createItemCatalog, itemProblems, type ItemDefinition } from '../src/items/ItemDefinition';
import { readPng } from './helpers/png';

const ID = 'weapon_rusty_dagger';
const TEXTS = {
  th: { name: 'มีดสนิม', description: 'มีดสั้นที่ถูกสนิมกัดกิน คมทื่อไปมาก แต่ยังพอใช้ฟันศัตรูได้' },
  en: { name: 'Rusty Dagger', description: 'A short dagger eaten by rust. Its edge is dull, yet it still bites.' },
} as const;
/** Earlier ids of this item: must be gone everywhere. */
const OLD_IDS = ['weapon_mit_sanit'];
/** SHA-256 of rusty_dagger_icon_32x32.png (PixelLab, approved for the 32 px icon update). */
const ICON_SHA256 = '26dd4db6948641da57cdec6345d85c8ce3a0c54e01c9733327a2d59f042df51c';

const root = process.cwd();
const dagger = (): ItemDefinition => itemDefinition(ID)!;

test('the first item is exactly as specified; only it and the starter armor exist', () => {
  assert.deepEqual([...ITEM_CATALOG.keys()], [ID, 'armor_worn_cloth', 'consumable_red_healing_potion', 'consumable_sp_recovery_potion', 'scroll_power_thrust', 'scroll_heal']);
  const { icon, ...rest } = dagger();
  assert.deepEqual(rest, {
    id: ID,
    category: 'equipment',
    equipmentSlot: 'weapon',
    weaponType: 'dagger',
    requiredLevel: 1,
    bonuses: { physicalAtk: 4, magicAtk: 0 },
    additionalStats: {},
    specialEffects: [],
    stackable: false,
  });
  assert.deepEqual(icon, { url: 'assets/items/weapons/rusty_dagger_icon_32x32.png', width: 32, height: 32 });
  for (const id of ['unknown', ...OLD_IDS]) assert.equal(itemDefinition(id), undefined);
  assert.equal(itemIconKey(ID), 'item.icon.weapon_rusty_dagger');
});

test('Thai and English name and description are exact', () => {
  initLanguage(null);
  for (const language of ['en', 'th'] as const) {
    setLanguage(language);
    assert.deepEqual({ name: labels.itemName(ID), description: labels.itemDescription(ID) }, TEXTS[language]);
  }
});

test('every item has a name and a description in every language', () => {
  initLanguage(null);
  for (const language of ['th', 'en'] as const) {
    setLanguage(language);
    for (const id of ITEM_CATALOG.keys()) for (const text of [labels.itemName(id), labels.itemDescription(id)]) assert.ok(text.length > 0 && !text.startsWith('items.'), `${language} ${id}`);
  }
  setLanguage('th');
});

test('icon: the approved file byte for byte, 32x32, transparent background, hard pixels only', () => {
  const file = path.join(root, 'public', dagger().icon.url);
  assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'), ICON_SHA256);
  const png = readPng(file);
  assert.deepEqual([png.width, png.height], [32, 32]);
  const alphas = Array.from({ length: 32 * 32 }, (_, i) => png.data[i * 4 + 3]);
  assert.ok(alphas.every((a) => a === 0 || a === 255), 'no anti-aliasing');
  assert.equal(alphas.filter((a) => a === 0).length, 744);
});

test('32 px icons: the dagger, the starter armor and both scrolls; every one transparent with hard pixels; scrolls differ', () => {
  const ids = ['weapon_rusty_dagger', 'armor_worn_cloth', 'scroll_power_thrust', 'scroll_heal'];
  const files = ids.map((id) => {
    const { icon } = itemDefinition(id)!;
    assert.deepEqual([icon.width, icon.height], [32, 32], id);
    const file = path.join(root, 'public', icon.url);
    const png = readPng(file);
    assert.deepEqual([png.width, png.height], [32, 32], id);
    for (let i = 3; i < png.data.length; i += 4) assert.ok(png.data[i] === 0 || png.data[i] === 255, `${id}: hard pixels`);
    for (const [x, y] of [[0, 0], [31, 31]]) assert.equal(png.data[(y * 32 + x) * 4 + 3], 0, `${id}: transparent corner`);
    return fs.readFileSync(file);
  });
  assert.equal(new Set(files.map((b) => b.toString('base64'))).size, 4, 'four different pictures');
  assert.equal(itemDefinition('consumable_red_healing_potion')!.icon.width, 16, 'the potion keeps its 16 px icon');
});

test('every icon file exists and has the declared size', () => {
  for (const { id, icon } of ITEM_CATALOG.values()) {
    const png = readPng(path.join(root, 'public', icon.url));
    assert.deepEqual([png.width, png.height], [icon.width, icon.height], id);
  }
});

test('catalog: duplicate ids and invalid definitions are refused', () => {
  const d = dagger();
  assert.deepEqual(itemProblems(d), []);
  assert.throws(() => createItemCatalog([d, { ...d }]), /defined twice/);
  const bad: Partial<ItemDefinition>[] = [
    { id: 'Bad Id' },
    { equipmentSlot: 'ring' as never },
    { weaponType: null },
    { weaponType: 'axe' as never },
    { equipmentSlot: 'hat' },
    { requiredLevel: 0 },
    { bonuses: { physicalAtk: Number.NaN, magicAtk: 0 } },
    { stackable: true },
    { icon: { url: '', width: 16, height: 16 } },
  ];
  for (const change of bad) assert.throws(() => createItemCatalog([{ ...d, ...change }]), undefined, JSON.stringify(change));
});

test('a new character has no items, and only Tutorial Quest 02 names the dagger', () => {
  assert.ok(!JSON.stringify(createCharacterData('Tester', { gender: 'male', hairstyleId: 'mohawk' })).includes(ID));
  for (const slot of EQUIPMENT_SLOTS) assert.equal(EMPTY_INVENTORY.itemAt({ kind: 'equipment', slot }), null);
  for (let index = 0; index < INVENTORY_SLOT_COUNT; index++) assert.equal(EMPTY_INVENTORY.itemAt({ kind: 'bag', index }), null);

  const naming: string[] = [];
  const stale: string[] = [];
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (p.endsWith('.ts')) {
        const text = fs.readFileSync(p, 'utf8');
        const rel = path.relative(path.join(root, 'src'), p).replace(/\\/g, '/');
        if (text.includes(ID)) naming.push(rel);
        if (OLD_IDS.some((id) => text.includes(id))) stale.push(rel);
      }
    }
  };
  walk(path.join(root, 'src'));
  assert.deepEqual(naming.sort(), ['i18n/en.ts', 'i18n/th.ts', 'items/ItemCatalog.ts', 'quests/TutorialQuest02.ts'], 'definition, texts and its quest only');
  assert.deepEqual(stale, [], 'no reference to an old id');
});
