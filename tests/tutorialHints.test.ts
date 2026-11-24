import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { en } from '../src/i18n/en';
import { th } from '../src/i18n/th';
import { checksum, parseSave, serializeSave } from '../src/save/SaveFile';
import { SaveService } from '../src/save/SaveService';
import { QuestService } from '../src/quests/QuestService';
import { QUEST01_STATES } from '../src/quests/TutorialQuest01';
import { HintService, sanitizeHints, showClickToMoveHint } from '../src/tutorial/TutorialHints';
import { HINT_BANNER, hintBannerLayout, MOUSE_ICON, MOUSE_ICON_SIZE } from '../src/ui/tutorial/HintBannerLayout';
import { newCharacter, saveAndLoad, withoutStorage } from './helpers/session';

const read = (f: string): string => fs.readFileSync(path.join(process.cwd(), f), 'utf8');

test('rule: shown while looking for Mateus, gone once his first conversation began or the hint is done', () => {
  assert.equal(showClickToMoveHint('NOT_STARTED', false), true);
  assert.equal(showClickToMoveHint('FIND_MATEUS', false), true);
  assert.equal(showClickToMoveHint('FIND_MATEUS', true), false, 'finished: never again');
  for (const later of QUEST01_STATES.slice(2)) assert.equal(showClickToMoveHint(later, false), false, later);
});

test('service: a new character has none finished; complete records once and tells listeners once', () => {
  withoutStorage(() => {
    const c = newCharacter('Alpha');
    assert.equal(HintService.isDone(c, 'click_to_move'), false);
    assert.equal(showClickToMoveHint(QuestService.quest01(c).state, false), true, 'shown on the first entry');
    let heard = 0;
    const off = HintService.onComplete((x) => x === c && heard++);
    assert.equal(HintService.complete(c, 'click_to_move'), true);
    assert.equal(HintService.complete(c, 'click_to_move'), false);
    off();
    assert.deepEqual([HintService.isDone(c, 'click_to_move'), heard, c.hints], [true, 1, ['click_to_move']]);
  });
});

test('save / load: a finished hint stays finished; older files load with none; bad data is repaired', () => {
  withoutStorage(() => {
    const c = newCharacter('Beta');
    assert.equal(HintService.isDone(saveAndLoad(c), 'click_to_move'), false, 'not finished: shown again after loading');
    HintService.complete(c, 'click_to_move');
    assert.equal(HintService.isDone(saveAndLoad(c), 'click_to_move'), true);
    const doc = JSON.parse(serializeSave(c, null)) as Record<string, unknown>;
    delete doc.checksum;
    const resign = (d: Record<string, unknown>): string => JSON.stringify({ ...d, checksum: checksum(d) });
    const { hints: _drop, ...old } = doc;
    assert.equal(HintService.isDone(SaveService.restore(parseOk(resign(old))), 'click_to_move'), false, 'an older file: none');
    const r = parseSave(resign({ ...doc, hints: ['click_to_move', 'click_to_move', 'nope', 3] }));
    assert.ok(r.ok);
    assert.deepEqual(r.save.hints, ['click_to_move']);
    assert.ok(r.save.repaired.includes('hints'));
    assert.deepEqual([sanitizeHints(undefined), sanitizeHints('x')], [{ state: [], dropped: [] }, { state: [], dropped: ['hints'] }]);
  });
});

test('trigger: finished the moment Mateus\'s first conversation begins (before the dialogue opens)', () => {
  const game = read('src/scenes/GameScene.ts');
  const branch = game.slice(game.indexOf("if (QuestService.advance(character, 'talk')) {"));
  assert.ok(branch.indexOf("HintService.complete(character, 'click_to_move')") < branch.indexOf('this.beginConversation(ui)'));
  const ui = read('src/scenes/GameUIScene.ts');
  assert.match(ui, /showClickToMoveHint\(QuestService\.quest01\(c\)\.state, HintService\.isDone\(c, 'click_to_move'\)\)/);
});

test('banner: visual only (no Container, Image or input) so clicks reach the world; fades out; localized', () => {
  const src = read('src/ui/tutorial/BannerStack.ts');
  for (const banned of ['add.container', 'add.image', 'setInteractive', 'delayedCall', 'add.zone']) assert.ok(!src.includes(banned), banned);
  assert.match(src, /alpha: 0/);
  assert.match(src, /localize\(/);
  assert.equal(th.hints.clickToMove, 'กดคลิกซ้าย เพื่อเดินและคุยกับ NPC');
  assert.equal(en.hints.clickToMove, 'Left-click to move and talk to NPCs.');
});

test('layout: upper centre, sized to the text, whole pixels, inside the screen at any size', () => {
  const L = hintBannerLayout(960, 480, 200);
  assert.equal(L.y, Math.round(480 * HINT_BANNER.topRatio));
  assert.ok(L.y >= 100 && L.y + L.height <= 157, 'inside the marked area');
  assert.equal(Math.abs(L.x + L.width / 2 - 480) <= 1, true, 'centred');
  assert.ok(L.textX > L.iconX + MOUSE_ICON_SIZE.width);
  for (const [w, h] of [[640, 360], [1280, 720], [1920, 1080]]) {
    const r = hintBannerLayout(w, h, 240);
    assert.ok(r.x >= 0 && r.x + r.width <= w && r.y > 0 && r.y + r.height < h / 2, `${w}x${h}`);
    for (const v of Object.values(r)) assert.ok(Number.isInteger(v));
  }
  assert.ok(MOUSE_ICON.every((row) => row.length === MOUSE_ICON_SIZE.width));
  assert.ok(MOUSE_ICON.some((row) => row.includes('l')), 'the left button is lit');
});

function parseOk(text: string): Parameters<typeof SaveService.restore>[0] {
  const r = parseSave(text);
  assert.ok(r.ok);
  return r.save;
}
