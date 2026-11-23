import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import type { CharacterData } from '../src/data/CharacterData';
import { InventoryService } from '../src/inventory/InventoryService';
import { bagIndexOf } from '../src/inventory/InventoryState';
import { NPC_DEFINITIONS, type NpcId } from '../src/npcs/NpcDefinition';
import { PassiveTreeService } from '../src/passives/PassiveTreeService';
import { npcQuestMarker, QUEST_MARKER_PRIORITY, QUEST_MARKER_SOURCES, type QuestMarkerSource, type QuestMarkerState, type QuestMarkerType } from '../src/quests/QuestMarkers';
import { QuestService } from '../src/quests/QuestService';
import { isQuest01Active, QUEST01_STATES } from '../src/quests/TutorialQuest01';
import { isQuest02AtMateus, TUTORIAL_QUEST_02 } from '../src/quests/TutorialQuest02';
import { serializeSave } from '../src/save/SaveFile';
import { CharacterStatusService } from '../src/status/CharacterStatusService';
import { QUEST_MARKER_ART, QUEST_MARKER_FLOAT, QUEST_MARKER_GAP, questMarkerFloat } from '../src/ui/world/QuestMarkerArt';
import { readPng } from './helpers/png';
import { newCharacter, saveAndLoad, withoutStorage } from './helpers/session';

const MATEUS: NpcId = 'city_guard_01';
const OTHERS: NpcId[] = ['city_guard_jack', 'city_guard_sonny'];
const { reward } = TUTORIAL_QUEST_02;

/** Mateus's marker now - and the same after Save Game + Load Game; nobody else ever shows one. */
function expectMarker(c: CharacterData, expected: QuestMarkerType | null, stage: string): void {
  const before = JSON.stringify(c);
  assert.equal(npcQuestMarker(c, MATEUS), expected, stage);
  assert.equal(npcQuestMarker(saveAndLoad(c), MATEUS), expected, `${stage}, loaded`);
  for (const id of OTHERS) assert.equal(npcQuestMarker(c, id), null, `${stage}: ${id}`);
  assert.equal(JSON.stringify(c), before, `${stage}: asking changes nothing`);
}

test('Mateus: yellow -> gray -> yellow -> gray -> green check mark, exactly with the quest progress, also in loaded saves', () => {
  withoutStorage(() => {
    const completed: string[] = [];
    const gained: string[] = [];
    const offQuest = QuestService.onCompleted((_c, id) => completed.push(id));
    const offItem = InventoryService.onGained((_c, id) => gained.push(id));
    const c = newCharacter('Alpha');
    // what GameScene does: Tutorial Quest 02 follows the character
    const offSync = CharacterStatusService.onChange((x) => x === c && QuestService.sync(x));
    const status = JSON.stringify({ level: c.status!.level, exp: (c.status as unknown as { exp?: unknown }).exp });

    // 1: new character
    expectMarker(c, 'available', 'New Game');
    QuestService.advance(c, 'start');
    expectMarker(c, 'available', 'map entered');
    QuestService.advance(c, 'talk');
    expectMarker(c, 'available', 'talking');
    QuestService.advance(c, 'cancelTalk');
    expectMarker(c, 'available', 'conversation broken off');
    QuestService.advance(c, 'talk');

    // 2: passive tree tutorial
    QuestService.advance(c, 'finishDialogue');
    assert.equal(npcQuestMarker(c, MATEUS), 'inProgress');
    QuestService.advance(c, 'startPassiveTutorial');
    QuestService.sync02(c);
    expectMarker(c, 'inProgress', 'Passive Tree tutorial');
    assert.notEqual(PassiveTreeService.upgrade(c, 'no_such_node'), null);
    expectMarker(c, 'inProgress', 'upgrade refused');

    // 3: the real upgrade, nothing else
    assert.equal(PassiveTreeService.upgrade(c, 'drifters_resolve'), null);
    assert.equal(npcQuestMarker(c, MATEUS), 'available', 'at once');
    expectMarker(c, 'available', 'Tutorial Quest 02 available');
    assert.equal(isQuest02AtMateus(QuestService.quest02(c)), true, 'dotted path as before');

    // 4: accepted, dagger received
    QuestService.advance02(c, 'talk');
    expectMarker(c, 'available', 'second conversation, nothing received yet');
    QuestService.advance02(c, 'cancelTalk');
    expectMarker(c, 'available', 'bag was full');
    QuestService.advance02(c, 'talk');
    assert.equal(InventoryService.grantOnce(c, reward), null);
    QuestService.advance02(c, 'grantReward');
    expectMarker(c, 'inProgress', 'dagger received');
    QuestService.advance02(c, 'finishDialogue');
    QuestService.sync02(c);
    expectMarker(c, 'inProgress', 'Equipment Tutorial');
    const bag = bagIndexOf(c.inventory, reward.itemId);
    assert.equal(InventoryService.equip(c, bag, 'hat'), 'wrongSlot');
    expectMarker(c, 'inProgress', 'equip refused');

    // 5: worn
    assert.equal(InventoryService.equip(c, bag, 'weapon'), null);
    assert.equal(npcQuestMarker(c, MATEUS), 'completed', 'at once');
    expectMarker(c, 'completed', 'Equipment Tutorial completed');
    InventoryService.unequip(c, 'weapon');
    expectMarker(c, 'completed', 'taken off again');
    // the check mark waits for the turn-in: it comes before anything another quest of Mateus could ask for
    for (const other of ['available', 'inProgress', 'completed', null] as const) {
      assert.equal(npcQuestMarker(c, MATEUS, [...QUEST_MARKER_SOURCES, { npcId: MATEUS, marker: () => other }]), 'completed');
    }
    assert.deepEqual([isQuest01Active(QuestService.quest01(c)), isQuest02AtMateus(QuestService.quest02(c))], [false, true], 'dotted path back to Mateus');
    assert.deepEqual([QuestService.advance(c, 'talk'), QuestService.advance02(c, 'talk')], [false, false], 'no earlier conversation again');

    assert.deepEqual(Object.keys(c.quests!).sort(), ['tutorial_01_find_mateus', 'tutorial_02_rusty_dagger', 'tutorial_03_void_mite_hunt', 'tutorial_04_potion_training', 'tutorial_05_mutant_wolf_hunt'], 'no other quest');
    assert.equal(QuestService.quest03(c).state, 'NOT_STARTED', 'not before the turn-in and the Status tutorial');
    assert.deepEqual(completed, ['tutorial_01_find_mateus', 'tutorial_02_rusty_dagger']);
    assert.deepEqual(gained, [reward.itemId]);
    assert.equal(InventoryService.grantOnce(c, reward), 'alreadyGranted');
    assert.equal(JSON.stringify({ level: c.status!.level, exp: (c.status as unknown as { exp?: unknown }).exp }), status, 'no EXP');
    assert.ok(!/marker/i.test(serializeSave(c, null)), 'nothing about markers in the save file');
    // another New Game, same name
    expectMarker(newCharacter('Alpha'), 'available', 'next New Game');
    for (const off of [offQuest, offItem, offSync]) off();
  });
});

test('passive node unlocked before the first conversation: stays yellow until Tutorial Quest 02 was accepted', () => {
  withoutStorage(() => {
    const c = newCharacter('Early');
    QuestService.advance(c, 'start');
    assert.equal(PassiveTreeService.upgrade(c, 'drifters_resolve'), null);
    expectMarker(c, 'available', 'not talked yet');
    for (const e of ['talk', 'finishDialogue', 'startPassiveTutorial'] as const) QuestService.advance(c, e);
    expectMarker(c, 'available', 'before and');
    QuestService.sync02(c);
    expectMarker(c, 'available', 'after the quest started by itself');
  });
});

test('no quest, no marker: characters without the tutorial quests and characters without a quest log', () => {
  withoutStorage(() => {
    const c = newCharacter('Veteran');
    c.quests = { ...c.quests!, tutorial_01_find_mateus: { state: 'NOT_STARTED', autoStart: false, rewardClaimed: false } };
    expectMarker(c, null, 'from before the quests');
    delete c.quests;
    assert.equal(npcQuestMarker(c, MATEUS), null);
  });
  assert.equal(QUEST01_STATES.length, 5, 'a new state needs a marker');
  for (const s of QUEST_MARKER_SOURCES) assert.ok(s.npcId in NPC_DEFINITIONS);
});

test('normal quests: available -> in progress -> check mark -> hidden or the next quest; one symbol by priority', () => {
  const c = newCharacter('Alpha');
  const state: Record<string, QuestMarkerState | null> = { a: 'available', b: null };
  const sources: QuestMarkerSource[] = Object.keys(state).map((k) => ({ npcId: 'city_guard_jack', marker: () => state[k] }));
  const now = (): QuestMarkerType | null => npcQuestMarker(c, 'city_guard_jack', sources);
  const seen: unknown[] = [];
  for (const a of ['available', 'inProgress', 'completed', 'completedKept', null] as const) {
    state.a = a;
    seen.push(now());
  }
  assert.deepEqual(seen, ['available', 'inProgress', 'completed', 'completed', null]);
  state.b = 'available';
  assert.equal(now(), 'available', 'resolved, the next one is available');

  assert.deepEqual(QUEST_MARKER_PRIORITY, ['completed', 'available', 'inProgress', 'completedKept']);
  const all = [...QUEST_MARKER_PRIORITY, null];
  for (const a of all) for (const b of all) {
    [state.a, state.b] = [a, b];
    const first = QUEST_MARKER_PRIORITY.find((x) => x === a || x === b) ?? null;
    assert.equal(now(), first === 'completedKept' ? 'completed' : first, `${a} + ${b}`);
  }
  assert.equal(npcQuestMarker(c, 'city_guard_sonny', sources), null, 'another NPC');
});

test('art: clean pixel rows, outlined, readable size; yellow, gray and green', () => {
  assert.deepEqual(Object.keys(QUEST_MARKER_ART).sort(), ['available', 'completed', 'inProgress'], 'exactly the three symbols');
  const rgb = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  for (const [type, { pixels, colors }] of Object.entries(QUEST_MARKER_ART)) {
    const w = pixels[0].length;
    assert.ok(pixels.every((r) => r.length === w && /^[.oWMD]+$/.test(r)), type);
    assert.ok(w % 2 === 0 && w >= 8 && w <= 16 && pixels.length >= 13 && pixels.length <= 18, `${type}: ${w} x ${pixels.length}`);
    // every coloured pixel is inside the dark outline
    pixels.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.' || ch === 'o') return;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) assert.ok(/[oWMD]/.test(pixels[y + dy]?.[x + dx] ?? '.'), `${type} ${x},${y}`);
    }));
    const [r, g, b] = rgb(colors.M);
    if (type === 'available') assert.ok(r > 200 && g > 150 && b < 90);
    else if (type === 'completed') assert.ok(g > 150 && r < 120 && b < 120);
    else assert.ok(Math.max(r, g, b) - Math.min(r, g, b) < 16 && r > 120 && r < 200);
  }
});

test('place: centred over the head, clear of every idle frame; floats by whole pixels, upwards only', () => {
  for (const def of Object.values(NPC_DEFINITIONS)) {
    const { meta, url } = def.art;
    const img = readPng(path.join(process.cwd(), 'public', url));
    const solid = (frame: number, x: number, y: number): boolean =>
      img.data[((Math.floor(frame / meta.columns) * meta.frameHeight + y) * img.width + (frame % meta.columns) * meta.frameWidth + x) * 4 + 3] >= 128;
    // the head's first row, above the head's middle
    assert.ok(solid(meta.standFrame, def.head.x, def.head.top), def.name);
    assert.ok(!solid(meta.standFrame, def.head.x, def.head.top - 1), def.name);
    // no marker pixel ever lies on the figure, in any frame
    for (const { pixels } of Object.values(QUEST_MARKER_ART)) {
      const left = def.head.x - pixels[0].length / 2;
      for (const frame of [meta.standFrame, ...meta.playFrames]) pixels.forEach((row, y) => [...row].forEach((ch, x) => {
        const fy = def.head.top - QUEST_MARKER_GAP - pixels.length + y;
        if (ch !== '.' && fy >= 0) assert.ok(!solid(frame, left + x, fy), `${def.name} frame ${frame}`);
      }));
    }
  }
  const offsets = Array.from({ length: QUEST_MARKER_FLOAT.periodMs }, (_, ms) => questMarkerFloat(ms));
  assert.deepEqual([...new Set(offsets)].sort(), [0, 1, 2, 3]);
  assert.ok(offsets.every((o, i) => i === 0 || Math.abs(o - offsets[i - 1]) <= 1));
  assert.equal(questMarkerFloat(0), questMarkerFloat(QUEST_MARKER_FLOAT.periodMs));
});
