import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { FeatureService, sanitizeUnlocks, unlockedByProgress } from '../src/features/FeatureUnlocks';
import { initLanguage, setLanguage, translate } from '../src/i18n';
import { isQuestAccepted, NOTICE_QUEST_IDS, QuestAcceptWatcher } from '../src/quests/QuestNotices';
import { QuestService } from '../src/quests/QuestService';
import { checksum, parseSave, serializeSave } from '../src/save/SaveFile';
import { SaveService } from '../src/save/SaveService';
import { BANNER_ICONS, BANNER_TIMING, bannerFrame, HINT_BANNER, stackTops } from '../src/ui/tutorial/HintBannerLayout';
import { newCharacter, saveAndLoad, withoutStorage } from './helpers/session';

const q7 = (state: string, potionTutorialDone = false) => ({ state, potionTutorialDone, autoTutorialDone: false }) as never;
const read = (f: string): string => fs.readFileSync(path.join(process.cwd(), f), 'utf8');

test('unlock rules: Navigate with its tutorial (Mateus\'s last quest done), Auto Combat with its tutorial (after the potion one)', () => {
  assert.equal(unlockedByProgress('navigate', 'TURN_IN_DIALOGUE', q7('NOT_STARTED')), false);
  assert.equal(unlockedByProgress('navigate', 'COMPLETED', q7('NOT_STARTED')), true);
  assert.equal(unlockedByProgress('autoCombat', 'COMPLETED', q7('OFFERED')), false);
  assert.equal(unlockedByProgress('autoCombat', 'COMPLETED', q7('ACTIVE')), false, 'the potion hotkey tutorial comes first');
  assert.equal(unlockedByProgress('autoCombat', 'COMPLETED', q7('ACTIVE', true)), true);
  for (const later of ['TURN_IN_DIALOGUE', 'REWARDED', 'COMPLETED']) assert.equal(unlockedByProgress('autoCombat', 'COMPLETED', q7(later)), true, later);
});

test('unlocks: a new character has none; recorded once; kept through save / load; older saves unlock from progress', () => {
  withoutStorage(() => {
    const c = newCharacter('Alpha');
    assert.deepEqual([FeatureService.isUnlocked(c, 'navigate'), FeatureService.isUnlocked(c, 'autoCombat')], [false, false]);
    FeatureService.sync(c);
    assert.deepEqual(c.unlocks, [], 'nothing reached yet');
    assert.equal(FeatureService.unlock(c, 'navigate'), true);
    assert.equal(FeatureService.unlock(c, 'navigate'), false);
    const loaded = saveAndLoad(c);
    assert.deepEqual([FeatureService.isUnlocked(loaded, 'navigate'), FeatureService.isUnlocked(loaded, 'autoCombat')], [true, false]);
    // a file from before unlocks existed, far into the tutorial: no "unlocks" field - progress unlocks both
    const doc = JSON.parse(serializeSave(c, null)) as Record<string, unknown>;
    delete doc.checksum;
    const { unlocks: _drop, ...old } = doc;
    const quests = { ...(old.quests as Record<string, unknown>), tutorial_03_void_mite_hunt: { state: 'COMPLETED', kills: 5 }, tutorial_07_reach_level_10: { state: 'COMPLETED' } };
    const r = parseSave(JSON.stringify({ ...old, quests, checksum: checksum({ ...old, quests }) }));
    assert.ok(r.ok);
    const restored = SaveService.restore(r.save);
    assert.deepEqual(restored.unlocks, []);
    FeatureService.sync(restored);
    assert.deepEqual([...(restored.unlocks ?? [])].sort(), ['autoCombat', 'navigate']);
    assert.deepEqual(sanitizeUnlocks(['navigate', 'navigate', 'x', 1]), { state: ['navigate'], dropped: ['unlocks'] });
    assert.deepEqual(sanitizeUnlocks(undefined), { state: [], dropped: [] });
  });
});

test('locked: the AUTO button, X and Navigate only show the notice; TH / EN text', () => {
  const ui = read('src/scenes/GameUIScene.ts');
  assert.match(ui, /onAutoPlay: \(\) => this\.featureReady\('autoCombat'\) && this\.canOpenWindows\(\) && this\.toggleAutoPlayWindow\(\)/);
  assert.match(ui, /if \(!this\.featureReady\('autoCombat'\)\) return; \/\/ locked until the Auto Combat tutorial\s*AutoPlayService\.toggle\(character\);/);
  assert.match(ui, /if \(!game \|\| !this\.featureReady\('navigate'\) \|\| !this\.canOpenWindows\(\)\) return;/);
  assert.match(ui, /this\.banners\?\.notify\('feature\.locked', 'features\.locked', 'lock'\);/);
  initLanguage(null);
  setLanguage('th');
  assert.equal(translate('features.locked'), 'ต้องผ่าน Tutorial ก่อนถึงจะกดใช้ได้');
  assert.equal(translate('notices.questAccepted', { name: 'ล่า Void Mite' }), 'ได้รับภารกิจ: ล่า Void Mite');
  assert.equal(translate('notices.questCompleted', { name: 'ล่า Void Mite' }), 'สำเร็จภารกิจ: ล่า Void Mite');
  setLanguage('en');
  assert.equal(translate('features.locked'), 'Complete the tutorial to unlock this feature.');
  assert.equal(translate('notices.questAccepted', { name: 'Void Mite Hunt' }), 'Quest accepted: Void Mite Hunt');
  assert.equal(translate('notices.questCompleted', { name: 'Void Mite Hunt' }), 'Quest completed: Void Mite Hunt');
  setLanguage('th');
});

test('quest notices: accepted once the giver\'s talk is over (never twice, never for what a save already had); Reach Level 10 announces its completion', () => {
  withoutStorage(() => {
    const c = newCharacter('Beta');
    assert.equal(NOTICE_QUEST_IDS.length, 7);
    const w = new QuestAcceptWatcher(c);
    QuestService.advance(c, 'start');
    assert.deepEqual(w.newlyAccepted(), ['tutorial_01_find_mateus']);
    assert.deepEqual(w.newlyAccepted(), []);
    c.quests = { ...c.quests!, tutorial_03_void_mite_hunt: { state: 'ACCEPT_DIALOGUE', kills: 0 } };
    assert.equal(isQuestAccepted(c, 'tutorial_03_void_mite_hunt'), false, 'still talking: not yet');
    c.quests = { ...c.quests!, tutorial_03_void_mite_hunt: { state: 'HUNTING', kills: 0 } };
    assert.deepEqual(w.newlyAccepted(), ['tutorial_03_void_mite_hunt']);
    c.quests = { ...c.quests!, tutorial_07_reach_level_10: { state: 'TURN_IN_DIALOGUE', potionTutorialDone: true, autoTutorialDone: true } };
    assert.deepEqual(w.newlyAccepted(), ['tutorial_07_reach_level_10']);
    c.quests = { ...c.quests!, tutorial_07_reach_level_10: { state: 'ACTIVE', potionTutorialDone: true, autoTutorialDone: true } };
    assert.deepEqual(w.newlyAccepted(), [], 'a cut-off talk going back is not a new acceptance');
    assert.deepEqual(new QuestAcceptWatcher(c).newlyAccepted(), [], 'loaded progress is not announced');
    const done: string[] = [];
    const off = QuestService.onCompleted((x, id) => x === c && done.push(id));
    c.quests = { ...c.quests!, tutorial_07_reach_level_10: { state: 'REWARDED', potionTutorialDone: true, autoTutorialDone: true } };
    assert.ok(QuestService.advance07(c, 'complete'));
    off();
    assert.deepEqual(done, ['tutorial_07_reach_level_10']);
  });
});

test('banners: stacked under each other (never overlapping), 3 s then a fade out, upper-centre, visual only', () => {
  const tops = stackTops(480, 4);
  assert.equal(tops[0], Math.round(480 * HINT_BANNER.topRatio));
  for (let i = 1; i < tops.length; i++) assert.equal(tops[i] - tops[i - 1], HINT_BANNER.height + HINT_BANNER.gap);
  assert.equal(BANNER_TIMING.showMs, 3000);
  assert.ok(BANNER_TIMING.fadeOutMs > 0 && BANNER_TIMING.shiftMs > 0);
  const f = bannerFrame(960, 140, 200);
  assert.ok(Math.abs(f.x + f.width / 2 - 480) <= 1 && f.y === 140);
  for (const [name, rows] of Object.entries(BANNER_ICONS)) {
    assert.ok(rows.length <= HINT_BANNER.height - 4 && rows.every((r) => r.length === rows[0].length && r.length <= 11), name);
  }
  const src = read('src/ui/tutorial/BannerStack.ts');
  for (const banned of ['add.container', 'add.image', 'setInteractive', 'add.zone']) assert.ok(!src.includes(banned), banned);
  assert.match(src, /now - b\.shownAt >= BANNER_TIMING\.showMs\) this\.leave\(b\);/, 'timed by the scene clock: 3 s even at a low frame rate');
  assert.match(src, /alpha: 0,\s*duration: BANNER_TIMING\.fadeOutMs/);
  assert.match(src, /this\.banners = this\.banners\.filter\(\(x\) => x !== b\);\s*this\.layout\(\);/, 'the ones below glide up once it is gone');
  assert.match(src, /y: top, duration: BANNER_TIMING\.shiftMs/);
  const ui = read('src/scenes/GameUIScene.ts');
  assert.match(ui, /this\.banners\.setPersistent\('hint\.clickToMove', 'hints\.clickToMove', this\.touch \? 'joystick' : 'mouse', /, 'the left-click hint (joystick hint on mobile) is the persistent top banner');
});
