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
  th: { name: 'มีดสนิม', description: 'มีดเก่าที่เต็มไปด้วยสนิม แม้จะไม่คมเหมือนเดิม แต่ยังพอใช้ป้องกันตัวได้' },
  en: { name: 'Rusty Dagger', description: 'An old dagger covered in rust. Its edge has dulled, but it can still serve as a weapon for self-defense.' },
} as const;
/** Earlier ids of this item: must be gone everywhere. */
const OLD_IDS = ['weapon_mit_sanit'];
/** SHA-256 of the uploaded straight_sword_icon_16x16.png. */
const ICON_SHA256 = '0277a61651942fb1c68aaee61df4fba2b0bd39db1ce5916368febd7d25668231';

const root = process.cwd();
const dagger = (): ItemDefinition => itemDefinition(ID)!;

test('the first item is exactly as specified, and the only one', () => {
  assert.deepEqual([...ITEM_CATALOG.keys()], [ID]);
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
  assert.deepEqual([icon.width, icon.height], [16, 16]);
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

test('icon: the uploaded file byte for byte, 16x16, transparent background', () => {
  const file = path.join(root, 'public', dagger().icon.url);
  assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'), ICON_SHA256);
  const png = readPng(file);
  assert.deepEqual([png.width, png.height], [16, 16]);
  const transparent = Array.from({ length: 256 }, (_, i) => png.data[i * 4 + 3]).filter((a) => a === 0).length;
  assert.equal(transparent, 229);
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
