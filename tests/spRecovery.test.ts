import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { HotbarService } from '../src/hotbar/HotbarService';
import { assignPotion, createPotionSlots, sanitizePotionSlots } from '../src/hotbar/PotionSlots';
import { initLanguage, setLanguage } from '../src/i18n';
import { labels } from '../src/i18n/labels';
import { InventoryService } from '../src/inventory/InventoryService';
import { itemCount } from '../src/inventory/InventoryState';
import { slotAction } from '../src/inventory/InventorySlots';
import { characterInventorySource } from '../src/inventory/CharacterInventorySource';
import { hpRestored, spRestored, useProblem } from '../src/items/ConsumableUse';
import { itemDefinition, itemIconKey } from '../src/items/ItemCatalog';
import { itemProblems, type ItemDefinition } from '../src/items/ItemDefinition';
import { itemInfo } from '../src/items/ItemInfoText';
import { cooldownSeconds, elapsedFraction, handAngle, remainingWedge, sweepStep, SWEEP_STEPS } from '../src/ui/hud/CooldownSweep';
import { newCharacter, saveAndLoad, withoutStorage } from './helpers/session';
import { readPng } from './helpers/png';

const SP = 'consumable_sp_recovery_potion';
const HP = 'consumable_red_healing_potion';

test('SP Recovery Potion: definition exactly as specified, 32x32 icon, both languages, not given anywhere', () => {
  const def = itemDefinition(SP)!;
  const { icon, ...rest } = def;
  assert.deepEqual(rest, {
    id: SP,
    category: 'consumable',
    equipmentSlot: null,
    weaponType: null,
    requiredLevel: 1,
    bonuses: { physicalAtk: 0, magicAtk: 0 },
    additionalStats: {},
    specialEffects: [],
    stackable: true,
    use: { restoreSpPercent: 30 },
  });
  assert.deepEqual(itemProblems(def), []);
  assert.deepEqual(icon, { url: 'assets/items/consumables/sp_recovery_potion_32x32.png', width: 32, height: 32 });
  const png = readPng(path.join(process.cwd(), 'public', icon.url));
  assert.deepEqual([png.width, png.height], [32, 32]);
  for (let i = 3; i < png.data.length; i += 4) assert.ok(png.data[i] === 0 || png.data[i] === 255, 'hard pixels, transparent background');
  initLanguage(null);
  setLanguage('th');
  assert.equal(labels.itemName(SP), 'ยาฟ้าฟื้นฟู');
  assert.deepEqual(itemInfo(SP)!.effects, ['ฟื้นฟู SP 30% ของ SP สูงสุด']);
  setLanguage('en');
  assert.equal(labels.itemName(SP), 'SP Recovery Potion');
  assert.deepEqual([itemInfo(SP)!.type, itemInfo(SP)!.effects], ['Consumable', ['Restores 30% of Max SP']]);
  setLanguage('th');
  assert.equal(itemIconKey(SP), 'item.icon.consumable_sp_recovery_potion');
  // never part of a new character
  assert.equal(itemCount(newCharacter('Fresh').inventory, SP), 0);
  // item validation: a consumable restores HP and / or a percent of SP, nothing broken
  const base = itemDefinition(SP)! as ItemDefinition;
  for (const use of [{}, { restoreSpPercent: 0 }, { restoreSpPercent: 150 }, { restoreSpPercent: 2.5 }, { restoreHp: -1 }]) assert.deepEqual(itemProblems({ ...base, use } as ItemDefinition), ['use'], JSON.stringify(use));
});

test('SP potion use: 30 % of max SP rounded like Heal, capped at max; refused at full SP, dead or none left', () => {
  assert.deepEqual([spRestored(SP, 0, 23), spRestored(SP, 20, 23), spRestored(SP, 10, 50), spRestored(SP, 23, 23), spRestored(HP, 0, 23)], [7, 3, 15, 0, 0]);
  assert.equal(hpRestored(SP, 10, 100), 0, 'an SP potion heals no HP');
  const ctx = { alive: true, quantity: 1, hp: 100, maxHp: 100, sp: 10, maxSp: 23, blocked: false };
  assert.equal(useProblem(SP, ctx), null, 'full HP does not matter for an SP potion');
  assert.equal(useProblem(SP, { ...ctx, sp: 23 }), 'spFull');
  assert.equal(useProblem(SP, { ...ctx, alive: false }), 'dead');
  assert.equal(useProblem(SP, { ...ctx, quantity: 0 }), 'none');
  assert.equal(useProblem(HP, { ...ctx, hp: 50, sp: 23 }), null, 'full SP does not matter for an HP potion');
});

test('SP potion: USE + ASSIGN HOTKEY in the item panel; goes on W (never Q), replaces, nothing used up; saved', () => {
  withoutStorage(() => {
    const c = newCharacter('Alpha');
    assert.equal(InventoryService.grantOnce(c, { grantId: 't:sp', itemId: SP, quantity: 3 }), null);
    assert.equal(InventoryService.grantOnce(c, { grantId: 't:hp', itemId: HP, quantity: 2 }), null);
    const index = c.inventory!.bag.findIndex((s) => s?.itemId === SP);
    assert.deepEqual(slotAction(characterInventorySource(c), { kind: 'bag', index }), { kind: 'consumable', itemId: SP }, 'USE and ASSIGN HOTKEY');
    assert.equal(HotbarService.assignPotion(c, SP), 'sp');
    assert.equal(HotbarService.assignPotion(c, HP), 'hp');
    assert.deepEqual([HotbarService.potions(c), itemCount(c.inventory, SP), itemCount(c.inventory, HP)], [{ hp: HP, sp: SP }, 3, 2]);
    assert.deepEqual(assignPotion(createPotionSlots(), SP), { slots: { hp: null, sp: SP }, key: 'sp' });
    assert.deepEqual(sanitizePotionSlots({ hp: SP, sp: SP }).state, { hp: null, sp: SP }, 'an SP potion is never on Q');
    assert.deepEqual(HotbarService.potions(saveAndLoad(c)), { hp: HP, sp: SP });
  });
});

test('cooldown sweep: from the real remaining / total time, clockwise from 12 o\'clock, redrawn by whole steps', () => {
  assert.deepEqual([elapsedFraction(3000, 3000), elapsedFraction(1500, 3000), elapsedFraction(0, 3000), elapsedFraction(-5, 3000), elapsedFraction(10, 0)], [0, 0.5, 1, 1, 1]);
  assert.deepEqual([sweepStep(3000, 3000), sweepStep(1500, 3000), sweepStep(1, 3000)], [0, SWEEP_STEPS / 2, SWEEP_STEPS - 1]);
  assert.deepEqual([cooldownSeconds(29_001), cooldownSeconds(1), cooldownSeconds(2000)], [30, 1, 2]);
  // the hand: 12 o'clock at the start, 3 o'clock after a quarter (clockwise on screen: y grows downwards)
  const at = (e: number): [number, number] => [Math.round(Math.cos(handAngle(e)) * 10), Math.round(Math.sin(handAngle(e)) * 10)];
  assert.deepEqual([at(0), at(0.25), at(0.5), at(0.75)], [[0, -10], [10, 0], [0, 10], [-10, 0]]);
  // the gray part starts at the hand and ends at 12 o'clock; it is empty when ready
  const c = { x: 50, y: 50 };
  const w = remainingWedge(c, 20, 0.25);
  assert.deepEqual(w[0], c);
  const first = w[1];
  const last = w[w.length - 1];
  assert.deepEqual([Math.round(first.x), Math.round(first.y), Math.round(last.x), Math.round(last.y)], [70, 50, 50, 30]);
  assert.deepEqual(remainingWedge(c, 20, 1), []);
  assert.ok(remainingWedge(c, 20, 0).length > remainingWedge(c, 20, 0.9).length, 'fewer points as it shrinks');
});
