import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CharacterData } from '../src/data/CharacterData';
import { initLanguage, setLanguage, t } from '../src/i18n';
import { characterInventorySource } from '../src/inventory/CharacterInventorySource';
import { InventoryService } from '../src/inventory/InventoryService';
import { EQUIPMENT_SLOTS, INVENTORY_SLOT_COUNT } from '../src/inventory/InventorySlots';
import { bagIndexOf, createInventory, equipmentDerivedBonus, unequipToBag, type InventoryState } from '../src/inventory/InventoryState';
import { PassiveTreeService } from '../src/passives/PassiveTreeService';
import { QuestService } from '../src/quests/QuestService';
import { TUTORIAL_QUEST_02 } from '../src/quests/TutorialQuest02';
import { CharacterStatusService } from '../src/status/CharacterStatusService';
import { inventoryLayout } from '../src/ui/inventory/InventoryLayout';
import { newCharacter, saveAndLoad, withoutStorage } from './helpers/session';

const DAGGER = 'weapon_rusty_dagger';
const { reward } = TUTORIAL_QUEST_02;

const melee = (c: CharacterData): number => CharacterStatusService.derived(c).meleeAtk;
const count = (s: InventoryState): number => s.bag.reduce((n, x) => n + (x?.quantity ?? 0), 0) + Object.values(s.equipment).filter((x) => x !== null).length;

/** Tutorial Quest 02 done, dagger worn, first passive node unlocked. */
function withDagger(name: string): CharacterData {
  const c = newCharacter(name);
  for (const e of ['start', 'talk', 'finishDialogue', 'startPassiveTutorial'] as const) QuestService.advance(c, e);
  PassiveTreeService.upgrade(c, 'drifters_resolve');
  QuestService.sync02(c);
  QuestService.advance02(c, 'talk');
  InventoryService.grantOnce(c, reward);
  QuestService.advance02(c, 'grantReward');
  QuestService.advance02(c, 'finishDialogue');
  assert.equal(InventoryService.equip(c, bagIndexOf(c.inventory, DAGGER), 'weapon'), null);
  QuestService.sync02(c);
  assert.equal(QuestService.quest02(c).state, 'COMPLETED');
  return c;
}

test('rules: every one of the five slots can be emptied into the first free bag slot; nothing else changes', () => {
  for (const slot of EQUIPMENT_SLOTS) {
    const bag = [...createInventory().bag];
    bag[0] = { itemId: 'x', quantity: 3 };
    bag[2] = { itemId: 'y', quantity: 1 };
    const worn = Object.fromEntries(EQUIPMENT_SLOTS.map((id) => [id, { itemId: `item_${id}`, instanceId: `id_${id}` }])) as InventoryState['equipment'];
    const s: InventoryState = { bag, equipment: worn, grants: ['g'] };
    const frozen = JSON.stringify(s);
    const r = unequipToBag(s, slot);
    assert.ok(r.ok);
    assert.equal(r.bagIndex, 1);
    assert.deepEqual(r.state.bag[1], { itemId: `item_${slot}`, quantity: 1, instanceId: `id_${slot}` });
    assert.deepEqual(r.state.equipment, { ...worn, [slot]: null });
    assert.deepEqual(r.state.grants, ['g']);
    assert.equal(count(r.state), count(s));
    assert.equal(JSON.stringify(s), frozen, 'the given state is not changed');
    assert.deepEqual(unequipToBag(r.state, slot), { ok: false, error: 'emptySlot' });
  }
});

test('full bag: refused, nothing lost; works again with one free slot', () => {
  const full: InventoryState = { ...createInventory(), bag: Array.from({ length: INVENTORY_SLOT_COUNT }, () => ({ itemId: 'x', quantity: 1 })), equipment: { ...createInventory().equipment, weapon: { itemId: DAGGER, instanceId: 'a' } } };
  for (const slot of EQUIPMENT_SLOTS) assert.deepEqual(unequipToBag(full, slot), { ok: false, error: slot === 'weapon' ? 'bagFull' : 'emptySlot' });
  const bag = [...full.bag];
  bag[INVENTORY_SLOT_COUNT - 1] = null;
  const r = unequipToBag({ ...full, bag }, 'weapon');
  assert.ok(r.ok && r.bagIndex === INVENTORY_SLOT_COUNT - 1);
});

test('equip -> unequip -> re-equip: bonus removed and restored through the normal stat calculation, saved every time', () => {
  withoutStorage(() => {
    const c = withDagger('Alpha');
    assert.equal(melee(c), 14);
    assert.deepEqual(InventoryService.unequip(c, 'weapon'), { bagIndex: 0 });
    assert.equal(melee(c), 10);
    assert.deepEqual(equipmentDerivedBonus(c.inventory), { flat: {}, maxHpPercent: 0 });
    assert.deepEqual([c.inventory!.equipment.weapon, c.inventory!.bag[0]?.itemId, c.inventory!.bag[0]?.quantity], [null, DAGGER, 1]);
    const reloaded = saveAndLoad(c);
    assert.deepEqual(reloaded.inventory, c.inventory);
    assert.equal(melee(reloaded), 10);
    assert.equal(InventoryService.equip(reloaded, 0, 'weapon'), null);
    assert.equal(melee(reloaded), 14);
    const again = saveAndLoad(reloaded);
    assert.deepEqual([again.inventory!.equipment.weapon?.itemId, count(again.inventory!), melee(again)], [DAGGER, 1, 14]);
  });
});

test('rapid repeats never double or lose the item', () => {
  withoutStorage(() => {
    const c = withDagger('Alpha');
    for (let i = 0; i < 5; i++) InventoryService.unequip(c, 'weapon');
    assert.deepEqual([count(c.inventory!), c.inventory!.equipment.weapon], [1, null]);
    for (let round = 0; round < 50; round++) {
      for (let i = 0; i < 3; i++) InventoryService.equip(c, bagIndexOf(c.inventory, DAGGER), 'weapon');
      assert.deepEqual([count(c.inventory!), c.inventory!.equipment.weapon?.itemId], [1, DAGGER]);
      for (let i = 0; i < 3; i++) InventoryService.unequip(c, 'weapon');
      assert.deepEqual([count(c.inventory!), c.inventory!.equipment.weapon], [1, null]);
    }
  });
});

test('bag full: the item stays worn with its bonus, nothing is announced', () => {
  withoutStorage(() => {
    const c = withDagger('Alpha');
    let changes = 0;
    const off = InventoryService.onChange(() => changes++);
    const worn = c.inventory!;
    c.inventory = { ...worn, bag: worn.bag.map(() => ({ itemId: 'x', quantity: 1 })) };
    assert.deepEqual(InventoryService.unequip(c, 'weapon'), { error: 'bagFull' });
    assert.deepEqual([c.inventory.equipment.weapon?.itemId, melee(c), changes], [DAGGER, 14, 0]);
    assert.deepEqual(InventoryService.unequip(c, 'hat'), { error: 'emptySlot' });
    off();
  });
});

test('Tutorial Quest 02 stays completed: no restart, no second dagger, no EXP', () => {
  withoutStorage(() => {
    const c = withDagger('Alpha');
    const done: string[] = [];
    const off = QuestService.onCompleted((_c, id) => done.push(id));
    const status = JSON.stringify(c.status);
    for (let i = 0; i < 3; i++) {
      InventoryService.unequip(c, 'weapon');
      QuestService.sync02(c);
      assert.equal(QuestService.quest02(c).state, 'COMPLETED');
      assert.equal(QuestService.quest02(saveAndLoad(c)).state, 'COMPLETED', 'also after save and load');
      assert.equal(InventoryService.grantOnce(c, reward), 'alreadyGranted');
      InventoryService.equip(c, bagIndexOf(c.inventory, DAGGER), 'weapon');
      QuestService.sync02(c);
    }
    assert.deepEqual(done, []);
    assert.deepEqual([JSON.stringify(c.status), count(c.inventory!)], [status, 1]);
    off();
  });
});

test('while the equipment tutorial runs nothing can be taken off; afterwards it can', () => {
  withoutStorage(() => {
    const c = withDagger('Alpha');
    const source = characterInventorySource(c, () => QuestService.quest02(c).state !== 'EQUIPMENT_TUTORIAL');
    c.quests = { ...c.quests!, tutorial_02_rusty_dagger: { state: 'EQUIPMENT_TUTORIAL' } };
    assert.equal(source.canUnequip(), false);
    assert.deepEqual(source.unequip('weapon'), { error: 'notAllowed' });
    assert.equal(c.inventory!.equipment.weapon?.itemId, DAGGER);
    QuestService.sync02(c);
    assert.equal(source.canUnequip(), true);
    assert.deepEqual(source.unequip('weapon'), { bagIndex: 0 });
    assert.equal(source.itemAt({ kind: 'equipment', slot: 'weapon' }), null);
    assert.equal(source.itemAt({ kind: 'bag', index: 0 })!.name.length > 0, true);
  });
});

test('button: labels in both languages; inside the description panel, below every text line', () => {
  initLanguage(null);
  setLanguage('en');
  assert.equal(t('inventory.unequip'), 'Unequip');
  setLanguage('th');
  assert.equal(t('inventory.unequip'), 'ถอดอุปกรณ์');
  for (const [sw, sh] of [[960, 480], [1280, 720], [800, 480], [720, 400]]) {
    const { detail: d, panels } = inventoryLayout(sw, sh);
    const [x, y, w, h] = d.button;
    const [px, py, pw, ph] = panels.detail;
    assert.ok(x > px && x + w < px + pw && y > py && y + h < py + ph, `${sw}x${sh}`);
    assert.ok(d.effects.textY + d.effects.lines * 14 <= y, `${sw}x${sh}`);
    assert.ok(d.button.every(Number.isInteger));
  }
});
