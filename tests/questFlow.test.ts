import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CharacterData } from '../src/data/CharacterData';
import { DIALOGUES, DialogueSession } from '../src/dialogue/Dialogues';
import { collectKeys, findMissingTranslations, getDictionary, initLanguage, setLanguage, translate } from '../src/i18n';
import { labels } from '../src/i18n/labels';
import { InventoryService } from '../src/inventory/InventoryService';
import { bagIndexOf, itemCount } from '../src/inventory/InventoryState';
import { MONSTER_DEFINITIONS } from '../src/monsters/MonsterDefinition';
import { MONSTER_EXP_REWARDS } from '../src/progression/MonsterExpRewards';
import { expToNextLevel } from '../src/progression/ExpCurve';
import { PassiveTreeService } from '../src/passives/PassiveTreeService';
import { npcQuestMarker, type QuestMarkerType } from '../src/quests/QuestMarkers';
import { QuestRewards } from '../src/quests/QuestRewards';
import { QuestService } from '../src/quests/QuestService';
import { trackedQuest } from '../src/quests/QuestTracker';
import { isQuest02AtMateus, statusTutorialStep, TUTORIAL_QUEST_02 } from '../src/quests/TutorialQuest02';
import {
  applyQuest03,
  createQuest03,
  isQuest03AtMateus,
  QUEST03_STATES,
  restoreQuest03,
  TUTORIAL_QUEST_03,
  type Quest03Event,
  type Quest03State,
} from '../src/quests/TutorialQuest03';
import { CharacterStatusService } from '../src/status/CharacterStatusService';
import { StatAllocationDraft } from '../src/status/StatAllocation';
import { MAIN_STATS, type MainStat } from '../src/status/StatTypes';
import { STATUS_STAT_ORDER } from '../src/ui/status/StatusLayout';
import { newCharacter, saveAndLoad, withoutStorage } from './helpers/session';

const MATEUS = TUTORIAL_QUEST_02.npcId;
const marker = (c: CharacterData): QuestMarkerType | null => npcQuestMarker(c, MATEUS);
const exp = (c: CharacterData): [number, number] => [c.status.level, c.status.exp];

/** What GameScene does: quests follow status changes (level-ups, allocations). */
function session(name: string): { c: CharacterData; off: () => void } {
  const c = newCharacter(name);
  const off = CharacterStatusService.onChange((x) => x === c && QuestService.sync(x));
  return { c, off };
}

/** Plays everything up to the worn dagger (Tutorial Quests 01 and 02 as before). */
function daggerWorn(c: CharacterData): void {
  for (const e of ['start', 'talk', 'finishDialogue', 'startPassiveTutorial'] as const) assert.ok(QuestService.advance(c, e), e);
  assert.equal(PassiveTreeService.upgrade(c, 'drifters_resolve'), null);
  QuestService.sync(c);
  QuestService.advance02(c, 'talk');
  InventoryService.grantOnce(c, TUTORIAL_QUEST_02.reward);
  QuestService.advance02(c, 'grantReward');
  QuestService.advance02(c, 'finishDialogue');
  assert.equal(InventoryService.equip(c, bagIndexOf(c.inventory, TUTORIAL_QUEST_02.reward.itemId), 'weapon'), null);
  QuestService.sync(c);
}

/** The turn-in conversation as GameScene runs it: EXP before the second line, Status tutorial after the third. */
function turnIn02(c: CharacterData): void {
  assert.ok(QuestService.advance02(c, 'turnIn'));
  const s = new DialogueSession(DIALOGUES[TUTORIAL_QUEST_02.turnInDialogueId]);
  while (!s.isDone) {
    if (!s.isLastStep && s.step + 1 === TUTORIAL_QUEST_02.expBeforeStep) QuestRewards.quest02(c);
    s.next();
  }
  QuestService.advance02(c, 'finishTurnIn');
  QuestService.sync(c);
}

function spend(c: CharacterData, stat: MainStat): void {
  const draft = new StatAllocationDraft(c.status);
  assert.ok(draft.add(stat));
  assert.equal(CharacterStatusService.confirmAllocation(c, draft), null);
}

function kill(c: CharacterData, monster: 'voidmite' | 'mutant_wolf' = 'voidmite'): boolean {
  return QuestService.recordKill(c, MONSTER_DEFINITIONS[monster].id);
}

// ------------------------------------------------------------------------------------------- whole flow

test('the whole sequence: markers, 100 EXP once, Status tutorial on any stat, 5 Void Mites, 200 EXP once', () => {
  withoutStorage(() => {
    const { c, off } = session('Alpha');
    const completed: string[] = [];
    const offDone = QuestService.onCompleted((_c, id) => completed.push(id));
    daggerWorn(c);
    const points = c.status.statPoints;
    assert.deepEqual(exp(c), [1, 0]);
    // 1-2: dagger worn -> green check mark, back to Mateus
    assert.equal(marker(c), 'completed');
    assert.equal(marker(saveAndLoad(c)), 'completed');
    assert.equal(isQuest02AtMateus(QuestService.quest02(c)), true, 'dotted path');
    assert.deepEqual(trackedQuest(c), { questId: TUTORIAL_QUEST_02.id, objectiveKey: 'objective' });

    // 3-6: turn-in conversation; first line, still the check mark and no EXP
    assert.ok(QuestService.advance02(c, 'turnIn'));
    assert.deepEqual([marker(c), exp(c)], ['completed', [1, 0]]);
    // 4-5: before the second line: 100 EXP once -> Level 2 with 20 EXP (80 needed for Level 2)
    assert.equal(expToNextLevel(1), 80);
    assert.deepEqual(QuestRewards.quest02(c), { exp: 100, levels: 1 });
    for (let i = 0; i < 5; i++) assert.equal(QuestRewards.quest02(c), null, 'rapid clicks: never twice');
    assert.deepEqual(exp(c), [2, 20]);
    assert.equal(c.status.statPoints, points + 3, 'the normal level-up points, nothing more');
    assert.equal(marker(c), 'inProgress');
    // 6: last line closed -> Status tutorial
    assert.ok(QuestService.advance02(c, 'finishTurnIn'));
    QuestService.sync(c);
    assert.equal(QuestService.quest02(c).state, 'STATUS_TUTORIAL');
    assert.equal(marker(c), 'inProgress');
    assert.deepEqual(trackedQuest(c), { questId: TUTORIAL_QUEST_02.id, objectiveKey: 'objectiveStatus' });
    assert.deepEqual([statusTutorialStep(QuestService.quest02(c), false, false), statusTutorialStep(QuestService.quest02(c), true, false), statusTutorialStep(QuestService.quest02(c), true, true)], ['openStatus', 'chooseStat', 'confirmStat']);
    const loaded = saveAndLoad(c);
    assert.deepEqual([QuestService.quest02(loaded).state, marker(loaded), exp(loaded)], ['STATUS_TUTORIAL', 'inProgress', [2, 20]], 'in the save file');
    assert.equal(QuestRewards.quest02(loaded), null, 'loaded: never paid again');

    // 7-8: one stat point (here LUK) - only a real allocation counts
    const draft = new StatAllocationDraft(c.status);
    draft.add('luk');
    assert.equal(QuestService.quest02(c).state, 'STATUS_TUTORIAL', 'selected, not confirmed');
    assert.equal(CharacterStatusService.confirmAllocation(c, draft), null);
    assert.equal(QuestService.quest02(c).state, 'TURNED_IN');
    assert.equal(statusTutorialStep(QuestService.quest02(c), true, false), null, 'spotlight gone');
    // the Void Mite hunt is available: yellow !, nothing opened by itself
    assert.equal(QuestService.quest03(c).state, 'OFFERED');
    assert.deepEqual([marker(c), isQuest03AtMateus(QuestService.quest03(c))], ['available', true]);
    assert.equal(marker(saveAndLoad(c)), 'available');

    // 9-11: accepted, hunting; earlier / other kills never count
    assert.equal(kill(c), false, 'not accepted yet');
    assert.ok(QuestService.advance03(c, 'talk'));
    assert.equal(kill(c), false, 'still talking');
    assert.ok(QuestService.advance03(c, 'accept'));
    assert.deepEqual([marker(c), QuestService.quest03(c).kills, isQuest03AtMateus(QuestService.quest03(c))], ['inProgress', 0, false]);
    assert.equal(labels.questObjective(TUTORIAL_QUEST_03.id, trackedQuest(c)!.objectiveKey, trackedQuest(c)!.params), 'กำจัด Void Mite (0/5)');
    assert.equal(kill(c, 'mutant_wolf'), false, 'another monster');
    const counts: string[] = [];
    for (let i = 0; i < 5; i++) {
      assert.equal(kill(c), true);
      counts.push(labels.questObjective(TUTORIAL_QUEST_03.id, trackedQuest(c)!.objectiveKey, trackedQuest(c)!.params));
      if (i === 2) assert.deepEqual(QuestService.quest03(saveAndLoad(c)), { state: 'HUNTING', kills: 3 }, 'counter in the save file');
    }
    assert.deepEqual(counts, ['กำจัด Void Mite (1/5)', 'กำจัด Void Mite (2/5)', 'กำจัด Void Mite (3/5)', 'กำจัด Void Mite (4/5)', 'กำจัด Void Mite (5/5)']);
    assert.equal(kill(c), false, 'capped at 5/5');
    assert.deepEqual(QuestService.quest03(c), { state: 'READY_TO_TURN_IN', kills: 5 });
    assert.deepEqual([marker(c), isQuest03AtMateus(QuestService.quest03(c))], ['completed', true], 'green check mark, dotted path back');
    assert.equal(marker(saveAndLoad(c)), 'completed');
    const before = exp(c);
    assert.deepEqual(QuestRewards.quest03(c), { ok: false, error: 'notReady' }, 'not without talking to Mateus');

    // 12: completion conversation: 200 EXP when it ends, once
    assert.ok(QuestService.advance03(c, 'turnIn'));
    assert.deepEqual(exp(c), before, 'nothing on the first line');
    const paid = QuestRewards.quest03(c);
    assert.ok(paid.ok && paid.exp === 200);
    assert.equal(itemCount(c.inventory, 'consumable_red_healing_potion'), 20, '20 potions with it');
    for (let i = 0; i < 5; i++) assert.deepEqual(QuestRewards.quest03(c), { ok: false, error: 'notReady' });
    assert.equal(itemCount(c.inventory, 'consumable_red_healing_potion'), 20, 'never twice');
    assert.equal(QuestService.advance03(c, 'turnIn'), false, 'no second conversation');
    const after = saveAndLoad(c);
    assert.deepEqual(QuestRewards.quest03(after), { ok: false, error: 'notReady' }, 'loaded: never paid again');
    assert.deepEqual([QuestService.quest03(after).state, marker(after)], ['COMPLETED', null], 'Mateus: no marker');
    assert.deepEqual([npcQuestMarker(after, 'roland_01'), trackedQuest(after)], ['available', { questId: 'tutorial_04_potion_training', objectiveKey: 'objective' }], 'on to Roland');
    assert.equal(isQuest03AtMateus(QuestService.quest03(after)), false);
    assert.deepEqual(completed, ['tutorial_01_find_mateus', 'tutorial_02_rusty_dagger', 'tutorial_03_void_mite_hunt'], 'each completed once');
    assert.deepEqual(Object.keys(c.quests!).sort(), ['tutorial_01_find_mateus', 'tutorial_02_rusty_dagger', 'tutorial_03_void_mite_hunt', 'tutorial_04_potion_training', 'tutorial_05_mutant_wolf_hunt', 'tutorial_06_dark_avian_hunt', 'tutorial_07_reach_level_10']);
    off();
    offDone();
  });
});

test('Status tutorial: any of the six stats completes it; not a click, not test points, not before it begins', () => {
  withoutStorage(() => {
    assert.deepEqual([...STATUS_STAT_ORDER], ['str', 'agi', 'vit', 'int', 'dex', 'luk'], 'order unchanged');
    for (const stat of MAIN_STATS) {
      const { c, off } = session(`S-${stat}`);
      daggerWorn(c);
      turnIn02(c);
      assert.equal(QuestService.quest02(c).state, 'STATUS_TUTORIAL');
      const base = { ...c.status.base };
      spend(c, stat);
      assert.equal(QuestService.quest02(c).state, 'TURNED_IN', stat);
      assert.deepEqual(c.status.base, { ...base, [stat]: base[stat] + 1 }, 'only the chosen stat');
      off();
    }
    // a refused allocation does nothing
    const { c, off } = session('Refused');
    daggerWorn(c);
    turnIn02(c);
    const draft = new StatAllocationDraft(c.status);
    assert.notEqual(CharacterStatusService.confirmAllocation(c, draft), null, 'nothing selected');
    assert.equal(QuestService.quest02(c).state, 'STATUS_TUTORIAL');
    // a point spent BEFORE the tutorial began does not count for it
    const early = session('Early');
    daggerWorn(early.c);
    CharacterStatusService.setLevel(early.c, 3);
    spend(early.c, 'str');
    turnIn02(early.c);
    assert.equal(QuestService.quest02(early.c).state, 'STATUS_TUTORIAL');
    spend(early.c, 'agi');
    assert.equal(QuestService.quest02(early.c).state, 'TURNED_IN');
    off();
    early.off();
  });
});

test('Status tutorial with no point to spend ends at once (no free points); a save in it keeps its start', () => {
  withoutStorage(() => {
    const { c, off } = session('Max');
    daggerWorn(c);
    CharacterStatusService.setLevel(c, 99);
    // every point spent, then the turn-in at Level 99 pays EXP but no level
    const draft = new StatAllocationDraft(c.status);
    for (const stat of MAIN_STATS) while (draft.add(stat));
    CharacterStatusService.confirmAllocation(c, draft);
    const points = c.status.statPoints;
    turnIn02(c);
    assert.equal(QuestService.quest02(c).state, 'TURNED_IN');
    assert.equal(c.status.statPoints, points, 'nothing given');
    off();
  });
});

test('Void Mite quest rules: order, kills only while hunting, capped; restore repairs every state', () => {
  const EVENTS: Quest03Event[] = ['offer', 'talk', 'cancelTalk', 'accept', 'kill', 'turnIn', 'cancelTurnIn', 'complete'];
  let p = createQuest03();
  const path: [Quest03Event, Quest03State][] = [['offer', 'OFFERED'], ['talk', 'ACCEPT_DIALOGUE'], ['accept', 'HUNTING']];
  for (const [event, state] of path) {
    p = applyQuest03(p, event)!;
    assert.equal(p.state, state);
  }
  for (let i = 1; i <= 7; i++) p = applyQuest03(p, 'kill') ?? p;
  assert.deepEqual(p, { state: 'READY_TO_TURN_IN', kills: 5 });
  p = applyQuest03(p, 'turnIn')!;
  p = applyQuest03(p, 'complete')!;
  assert.deepEqual(p, { state: 'COMPLETED', kills: 5 });
  assert.deepEqual(EVENTS.filter((e) => applyQuest03(p, e) !== null), [], 'nothing after completion');
  for (const s of QUEST03_STATES) {
    const allowed = EVENTS.filter((e) => applyQuest03({ state: s, kills: 0 }, e) !== null);
    assert.ok(allowed.length <= 2, `${s}: ${allowed}`);
    assert.equal(allowed.includes('kill'), s === 'HUNTING', s);
  }
  assert.deepEqual(TUTORIAL_QUEST_03.target, { monsterId: 'voidmite', count: 5 });
  assert.equal(MONSTER_DEFINITIONS.voidmite.displayName, 'Void Mite');
  const r = (raw: unknown) => restoreQuest03(raw);
  assert.deepEqual(r({ state: 'ACCEPT_DIALOGUE' }), { state: 'OFFERED', kills: 0 }, 'cut off: asked again');
  assert.deepEqual(r({ state: 'HUNTING', kills: 3 }), { state: 'HUNTING', kills: 3 });
  assert.deepEqual(r({ state: 'HUNTING', kills: 99 }), { state: 'READY_TO_TURN_IN', kills: 5 });
  assert.deepEqual(r({ state: 'HUNTING', kills: -2 }), { state: 'HUNTING', kills: 0 });
  assert.deepEqual(r({ state: 'HUNTING', kills: 2.7 }), { state: 'HUNTING', kills: 2 });
  assert.deepEqual(r({ state: 'TURN_IN_DIALOGUE', kills: 5 }), { state: 'READY_TO_TURN_IN', kills: 5 }, 'cut off before the EXP: asked again');
  assert.deepEqual(r({ state: 'COMPLETED' }), { state: 'COMPLETED', kills: 5 });
  for (const broken of [null, 5, 'x', {}, { state: 'NOPE' }]) assert.deepEqual(r(broken), createQuest03());
});

test('kill credit: monster EXP unchanged and separate from the quest; another character is independent', () => {
  withoutStorage(() => {
    assert.deepEqual({ ...MONSTER_EXP_REWARDS }, { voidmite: 20, mutant_wolf: 32, dark_avian: 54 }, 'monster EXP unchanged (the vulture added)');
    const { c, off } = session('Hunter');
    daggerWorn(c);
    turnIn02(c);
    spend(c, 'str');
    QuestService.advance03(c, 'talk');
    QuestService.advance03(c, 'accept');
    const other = newCharacter('Hunter');
    kill(c);
    assert.deepEqual([QuestService.quest03(c).kills, QuestService.quest03(other).kills], [1, 0]);
    off();
  });
});

test('a save from before the turn-in existed (dagger worn, "COMPLETED") can still turn in: 100 EXP once', () => {
  withoutStorage(() => {
    const { c, off } = session('Old');
    daggerWorn(c);
    const old = saveAndLoad(c);
    assert.deepEqual([QuestService.quest02(old).state, marker(old)], ['COMPLETED', 'completed']);
    assert.ok(QuestService.advance02(old, 'turnIn'));
    assert.equal(QuestRewards.quest02(old)?.exp, 100);
    assert.equal(QuestRewards.quest02(saveAndLoad(old)), null);
    off();
  });
});

// ------------------------------------------------------------------------------------------- dialogue texts

const TEXTS: Record<string, { th: string[]; en: string[] }> = {
  mateus_rusty_dagger_turn_in: {
    th: ['เอาล่ะเจ้าได้สวมใส่มีดเพื่อเตรียมสู้ไปแล้ว ข้าจะมอบพลังให้เจ้าอีก', 'รู้สึกได้ถึงความแข็งแกร่งไหมล่ะ', 'ต่อไปเป็นข้าจะสอนวิธีเพิ่มความแข็งแกร่งให้เพิ่มเติม'],
    en: ["Now that you've equipped your dagger and prepared for battle, I'll grant you a little more power.", 'Can you feel yourself growing stronger?', "Next, I'll teach you how to become even stronger."],
  },
  mateus_void_mite_hunt: {
    th: [
      'คราวนี้จะให้เจ้ากำจัดแมงกุดจี่กลายพันธุ์(Void Mite)บริเวณนี้',
      'สิ่งมีชีวิตพวกนี้กลายพันธุ์ไปแล้วจากการที่เราโดนโจมตีจากสัตว์ประหลาดปริศนา',
      'เดี๋ยวเราค่อยไปเรียนรู้ละกันว่าทำไมเจ้าพวกนี้มันกลายเป็นแบบนี้',
      'กำจัดมันซัก 5 ตัว ข้าอยากเห็นความสามารถของเจ้าก่อน',
    ],
    en: [
      'This time, I want you to eliminate the mutated beetles known as Void Mites around here.',
      'These creatures mutated after we were attacked by a mysterious monster.',
      "We'll find out later why these creatures ended up this way.",
      "Defeat five of them. I want to see what you're capable of first.",
    ],
  },
  mateus_void_mite_hunt_done: {
    th: ['ทำได้ดีมาก เจ้านี่ก็เอาเรื่อง', 'หลังจากนี้เจ้าจงไปหา Roland เจ้านั่นน่าจะอยู่บริเวณบ้านร้างลึกเข้าไปอีกหน่อย', 'แล้วเราค่อยเจอกันใหม่ ส่วนนี่ก็รางวัลของเจ้า'],
    en: ["Well done! You're more capable than I thought.", 'Next, go find Roland. He should be somewhere near the abandoned houses farther ahead.', "We'll meet again later. Here's your reward."],
  },
};

test('dialogue: the given lines in Thai and English, step for step', () => {
  initLanguage(null);
  for (const [id, texts] of Object.entries(TEXTS)) {
    for (const language of ['th', 'en'] as const) {
      setLanguage(language);
      assert.deepEqual(DIALOGUES[id as keyof typeof DIALOGUES].map((k) => translate(k)), texts[language], `${id} ${language}`);
    }
  }
  setLanguage('th');
  assert.equal(TUTORIAL_QUEST_02.expBeforeStep, 1, 'EXP on the way from line 1 to line 2');
  assert.equal(TUTORIAL_QUEST_03.previewStep, 0, 'Void Mite picture with the first line');
});

test('every NPC dialogue line exists in both languages; English is never the Thai text', () => {
  assert.deepEqual(findMissingTranslations(), { th: [], en: [] });
  const th = getDictionary('th');
  const en = getDictionary('en');
  const keys = collectKeys(th).filter((k) => k.startsWith('dialogues.'));
  assert.equal(keys.length, new Set(Object.values(DIALOGUES).flat()).size, 'every key is a line of a dialogue (a dialogue may reuse lines)');
  const read = (dict: unknown, key: string): unknown => key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], dict);
  for (const lines of Object.values(DIALOGUES)) {
    for (const key of lines) {
      const [t, e] = [read(th, key), read(en, key)];
      assert.ok(typeof t === 'string' && t.length > 0, key);
      assert.ok(typeof e === 'string' && e.length > 0 && e !== t && !/[฀-๿]/.test(e as string), `${key}: English`);
    }
  }
  initLanguage(null);
  setLanguage('en');
  assert.equal(labels.questObjective(TUTORIAL_QUEST_03.id, 'objectiveHunt', { count: 0, total: 5 }), 'Defeat Void Mites (0/5)');
  setLanguage('th');
  assert.equal(labels.questObjective(TUTORIAL_QUEST_03.id, 'objectiveHunt', { count: 0, total: 5 }), 'กำจัด Void Mite (0/5)');
});
