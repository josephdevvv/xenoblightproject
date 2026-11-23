import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { hotbarSlotOfKey } from '../src/hotbar/Hotbar';
import { HotbarService } from '../src/hotbar/HotbarService';
import { assignPotion, createPotionSlots, migratePotionSlots, potionKind, potionSlotOfKey, sanitizePotionSlots } from '../src/hotbar/PotionSlots';
import { initLanguage, setLanguage, translate } from '../src/i18n';
import { InventoryService } from '../src/inventory/InventoryService';
import { itemCount } from '../src/inventory/InventoryState';
import { ITEM_CATALOG } from '../src/items/ItemCatalog';
import { checksum, parseSave, serializeSave } from '../src/save/SaveFile';
import { SaveService } from '../src/save/SaveService';
import { QuestService } from '../src/quests/QuestService';
import { HOTBAR_SLOT, hotbarLayout } from '../src/ui/hud/HotbarLayout';
import { newCharacter, saveAndLoad, withoutStorage } from './helpers/session';

const POTION = 'consumable_red_healing_potion';
const SP_POTION = 'consumable_sp_recovery_potion';
const root = process.cwd();

test('potion kinds: the HP potion goes on Q, the SP Recovery Potion on W, nothing else; keys Q / W only', () => {
  assert.equal(potionKind(POTION), 'hp');
  assert.equal(potionKind(SP_POTION), 'sp');
  for (const id of ITEM_CATALOG.keys()) if (id !== POTION && id !== SP_POTION) assert.equal(potionKind(id), null, id);
  assert.equal(potionKind('nothing'), null);
  assert.deepEqual([potionSlotOfKey('KeyQ'), potionSlotOfKey('KeyW')], ['hp', 'sp']);
  for (const code of ['KeyA', 'KeyS', 'KeyD', 'KeyE', 'Digit1', 'q', 'Numpad1', '']) assert.equal(potionSlotOfKey(code), null, code);
  // no clash with the numbered hotbar
  assert.deepEqual([hotbarSlotOfKey('KeyQ'), hotbarSlotOfKey('KeyW')], [-1, -1]);
});

test('assign: an HP potion goes straight to Q, replacing; nothing is used up; slots 1-8 untouched; non-potions refused', () => {
  withoutStorage(() => {
    const c = newCharacter('Alpha');
    assert.deepEqual(HotbarService.potions(c), createPotionSlots());
    assert.equal(HotbarService.assignPotion(c, POTION), null, 'not owned: nothing');
    assert.equal(InventoryService.grantOnce(c, { grantId: 't:p', itemId: POTION, quantity: 5 }), null);
    let changes = 0;
    const off = HotbarService.onChange((x) => x === c && changes++);
    assert.equal(HotbarService.assignPotion(c, POTION), 'hp');
    assert.equal(HotbarService.assignPotion(c, POTION), 'hp', 'again: replaced, no error');
    off();
    assert.deepEqual([HotbarService.potions(c), itemCount(c.inventory, POTION), changes], [{ hp: POTION, sp: null }, 5, 2]);
    assert.deepEqual(HotbarService.state(c), Array(8).fill(null), 'slots 1-8 stay free');
    assert.equal(HotbarService.assignPotion(c, 'armor_worn_cloth'), null);
    assert.equal(assignPotion(createPotionSlots(), 'scroll_heal'), null);
    // saved and loaded
    assert.deepEqual(HotbarService.potions(saveAndLoad(c)), { hp: POTION, sp: null });
  });
});

test('save: edited slots are repaired; older files move their potion from 1-8 to Q - items, counts and ids unchanged', () => {
  assert.deepEqual(sanitizePotionSlots({ hp: POTION, sp: POTION }), { state: { hp: POTION, sp: null }, dropped: ['potionSlots: sp'] }, 'an HP potion is never on W');
  assert.deepEqual(sanitizePotionSlots({ hp: 'armor_worn_cloth' }).state, createPotionSlots());
  assert.deepEqual(sanitizePotionSlots(undefined), { state: createPotionSlots(), dropped: [] });
  assert.deepEqual(sanitizePotionSlots('x').dropped, ['potionSlots']);
  const m = migratePotionSlots([{ type: 'item', itemId: 'scroll_heal' }, null, { type: 'item', itemId: POTION }, { type: 'skill', skillId: 'drifter_lv1' }, null, { type: 'item', itemId: POTION }, null, null]);
  assert.deepEqual(m.slots, { hp: POTION, sp: null });
  assert.deepEqual(m.hotbar, [{ type: 'item', itemId: 'scroll_heal' }, null, null, { type: 'skill', skillId: 'drifter_lv1' }, null, null, null, null]);

  withoutStorage(() => {
    const c = newCharacter('Beta');
    InventoryService.grantOnce(c, { grantId: 't:p', itemId: POTION, quantity: 20 });
    assert.ok(HotbarService.assignItem(c, 3, POTION), 'an old-style assignment on slot 4');
    const doc = JSON.parse(serializeSave(c, null)) as Record<string, unknown>;
    delete doc.potionSlots; // as written before Q / W existed
    delete doc.checksum;
    const old = JSON.stringify({ ...doc, checksum: checksum(doc) });
    const r = parseSave(old);
    assert.ok(r.ok, JSON.stringify(r));
    const loaded = SaveService.restore(r.save);
    assert.deepEqual(HotbarService.potions(loaded), { hp: POTION, sp: null });
    assert.equal(HotbarService.state(loaded)[3], null, 'off slot 4: one key per potion');
    assert.deepEqual(loaded.inventory, c.inventory, 'every stack, quantity and instance id as it was');
    // a file that already has the slots keeps them as written (no second migration)
    const again = saveAndLoad(loaded);
    assert.deepEqual([HotbarService.potions(again), HotbarService.state(again)[3]], [{ hp: POTION, sp: null }, null]);
  });
});

test('potion training: ASSIGN HOTKEY puts the potion on Q and ends the Inventory steps (no slot window), nothing used', () => {
  withoutStorage(() => {
    const c = newCharacter('Gamma');
    InventoryService.grantOnce(c, { grantId: 't:p', itemId: POTION, quantity: 20 });
    c.quests = { ...c.quests!, tutorial_04_potion_training: { state: 'POTION_TUTORIAL', useExplained: true } };
    // what GameUIScene does on ASSIGN HOTKEY for a potion
    assert.equal(HotbarService.assignPotion(c, POTION), 'hp');
    assert.ok(QuestService.hotkeyAssigned(c, POTION));
    assert.deepEqual([QuestService.quest04(c).state, itemCount(c.inventory, POTION), HotbarService.potions(c).hp], ['HOTKEY_ASSIGNED', 20, POTION]);
    initLanguage(null);
    setLanguage('th');
    assert.equal(translate('potionTutorial.qSlot'), 'ยาแดงอยู่ที่ปุ่ม Q แล้ว');
    setLanguage('en');
    assert.equal(translate('notifications.potionAssigned', { name: 'Red Healing Potion', key: 'Q' }), 'Assigned Red Healing Potion to Q');
    setLanguage('th');
  });
});

test('HUD row: slots 1-8, then Q and W in the same size, then Auto Play - centred', () => {
  for (const width of [960, 1280, 800]) {
    const L = hotbarLayout(width, 400);
    const [q, w] = L.potionSlots;
    for (const s of [q, w]) assert.deepEqual([s.width, s.height, s.y], [HOTBAR_SLOT.width, HOTBAR_SLOT.height, 400]);
    assert.ok(L.slots[7].x + HOTBAR_SLOT.width < L.potionDivider.x && L.potionDivider.x < q.x, 'a divider between 8 and Q');
    assert.equal(w.x - q.x - HOTBAR_SLOT.width, HOTBAR_SLOT.gap);
    assert.ok(w.x + w.width < L.autoButton.x, 'Auto Play right of W');
    assert.ok(Math.abs(L.slots[0].x - (width - (L.autoButton.x + L.autoButton.width))) <= 1, 'centred');
  }
});

test('movement: no keyboard movement any more (W is the SP potion key) - left click only', () => {
  assert.equal(fs.existsSync(path.join(root, 'src/player/KeyboardMovementInput.ts')), false);
  const controller = fs.readFileSync(path.join(root, 'src/player/PlayerController.ts'), 'utf8');
  assert.ok(!/addKey|KeyCodes|keyboard/i.test(controller.replace(/\/\*\*[^]*?\*\//g, '')), 'the controller reads no keys');
  for (const file of ['src/scenes/GameScene.ts', 'src/scenes/GameUIScene.ts', 'src/combat/CombatSystem.ts']) {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(!/KeyCodes\.(W|A|S|D)\b|keydown-(W|A|S|D)\b/.test(src), file);
  }
});
