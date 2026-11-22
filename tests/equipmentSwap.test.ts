import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CharacterData } from '../src/data/CharacterData';
import { characterInventorySource } from '../src/inventory/CharacterInventorySource';
import { InventoryService } from '../src/inventory/InventoryService';
import { EQUIPMENT_SLOTS, INVENTORY_SLOT_COUNT, slotAction } from '../src/inventory/InventorySlots';
import { addItem, bagIndexOf, createInventory, equipFromBag, equipOption, sanitizeInventory, unequipToBag, type InventoryState } from '../src/inventory/InventoryState';
import { newInstanceId, type ItemInstance } from '../src/inventory/ItemInstance';
import { itemDefinition } from '../src/items/ItemCatalog';
import type { ItemDefinition } from '../src/items/ItemDefinition';
import { CharacterStatusService } from '../src/status/CharacterStatusService';
import { isHotkeyPress, isTypingTarget } from '../src/ui/input/typing';
import { newCharacter, saveAndLoad, withoutStorage } from './helpers/session';

const DAGGER = 'weapon_rusty_dagger';

/** Every instance of a state: where it is and its options. */
function instances(s: InventoryState): Record<string, { at: string; itemId: string; options?: unknown }> {
  const all = [
    ...s.bag.flatMap((x, i) => (x?.instanceId ? [{ id: x.instanceId, at: `bag ${i}`, itemId: x.itemId, options: x.options }] : [])),
    ...EQUIPMENT_SLOTS.flatMap((slot) => (s.equipment[slot] ? [{ id: s.equipment[slot]!.instanceId, at: slot, itemId: s.equipment[slot]!.itemId, options: s.equipment[slot]!.options }] : [])),
  ];
  assert.equal(new Set(all.map((x) => x.id)).size, all.length, 'every instance exists once');
  return Object.fromEntries(all.map(({ id, ...rest }) => [id, rest]));
}

const A: ItemInstance = { itemId: DAGGER, instanceId: 'A', options: { roll: 3, nested: { affix: ['x'] } } };
const B: ItemInstance = { itemId: DAGGER, instanceId: 'B', options: { roll: 9 } };
/** A worn, B in a bag slot that is not the first free one. */
function wearingA(): InventoryState {
  const bag = [...createInventory().bag];
  bag[7] = { ...B, quantity: 1 };
  return { bag, equipment: { ...createInventory().equipment, weapon: A }, grants: ['g'] };
}

// ------------------------------------------------------------------------------------------------- rules

test('swap: the new item is worn, the old one lies in exactly the slot it left; identity and options kept', () => {
  const s = wearingA();
  const frozen = JSON.stringify(s);
  assert.deepEqual(equipOption(s, 7, 1), { slot: 'weapon', requiredLevel: 1, problem: null }, 'offered although the slot is occupied by the same item');
  const r = equipFromBag(s, 7, 'weapon', 1);
  assert.ok(r.ok);
  assert.deepEqual(r.state.equipment.weapon, B);
  assert.deepEqual(r.state.bag[7], { ...A, quantity: 1 });
  assert.equal(r.state.bag.filter((x) => x !== null).length, 1);
  assert.deepEqual(r.state.grants, ['g']);
  assert.deepEqual(instances(r.state), { A: { at: 'bag 7', itemId: DAGGER, options: A.options }, B: { at: 'weapon', itemId: DAGGER, options: B.options } });
  assert.equal(JSON.stringify(s), frozen, 'the given state is not changed');
  const back = equipFromBag(r.state, 7, 'weapon', 1);
  assert.ok(back.ok);
  assert.deepEqual(back.state, s, 'swapping back restores the exact state');
});

test('swap works with a completely full bag', () => {
  const s = wearingA();
  const full: InventoryState = { ...s, bag: s.bag.map((x, i) => x ?? { itemId: 'x', quantity: i + 1 }) };
  const r = equipFromBag(full, 7, 'weapon', 1);
  assert.ok(r.ok);
  assert.ok(r.state.bag.every((x, i) => (i === 7 ? x?.instanceId === 'A' : x === full.bag[i])));
});

test('swap in every equipment slot; requirements are checked first and a failure changes nothing', () => {
  const defs: Record<string, ItemDefinition> = {};
  for (const slot of EQUIPMENT_SLOTS) for (const [n, level] of [['one', 1], ['two', 1], ['high', 20]] as const) defs[`${slot}_${n}`] = { ...itemDefinition(DAGGER)!, id: `${slot}_${n}`, equipmentSlot: slot, weaponType: slot === 'weapon' ? 'dagger' : null, requiredLevel: level };
  const lookup = (id: string): ItemDefinition | undefined => defs[id];
  for (const slot of EQUIPMENT_SLOTS) {
    const bag = [...createInventory().bag];
    bag[0] = { itemId: `${slot}_two`, quantity: 1, instanceId: 'two' };
    bag[1] = { itemId: `${slot}_high`, quantity: 1, instanceId: 'high' };
    bag[2] = { itemId: 'gone', quantity: 1, instanceId: 'gone' };
    const s: InventoryState = { bag, equipment: { ...createInventory().equipment, [slot]: { itemId: `${slot}_one`, instanceId: 'one' } }, grants: [] };
    const r = equipFromBag(s, 0, slot, 1, lookup);
    assert.ok(r.ok && r.state.equipment[slot]?.instanceId === 'two' && r.state.bag[0]?.instanceId === 'one', slot);
    const other = EQUIPMENT_SLOTS.find((x) => x !== slot)!;
    assert.deepEqual(equipFromBag(s, 1, slot, 19, lookup), { ok: false, error: 'levelTooLow' });
    assert.deepEqual(equipFromBag(s, 0, other, 1, lookup), { ok: false, error: 'wrongSlot' });
    assert.deepEqual(equipFromBag(s, 2, slot, 1, lookup), { ok: false, error: 'unknownItem' });
    assert.deepEqual(equipFromBag(s, 30, slot, 1, lookup), { ok: false, error: 'emptySlot' });
  }
});

// ---------------------------------------------------------------------------------------------- identity

test('instances: every piece of equipment gets its own id and is never merged; stackable items stay plain stacks', () => {
  const lookup = (id: string): ItemDefinition | undefined => (id === 'potion' ? { ...itemDefinition(DAGGER)!, id, stackable: true } : itemDefinition(id));
  const r = addItem(createInventory(), DAGGER, 3, lookup);
  assert.ok(r.ok);
  assert.equal(Object.keys(instances(r.state)).length, 3);
  assert.deepEqual(r.state.bag.slice(0, 4).map((x) => x?.quantity ?? null), [1, 1, 1, null]);
  const p = addItem(r.state, 'potion', 2, lookup);
  assert.ok(p.ok);
  const p2 = addItem(p.state, 'potion', 5, lookup);
  assert.ok(p2.ok);
  assert.deepEqual(p2.state.bag[3], { itemId: 'potion', quantity: 7 });
  const ids = new Set(Array.from({ length: 5000 }, newInstanceId));
  assert.equal(ids.size, 5000);
  const g = globalThis as { crypto?: unknown };
  const descriptor = Object.getOwnPropertyDescriptor(g, 'crypto');
  Object.defineProperty(g, 'crypto', { value: undefined, configurable: true });
  assert.equal(new Set(Array.from({ length: 5000 }, newInstanceId)).size, 5000, 'also without crypto.randomUUID');
  if (descriptor) Object.defineProperty(g, 'crypto', descriptor);
});

test('unequip keeps identity and options too', () => {
  const r = unequipToBag(wearingA(), 'weapon');
  assert.ok(r.ok);
  assert.deepEqual(r.state.bag[r.bagIndex], { ...A, quantity: 1 });
  const again = equipFromBag(r.state, r.bagIndex, 'weapon', 1);
  assert.ok(again.ok);
  assert.deepEqual(again.state.equipment.weapon, A);
});

test('records from before instances are upgraded: same items, each with an id', () => {
  const bag = Array.from({ length: INVENTORY_SLOT_COUNT }, () => null as unknown);
  bag[4] = { itemId: DAGGER, quantity: 1 };
  const { state, newIds } = sanitizeInventory({ bag, equipment: { weapon: DAGGER, hat: null, armor: null, shoes: null, charm: null }, grants: ['g'] });
  assert.deepEqual(Object.values(instances(state)).map((x) => [x.at, x.itemId]).sort(), [['bag 4', DAGGER], ['weapon', DAGGER]]);
  assert.deepEqual([state.grants, newIds], [['g'], 2]);
  assert.deepEqual(sanitizeInventory(JSON.parse(JSON.stringify(state))), { state, repaired: [], newIds: 0 }, 'the ids stay');
});

test('broken data: a repeated id gets a new one, options are kept, several single items in one slot are separated', () => {
  const { state, newIds } = sanitizeInventory({ bag: [{ ...A, quantity: 1 }, { ...B, quantity: 1 }, { itemId: DAGGER, quantity: 3 }], equipment: { weapon: A }, grants: [] });
  const all = instances(state);
  assert.equal(Object.keys(all).length, 6);
  assert.equal(all.A.at, 'weapon', 'the worn one keeps its id');
  assert.deepEqual(state.bag[0]?.options, A.options);
  assert.deepEqual(all.B.options, B.options);
  assert.equal(newIds, 4);
  assert.deepEqual(sanitizeInventory(JSON.parse(JSON.stringify(state))), { state, repaired: [], newIds: 0 });
  for (const options of ['x', 5, null, [1]]) assert.equal(sanitizeInventory({ bag: [{ itemId: DAGGER, quantity: 1, instanceId: 'q', options }], equipment: {}, grants: [] }).state.bag[0]?.options, undefined);
});

// ----------------------------------------------------------------------------------------------- service

/** Two daggers, the first worn. */
function twoDaggers(name: string): { c: CharacterData; first: string; second: string } {
  const c = newCharacter(name);
  assert.equal(InventoryService.grantOnce(c, { grantId: 'a', itemId: DAGGER, quantity: 1 }), null);
  assert.equal(InventoryService.grantOnce(c, { grantId: 'b', itemId: DAGGER, quantity: 1 }), null);
  const [first, second] = [c.inventory!.bag[0]!.instanceId!, c.inventory!.bag[1]!.instanceId!];
  assert.equal(InventoryService.equip(c, 0, 'weapon'), null);
  return { c, first, second };
}

test('service: Rusty Dagger A <-> B, +4 exactly once, saved, survives a reload', () => {
  withoutStorage(() => {
    const base = CharacterStatusService.derived(newCharacter('Base'));
    const { c, first, second } = twoDaggers('Alpha');
    const worn = { ...base, meleeAtk: base.meleeAtk + 4 };
    assert.deepEqual(CharacterStatusService.derived(c), worn);
    const source = characterInventorySource(c);
    assert.deepEqual(slotAction(source, { kind: 'bag', index: 1 }), { kind: 'equip', slot: 'weapon', requiredLevel: 1, problem: null }, 'EQUIP is offered');
    assert.equal(source.equip(1, 'weapon'), true);
    assert.deepEqual([c.inventory!.equipment.weapon?.instanceId, c.inventory!.bag[1]?.instanceId], [second, first]);
    assert.deepEqual(CharacterStatusService.derived(c), worn, 'not stacked');
    const reloaded = saveAndLoad(c);
    assert.deepEqual(reloaded.inventory, c.inventory);
    assert.deepEqual(CharacterStatusService.derived(reloaded), worn);
    for (let i = 0; i < 101; i++) assert.equal(InventoryService.equip(reloaded, 1, 'weapon'), null);
    assert.deepEqual([reloaded.inventory!.equipment.weapon?.instanceId, Object.keys(instances(reloaded.inventory!)).sort()], [first, [first, second].sort()]);
    assert.deepEqual(CharacterStatusService.derived(reloaded), worn);
    // taking off still works, the other one stays where it is
    assert.deepEqual(InventoryService.unequip(reloaded, 'weapon'), { bagIndex: 0 });
    assert.deepEqual(CharacterStatusService.derived(reloaded), base);
    assert.equal(Object.keys(instances(reloaded.inventory!)).length, 2);
  });
});

test('service: one swap = one announcement; a swap that is not possible changes nothing', () => {
  withoutStorage(() => {
    const { c } = twoDaggers('Alpha');
    let changes = 0;
    const off = InventoryService.onChange(() => changes++);
    const before = c.inventory;
    assert.equal(InventoryService.equip(c, 5, 'weapon'), 'emptySlot');
    assert.equal(InventoryService.equip(c, 1, 'hat'), 'wrongSlot');
    assert.equal(c.inventory, before);
    assert.equal(InventoryService.equip(c, 1, 'weapon'), null);
    assert.equal(changes, 1);
    off();
  });
});

test('random equip / unequip / swap sequences never lose, double or rename an instance', () => {
  withoutStorage(() => {
    const { c } = twoDaggers('Alpha');
    InventoryService.grantOnce(c, { grantId: 'c', itemId: DAGGER, quantity: 1 });
    const ids = Object.keys(instances(c.inventory!)).sort();
    let seed = 7;
    for (let i = 0; i < 600; i++) {
      seed = (seed * 16807) % 2147483647;
      if (seed % 4 === 0) InventoryService.unequip(c, 'weapon');
      else InventoryService.equip(c, seed % 5, 'weapon');
      assert.deepEqual(Object.keys(instances(c.inventory!)).sort(), ids);
    }
    assert.ok(bagIndexOf(c.inventory, DAGGER) >= 0);
    assert.deepEqual(saveAndLoad(c).inventory, c.inventory);
  });
});

// ------------------------------------------------------------------------------------------------ hotkey

test('T: only a fresh press without modifiers, and never while typing', () => {
  const e = (change: object = {}) => ({ repeat: false, ctrlKey: false, altKey: false, metaKey: false, isComposing: false, target: null as unknown, ...change });
  assert.equal(isHotkeyPress(e(), null), true);
  assert.equal(isHotkeyPress(e(), { tagName: 'BODY' }), true);
  assert.equal(isHotkeyPress(e(), { tagName: 'CANVAS' }), true);
  for (const change of [{ repeat: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }, { isComposing: true }]) assert.equal(isHotkeyPress(e(change), null), false, JSON.stringify(change));
  for (const focused of [{ tagName: 'INPUT', type: 'text' }, { tagName: 'input' }, { tagName: 'INPUT', type: 'search' }, { tagName: 'TEXTAREA' }, { tagName: 'SELECT' }, { tagName: 'DIV', isContentEditable: true }]) {
    assert.equal(isTypingTarget(focused), true, JSON.stringify(focused));
    assert.equal(isHotkeyPress(e(), focused), false);
    assert.equal(isHotkeyPress(e({ target: focused }), null), false);
  }
  for (const type of ['button', 'checkbox', 'radio', 'range']) assert.equal(isTypingTarget({ tagName: 'INPUT', type }), false, type);
  assert.equal(isTypingTarget(null), false);
});
