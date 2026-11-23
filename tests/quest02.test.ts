import assert from 'node:assert/strict';
import { test } from 'node:test';
import { playerCombatStats } from '../src/combat/CombatRules';
import type { CharacterData } from '../src/data/CharacterData';
import { DIALOGUES, DialogueSession } from '../src/dialogue/Dialogues';
import { initLanguage, setLanguage, translate } from '../src/i18n';
import { labels } from '../src/i18n/labels';
import { characterInventorySource } from '../src/inventory/CharacterInventorySource';
import { InventoryService } from '../src/inventory/InventoryService';
import { EQUIPMENT_SLOTS, INVENTORY_SLOT_COUNT } from '../src/inventory/InventorySlots';
import { addItem, bagIndexOf, createInventory, equipFromBag, equipmentDerivedBonus, grantOnce, hasGrant, sanitizeInventory, type InventoryState } from '../src/inventory/InventoryState';
import { ITEM_CATALOG, itemDefinition } from '../src/items/ItemCatalog';
import type { ItemDefinition } from '../src/items/ItemDefinition';
import { itemInfo } from '../src/items/ItemInfoText';
import { PassiveTreeService } from '../src/passives/PassiveTreeService';
import { TUTORIAL_QUEST_EXP_BUDGET } from '../src/progression/QuestExpBudget';
import { QuestService } from '../src/quests/QuestService';
import {
  applyQuest02,
  createQuest02,
  equipmentTutorialStep,
  isQuest02AtMateus,
  QUEST02_STATES,
  restoreQuest02,
  TUTORIAL_QUEST_02,
  type Quest02Event,
  type Quest02Progress,
  type Quest02State,
} from '../src/quests/TutorialQuest02';
import { CharacterStatusService } from '../src/status/CharacterStatusService';
import { NOTIFICATION_TIMING, NotificationQueue } from '../src/ui/notifications/NotificationQueue';
import { newCharacter, saveAndLoad, withoutStorage } from './helpers/session';

const DAGGER = 'weapon_rusty_dagger';
/** The starter armor every new character wears (StartingEquipment). */
const ARMOR = 'armor_worn_cloth';
const { reward } = TUTORIAL_QUEST_02;
const EVENTS: Quest02Event[] = ['start', 'talk', 'cancelTalk', 'grantReward', 'finishDialogue', 'complete', 'turnIn', 'cancelTurnIn', 'grantExp', 'finishTurnIn', 'statAllocated'];
const at = (state: Quest02State): Quest02Progress => ({ state });

/** Plays Tutorial Quest 01 and the passive tutorial up to the unlocked first node. */
function afterPassiveTutorial(name: string): CharacterData {
  const c = newCharacter(name);
  for (const e of ['start', 'talk', 'finishDialogue', 'startPassiveTutorial'] as const) assert.ok(QuestService.advance(c, e), e);
  QuestService.sync02(c);
  assert.equal(QuestService.quest02(c).state, 'NOT_STARTED', 'not before the node is unlocked');
  assert.equal(PassiveTreeService.upgrade(c, 'drifters_resolve'), null);
  QuestService.sync02(c);
  return c;
}

const items = (s: InventoryState): string[] => [...s.bag.flatMap((x) => (x ? Array.from({ length: x.quantity }, () => x.itemId) : [])), ...Object.values(s.equipment).flatMap((x) => (x ? [x.itemId] : []))];

// -------------------------------------------------------------------------------------------- dialogue

test('dialogue: exactly three steps, the author\'s text character for character; the reward comes before the third', () => {
  assert.equal(TUTORIAL_QUEST_02.id, 'tutorial_02_rusty_dagger');
  const lines = DIALOGUES[TUTORIAL_QUEST_02.dialogueId];
  initLanguage(null);
  setLanguage('th');
  assert.deepEqual(lines.map((k) => translate(k)), ['เอาล่ะ เจ้าได้สัมผัสความแข็งแกร่งของตัวเจ้าเองแล้ว', 'ข้าจะมอบมีดให้ 1 เล่ม เพื่อให้เจ้าเอาไปใช้ปราบสัตว์ประหลาด', 'เอาล่ะลองใช้สิ่งนี้ดู']);
  assert.equal(TUTORIAL_QUEST_02.rewardBeforeStep, 2);
  assert.deepEqual({ ...reward }, { grantId: 'quest:tutorial_02_rusty_dagger', itemId: DAGGER, quantity: 1 });
  const s = new DialogueSession(lines);
  assert.deepEqual([s.isLastStep, s.next(), s.isLastStep, s.next(), s.isLastStep, s.next()], [false, false, false, false, true, true]);
});

// ----------------------------------------------------------------------------------------------- states

test('states: only the next step is accepted from each state, in order, once', () => {
  let p = createQuest02();
  const path: [Quest02Event, Quest02State][] = [
    ['start', 'FIND_MATEUS'],
    ['talk', 'MATEUS_DIALOGUE'],
    ['grantReward', 'DAGGER_GRANTED'],
    ['finishDialogue', 'EQUIPMENT_TUTORIAL'],
    ['complete', 'COMPLETED'],
    ['turnIn', 'TURN_IN_DIALOGUE'],
    ['grantExp', 'REWARDED'],
    ['finishTurnIn', 'STATUS_TUTORIAL'],
    ['statAllocated', 'TURNED_IN'],
  ];
  for (const [event, state] of path) {
    const allowed = EVENTS.filter((e) => applyQuest02(p, e) !== null);
    const cancel = p.state === 'MATEUS_DIALOGUE' ? ['cancelTalk'] : p.state === 'TURN_IN_DIALOGUE' ? ['cancelTurnIn'] : [];
    assert.deepEqual(allowed.sort(), [...cancel, event].sort(), p.state);
    p = applyQuest02(p, event)!;
    assert.equal(p.state, state);
  }
  assert.deepEqual(EVENTS.filter((e) => applyQuest02(p, e) !== null), []);
  for (const s of QUEST02_STATES) assert.equal(isQuest02AtMateus(at(s)), ['FIND_MATEUS', 'MATEUS_DIALOGUE', 'DAGGER_GRANTED', 'COMPLETED', 'TURN_IN_DIALOGUE', 'REWARDED'].includes(s), `${s}: dotted path until the last line`);
});

test('restore: a cut-off conversation starts over or goes on, completed stays completed, nothing restarts', () => {
  const r = (state: unknown, given: boolean) => restoreQuest02({ state }, given).state;
  assert.equal(r('NOT_STARTED', false), 'NOT_STARTED');
  assert.equal(r('FIND_MATEUS', false), 'FIND_MATEUS');
  assert.equal(r('MATEUS_DIALOGUE', false), 'FIND_MATEUS');
  assert.equal(r('MATEUS_DIALOGUE', true), 'EQUIPMENT_TUTORIAL', 'given, quest not saved any more');
  assert.equal(r('FIND_MATEUS', true), 'EQUIPMENT_TUTORIAL');
  assert.equal(r('DAGGER_GRANTED', true), 'EQUIPMENT_TUTORIAL', 'the last line is not repeated');
  assert.equal(r('EQUIPMENT_TUTORIAL', true), 'EQUIPMENT_TUTORIAL');
  assert.equal(r('COMPLETED', true), 'COMPLETED', 'worn, not turned in yet (also saves from before the turn-in existed)');
  assert.equal(r('COMPLETED', false), 'COMPLETED');
  assert.equal(r('TURN_IN_DIALOGUE', true), 'COMPLETED', 'cut off before the EXP: asked again');
  assert.equal(r('REWARDED', true), 'STATUS_TUTORIAL', 'cut off after the EXP: never paid again');
  assert.equal(r('STATUS_TUTORIAL', true), 'STATUS_TUTORIAL');
  assert.equal(r('TURNED_IN', true), 'TURNED_IN');
  assert.deepEqual(restoreQuest02({ state: 'STATUS_TUTORIAL', statPointsSpentAtStart: 2 }, true, 3), { state: 'STATUS_TUTORIAL', statPointsSpentAtStart: 2 });
  for (const bad of [-1, 4, 1.5, 'x', undefined]) assert.deepEqual(restoreQuest02({ state: 'STATUS_TUTORIAL', statPointsSpentAtStart: bad }, true, 3), { state: 'STATUS_TUTORIAL', statPointsSpentAtStart: 3 }, String(bad));
  for (const broken of ['HACKED', 5, null, undefined, {}]) {
    assert.equal(r(broken, false), 'NOT_STARTED');
    assert.equal(r(broken, true), 'TURNED_IN', 'lost progress never gives a second dagger or EXP');
  }
  assert.equal(restoreQuest02(null, false).state, 'NOT_STARTED');
});

test('start: after quest 01 AND the first passive node, by itself, once', () => {
  withoutStorage(() => {
    const c = afterPassiveTutorial('Alpha');
    assert.equal(QuestService.quest02(c).state, 'FIND_MATEUS');
    QuestService.sync02(c);
    assert.equal(QuestService.quest02(c).state, 'FIND_MATEUS');
    assert.equal(QuestService.quest02(saveAndLoad(c)).state, 'FIND_MATEUS', 'in the save file');
    // node unlocked before the first conversation: starts when that conversation is over
    const early = newCharacter('Early');
    PassiveTreeService.upgrade(early, 'drifters_resolve');
    QuestService.advance(early, 'start');
    QuestService.sync02(early);
    assert.equal(QuestService.quest02(early).state, 'NOT_STARTED');
    for (const e of ['talk', 'finishDialogue', 'startPassiveTutorial'] as const) QuestService.advance(early, e);
    QuestService.sync02(early);
    assert.equal(QuestService.quest02(early).state, 'FIND_MATEUS');
    // characters from before quest 01 keep everything as it was
    const old = newCharacter('Veteran');
    old.quests = { ...old.quests!, tutorial_01_find_mateus: { state: 'NOT_STARTED', autoStart: false, rewardClaimed: false } };
    PassiveTreeService.upgrade(old, 'drifters_resolve');
    QuestService.sync02(old);
    assert.equal(QuestService.quest02(old).state, 'NOT_STARTED');
  });
});

test('whole quest: one dagger, worn, saved, completed once, no EXP, quest 01 untouched', () => {
  withoutStorage(() => {
    const done: string[] = [];
    const off = QuestService.onCompleted((c, id) => done.push(`${c.name}:${id}`));
    const gained: unknown[] = [];
    const offGained = InventoryService.onGained((c, id, n) => gained.push([c.name, id, n]));
    const c = afterPassiveTutorial('Alpha');
    const before = { status: JSON.stringify(c.status), quest01: JSON.stringify(QuestService.quest01(c)) };
    const atk = playerCombatStats(CharacterStatusService.derived(c)).atk;

    assert.ok(QuestService.advance02(c, 'talk'));
    assert.equal(InventoryService.grantOnce(c, reward), null);
    assert.ok(QuestService.advance02(c, 'grantReward'));
    assert.deepEqual(items(c.inventory!), [DAGGER, ARMOR]);
    assert.equal(c.inventory!.equipment.weapon, null, 'not equipped by itself');
    assert.equal(playerCombatStats(CharacterStatusService.derived(c)).atk, atk, 'no bonus while it lies in the bag');
    assert.deepEqual(gained, [['Alpha', DAGGER, 1]]);
    assert.ok(QuestService.advance02(c, 'finishDialogue'));
    QuestService.sync02(c);
    assert.equal(QuestService.quest02(c).state, 'EQUIPMENT_TUTORIAL', 'only completes when it is worn');

    // reload, then equip
    const c2 = saveAndLoad(c);
    assert.equal(QuestService.quest02(c2).state, 'EQUIPMENT_TUTORIAL');
    assert.deepEqual(items(c2.inventory!), [DAGGER, ARMOR]);
    assert.equal(InventoryService.grantOnce(c2, reward), 'alreadyGranted');
    const index = bagIndexOf(c2.inventory, DAGGER);
    assert.equal(InventoryService.equip(c2, index, 'hat'), 'wrongSlot');
    assert.equal(InventoryService.equip(c2, index, 'weapon'), null);
    assert.equal(InventoryService.equip(c2, index, 'weapon'), 'emptySlot', 'never twice');
    QuestService.sync02(c2);
    QuestService.sync02(c2);
    assert.equal(QuestService.quest02(c2).state, 'COMPLETED');
    assert.deepEqual(done, ['Alpha:tutorial_01_find_mateus', 'Alpha:tutorial_02_rusty_dagger']);
    assert.deepEqual(items(c2.inventory!), [DAGGER, ARMOR]);

    const c3 = saveAndLoad(c2);
    assert.equal(QuestService.quest02(c3).state, 'COMPLETED');
    assert.equal(c3.inventory!.equipment.weapon?.itemId, DAGGER);
    assert.equal(bagIndexOf(c3.inventory, DAGGER), -1);
    assert.equal(InventoryService.grantOnce(c3, reward), 'alreadyGranted');
    assert.equal(gained.length, 1);
    assert.equal(playerCombatStats(CharacterStatusService.derived(c3)).atk, atk + 4);
    assert.equal(JSON.stringify(c3.status), before.status, 'no EXP, level or stat points');
    assert.equal(JSON.stringify(QuestService.quest01(c3)), before.quest01);
    assert.equal(TUTORIAL_QUEST_EXP_BUDGET.allocations[TUTORIAL_QUEST_02.id], 100, 'paid only when turned in (questFlow tests)');
    // another character - also of the same name - is independent
    assert.deepEqual(items(newCharacter('Alpha').inventory!), [ARMOR], 'only the starter armor');
    off();
    offGained();
  });
});

// ----------------------------------------------------------------------------------- one-time reward safety

test('reward: repeated, or saved and loaded at any point - never a second dagger', () => {
  withoutStorage(() => {
    const c = afterPassiveTutorial('Alpha');
    QuestService.advance02(c, 'talk');
    for (let i = 0; i < 5; i++) InventoryService.grantOnce(c, reward);
    assert.deepEqual(items(c.inventory!), [DAGGER, ARMOR]);
    // saved between giving the item and the next quest step
    const reloaded = saveAndLoad(c);
    assert.equal(InventoryService.grantOnce(reloaded, reward), 'alreadyGranted');
    assert.equal(QuestService.quest02(reloaded).state, 'EQUIPMENT_TUTORIAL');
    assert.equal(QuestService.advance02(reloaded, 'talk'), false, 'no second conversation');
    assert.deepEqual(items(reloaded.inventory!), [DAGGER, ARMOR]);
  });
});

test('reward that does not fit: nothing is given, announced or recorded; asking again works', () => {
  withoutStorage(() => {
    const gained: unknown[] = [];
    const off = InventoryService.onGained((...x) => gained.push(x));
    const c = afterPassiveTutorial('Alpha');
    const full: InventoryState = { ...createInventory(), bag: Array.from({ length: INVENTORY_SLOT_COUNT }, () => ({ itemId: 'x', quantity: 1 })) };
    c.inventory = full;
    assert.equal(InventoryService.grantOnce(c, reward), 'bagFull');
    assert.equal(c.inventory, full);
    assert.equal(InventoryService.grantOnce(c, { ...reward, itemId: 'nothing' }), 'unknownItem');
    assert.deepEqual([hasGrant(c.inventory, reward.grantId), gained.length], [false, 0]);
    c.inventory = createInventory();
    assert.equal(InventoryService.grantOnce(c, reward), null);
    assert.equal(gained.length, 1);
    off();
  });
});

test('broken progress: quest and item records repair each other', () => {
  withoutStorage(() => {
    const c = afterPassiveTutorial('Alpha');
    QuestService.advance02(c, 'talk');
    InventoryService.grantOnce(c, reward);
    QuestService.advance02(c, 'grantReward');
    QuestService.advance02(c, 'finishDialogue');
    const broken = newCharacter('Alpha');
    CharacterStatusService.restore(broken, { status: c.status, passives: c.passives!, quests: c.quests!, inventory: createInventory() });
    assert.equal(QuestService.quest02(broken).state, 'EQUIPMENT_TUTORIAL');
    assert.equal(InventoryService.grantOnce(broken, reward), null, 'GameScene replaces the lost dagger, once');
    assert.equal(InventoryService.grantOnce(broken, reward), 'alreadyGranted');
    assert.deepEqual(items(broken.inventory!), [DAGGER]);
    const lost = newCharacter('Alpha');
    CharacterStatusService.restore(lost, { status: c.status, passives: c.passives!, quests: {}, inventory: c.inventory! });
    assert.equal(QuestService.quest02(lost).state, 'TURNED_IN', 'lost quest log: no restart, no second dagger or EXP');
  });
});

// -------------------------------------------------------------------------------------------- item rules

const item = (change: Partial<ItemDefinition>): ItemDefinition => ({ ...itemDefinition(DAGGER)!, ...change });
const LOOKUP: Record<string, ItemDefinition> = {
  dagger: item({ id: 'dagger' }),
  other: item({ id: 'other', bonuses: { physicalAtk: 9, magicAtk: 2 }, requiredLevel: 5 }),
  hat: item({ id: 'hat', equipmentSlot: 'hat', weaponType: null, bonuses: { physicalAtk: 1, magicAtk: 0 }, additionalStats: { maxHp: 10 } }),
  potion: { ...item({ id: 'potion' }), stackable: true },
};
const lookup = (id: string): ItemDefinition | undefined => LOOKUP[id];
const must = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  assert.ok(r.ok, JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};

test('bag: first free slot, stacks only stackable items, all or nothing, the given state never changes', () => {
  const s0 = createInventory();
  const frozen = JSON.stringify(s0);
  const s1 = must(addItem(s0, 'dagger', 2, lookup)).state;
  assert.deepEqual(s1.bag.slice(0, 3).map((x) => x && [x.itemId, x.quantity]), [['dagger', 1], ['dagger', 1], null]);
  const s2 = must(addItem(must(addItem(s1, 'potion', 3, lookup)).state, 'potion', 4, lookup)).state;
  assert.deepEqual(s2.bag[2], { itemId: 'potion', quantity: 7 });
  assert.equal(JSON.stringify(s0), frozen);
  const almost = must(addItem(s0, 'dagger', INVENTORY_SLOT_COUNT - 1, lookup)).state;
  assert.deepEqual(addItem(almost, 'dagger', 2, lookup), { ok: false, error: 'bagFull' });
  for (const q of [0, -1, 1.5, Number.NaN]) assert.deepEqual(addItem(s0, 'dagger', q, lookup), { ok: false, error: 'invalidQuantity' });
  const g = must(grantOnce(s0, 'q', 'dagger', 1, lookup)).state;
  assert.deepEqual(grantOnce(g, 'q', 'dagger', 1, lookup), { ok: false, error: 'alreadyGranted' });
  assert.ok(must(grantOnce(g, 'q2', 'dagger', 1, lookup)).state.grants.length === 2, 'another grant is independent');
});

test('equip: moves the item, swaps the worn one back, checks slot and level, never doubles anything', () => {
  let s = must(addItem(must(addItem(createInventory(), 'dagger', 1, lookup)).state, 'other', 1, lookup)).state;
  for (const slot of EQUIPMENT_SLOTS) if (slot !== 'weapon') assert.deepEqual(equipFromBag(s, 0, slot, 10, lookup), { ok: false, error: 'wrongSlot' });
  s = must(equipFromBag(s, 0, 'weapon', 1, lookup)).state;
  assert.deepEqual([s.bag[0], s.equipment.weapon?.itemId], [null, 'dagger']);
  assert.deepEqual(equipFromBag(s, 1, 'weapon', 4, lookup), { ok: false, error: 'levelTooLow' });
  s = must(equipFromBag(s, 1, 'weapon', 5, lookup)).state;
  assert.deepEqual([s.bag[1]?.itemId, s.equipment.weapon?.itemId], ['dagger', 'other']);
  assert.deepEqual(items(s).sort(), ['dagger', 'other']);
  for (const i of [-1, 20, 999]) assert.deepEqual(equipFromBag(s, i, 'weapon', 9, lookup), { ok: false, error: 'emptySlot' });
});

test('bonus: additive on top of the unchanged formulas; a dagger\'s Physical ATK is melee', () => {
  const s: InventoryState = { ...createInventory(), equipment: { weapon: { itemId: DAGGER, instanceId: 'a' }, hat: null, armor: null, shoes: null, charm: null } };
  assert.deepEqual(equipmentDerivedBonus(s), { flat: { meleeAtk: 4 }, maxHpPercent: 0 });
  assert.deepEqual(equipmentDerivedBonus(createInventory()), { flat: {}, maxHpPercent: 0 });
  assert.deepEqual(equipmentDerivedBonus(undefined), { flat: {}, maxHpPercent: 0 });
  const mixed: InventoryState = { ...s, equipment: { ...s.equipment, weapon: { itemId: 'other', instanceId: 'b' }, hat: { itemId: 'hat', instanceId: 'c' } } };
  assert.deepEqual(equipmentDerivedBonus(mixed, lookup).flat, { meleeAtk: 10, matk: 2, rangedAtk: 1, maxHp: 10 });
});

test('stored data of any shape becomes a valid state; unknown items are kept', () => {
  for (const raw of [null, 5, {}, { bag: 'x', equipment: 3, grants: 1 }, { bag: [{}, 4, null, { itemId: '' }] }]) {
    const { state } = sanitizeInventory(raw, lookup);
    assert.equal(state.bag.length, INVENTORY_SLOT_COUNT);
    assert.deepEqual(items(state), []);
  }
  const { state, repaired } = sanitizeInventory({ bag: [null, { itemId: 'future', quantity: 2 }, { itemId: 'dagger', quantity: -3 }], equipment: { weapon: 'hat', hat: 'unknown', ring: 'dagger' }, grants: ['a', 'a', 7] }, lookup);
  assert.deepEqual(state.bag.slice(0, 3).map((x) => x && [x.itemId, x.quantity]), [['hat', 1], ['future', 2], ['dagger', 1]]);
  assert.deepEqual([state.equipment.weapon, state.equipment.hat?.itemId, state.grants], [null, 'unknown', ['a']]);
  assert.ok(repaired.length > 0);
  const good = must(grantOnce(createInventory(), 'g', DAGGER, 1)).state;
  assert.deepEqual(sanitizeInventory(JSON.parse(JSON.stringify(good))), { state: good, repaired: [], newIds: 0 });
});

// --------------------------------------------------------------------------------- window texts and tutorial

test('inventory window data: icon, name, type and effects of the registered item; equips through the same source', () => {
  withoutStorage(() => {
    initLanguage(null);
    const c = newCharacter('Alpha');
    const source = characterInventorySource(c);
    let changes = 0;
    const off = source.onChange(() => changes++);
    assert.equal(source.itemAt({ kind: 'bag', index: 0 }), null);
    InventoryService.grantOnce(c, reward);
    setLanguage('th');
    assert.deepEqual(source.itemAt({ kind: 'bag', index: 0 }), {
      name: 'มีดสนิม',
      type: 'อาวุธ · มีดสั้น · Lv 1',
      description: 'มีดสั้นที่ถูกสนิมกัดกิน คมทื่อไปมาก แต่ยังพอใช้ฟันศัตรูได้',
      effects: ['ATK กายภาพ +4'],
      icon: { texture: 'item.icon.weapon_rusty_dagger' },
    });
    setLanguage('en');
    assert.deepEqual([itemInfo(DAGGER)!.name, itemInfo(DAGGER)!.type, itemInfo(DAGGER)!.effects], ['Rusty Dagger', 'Weapon · Dagger · Lv 1', ['Physical ATK +4']]);
    setLanguage('th');
    assert.equal(source.equip(0, 'armor'), false);
    assert.equal(source.equip(0, 'weapon'), true);
    assert.equal(source.equip(0, 'weapon'), false);
    assert.equal(source.itemAt({ kind: 'bag', index: 0 }), null);
    assert.equal(source.itemAt({ kind: 'equipment', slot: 'weapon' })!.name, 'มีดสนิม');
    assert.equal(changes, 2);
    off();
  });
  assert.deepEqual([...ITEM_CATALOG.keys()], [DAGGER, ARMOR, 'consumable_red_healing_potion', 'consumable_sp_recovery_potion', 'scroll_power_thrust', 'scroll_heal'], 'no additional items');
});

test('equipment tutorial: the step always follows what is open, selected and worn', () => {
  const inv = must(grantOnce(createInventory(), 'g', DAGGER, 1)).state;
  const p = at('EQUIPMENT_TUTORIAL');
  assert.equal(equipmentTutorialStep(p, inv, false, null), 'openInventory');
  assert.equal(equipmentTutorialStep(p, inv, true, null), 'selectItem');
  assert.equal(equipmentTutorialStep(p, inv, true, { kind: 'bag', index: 5 }), 'selectItem');
  assert.equal(equipmentTutorialStep(p, inv, true, { kind: 'equipment', slot: 'weapon' }), 'selectItem', 'the slot alone equips nothing');
  assert.equal(equipmentTutorialStep(p, inv, true, { kind: 'bag', index: 0 }), 'equipItem');
  assert.equal(equipmentTutorialStep(p, inv, false, { kind: 'bag', index: 0 }), 'openInventory', 'closed again');
  const worn = must(equipFromBag(inv, 0, 'weapon', 1)).state;
  assert.equal(equipmentTutorialStep(p, worn, true, null), null);
  assert.equal(equipmentTutorialStep(p, createInventory(), true, null), null, 'no dagger: no spotlight, nothing is blocked');
  assert.equal(equipmentTutorialStep(p, undefined, false, null), null);
  for (const s of QUEST02_STATES) if (s !== 'EQUIPMENT_TUTORIAL') assert.equal(equipmentTutorialStep(at(s), inv, false, null), null, s);
});

test('quest texts exist in both languages', () => {
  initLanguage(null);
  for (const language of ['th', 'en'] as const) {
    setLanguage(language);
    for (const text of [labels.questName(TUTORIAL_QUEST_02.id), labels.questObjective(TUTORIAL_QUEST_02.id), labels.questObjective(TUTORIAL_QUEST_02.id, 'objectiveEquip')]) assert.ok(!text.startsWith('quests.'), text);
  }
  setLanguage('th');
});

// ----------------------------------------------------------------------------------------- notifications

test('notifications: 3000 ms fully visible, about 500 ms fade, then gone', () => {
  assert.deepEqual({ ...NOTIFICATION_TIMING }, { visibleMs: 3000, fadeMs: 500 });
  const q = new NotificationQueue<string>(3);
  q.push('a');
  const n = q.visible[0];
  assert.equal(q.alphaOf(n), 1, 'immediately');
  q.update(3000);
  assert.equal(q.alphaOf(n), 1);
  let last = 1;
  for (let i = 0; i < 9; i++) {
    q.update(50);
    assert.ok(q.alphaOf(n) < last);
    last = q.alphaOf(n);
  }
  assert.equal(q.visible.length, 1);
  q.update(50);
  assert.equal(q.visible.length, 0);
});

test('notifications: stack up to the capacity, the rest wait with their full time', () => {
  const q = new NotificationQueue<number>(2);
  for (let i = 0; i < 5; i++) q.push(i);
  assert.deepEqual(q.visible.map((n) => n.content), [0, 1]);
  assert.equal(q.waitingCount, 3);
  q.update(3500);
  assert.deepEqual(q.visible.map((n) => [n.content, n.ageMs]), [[2, 0], [3, 0]]);
  q.update(3500);
  q.update(3500);
  assert.deepEqual([q.visible.length, q.waitingCount], [0, 0]);
});

