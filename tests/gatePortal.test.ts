import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { DIALOGUES } from '../src/dialogue/Dialogues';
import { GATE_ANSWERS, GATE_TALKS, gateTalkMode, gateTalkOf } from '../src/dialogue/GateTalks';
import { initLanguage, setLanguage, translate } from '../src/i18n';
import { QUEST_MARKER_SOURCES } from '../src/quests/QuestMarkers';
import { trackedQuest } from '../src/quests/QuestTracker';
import { NPC_CURSOR, NpcCursor } from '../src/ui/world/NpcCursor';
import { PORTALS, PortalService, portalArrowShown, portalVisible, portalsAllowed, sanitizePortals, tileCentre } from '../src/world/Portals';
import { createQuest07, QUEST07_STATES } from '../src/quests/TutorialQuest07';
import { readPng } from './helpers/png';
import { newCharacter, saveAndLoad, withoutStorage } from './helpers/session';

const read = (f: string): string => fs.readFileSync(path.join(process.cwd(), f), 'utf8');
const say = (id: keyof typeof DIALOGUES): string[] => DIALOGUES[id].map((k) => translate(k));

test('Sonny and Jack: the exact Thai lines, the question with its two answers, a branch per answer', () => {
  initLanguage(null);
  setLanguage('th');
  assert.deepEqual(GATE_ANSWERS.map((k) => translate(k)), ['ข้ามาตามคำแนะนำของ Roland', 'เดินเล่นเฉยๆ']);
  assert.deepEqual(say('sonny_gate'), ['ที่นี่คือประตูเมือง Dawnkeep ป้อมปราการแรกแห่งอาณาจักร Rosencrown', 'เจ้ามีธุระอะไรกันถึงได้มาที่นี่']);
  assert.deepEqual(say('sonny_from_roland'), ['อ่อ เจ้าคนเร่ร่อนที่ Mateus ไปเจอมาหรือเนี่ย โอเคๆ', 'ข้าจะเปิดทางให้เจ้าเข้าไปในเมือง จงเตรียมพร้อมที่จะเรียนรู้สิ่งต่างๆด้วยล่ะ']);
  assert.deepEqual(say('sonny_just_walking'), ['อะไรของเจ้าเนี่ย ตัวก็เหม็น สกปรกมาก เจ้าคนเร่ร่อน!', 'ไปคุยกับ Jack ไป ถ้าจะมากวนประสาท']);
  assert.deepEqual(say('jack_gate'), ['เจ้าคือใคร มาทำไมในสถานที่แห่งนี้']);
  assert.deepEqual(say('jack_from_roland'), ['ใครคือ Roland ข้าไม่เห็นจะรู้จัก', 'กลับไปทางที่เจ้ามาเถอะ ไอ้ตัวเหม็น']);
  assert.deepEqual(say('jack_just_walking'), ['เดินเล่น? เดินเล่นอะไรในสถานที่แห่งนี้', 'กลับไปทางที่เจ้ามาเถอะ ไอ้ตัวเหม็น']);
  assert.equal(GATE_TALKS.sonny.questionStep, DIALOGUES.sonny_gate.length - 1, 'Sonny asks on his second line');
  assert.equal(GATE_TALKS.jack.questionStep, 0, 'Jack asks at once');
  setLanguage('en');
  for (const id of ['sonny_gate', 'sonny_from_roland', 'sonny_just_walking', 'jack_gate', 'jack_from_roland', 'jack_just_walking'] as const) {
    for (const line of say(id)) assert.ok(/[a-z]/.test(line) && !line.startsWith('dialogues.'), id);
  }
  setLanguage('th');
});

test('only Sonny\'s "Roland sent me" opens the portal; Jack never starts a quest or anything else', () => {
  assert.equal(GATE_TALKS.sonny.opensPortalOn, 0);
  assert.equal(GATE_TALKS.jack.opensPortalOn, null);
  assert.equal(gateTalkOf('city_guard_jack'), GATE_TALKS.jack);
  assert.equal(gateTalkOf('city_guard_01'), null);
  assert.ok(!QUEST_MARKER_SOURCES.some((s) => s.npcId === 'city_guard_jack'), 'no quest of Jack');
  const game = read('src/scenes/GameScene.ts');
  const talk = game.slice(game.indexOf('private gateTalk('), game.indexOf('private enterPortal('));
  assert.match(talk, /if \(answer === gate\.opensPortalOn && completed\) PortalService\.unlock\(this\.character, 'dawnkeep_gate'\);/);
  assert.ok(!/QuestService\.(?!quest07\()|Reward|grant/i.test(talk), 'just talk: reads Quest 07, no quest step, no reward');
  assert.match(talk, /choices: \{\s*step: gate\.questionStep,\s*options: GATE_ANSWERS,/);
});

test('portal: opened once (never a second one), shown with the arrow until entered, saved', () => {
  withoutStorage(() => {
    const c = newCharacter('Alpha');
    c.quests = { ...c.quests!, tutorial_07_reach_level_10: { ...createQuest07(), state: 'COMPLETED' } };
    assert.equal(PortalService.state(c, 'dawnkeep_gate'), 'LOCKED');
    assert.equal(PortalService.enter(c, 'dawnkeep_gate'), false, 'a locked portal leads nowhere');
    assert.deepEqual([portalVisible('LOCKED'), portalArrowShown('LOCKED')], [false, false]);
    assert.equal(PortalService.unlock(c, 'dawnkeep_gate'), true);
    assert.equal(PortalService.unlock(c, 'dawnkeep_gate'), false, 'the good branch again: no second portal');
    assert.deepEqual([portalVisible('UNLOCKED'), portalArrowShown('UNLOCKED')], [true, true]);
    const reloaded = saveAndLoad(c);
    assert.equal(PortalService.state(reloaded, 'dawnkeep_gate'), 'UNLOCKED', 'reloading after unlocking: still open');
    assert.equal(PortalService.enter(reloaded, 'dawnkeep_gate'), true);
    assert.equal(PortalService.state(reloaded, 'dawnkeep_gate'), 'ENTERED');
    assert.deepEqual([portalVisible('ENTERED'), portalArrowShown('ENTERED')], [true, false], 'the arrow goes after entering');
    assert.equal(PortalService.enter(reloaded, 'dawnkeep_gate'), true, 'it still works afterwards');
    assert.equal(PortalService.state(saveAndLoad(reloaded), 'dawnkeep_gate'), 'ENTERED');
    assert.deepEqual(sanitizePortals({ dawnkeep_gate: 'OPEN', nowhere: 'UNLOCKED' }), { state: {}, dropped: ['portals: dawnkeep_gate', 'portals: nowhere'] });
    assert.deepEqual(sanitizePortals(undefined), { state: {}, dropped: [] });
  });
});

test('portal: leads into Dawnkeep (just inside its gate); 64 x 64 art; one per map; another map = the scene restarts there', () => {
  const gate = PORTALS.dawnkeep_gate;
  assert.deepEqual(gate.destination, { mapId: 'dawnkeep', col: 47, row: 86 });
  assert.equal(gate.art.size, 64);
  const png = readPng(path.join(process.cwd(), 'public', gate.art.url));
  assert.deepEqual([png.width, png.height], [64 * gate.art.frames, 64], 'a 12-frame sheet of 64 x 64 cells');
  assert.equal(png.data[3], 0, 'transparent background');
  const game = read('src/scenes/GameScene.ts');
  const enter = game.slice(game.indexOf('private enterPortal('));
  assert.ok(enter.includes('if (this.leaving || !warpAllowed(this.warpGuard, this.time.now)) return;'), 'no warp right after arriving');
  assert.ok(enter.includes('if (!PortalService.enter(this.character, portal.definition.id as PortalId)) return;'));
  assert.ok(enter.includes('this.scene.restart({ mapId: dest.mapId, arrival: arrivalPoint(dest) }'), 'another map: entered through a scene restart');
  assert.ok(enter.includes('this.player.teleport(arrivalPoint(dest));'), 'the same map: a teleport');
  assert.ok(game.includes('const portal = Object.values(PORTALS).find((p) => p.mapId === this.mapId);'), 'built once with the map');
});

test('tracker: after Reach Level 10 - talk to Sonny, then step through the portal, then nothing', () => {
  withoutStorage(() => {
    const c = newCharacter('Beta');
    c.quests = { ...c.quests!, tutorial_07_reach_level_10: { state: 'COMPLETED', potionTutorialDone: true, autoTutorialDone: true } };
    initLanguage(null);
    setLanguage('en');
    const objective = (): string | null => {
      const t = trackedQuest(c);
      return t ? translate(`quests.${t.questId}.${t.objectiveKey}`, t.params) : null;
    };
    assert.equal(objective(), 'Head north and talk to Sonny at the gate');
    PortalService.unlock(c, 'dawnkeep_gate');
    assert.equal(objective(), 'Step through the portal');
    PortalService.enter(c, 'dawnkeep_gate');
    assert.equal(objective(), null);
    setLanguage('th');
  });
});

test('NPC cursor: the uploaded 32 x 14 sheet - frame 1 on hover, frame 2 while pressed, normal cursor elsewhere', () => {
  const png = readPng(path.join(process.cwd(), 'public', NPC_CURSOR.url));
  assert.deepEqual([png.width, png.height], [NPC_CURSOR.frameWidth * NPC_CURSOR.frames, NPC_CURSOR.frameHeight]);
  const src = readPng(path.join(process.cwd(), 'art-source/ui/cursor/npc_talk_cursor.png'));
  assert.deepEqual(Buffer.from(png.data), Buffer.from(src.data), 'exactly the delivered pixels');
  const c = new NpcCursor({ exists: () => false } as never);
  c.update(true);
  assert.equal(c.getState(), 'hover');
  c.press();
  assert.equal(c.getState(), 'press');
  c.release(true);
  assert.equal(c.getState(), 'hover');
  c.press();
  c.release(false);
  assert.equal(c.getState(), 'none');
  c.update(true);
  c.update(false);
  assert.equal(c.getState(), 'none', 'leaving the NPC restores the normal cursor');
  const game = read('src/scenes/GameScene.ts');
  assert.match(game, /this\.npcCursor\.update\(over === 'npc'\);/);
  assert.match(game, /return npc === this\.questNpc\(\) \|\| gateTalkOf\(npc\.definition\.id\) !== null;/, 'talkable NPCs only');
});

test('dialogue choices: the question step waits for an answer; an answer closes it and runs its branch', () => {
  const src = read('src/ui/dialogue/DialogueWindow.ts');
  assert.match(src, /if \(this\.hooks\.choices\?\.step === session\.step\) return; \/\/ a question: only an answer goes on/);
  assert.match(src, /this\.close\(\);\s*q\.onChoose\(index\);/);
});

test('the tracker hears about the portal: opened and first entered fire a change (nothing else does)', () => {
  withoutStorage(() => {
    const c = newCharacter('Gamma');
    let heard = 0;
    const off = PortalService.onChange((x) => x === c && heard++);
    PortalService.unlock(c, 'dawnkeep_gate');
    PortalService.unlock(c, 'dawnkeep_gate');
    PortalService.enter(c, 'dawnkeep_gate');
    PortalService.enter(c, 'dawnkeep_gate');
    off();
    assert.equal(heard, 2);
    assert.match(read('src/scenes/GameUIScene.ts'), /PortalService\.onChange\(\(c\) => \{\s*if \(c === character\) refreshQuest\(\);/);
  });
});

test('Sonny before Quest 07 is completed: only "get lost" - one line, no question, no portal; Jack is unchanged', () => {
  initLanguage(null);
  setLanguage('th');
  assert.deepEqual(say('sonny_not_yet'), ['ไปไหนก็ไป เจ้าตัวเหม็น!']);
  setLanguage('en');
  assert.deepEqual(say('sonny_not_yet'), ['Get lost, you stinking wretch!']);
  setLanguage('th');
  assert.equal(GATE_TALKS.sonny.notYet, 'sonny_not_yet');
  assert.equal(GATE_TALKS.jack.notYet, undefined);
  assert.equal(gateTalkMode(GATE_TALKS.sonny, false), 'notYet');
  assert.equal(gateTalkMode(GATE_TALKS.sonny, true), 'full');
  assert.equal(gateTalkMode(GATE_TALKS.jack, false), 'full', 'Jack talks as before');
  const game = read('src/scenes/GameScene.ts');
  const talk = game.slice(game.indexOf('private gateTalk('), game.indexOf('private enterPortal('));
  assert.match(talk, /const completed = isQuest07ToSonny\(QuestService\.quest07\(this\.character\)\);/, 'actual quest state, not the level');
  assert.ok(!/level/.test(talk.replace(/Level 10/g, '')), 'the level alone never opens it');
  const early = talk.slice(talk.indexOf("=== 'notYet'"), talk.indexOf('return;'));
  assert.match(early, /dialogue\.open\(name, DIALOGUES\[gate\.notYet\], end, \{ onInterrupted: end \}\);/);
  assert.ok(!/choices|PortalService/.test(early), 'no answers, no portal');
});

test('Sonny\'s portal through Save / Load: dropped unless Quest 07 is completed (Level 10 alone is not enough)', () => {
  assert.deepEqual(portalsAllowed({ dawnkeep_gate: 'UNLOCKED', dawnkeep_exit: 'UNLOCKED' }, false), { dawnkeep_exit: 'UNLOCKED' });
  assert.deepEqual(portalsAllowed({ dawnkeep_gate: 'ENTERED' }, true), { dawnkeep_gate: 'ENTERED' });
  withoutStorage(() => {
    for (const state of QUEST07_STATES) {
      const c = newCharacter('Beta');
      c.level = 10;
      c.quests = { ...c.quests!, tutorial_07_reach_level_10: { ...createQuest07(), state } };
      c.portals = { dawnkeep_gate: 'UNLOCKED' };
      const loaded = saveAndLoad(c);
      assert.equal(PortalService.state(loaded, 'dawnkeep_gate'), state === 'COMPLETED' ? 'UNLOCKED' : 'LOCKED', `Quest 07 ${state}`);
    }
  });
  assert.match(read('src/status/CharacterStatusService.ts'), /QuestService\.restore\(character, saved\.quests\);\s*\/\/[^\n]*\n\s*character\.portals = portalsAllowed\(character\.portals, isQuest07ToSonny\(QuestService\.quest07\(character\)\)\);/);
});
