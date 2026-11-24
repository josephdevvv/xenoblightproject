import assert from 'node:assert/strict';
import { test } from 'node:test';
import { characterInventorySource } from '../src/inventory/CharacterInventorySource';
import { InventoryService } from '../src/inventory/InventoryService';
import { INVENTORY_SLOT_COUNT } from '../src/inventory/InventorySlots';
import { addItem, consumeOne, createInventory, itemCount, sanitizeInventory, type InventoryState } from '../src/inventory/InventoryState';
import { ITEM_CATALOG, itemDefinition } from '../src/items/ItemCatalog';
import { MAX_STACK, stackLimit } from '../src/items/ItemDefinition';
import { QuestRewards } from '../src/quests/QuestRewards';
import { QuestService } from '../src/quests/QuestService';
import { TUTORIAL_QUEST_03 } from '../src/quests/TutorialQuest03';
import { newCharacter, saveAndLoad, withoutStorage } from './helpers/session';

const HP = 'consumable_red_healing_potion';
const SP = 'consumable_sp_recovery_potion';
const SCROLL = 'scroll_power_thrust';
const DAGGER = 'weapon_rusty_dagger';

const must = (r: ReturnType<typeof addItem>): InventoryState => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.state;
};
const stacks = (s: InventoryState, id: string): number[] => s.bag.filter((x) => x?.itemId === id).map((x) => x!.quantity);

test('limits: consumables 99 per slot; equipment and skill scrolls one per slot; capacity 100', () => {
  assert.equal(MAX_STACK, 99);
  assert.equal(INVENTORY_SLOT_COUNT, 100);
  for (const def of ITEM_CATALOG.values()) assert.equal(stackLimit(def), def.category === 'consumable' ? 99 : 1, def.id);
});

test('adding: merge into existing stacks up to 99, overflow opens new stacks (120 = 99 + 21); all or nothing', () => {
  let s = must(addItem(createInventory(), HP, 120));
  assert.deepEqual(stacks(s, HP), [99, 21]);
  s = must(addItem(s, HP, 100));
  assert.deepEqual(stacks(s, HP), [99, 99, 22], 'the 21-stack is filled first (78), the other 22 open a new one');
  assert.equal(itemCount(s, HP), 220);
  s = must(addItem(s, SP, 5));
  assert.deepEqual([stacks(s, SP), stacks(s, HP)], [[5], [99, 99, 22]], 'different items never share a stack');
  // equipment and scrolls: one per slot, each its own instance
  s = must(addItem(s, SCROLL, 3));
  s = must(addItem(s, DAGGER, 2));
  assert.deepEqual([stacks(s, SCROLL), stacks(s, DAGGER)], [[1, 1, 1], [1, 1]]);
  const ids = s.bag.filter((x) => x?.itemId === SCROLL || x?.itemId === DAGGER).map((x) => x!.instanceId);
  assert.equal(new Set(ids).size, 5, 'unique instance ids');
  // a full bag: nothing is added (no loss, no half grant)
  const full: InventoryState = { ...createInventory(), bag: Array.from({ length: INVENTORY_SLOT_COUNT }, (_, i) => (i === 0 ? { itemId: HP, quantity: 90 } : { itemId: DAGGER, quantity: 1, instanceId: `d${i}` })) };
  assert.deepEqual(addItem(full, HP, 10), { ok: false, error: 'bagFull' }, '9 would fit, 10 do not: nothing');
  assert.deepEqual(stacks(must(addItem(full, HP, 9)), HP), [99], 'what fits on the stack is fine');
  assert.deepEqual(addItem(full, SCROLL, 1), { ok: false, error: 'bagFull' });
  // using one takes it from the given stack, an emptied stack frees its slot
  const used = consumeOne(must(addItem(createInventory(), HP, 100)), HP, 1);
  assert.ok(used.ok);
  assert.deepEqual(stacks(used.state, HP), [99]);
});

test('Roland / Mateus: the 20-potion reward stacks with potions already owned; a full bag gives nothing, loses nothing', () => {
  withoutStorage(() => {
    const c = newCharacter('Alpha');
    InventoryService.grantOnce(c, { grantId: 't:hp', itemId: HP, quantity: 90 });
    c.quests = { ...c.quests!, tutorial_02_rusty_dagger: { state: 'TURNED_IN' }, tutorial_03_void_mite_hunt: { state: 'TURN_IN_DIALOGUE', kills: 5 } };
    const r = QuestRewards.quest03(c);
    assert.ok(r.ok, JSON.stringify(r));
    assert.deepEqual([stacks(c.inventory!, HP), itemCount(c.inventory, HP)], [[99, 11], 110]);
    assert.equal(TUTORIAL_QUEST_03.reward.quantity, 20);
    // a bag with no room for the reward: nothing given, the quest waits
    const d = newCharacter('Beta');
    d.inventory = { ...d.inventory!, bag: Array.from({ length: INVENTORY_SLOT_COUNT }, (_, i) => ({ itemId: DAGGER, quantity: 1, instanceId: `x${i}` })) };
    d.quests = { ...d.quests!, tutorial_02_rusty_dagger: { state: 'TURNED_IN' }, tutorial_03_void_mite_hunt: { state: 'TURN_IN_DIALOGUE', kills: 5 } };
    assert.deepEqual(QuestRewards.quest03(d), { ok: false, error: 'bagFull' });
    assert.equal(itemCount(d.inventory, HP), 0);
    assert.notEqual(QuestService.quest03(d).state, 'COMPLETED');
  });
});

test('quantity display data: stackable items carry their slot quantity; equipment and scrolls none', () => {
  withoutStorage(() => {
    const c = newCharacter('Gamma');
    InventoryService.grantOnce(c, { grantId: 't:hp', itemId: HP, quantity: 120 });
    InventoryService.grantOnce(c, { grantId: 't:s', itemId: SCROLL, quantity: 1 });
    const src = characterInventorySource(c);
    const bag = c.inventory!.bag;
    const q = (id: string): (number | undefined)[] => bag.map((x, index) => (x?.itemId === id ? src.itemAt({ kind: 'bag', index })?.quantity : null)).filter((v) => v !== null) as (number | undefined)[];
    assert.deepEqual(q(HP), [99, 21]);
    assert.deepEqual(q(SCROLL), [undefined]);
    assert.equal(src.itemAt({ kind: 'equipment', slot: 'armor' })?.quantity, undefined, 'worn armor: no number');
    // saved and loaded: the same stacks
    assert.deepEqual(stacks(saveAndLoad(c).inventory!, HP), [99, 21]);
  });
});

test('older saves: stacks above 99 and stacked scrolls are split into free slots - nothing doubled, nothing lost', () => {
  const { state, repaired } = sanitizeInventory({
    bag: [{ itemId: HP, quantity: 250 }, { itemId: SCROLL, quantity: 3 }, null, { itemId: SP, quantity: 7 }],
    equipment: {},
    grants: [],
  });
  assert.deepEqual(stacks(state, HP), [99, 99, 52]);
  assert.deepEqual(stacks(state, SCROLL), [1, 1, 1]);
  assert.deepEqual(stacks(state, SP), [7]);
  assert.deepEqual([itemCount(state, HP), itemCount(state, SCROLL), itemCount(state, SP)], [250, 3, 7]);
  const scrollIds = state.bag.filter((x) => x?.itemId === SCROLL).map((x) => x!.instanceId);
  assert.ok(scrollIds.every(Boolean) && new Set(scrollIds).size === 3, 'each scroll its own instance');
  assert.equal(state.bag[3]?.itemId, SP, 'items already in place stay there');
  assert.ok(repaired.length > 0);
  assert.equal(itemDefinition(SCROLL)!.stackable, false);
});
