import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import type { CharacterData } from '../src/data/CharacterData';
import { DIALOGUES } from '../src/dialogue/Dialogues';
import { assignItem, createHotbar, HOTBAR_SIZE, hotbarSlotOfKey, sanitizeHotbar, slotOfItem } from '../src/hotbar/Hotbar';
import { HotbarService } from '../src/hotbar/HotbarService';
import { initLanguage, setLanguage, translate } from '../src/i18n';
import { InventoryService } from '../src/inventory/InventoryService';
import { INVENTORY_SLOT_COUNT, slotAction } from '../src/inventory/InventorySlots';
import { bagIndexOf, consumeOne, createInventory, equipFromBag, equipOption, grantOnce, itemCount, type InventoryState } from '../src/inventory/InventoryState';
import { characterInventorySource } from '../src/inventory/CharacterInventorySource';
import { hpRestored, useProblem } from '../src/items/ConsumableUse';
import { itemDefinition } from '../src/items/ItemCatalog';
import { itemInfo } from '../src/items/ItemInfoText';
import { MONSTER_DEFINITIONS } from '../src/monsters/MonsterDefinition';
import { NPC_DEFINITIONS, NPC_DISPLAY_SCALE } from '../src/npcs/NpcDefinition';
import { PassiveTreeService } from '../src/passives/PassiveTreeService';
import { npcQuestMarker } from '../src/quests/QuestMarkers';
import { QuestRewards } from '../src/quests/QuestRewards';
import { QuestService } from '../src/quests/QuestService';
import { trackedQuest } from '../src/quests/QuestTracker';
import { TUTORIAL_QUEST_03 } from '../src/quests/TutorialQuest03';
import { applyQuest04, createQuest04, potionTutorialStep, restoreQuest04, TUTORIAL_QUEST_04, type PotionTutorialView } from '../src/quests/TutorialQuest04';
import { applyQuest05, restoreQuest05, TUTORIAL_QUEST_05 } from '../src/quests/TutorialQuest05';
import { ACTIVE_SKILL_IDS, isSkillUnlocked } from '../src/skills/ActiveSkills';
import { CharacterStatusService } from '../src/status/CharacterStatusService';
import { hotbarAssignLayout } from '../src/ui/hotbar/HotbarAssignLayout';
import { HOTBAR_SLOT, hotbarLayout } from '../src/ui/hud/HotbarLayout';
import { MapLayout } from '../src/world/MapLayout';
import { ASHEN_CROSSROADS } from '../src/world/maps/AshenCrossroads';
import { Pathfinder } from '../src/world/navigation/Pathfinder';
import { readPng } from './helpers/png';
import { newCharacter, saveAndLoad, withoutStorage } from './helpers/session';

const POTION = 'consumable_red_healing_potion';
const ROLAND = 'roland_01';
const exp = (c: CharacterData): [number, number] => [c.status.level, c.status.exp];

/** A character whose Void Mite hunt is ready to be turned in (state set directly: earlier quests have their own tests). */
function readyForMateus(name: string): CharacterData {
  const c = newCharacter(name);
  assert.equal(PassiveTreeService.upgrade(c, 'drifters_resolve'), null, 'as in play: the first passive node is unlocked');
  c.quests = {
    ...c.quests!,
    tutorial_01_find_mateus: { state: 'PASSIVE_TUTORIAL_STARTED', autoStart: true, rewardClaimed: false },
    tutorial_02_rusty_dagger: { state: 'TURNED_IN' },
    tutorial_03_void_mite_hunt: { state: 'TURN_IN_DIALOGUE', kills: 5 },
  };
  return c;
}

/** Turns the hunt in as GameScene does at the end of the conversation. */
function turnIn03(c: CharacterData): ReturnType<typeof QuestRewards.quest03> {
  const r = QuestRewards.quest03(c);
  if (!r.ok) QuestService.advance03(c, 'cancelTurnIn');
  QuestService.sync(c);
  return r;
}

const view = (v: Partial<PotionTutorialView>): PotionTutorialView => ({ inventoryOpen: false, potionSelected: false, assignOpen: false, hasPotion: true, ...v });

// --------------------------------------------------------------------------------------------- the potion

test('Red Healing Potion: definition, untouched 16x16 icon, texts in both languages', () => {
  const { icon, ...rest } = itemDefinition(POTION)!;
  assert.deepEqual(rest, {
    id: POTION,
    category: 'consumable',
    equipmentSlot: null,
    weaponType: null,
    requiredLevel: 1,
    bonuses: { physicalAtk: 0, magicAtk: 0 },
    additionalStats: {},
    specialEffects: [],
    stackable: true,
    use: { restoreHp: 50 },
  });
  const file = path.join(process.cwd(), 'public', icon.url);
  const img = readPng(file);
  assert.deepEqual([icon.width, icon.height, img.width, img.height], [16, 16, 16, 16]);
  assert.equal(img.data[3], 0, 'transparent background');
  initLanguage(null);
  setLanguage('th');
  assert.deepEqual([itemInfo(POTION)!.name, itemInfo(POTION)!.description, itemInfo(POTION)!.effects], ['ยาแดงฟื้นฟู', 'ยาแดงสำหรับฟื้นฟูพลังชีวิต เมื่อใช้งานจะฟื้นฟู HP 50 หน่วย', ['ฟื้นฟู HP +50']]);
  setLanguage('en');
  assert.deepEqual([itemInfo(POTION)!.name, itemInfo(POTION)!.description, itemInfo(POTION)!.type], ['Red Healing Potion', 'A red potion that restores 50 HP when consumed.', 'Consumable']);
  assert.deepEqual([translate('inventory.use'), translate('inventory.assignHotkey')], ['Use', 'Assign Hotkey']);
  setLanguage('th');
  assert.deepEqual([translate('inventory.use'), translate('inventory.assignHotkey')], ['ใช้งาน', 'ตั้งคีย์ลัด']);
});

test('the potion is never equipment: no equip option, no equipment slot; the panel offers USE + ASSIGN HOTKEY', () => {
  withoutStorage(() => {
    const s = grantOnce(createInventory(), 'g', POTION, 20);
    assert.ok(s.ok);
    assert.deepEqual(s.state.bag[0], { itemId: POTION, quantity: 20 }, 'one stack');
    assert.equal(equipOption(s.state, 0, 99), null);
    for (const slot of ['weapon', 'hat', 'armor', 'shoes', 'charm'] as const) assert.deepEqual(equipFromBag(s.state, 0, slot, 99), { ok: false, error: 'wrongSlot' });
    const c = newCharacter('Alpha');
    c.inventory = { ...s.state, equipment: c.inventory!.equipment };
    const source = characterInventorySource(c);
    assert.deepEqual(slotAction(source, { kind: 'bag', index: 0 }), { kind: 'consumable', itemId: POTION });
    assert.deepEqual(slotAction(source, { kind: 'equipment', slot: 'armor' }), { kind: 'unequip' }, 'equipment keeps its button');
  });
});

test('use rules: alive, not blocked, one in the bag, HP not full; 50 HP at most, never above max', () => {
  const ok = { alive: true, quantity: 3, hp: 40, maxHp: 120, blocked: false };
  assert.equal(useProblem(POTION, ok), null);
  assert.equal(useProblem(POTION, { ...ok, alive: false }), 'dead');
  assert.equal(useProblem(POTION, { ...ok, blocked: true }), 'blocked');
  assert.equal(useProblem(POTION, { ...ok, quantity: 0 }), 'none');
  assert.equal(useProblem(POTION, { ...ok, hp: 120 }), 'hpFull');
  assert.equal(useProblem('armor_worn_cloth', ok), 'notUsable');
  assert.equal(useProblem('nothing', ok), 'notUsable');
  assert.deepEqual([hpRestored(POTION, 40, 120), hpRestored(POTION, 100, 120), hpRestored(POTION, 120, 120)], [50, 20, 0]);
});

test('consuming: exactly one, from the chosen stack, an empty stack frees its slot; nothing without the item', () => {
  const s: InventoryState = { ...createInventory(), bag: createInventory().bag.map((_, i) => (i === 2 ? { itemId: POTION, quantity: 2 } : i === 5 ? { itemId: POTION, quantity: 1 } : null)) };
  assert.equal(itemCount(s, POTION), 3);
  const a = consumeOne(s, POTION, 5);
  assert.ok(a.ok);
  assert.deepEqual([a.state.bag[5], a.state.bag[2]?.quantity, itemCount(a.state, POTION)], [null, 2, 2]);
  const b = consumeOne(a.state, POTION);
  assert.ok(b.ok && b.state.bag[2]?.quantity === 1);
  const c = consumeOne(b.state, POTION, 17);
  assert.ok(c.ok && itemCount(c.state, POTION) === 0);
  assert.deepEqual(consumeOne(c.state, POTION), { ok: false, error: 'none' });
  assert.equal(itemCount(s, POTION), 3, 'the given state is not changed');
});

// --------------------------------------------------------------------------------------------- the hotbar

test('hotbar: 8 slots, items by reference, one slot per item (assigning again moves it), skills kept but locked', () => {
  assert.equal(HOTBAR_SIZE, 8);
  let h = createHotbar();
  assert.deepEqual(h, Array(8).fill(null));
  h = assignItem(h, 2, POTION)!;
  assert.deepEqual(h[2], { type: 'item', itemId: POTION });
  h = assignItem(h, 6, POTION)!;
  assert.deepEqual([h[2], h[6], slotOfItem(h, POTION)], [null, { type: 'item', itemId: POTION }, 6], 'moved, not doubled');
  for (const [slot, item] of [[8, POTION], [-1, POTION], [1.5, POTION], [0, 'armor_worn_cloth'], [0, 'nothing']] as const) assert.equal(assignItem(h, slot, item), null);
  assert.deepEqual(ACTIVE_SKILL_IDS, ['drifter_lv1'], 'the registered skill ids (the basic attack is not a skill)');
  const c = newCharacter('Alpha');
  for (const id of [...ACTIVE_SKILL_IDS, 'basic', 'self_heal']) assert.equal(isSkillUnlocked(c, id), false, 'skills are disabled');
  const raw = [{ type: 'item', itemId: POTION }, { type: 'skill', skillId: 'drifter_lv1' }, { type: 'skill', skillId: 'invented' }, { type: 'item', itemId: 'armor_worn_cloth' }, 'x', null, { type: 'item', itemId: POTION }, 7, 'extra'];
  const { state, dropped } = sanitizeHotbar(raw);
  assert.deepEqual(state, [{ type: 'item', itemId: POTION }, { type: 'skill', skillId: 'drifter_lv1' }, null, null, null, null, null, null]);
  assert.ok(dropped.length >= 5, dropped.join());
  assert.deepEqual(sanitizeHotbar(undefined), { state: createHotbar(), dropped: [] });
  assert.deepEqual(sanitizeHotbar('nope').state, createHotbar());
});

test('keys: only the top-row Digit1-Digit8; the numpad, Digit9/0 and letters do nothing', () => {
  assert.deepEqual(['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8'].map(hotbarSlotOfKey), [0, 1, 2, 3, 4, 5, 6, 7]);
  for (const code of ['Numpad1', 'Numpad8', 'Digit9', 'Digit0', 'KeyQ', 'One', '1', '']) assert.equal(hotbarSlotOfKey(code), -1, code);
  // no direct skill key any more
  const scene = fs.readFileSync(path.join(process.cwd(), 'src/scenes/GameScene.ts'), 'utf8');
  assert.ok(!/keydown-ONE|useSkill\('drifter_lv1'\)/.test(scene), 'key 1 no longer fires the Lv.1 skill');
});

test('hotbar layout: 8 equal slots, centred, the pack art\'s size and spacing; assignment window: two rows of four', () => {
  for (const width of [960, 1280, 800]) {
    const L = hotbarLayout(width, 400);
    assert.equal(L.slots.length, 8);
    const left = L.slots[0].x;
    const right = L.slots[7].x + L.slots[7].width;
    assert.ok(Math.abs(left - (width - right)) <= 1, `centred at ${width}`);
    for (const s of L.slots) assert.deepEqual([s.width, s.height, s.y], [HOTBAR_SLOT.width, HOTBAR_SLOT.height, 400]);
    for (let i = 1; i < 8; i++) assert.equal(L.slots[i].x - L.slots[i - 1].x - HOTBAR_SLOT.width, i === 4 ? HOTBAR_SLOT.middleGap : HOTBAR_SLOT.gap);
    assert.ok(L.divider.x > L.slots[3].x + HOTBAR_SLOT.width && L.divider.x < L.slots[4].x);
  }
  const A = hotbarAssignLayout(960, 480);
  assert.deepEqual([...new Set(A.slots.map((r) => r[1]))].length, 2, 'two rows');
  assert.deepEqual(A.slots.filter((r) => r[1] === A.slots[0][1]).length, 4, 'four per row');
  for (const r of A.slots) assert.ok(r[0] >= A.slotArea[0] && r[0] + r[2] <= A.slotArea[0] + A.slotArea[2] && r[1] + r[3] <= A.slotArea[1] + A.slotArea[3]);
});

test('HotbarService: only an item the character owns; the hotbar is in the save file, assignments survive loading', () => {
  withoutStorage(() => {
    const c = newCharacter('Alpha');
    let changes = 0;
    const off = HotbarService.onChange(() => changes++);
    assert.equal(HotbarService.assignItem(c, 0, POTION), false, 'not owned');
    InventoryService.grantOnce(c, { grantId: 'g', itemId: POTION, quantity: 2 });
    assert.equal(HotbarService.assignItem(c, 3, POTION), true);
    assert.deepEqual([changes, itemCount(c.inventory, POTION)], [1, 2], 'assigning uses nothing');
    const loaded = saveAndLoad(c);
    assert.deepEqual(loaded.hotbar, c.hotbar);
    assert.deepEqual(loaded.hotbar![3], { type: 'item', itemId: POTION });
    assert.deepEqual(newCharacter('Beta').hotbar, createHotbar(), 'a new character has an empty hotbar');
    off();
  });
});

// --------------------------------------------------------------------------------------------- Void Mite hunt ending

test('Void Mite turn-in: 20 potions and 200 EXP once; then Roland has a yellow ! and the path leads to him', () => {
  withoutStorage(() => {
    const gained: unknown[] = [];
    const offGained = InventoryService.onGained((_c, id, n) => gained.push([id, n]));
    const c = readyForMateus('Alpha');
    const before = exp(c);
    const r = turnIn03(c);
    assert.ok(r.ok && r.exp === 200);
    assert.equal(itemCount(c.inventory, POTION), 20);
    assert.deepEqual(gained, [[POTION, 20]], 'the item notice shows the potions');
    assert.notDeepEqual(exp(c), before);
    for (let i = 0; i < 3; i++) assert.equal(turnIn03(c).ok, false);
    assert.equal(itemCount(saveAndLoad(c).inventory, POTION), 20, 'never twice, also after loading');
    assert.deepEqual([npcQuestMarker(c, 'city_guard_01'), npcQuestMarker(c, ROLAND), QuestService.quest04(c).state], [null, 'available', 'OFFERED']);
    offGained();
  });
});

test('Void Mite turn-in with a full bag: nothing given, no EXP, not completed - and it works with room', () => {
  withoutStorage(() => {
    const c = readyForMateus('Alpha');
    c.inventory = { ...c.inventory!, bag: Array.from({ length: INVENTORY_SLOT_COUNT }, () => ({ itemId: 'armor_worn_cloth', quantity: 1, instanceId: `x${Math.random()}` })) };
    const before = exp(c);
    assert.deepEqual(turnIn03(c), { ok: false, error: 'bagFull' });
    assert.deepEqual([QuestService.quest03(c).state, exp(c), itemCount(c.inventory, POTION), npcQuestMarker(c, 'city_guard_01')], ['READY_TO_TURN_IN', before, 0, 'completed']);
    c.inventory = { ...c.inventory!, bag: c.inventory!.bag.map((x, i) => (i === 0 ? null : x)) };
    QuestService.advance03(c, 'turnIn');
    assert.ok(turnIn03(c).ok);
    assert.equal(itemCount(c.inventory, POTION), 20);
  });
});

// --------------------------------------------------------------------------------------------- potion training

test('potion training steps follow what is open and selected; Use is never consumed; a hotkey only counts after the Use explanation', () => {
  const p = { state: 'POTION_TUTORIAL' as const, useExplained: false };
  assert.equal(potionTutorialStep(p, view({})), 'openInventory');
  assert.equal(potionTutorialStep(p, view({ inventoryOpen: true })), 'selectPotion');
  assert.equal(potionTutorialStep(p, view({ inventoryOpen: true, potionSelected: true })), 'explainUse');
  assert.equal(applyQuest04(p, 'hotkeyAssigned'), null, 'an assignment before the explanation does not skip it');
  const explained = applyQuest04(p, 'explainUse')!;
  assert.equal(applyQuest04(explained, 'explainUse'), null);
  assert.equal(potionTutorialStep(explained, view({ inventoryOpen: true, potionSelected: true })), 'assignHotkey');
  assert.equal(potionTutorialStep(explained, view({ inventoryOpen: true, potionSelected: true, assignOpen: true })), 'chooseSlot');
  assert.equal(potionTutorialStep(explained, view({ inventoryOpen: false })), 'openInventory', 'closed: back to the button');
  assert.equal(potionTutorialStep(explained, view({ inventoryOpen: true, hasPotion: false })), null, 'never stuck without a potion');
  assert.equal(potionTutorialStep(createQuest04(), view({ inventoryOpen: true })), null);
  assert.deepEqual(restoreQuest04({ state: 'INTRO_DIALOGUE' }), { state: 'OFFERED', useExplained: false });
  assert.deepEqual(restoreQuest04({ state: 'FINAL_DIALOGUE' }), { state: 'HOTKEY_ASSIGNED', useExplained: true });
  assert.deepEqual(restoreQuest04({ state: 'POTION_TUTORIAL', useExplained: true }), { state: 'POTION_TUTORIAL', useExplained: true });
  assert.deepEqual(restoreQuest04('x'), createQuest04());
});

test('Roland: intro, training (no potion used), hotkey, last part, 5 Mutant Wolves, 150 EXP once; markers and tracker', () => {
  withoutStorage(() => {
    const c = readyForMateus('Alpha');
    const off = CharacterStatusService.onChange((x) => x === c && QuestService.sync(x));
    turnIn03(c);
    const potions = itemCount(c.inventory, POTION);
    assert.deepEqual(trackedQuest(c), { questId: TUTORIAL_QUEST_04.id, objectiveKey: 'objective' });
    // intro
    assert.ok(QuestService.advance04(c, 'talk'));
    assert.equal(npcQuestMarker(c, ROLAND), 'available');
    assert.ok(QuestService.advance04(c, 'finishIntro'));
    assert.deepEqual([npcQuestMarker(c, ROLAND), QuestService.isItemUseBlocked(c), trackedQuest(c)?.objectiveKey], ['inProgress', true, 'objectiveTutorial']);
    assert.equal(useProblem(POTION, { alive: true, quantity: potions, hp: 1, maxHp: 120, blocked: QuestService.isItemUseBlocked(c) }), 'blocked', 'USE is only explained');
    assert.equal(QuestService.hotkeyAssigned(c, POTION), false, 'not before the explanation');
    assert.ok(QuestService.advance04(c, 'explainUse'));
    assert.equal(QuestService.quest04(saveAndLoad(c)).useExplained, true, 'kept in the save file');
    assert.equal(HotbarService.assignItem(c, 4, POTION), true);
    assert.equal(QuestService.hotkeyAssigned(c, 'armor_worn_cloth'), false);
    assert.ok(QuestService.hotkeyAssigned(c, POTION));
    assert.equal(itemCount(c.inventory, POTION), potions, 'no potion was used');
    assert.deepEqual([QuestService.quest04(c).state, npcQuestMarker(c, ROLAND), QuestService.isItemUseBlocked(c)], ['HOTKEY_ASSIGNED', 'inProgress', false]);
    // the last part (dialogues 6-9) ends the training and starts the hunt
    assert.ok(QuestService.advance04(c, 'finalTalk'));
    assert.ok(QuestService.advance04(c, 'complete'));
    assert.deepEqual([QuestService.quest04(c).state, QuestService.quest05(c)], ['COMPLETED', { state: 'HUNTING', kills: 0 }]);
    assert.equal(npcQuestMarker(c, ROLAND), 'inProgress');
    // the hunt: Mutant Wolves only, capped, kept in the save file
    assert.equal(QuestService.recordKill(c, MONSTER_DEFINITIONS.voidmite.id), false);
    const counts: number[] = [];
    for (let i = 0; i < 7; i++) {
      QuestService.recordKill(c, MONSTER_DEFINITIONS.mutant_wolf.id);
      counts.push(QuestService.quest05(c).kills);
      if (i === 1) assert.deepEqual(QuestService.quest05(saveAndLoad(c)), { state: 'HUNTING', kills: 2 });
    }
    assert.deepEqual(counts, [1, 2, 3, 4, 5, 5, 5]);
    initLanguage(null);
    setLanguage('th');
    const tracked = trackedQuest(c)!;
    assert.equal(translate(`quests.${tracked.questId}.${tracked.objectiveKey}`, tracked.params), 'กำจัด Mutant Wolf (5/5)');
    setLanguage('en');
    assert.equal(translate(`quests.${tracked.questId}.${tracked.objectiveKey}`, tracked.params), 'Defeat Mutant Wolves (5/5)');
    setLanguage('th');
    assert.equal(npcQuestMarker(c, ROLAND), 'completed');
    assert.deepEqual(QuestRewards.quest05(c), { ok: false, error: 'notReady' }, 'not without talking to Roland');
    // turn-in: 150 EXP once
    assert.ok(QuestService.advance05(c, 'turnIn'));
    const r = QuestRewards.quest05(c);
    assert.ok(r.ok && r.exp === 150);
    for (let i = 0; i < 3; i++) assert.equal(QuestRewards.quest05(c).ok, false);
    const loaded = saveAndLoad(c);
    assert.equal(QuestRewards.quest05(loaded).ok, false, 'loaded: never paid again');
    assert.deepEqual([npcQuestMarker(loaded, ROLAND), trackedQuest(loaded), QuestService.quest05(loaded).state], [null, null, 'COMPLETED'], 'no marker, no path, no further quest');
    off();
  });
});

test('quest rules: wolf kills only while hunting; restore repairs every state', () => {
  assert.deepEqual(TUTORIAL_QUEST_05.target, { monsterId: 'mutant_wolf', count: 5 });
  assert.equal(MONSTER_DEFINITIONS.mutant_wolf.displayName, 'Mutant Wolf');
  assert.equal(applyQuest05({ state: 'NOT_STARTED', kills: 0 }, 'kill'), null, 'kills before the quest never count');
  assert.deepEqual(restoreQuest05({ state: 'HUNTING', kills: 9 }), { state: 'READY_TO_TURN_IN', kills: 5 });
  assert.deepEqual(restoreQuest05({ state: 'TURN_IN_DIALOGUE' }), { state: 'READY_TO_TURN_IN', kills: 5 });
  assert.deepEqual(restoreQuest05(null), { state: 'NOT_STARTED', kills: 0 });
  assert.deepEqual(TUTORIAL_QUEST_03.reward, { grantId: 'quest:tutorial_03_void_mite_hunt', itemId: POTION, quantity: 20 });
});

// --------------------------------------------------------------------------------------------- Roland and NPC size

test('Roland: inside the abandoned stone house at (8, 77) - walkable floor, reached through its doorway', () => {
  const r = NPC_DEFINITIONS.roland_01;
  assert.deepEqual([r.id, r.name, r.mapId, r.facing, r.tile], [ROLAND, 'Roland', ASHEN_CROSSROADS.id, 'SW', { col: 8, row: 77 }]);
  const map = new MapLayout(ASHEN_CROSSROADS);
  const house = ASHEN_CROSSROADS.structures.findIndex((h) => h.type === 'stone_house' && h.col === 8 && h.row === 76);
  assert.ok(house >= 0, 'the abandoned stone house of Zone 2');
  assert.equal(map.structureAt(8, 77), house, 'his tile is inside its footprint');
  const free = (x: number, y: number): boolean => map.isAreaFree({ minX: x - 0.22, minY: y - 0.22, maxX: x + 0.22, maxY: y + 0.22 });
  assert.ok(free(8.5, 77.5), 'floor, not wall or furniture');
  // the player walks in through the doorway on the street side and stands next to him (talk range 1.5)
  const route = new Pathfinder(map, { radius: 0.22 }).findPath({ x: 14.5, y: 118.5 }, { x: 9.5, y: 77.5 });
  assert.ok(route && route.length > 0, 'reachable from the start');
  assert.ok(route!.some((p) => Math.abs(p.x - 12.5) < 0.01 && Math.abs(p.y - 77.5) < 0.01), 'through the doorway at (12, 77)');
  assert.ok(Math.hypot(9.5 - 8.5, 0) <= 1.5);
  assert.equal(NPC_DISPLAY_SCALE, 1.1);
  assert.deepEqual(r.idle, NPC_DEFINITIONS.city_guard_01.idle, 'the same idle routine as the other NPCs');
});

test('dialogue texts: Roland and the new Mateus lines, Thai exactly and English', () => {
  initLanguage(null);
  const lines = (id: keyof typeof DIALOGUES, language: 'th' | 'en'): string[] => {
    setLanguage(language);
    return DIALOGUES[id].map((k) => translate(k));
  };
  assert.deepEqual(lines('roland_potion_intro', 'th'), ['อ้าว คนเร่ร่อนนี่ Mateus ส่งเจ้ามางั้นหรอ โอเคๆ', 'ข้าจะสอนวิธีใช้งานไอเท็มที่เจ้าเพิ่งจะได้รับมาจาก Mateus']);
  assert.deepEqual(lines('roland_potion_select', 'th'), ['วิธีการใช้งานยาแดงฟื้นฟูก็กดคลิ๊กเข้าไปก่อน และ ดูด้านขวาส่วนรายละเอียดไอเท็ม']);
  assert.deepEqual(lines('roland_potion_use', 'th'), ['กดใช้งานเพื่อดื่ม']);
  assert.deepEqual(lines('roland_potion_hotkey', 'th'), ['กดตั้งคีย์ลัดเพื่อให้ใช้งานง่ายๆ ปุ่ม 1-8 บนคีย์บอร์ด']);
  assert.deepEqual(lines('roland_wolf_hunt', 'th'), [
    'เป็นยังไงล่ะ ไม่ยากเลยใช่ไหม เจ้าพร้อมสำหรับบททดสอบต่อไปหรือยัง',
    'บททดสอบอะไรอย่างงั้นหรือ เจ้าคงจะไม่รู้เรื่องราวอะไรเลยจริงๆสินะ',
    'เอาเป็นว่าจงกำจัด Mutant Wolf มาให้ข้าหน่อย',
    'ซัก 5 ตัวก็พอ แล้วข้าจะมอบของดี และจะเล่าอะไรให้ฟัง',
  ]);
  assert.deepEqual(lines('roland_wolf_hunt_done', 'th'), ['ไวเหมือนกันนี่ ถือว่าใช้ได้', 'แต่ดูเจ้าหอบนะ พักซักนิดก็แล้วกัน']);
  assert.deepEqual(lines('roland_potion_intro', 'en'), ['Oh, a wanderer! Mateus sent you, huh? Alright, alright.', "I'll teach you how to use the items you just received from Mateus."]);
  assert.deepEqual(lines('roland_wolf_hunt', 'en')[2], 'For now, I want you to hunt down some Mutant Wolves.');
  assert.deepEqual(lines('roland_wolf_hunt_done', 'en'), ['That was quick. Not bad at all.', 'You look out of breath, though. Take a little rest.']);
  setLanguage('th');
  assert.equal(TUTORIAL_QUEST_04.wolfPreviewStep, 2, 'the wolf picture with dialogue 8');
  assert.deepEqual(Object.keys(QuestService.quest04(newCharacter('X'))), ['state', 'useExplained']);
  assert.equal(bagIndexOf(newCharacter('X').inventory, POTION), -1, 'no potions before the Void Mite hunt');
});
