import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initLanguage, setLanguage, t } from '../src/i18n';
import { characterInventorySource } from '../src/inventory/CharacterInventorySource';
import { EMPTY_INVENTORY, EQUIPMENT_SLOTS, slotAction, type EquipmentSlotId, type InventorySource, type SlotRef } from '../src/inventory/InventorySlots';
import { InventoryService } from '../src/inventory/InventoryService';
import { addItem, createInventory, equipFromBag, equipOption, type InventoryState } from '../src/inventory/InventoryState';
import { itemDefinition } from '../src/items/ItemCatalog';
import type { ItemDefinition } from '../src/items/ItemDefinition';
import { QuestService } from '../src/quests/QuestService';
import { TUTORIAL_QUEST_02 } from '../src/quests/TutorialQuest02';
import { CharacterStatusService } from '../src/status/CharacterStatusService';
import { newCharacter, saveAndLoad, withoutStorage } from './helpers/session';

const DAGGER = 'weapon_rusty_dagger';
const item = (id: string, change: Partial<ItemDefinition> = {}): ItemDefinition => ({ ...itemDefinition(DAGGER)!, id, ...change });
/** One item per equipment slot, for the rules only. */
const PER_SLOT = Object.fromEntries(EQUIPMENT_SLOTS.map((slot) => [`my_${slot}`, item(`my_${slot}`, { equipmentSlot: slot, weaponType: slot === 'weapon' ? 'dagger' : null })]));
const LOOKUP: Record<string, ItemDefinition> = { ...PER_SLOT, strong: item('strong', { requiredLevel: 5 }), potion: item('potion', { category: 'consumable' as never, stackable: true }) };
const lookup = (id: string): ItemDefinition | undefined => LOOKUP[id];
const bagOf = (...ids: string[]): InventoryState => ({ ...createInventory(), bag: createInventory().bag.map((_, i) => (ids[i] ? { itemId: ids[i], quantity: 1 } : null)) });

test('equip option: offered for each of the five slots, and exactly what equipFromBag accepts', () => {
  const s = bagOf(...Object.keys(PER_SLOT), 'potion', 'strong', 'unknown');
  EQUIPMENT_SLOTS.forEach((slot, i) => {
    assert.deepEqual(equipOption(s, i, 1, lookup), { slot, requiredLevel: 1, problem: null });
    const r = equipFromBag(s, i, slot, 1, lookup);
    assert.ok(r.ok && r.state.equipment[slot]?.itemId === `my_${slot}`);
  });
  assert.equal(equipOption(s, 5, 99, lookup), null, 'not something to wear');
  assert.deepEqual(equipOption(s, 6, 4, lookup), { slot: 'weapon', requiredLevel: 5, problem: 'levelTooLow' });
  assert.deepEqual(equipOption(s, 6, 5, lookup), { slot: 'weapon', requiredLevel: 5, problem: null });
  for (const i of [7, 8, 35, -1, 99]) assert.equal(equipOption(s, i, 99, lookup), null, `bag ${i}`);
  const worn: InventoryState = { ...s, equipment: { ...s.equipment, weapon: { itemId: 'my_weapon', instanceId: 'w1' } } };
  assert.equal(equipOption(worn, 0, 1, lookup)!.problem, null, 'another copy of the worn item can be equipped');
  // an occupied slot is replaced by the safe swap
  assert.equal(equipOption(worn, 6, 9, lookup)!.problem, null);
  const swapped = equipFromBag(worn, 6, 'weapon', 9, lookup);
  assert.ok(swapped.ok && swapped.state.equipment.weapon?.itemId === 'strong' && swapped.state.bag[6]?.itemId === 'my_weapon');
});

test('button: one thing at a time - equip in the bag, unequip when worn, nothing otherwise', () => {
  let state = must(addItem(bagOf('my_hat', 'potion', 'strong'), 'my_weapon', 1, lookup));
  let allowed = true;
  const info = { name: 'x', type: '', description: '', effects: [], icon: null };
  const source: InventorySource = {
    itemAt: (s) => ((s.kind === 'bag' ? state.bag[s.index] : state.equipment[s.slot]) ? info : null),
    equipOption: (i) => equipOption(state, i, 1, lookup),
    equip: () => false,
    unequip: () => ({ error: 'emptySlot' }),
    canUnequip: () => allowed,
    onChange: () => () => undefined,
  };
  const bag = (index: number): SlotRef => ({ kind: 'bag', index });
  const worn = (slot: EquipmentSlotId): SlotRef => ({ kind: 'equipment', slot });
  assert.deepEqual(slotAction(source, bag(0)), { kind: 'equip', slot: 'hat', requiredLevel: 1, problem: null });
  assert.equal(slotAction(source, bag(1)), null, 'non-equippable item');
  assert.deepEqual(slotAction(source, bag(2)), { kind: 'equip', slot: 'weapon', requiredLevel: 5, problem: 'levelTooLow' });
  assert.equal(slotAction(source, bag(10)), null, 'empty bag slot');
  assert.equal(slotAction(source, null), null, 'nothing selected');
  for (const slot of EQUIPMENT_SLOTS) assert.equal(slotAction(source, worn(slot)), null, `empty ${slot}`);
  state = { ...state, equipment: Object.fromEntries(EQUIPMENT_SLOTS.map((s) => [s, { itemId: `my_${s}`, instanceId: s }])) as InventoryState['equipment'] };
  for (const slot of EQUIPMENT_SLOTS) assert.deepEqual(slotAction(source, worn(slot)), { kind: 'unequip' }, slot);
  allowed = false;
  for (const slot of EQUIPMENT_SLOTS) assert.equal(slotAction(source, worn(slot)), null, 'equipment tutorial running');
  assert.equal(slotAction(EMPTY_INVENTORY, bag(0)), null);
});

function must(r: { ok: true; state: InventoryState } | { ok: false }): InventoryState {
  assert.ok(r.ok);
  return r.state;
}

test('Rusty Dagger through the window\'s source: equip / unequip cycles, +4 exactly once, saved, quest completes once', () => {
  withoutStorage(() => {
    const c = newCharacter('Alpha');
    c.quests = { ...c.quests!, tutorial_02_rusty_dagger: { state: 'EQUIPMENT_TUTORIAL' } };
    const done: string[] = [];
    const off = QuestService.onCompleted((_c, id) => done.push(id));
    const base = CharacterStatusService.derived(c);
    const status = JSON.stringify(c.status);
    InventoryService.grantOnce(c, TUTORIAL_QUEST_02.reward);
    const source = characterInventorySource(c, () => QuestService.quest02(c).state !== 'EQUIPMENT_TUTORIAL');
    const bag0: SlotRef = { kind: 'bag', index: 0 };
    const weapon: SlotRef = { kind: 'equipment', slot: 'weapon' };
    assert.equal(slotAction(source, weapon), null);
    for (let i = 0; i < 20; i++) {
      const action = slotAction(source, bag0);
      assert.deepEqual(action, { kind: 'equip', slot: 'weapon', requiredLevel: 1, problem: null });
      assert.equal(source.equip(0, 'weapon'), true);
      assert.equal(source.equip(0, 'weapon'), false);
      QuestService.sync02(c);
      assert.deepEqual(CharacterStatusService.derived(c), { ...base, meleeAtk: base.meleeAtk + 4 });
      assert.deepEqual([slotAction(source, bag0), slotAction(source, weapon)], [null, { kind: 'unequip' }]);
      assert.deepEqual(saveAndLoad(c).inventory, c.inventory);
      assert.deepEqual(source.unequip('weapon'), { bagIndex: 0 });
      QuestService.sync02(c);
      assert.deepEqual(CharacterStatusService.derived(c), base);
      assert.equal(slotAction(source, weapon), null);
      assert.equal(c.inventory!.bag.filter((x) => x !== null).length, 1);
    }
    assert.deepEqual(done, [TUTORIAL_QUEST_02.id]);
    assert.equal(QuestService.quest02(c).state, 'COMPLETED');
    assert.equal(InventoryService.grantOnce(c, TUTORIAL_QUEST_02.reward), 'alreadyGranted');
    assert.equal(JSON.stringify(c.status), status, 'no EXP');
    off();
  });
});

test('labels in both languages', () => {
  initLanguage(null);
  setLanguage('en');
  assert.deepEqual([t('inventory.equip'), t('inventory.unequip'), t('inventory.equipNeedsLevel', { level: 5 })], ['Equip', 'Unequip', 'Requires Lv 5']);
  setLanguage('th');
  assert.deepEqual([t('inventory.equip'), t('inventory.unequip')], ['สวมใส่', 'ถอดอุปกรณ์']);
});
