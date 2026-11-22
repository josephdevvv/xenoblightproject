import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCharacterData } from '../src/data/CharacterData';
import { DIALOGUES, DialogueSession } from '../src/dialogue/Dialogues';
import { NPC_DEFINITIONS } from '../src/npcs/NpcDefinition';
import { NPC_INTERACT_RANGE, NpcInteraction } from '../src/npcs/NpcInteraction';
import { PASSIVE_TREES } from '../src/passives/PassiveTree';
import { createPassiveProgress, syncLevelRewards, tutorialStep } from '../src/passives/PassiveProgress';
import { TUTORIAL_QUEST_EXP_BUDGET } from '../src/progression/QuestExpBudget';
import { QuestService } from '../src/quests/QuestService';
import {
  applyQuest01,
  createQuest01,
  isPassiveTutorialOpen,
  isQuest01Completed,
  isQuest01Active,
  QUEST01_STATES,
  sanitizeQuest01,
  TUTORIAL_QUEST_01,
  type Quest01Event,
  type Quest01Progress,
} from '../src/quests/TutorialQuest01';
import { initLanguage, setLanguage } from '../src/i18n';
import { labels } from '../src/i18n/labels';
import { wrapText } from '../src/ui/text/wrapText';
import { MapLayout } from '../src/world/MapLayout';
import { ASHEN_CROSSROADS } from '../src/world/maps/AshenCrossroads';
import { Pathfinder } from '../src/world/navigation/Pathfinder';
import { newCharacter, saveAndLoad, withoutStorage } from './helpers/session';

const EVENTS: Quest01Event[] = ['start', 'talk', 'cancelTalk', 'finishDialogue', 'startPassiveTutorial'];

const character = (name: string) => createCharacterData(name, { gender: 'male', hairstyleId: 'bald' });

// -------------------------------------------------------------------------------------------- dialogue

test('dialogue: exactly three steps, the author\'s text character for character', () => {
  assert.deepEqual([...DIALOGUES[TUTORIAL_QUEST_01.dialogueId]], [
    'เจ้าคนเร่ร่อนนี่! เดินหลงทางมาจากไหนน่ะที่นี่มันอันตรายนะ',
    'แถวนี้มันเถื่อน ไม่แน่จริงอยู่ไม่ได้ เจ้าควรจะรู้วิธีเอาตัวรอดเบื้องต้นก่อน',
    'ข้าจะบอกวิธีการเพิ่มพลังพื้นฐานให้แก่เจ้า เอาล่ะทำตามนะ',
  ]);
});

test('dialogue session: one step per NEXT, finishes once after the third', () => {
  const lines = DIALOGUES[TUTORIAL_QUEST_01.dialogueId];
  const s = new DialogueSession(lines);
  assert.equal(s.line, lines[0]);
  assert.equal(s.next(), false);
  assert.equal(s.line, lines[1]);
  assert.equal(s.next(), false);
  assert.equal(s.line, lines[2]);
  assert.equal(s.isDone, false, 'the third line is shown before the end');
  assert.equal(s.next(), true);
  assert.equal(s.next(), false, 'never finishes twice');
});

test('line wrapping: Thai breaks between words, fits the width and never changes the text', () => {
  const measure = (t: string) => [...t].length * 7;
  for (const line of DIALOGUES[TUTORIAL_QUEST_01.dialogueId]) {
    for (const width of [140, 220, 490, 5000]) {
      const wrapped = wrapText(line, width, measure);
      assert.equal(wrapped.join(''), line);
      for (const l of wrapped) assert.ok(measure(l.trimEnd()) <= width, `"${l}" fits ${width}`);
    }
    assert.equal(wrapText(line, 5000, measure).length, 1);
    // no line starts with a combining mark (a vowel / tone mark torn off its consonant)
    for (const l of wrapText(line, 140, measure)) assert.ok(!/^\p{M}/u.test(l));
  }
});

// ----------------------------------------------------------------------------------------------- quest

test('quest: id, NPC from the registry (Mateus, not moved), name and objective', () => {
  assert.equal(TUTORIAL_QUEST_01.id, 'tutorial_01_find_mateus');
  const npc = NPC_DEFINITIONS[TUTORIAL_QUEST_01.npcId];
  assert.equal(npc.name, 'Mateus');
  assert.deepEqual(npc.tile, { col: 14, row: 105 });
  assert.equal(Object.values(NPC_DEFINITIONS).filter((n) => n.name === 'Mateus').length, 1, 'not duplicated');
  initLanguage(null);
  setLanguage('th');
  assert.equal(labels.questName(TUTORIAL_QUEST_01.id), 'ตามหา Mateus');
  assert.equal(labels.questObjective(TUTORIAL_QUEST_01.id), 'เดินทางไปพูดคุยกับ Mateus');
});

test('quest states: only the next step is accepted from each state, in order, once', () => {
  let p: Quest01Progress = createQuest01(true);
  const path: [Quest01Event, string][] = [['start', 'FIND_MATEUS'], ['talk', 'TALKING_TO_MATEUS'], ['finishDialogue', 'DIALOGUE_COMPLETED'], ['startPassiveTutorial', 'PASSIVE_TUTORIAL_STARTED']];
  for (const [event, state] of path) {
    const allowed = EVENTS.filter((e) => applyQuest01(p, e) !== null);
    assert.deepEqual(allowed.sort(), (p.state === 'TALKING_TO_MATEUS' ? ['cancelTalk', event] : [event]).sort(), p.state);
    p = applyQuest01(p, event)!;
    assert.equal(p.state, state);
  }
  assert.deepEqual(EVENTS.filter((e) => applyQuest01(p, e) !== null), [], 'finished: nothing more');
  assert.equal(applyQuest01(createQuest01(false), 'start'), null, 'characters from before the quest are left alone');
});

test('handoff: the passive tutorial waits for the conversation, and the passive data stays as it is', () => {
  const passives = createPassiveProgress();
  syncLevelRewards(passives, 1);
  assert.equal(tutorialStep(passives, false, null), 'open', 'the existing tutorial itself is unchanged');
  const at = (state: (typeof QUEST01_STATES)[number]) => ({ ...createQuest01(true), state });
  for (const s of ['NOT_STARTED', 'FIND_MATEUS', 'TALKING_TO_MATEUS', 'DIALOGUE_COMPLETED'] as const) assert.equal(isPassiveTutorialOpen(at(s)), false, s);
  assert.equal(isPassiveTutorialOpen(at('PASSIVE_TUTORIAL_STARTED')), true);
  assert.equal(isPassiveTutorialOpen(createQuest01(false)), true, 'older characters keep the tutorial as before');
  for (const s of QUEST01_STATES) assert.equal(isQuest01Active(at(s)), s === 'FIND_MATEUS' || s === 'TALKING_TO_MATEUS', 'tracker and dotted path until the conversation is over');
  assert.ok(PASSIVE_TREES.drifter.nodes.length === 10);
});

test('save files: every step survives save and load, completion fires once, no reward defined', () => {
  withoutStorage(() => {
    const done: string[] = [];
    const off = QuestService.onCompleted((c, id) => done.push(`${c.name}:${id}`));
    const a = newCharacter('Alpha');
    assert.equal(QuestService.quest01(a).state, 'NOT_STARTED');
    assert.equal(QuestService.quest01(saveAndLoad(a)).autoStart, true, 'saved before entering the map: still starts next time');
    assert.ok(QuestService.advance(a, 'start'));
    assert.equal(QuestService.quest01(saveAndLoad(a)).state, 'FIND_MATEUS');
    assert.equal(QuestService.advance(a, 'start'), false);
    QuestService.advance(a, 'talk');
    const a2 = saveAndLoad(a);
    assert.equal(QuestService.quest01(a2).state, 'FIND_MATEUS', 'a conversation that was cut off starts over');
    QuestService.advance(a2, 'talk');
    assert.equal(QuestService.canClaimReward(a2), false);
    QuestService.advance(a2, 'finishDialogue');
    assert.deepEqual(done, ['Alpha:tutorial_01_find_mateus']);
    const a3 = saveAndLoad(a2);
    assert.equal(QuestService.quest01(a3).state, 'DIALOGUE_COMPLETED', 'stays completed; the handoff resumes');
    assert.equal(QuestService.advance(a3, 'talk'), false, 'no second conversation');
    assert.equal(QuestService.advance(a3, 'finishDialogue'), false, 'no second completion');
    QuestService.advance(a3, 'startPassiveTutorial');
    assert.equal(QuestService.quest01(saveAndLoad(a3)).state, 'PASSIVE_TUTORIAL_STARTED');
    assert.equal(done.length, 1);
    // prepared reward claim: once, also after loading
    assert.equal(QuestService.claimReward(a3), true);
    assert.equal(QuestService.claimReward(a3), false);
    assert.equal(QuestService.claimReward(saveAndLoad(a3)), false);
    assert.deepEqual(TUTORIAL_QUEST_EXP_BUDGET.allocations, {}, 'no EXP allocated');
    assert.equal(a3.status.exp, 0, 'no EXP paid');
    // another character - also of the same name - is independent
    assert.equal(QuestService.quest01(newCharacter('Alpha')).state, 'NOT_STARTED');
    // a save without the quest never gets it by itself
    const old = character('Veteran');
    QuestService.restore(old, {});
    assert.equal(QuestService.advance(old, 'start'), false);
    assert.equal(QuestService.isPassiveTutorialOpen(old), true);
    off();
  });
});

test('broken quest records: never a second completion; unknown quests are kept', () => {
  const c = character('Bad');
  QuestService.restore(c, { tutorial_01_find_mateus: 'oops' });
  assert.equal(QuestService.quest01(c).state, 'NOT_STARTED');
  assert.equal(QuestService.canClaimReward(c), false);
  const m = character('Multi');
  QuestService.restore(m, { future_quest: { state: 'X' }, tutorial_01_find_mateus: { state: 'FIND_MATEUS', autoStart: true, rewardClaimed: false } });
  QuestService.advance(m, 'talk');
  assert.deepEqual(m.quests!.future_quest, { state: 'X' });
  assert.equal(sanitizeQuest01({ state: 'HACKED' }), null);
  assert.equal(sanitizeQuest01(null), null);
  assert.ok(isQuest01Completed({ ...createQuest01(true), state: 'PASSIVE_TUTORIAL_STARTED' }));
});

// ----------------------------------------------------------------------------------------- interaction

function fakePlayer(x: number, y: number, reachable = true) {
  return {
    pos: { x, y },
    path: false,
    faced: null as unknown,
    getTilePosition() { return this.pos; },
    moveTo() { this.path = reachable; return reachable; },
    stopPath() { this.path = false; },
    hasPath() { return this.path; },
    faceTowards(p: unknown) { this.faced = p; },
  };
}

test('NPC click: in range talks at once; out of range walks there first; other commands cancel it', () => {
  const npc = { position: { x: 14.5, y: 105.5 } };
  const talks: unknown[] = [];
  const near = fakePlayer(14.5, 105.5 + NPC_INTERACT_RANGE);
  new NpcInteraction(near, (n) => talks.push(n)).request(npc);
  assert.deepEqual(talks, [npc]);
  assert.equal(near.path, false);
  assert.deepEqual(near.faced, npc.position);

  const far = fakePlayer(14.5, 118.5);
  const i = new NpcInteraction(far, (n) => talks.push(n));
  assert.equal(i.request(npc), true);
  i.update();
  assert.equal(talks.length, 1, 'not from a distance');
  assert.equal(i.target, npc);
  far.pos = { x: 14.5, y: 106.8 };
  i.update();
  assert.equal(talks.length, 2, 'talks on arrival');
  assert.equal(far.path, false, 'and stops');
  i.update();
  assert.equal(talks.length, 2, 'once');

  far.pos = { x: 14.5, y: 118.5 };
  i.request(npc);
  i.cancel();
  far.pos = { x: 14.5, y: 106 };
  i.update();
  assert.equal(talks.length, 2, 'cancelled');

  const stuck = fakePlayer(14.5, 118.5);
  const j = new NpcInteraction(stuck, (n) => talks.push(n));
  j.request(npc);
  stuck.path = false;
  j.update();
  assert.equal(j.target, null, 'the way ended too far away: given up');
  assert.equal(new NpcInteraction(fakePlayer(0, 0, false), () => talks.push(0)).request(npc), false);
  assert.equal(talks.length, 2);
});

test('the player can really walk from the map spawn to Mateus (real map, real pathfinder)', () => {
  const layout = new MapLayout(ASHEN_CROSSROADS);
  const npc = NPC_DEFINITIONS[TUTORIAL_QUEST_01.npcId];
  const goal = { x: npc.tile.col + 0.5, y: npc.tile.row + 0.5 };
  const start = { x: ASHEN_CROSSROADS.spawn.col + 0.5, y: ASHEN_CROSSROADS.spawn.row + 0.5 };
  const path = new Pathfinder(layout, { radius: 0.22 }).findPath(start, goal);
  assert.ok(path && path.length > 0);
  const end = path[path.length - 1];
  assert.ok(Math.hypot(end.x - goal.x, end.y - goal.y) <= NPC_INTERACT_RANGE, 'ends within talking range');
});
