import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import type { CharacterData } from '../src/data/CharacterData';
import { initLanguage, setLanguage } from '../src/i18n';
import { InventoryService } from '../src/inventory/InventoryService';
import { EQUIPMENT_SLOTS } from '../src/inventory/InventorySlots';
import { addItem, bagIndexOf, createInventory, equipFromBag, equipmentDerivedBonus, type InventoryState } from '../src/inventory/InventoryState';
import { ITEM_CATALOG, itemDefinition } from '../src/items/ItemCatalog';
import { itemInfo } from '../src/items/ItemInfoText';
import { STARTING_EQUIPMENT, startingInventory } from '../src/items/StartingEquipment';
import { CharacterStatusService } from '../src/status/CharacterStatusService';
import { readPng } from './helpers/png';
import { newCharacter, saveAndLoad, withoutStorage } from './helpers/session';

const ARMOR = 'armor_worn_cloth';
const DAGGER = 'weapon_rusty_dagger';
const def = (c: CharacterData): number => CharacterStatusService.derived(c).def;
/** The same character without any equipment: what DEF is by the formulas alone. */
const defWithoutEquipment = (c: CharacterData): number => CharacterStatusService.derived({ ...c, inventory: createInventory() }).def;
const all = (s: InventoryState): { itemId: string; id?: string; at: string }[] => [
  ...s.bag.flatMap((x, i) => (x ? [{ itemId: x.itemId, id: x.instanceId, at: `bag ${i}` }] : [])),
  ...EQUIPMENT_SLOTS.flatMap((slot) => (s.equipment[slot] ? [{ itemId: s.equipment[slot]!.itemId, id: s.equipment[slot]!.instanceId, at: slot }] : [])),
];

test('definition: exactly as specified - armor slot, Lv 1, DEF +1 and nothing else, not stackable', () => {
  const { icon, ...rest } = itemDefinition(ARMOR)!;
  assert.deepEqual(rest, {
    id: ARMOR,
    category: 'equipment',
    equipmentSlot: 'armor',
    weaponType: null,
    requiredLevel: 1,
    bonuses: { physicalAtk: 0, magicAtk: 0 },
    additionalStats: { def: 1 },
    specialEffects: [],
    stackable: false,
  });
  assert.deepEqual(icon, { url: 'assets/items/armor/old_cloth_armor_icon_32x32.png', width: 32, height: 32 });
  assert.deepEqual([...ITEM_CATALOG.keys()], [DAGGER, ARMOR, 'consumable_red_healing_potion', 'consumable_sp_recovery_potion', 'scroll_power_thrust', 'scroll_heal'], 'the armor and, since, the potions and the skill scrolls');
  assert.deepEqual(equipmentDerivedBonus({ ...createInventory(), equipment: { ...createInventory().equipment, armor: { itemId: ARMOR, instanceId: 'a' } } }), { flat: { def: 1 }, maxHpPercent: 0 });
});

test('icon: a 32 x 32 PNG, transparent background, hard pixels only, not the dagger', () => {
  const file = path.join(process.cwd(), 'public', itemDefinition(ARMOR)!.icon.url);
  const img = readPng(file);
  assert.deepEqual([img.width, img.height], [32, 32]);
  const alpha = (x: number, y: number): number => img.data[(y * 32 + x) * 4 + 3];
  for (const [x, y] of [[0, 0], [31, 0], [0, 31], [31, 31]]) assert.equal(alpha(x, y), 0, 'transparent corners');
  let opaque = 0;
  for (let i = 3; i < img.data.length; i += 4) {
    assert.ok(img.data[i] === 0 || img.data[i] === 255, 'no anti-aliasing');
    if (img.data[i] === 255) opaque++;
  }
  assert.ok(opaque > 250 && opaque < 700, `a readable figure (${opaque} px)`);
  assert.ok(!fs.readFileSync(file).equals(fs.readFileSync(path.join(process.cwd(), 'public', itemDefinition(DAGGER)!.icon.url))));
});

test('texts: Thai and English name, description, type and DEF +1', () => {
  initLanguage(null);
  setLanguage('th');
  const th = itemInfo(ARMOR)!;
  assert.equal(th.name, 'ชุดผ้าเก่า');
  assert.equal(th.description, 'ชุดผ้าซีดที่ปะชุนมาหลายครั้ง ป้องกันได้เพียงเล็กน้อย แต่ก็ดีกว่าไม่มีอะไรเลย');
  setLanguage('en');
  const en = itemInfo(ARMOR)!;
  assert.equal(en.name, 'Old Cloth Armor');
  assert.equal(en.description, 'Patched, faded cloth worn by countless drifters. Barely any protection, but better than nothing.');
  assert.equal(en.type, 'Armor · Lv 1');
  assert.deepEqual(en.effects, ['DEF +1']);
  assert.deepEqual(en.icon, { texture: 'item.icon.armor_worn_cloth' });
  setLanguage('th');
});

test('New Game: the armor is worn - one new instance, nothing in the bag, DEF +1 on the formulas', () => {
  withoutStorage(() => {
    assert.deepEqual(STARTING_EQUIPMENT, [{ slot: 'armor', itemId: ARMOR }]);
    const a = newCharacter('Alpha');
    const b = newCharacter('Alpha');
    for (const c of [a, b]) {
      assert.deepEqual(all(c.inventory!).map(({ itemId, at }) => [itemId, at]), [[ARMOR, 'armor']], 'worn, no second copy');
      assert.equal(def(c), defWithoutEquipment(c) + 1);
      assert.equal(c.inventory!.grants.length, 0, 'not a quest reward');
    }
    assert.notEqual(a.inventory!.equipment.armor!.instanceId, b.inventory!.equipment.armor!.instanceId, 'its own instance per character');
    assert.equal(bagIndexOf(a.inventory, DAGGER), -1, 'no dagger: that still comes from Mateus');
    let n = 0;
    assert.deepEqual(startingInventory(() => `id${++n}`).equipment.armor, { itemId: ARMOR, instanceId: 'id1' });
    assert.equal(n, 1, 'exactly one instance created');
  });
});

test('unequip / re-equip: back to the bag without DEF, worn again with DEF +1 - never stacked, same instance', () => {
  withoutStorage(() => {
    const c = newCharacter('Alpha');
    const id = c.inventory!.equipment.armor!.instanceId;
    const base = defWithoutEquipment(c);
    for (let i = 0; i < 10; i++) {
      assert.deepEqual(InventoryService.unequip(c, 'armor'), { bagIndex: 0 });
      assert.deepEqual([c.inventory!.equipment.armor, c.inventory!.bag[0]?.instanceId, def(c)], [null, id, base]);
      assert.deepEqual(InventoryService.unequip(c, 'armor'), { error: 'emptySlot' });
      assert.equal(InventoryService.equip(c, 0, 'armor'), null);
      assert.equal(InventoryService.equip(c, 0, 'armor'), 'emptySlot', 'not twice');
      assert.deepEqual([c.inventory!.equipment.armor?.instanceId, def(c)], [id, base + 1]);
      assert.equal(all(c.inventory!).length, 1);
    }
    assert.equal(InventoryService.equip(c, 0, 'weapon'), 'emptySlot');
    InventoryService.unequip(c, 'armor');
    assert.equal(InventoryService.equip(c, 0, 'weapon'), 'wrongSlot', 'armor only fits the armor slot');
  });
});

test('swap: another copy takes its place in one exchange; +1 DEF, not +2; both keep their ids', () => {
  const start = startingInventory(() => 'worn');
  const withCopy = addItem(start, ARMOR, 1);
  assert.ok(withCopy.ok);
  const copy = withCopy.state.bag[0]!.instanceId!;
  const swapped = equipFromBag(withCopy.state, 0, 'armor', 1);
  assert.ok(swapped.ok);
  assert.deepEqual([swapped.state.equipment.armor?.instanceId, swapped.state.bag[0]?.instanceId], [copy, 'worn']);
  assert.deepEqual(equipmentDerivedBonus(swapped.state), { flat: { def: 1 }, maxHpPercent: 0 });
});

test('save / load: worn, same instance id, DEF once; loading never adds another; old saves get none', () => {
  withoutStorage(() => {
    const c = newCharacter('Alpha');
    const id = c.inventory!.equipment.armor!.instanceId;
    let loaded = c;
    for (let i = 0; i < 3; i++) loaded = saveAndLoad(loaded);
    assert.deepEqual(loaded.inventory, c.inventory);
    assert.deepEqual([loaded.inventory!.equipment.armor?.instanceId, def(loaded)], [id, defWithoutEquipment(loaded) + 1]);
    // taken off, saved: still taken off after loading
    InventoryService.unequip(c, 'armor');
    const off = saveAndLoad(c);
    assert.deepEqual([off.inventory!.equipment.armor, off.inventory!.bag[0]?.instanceId, def(off)], [null, id, defWithoutEquipment(off)]);
    // a character from before the starter armor (empty equipment) is left as it is
    const old = newCharacter('Old');
    old.inventory = createInventory();
    const oldLoaded = saveAndLoad(old);
    assert.deepEqual(all(oldLoaded.inventory!), [], 'nothing granted afterwards');
  });
});
