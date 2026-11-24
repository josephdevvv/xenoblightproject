import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import type { Point } from '../src/core/types';
import { initLanguage, setLanguage, translate } from '../src/i18n';
import { QuestNavigation, type NavigatingPlayer } from '../src/navigation/QuestNavigation';
import { NPC_INTERACT_RANGE } from '../src/npcs/NpcInteraction';
import { sanitizeHints, showNavigateHint } from '../src/tutorial/TutorialHints';
import { centerInkIn, inkBounds } from '../src/ui/text/TextInk';

/** A player on a straight line: moveTo plans a path, step() walks it one tile at a time. */
function fakePlayer(start: Point, reachable = true) {
  const log: string[] = [];
  let pos = { ...start };
  let goal: Point | null = null;
  const player: NavigatingPlayer = {
    getTilePosition: () => pos,
    moveTo: (p) => {
      if (!reachable) return false;
      goal = { ...p };
      log.push(`move ${p.x},${p.y}`);
      return true;
    },
    stopPath: () => {
      goal = null;
      log.push('stopPath');
    },
    hasPath: () => goal !== null,
    faceTowards: (p) => log.push(`face ${p.x},${p.y}`),
    halt: () => {
      goal = null;
      log.push('halt');
    },
  };
  const step = (): void => {
    if (!goal) return;
    const dx = goal.x - pos.x;
    const d = Math.abs(dx);
    pos = { x: d <= 1 ? goal.x : pos.x + Math.sign(dx), y: pos.y };
    if (d <= 1) goal = null;
  };
  return { player, log, step, at: () => pos, block: () => (goal = null) };
}

const roland = { position: { x: 10, y: 0 } };
const mateus = { position: { x: -5, y: 0 } };

test('navigate: walks with the normal pathfinding and stops inside the interaction range, facing the NPC', () => {
  const w = fakePlayer({ x: 0, y: 0 });
  const nav = new QuestNavigation(w.player);
  assert.equal(nav.start(roland), 'started');
  assert.deepEqual([nav.active, nav.npc, w.log], [true, roland, ['move 10,0']]);
  let arrived = null;
  for (let i = 0; i < 20 && !arrived; i++) {
    w.step();
    arrived = nav.update(roland);
  }
  assert.equal(arrived, 'arrived');
  assert.ok(Math.abs(w.at().x - 10) <= NPC_INTERACT_RANGE, 'inside the range, not on top of the NPC');
  assert.deepEqual(w.log.slice(-2), ['stopPath', 'face 10,0']);
  assert.equal(nav.active, false, 'no conversation, nothing left to do');
  // already in range: just faces the NPC
  assert.equal(nav.start(roland), 'arrived');
  assert.equal(nav.active, false);
});

test('navigate: the second click stops at once (idle); the next click starts again; manual movement cancels', () => {
  const w = fakePlayer({ x: 0, y: 0 });
  const nav = new QuestNavigation(w.player);
  nav.start(roland);
  w.step();
  nav.stop();
  assert.deepEqual([nav.active, w.player.hasPath(), w.log.at(-1)], [false, false, 'halt']);
  const stoppedAt = w.at().x;
  for (let i = 0; i < 5; i++) {
    w.step();
    assert.equal(nav.update(roland), null);
  }
  assert.equal(w.at().x, stoppedAt, 'nothing walks on after STOP');
  assert.equal(nav.start(roland), 'started', 'restartable');
  // a manual click replaces it: the navigation forgets its target, the click's own path stays
  w.player.moveTo({ x: -3, y: 0 });
  nav.cancel();
  assert.deepEqual([nav.active, w.player.hasPath()], [false, true]);
  assert.equal(nav.update(roland), null);
});

test('navigate: ends when the quest NPC changes, when the way ends early, or when the NPC cannot be reached', () => {
  const w = fakePlayer({ x: 0, y: 0 });
  const nav = new QuestNavigation(w.player);
  nav.start(roland);
  assert.equal(nav.update(mateus), null);
  assert.deepEqual([nav.active, w.log.at(-1)], [false, 'halt'], 'the quest moved on: stop');
  nav.start(roland);
  nav.update(null);
  assert.equal(nav.active, false, 'no quest NPC any more');
  nav.start(roland);
  w.block();
  assert.equal(nav.update(roland), null);
  assert.equal(nav.active, false, 'the path ended before the NPC');
  const stuck = fakePlayer({ x: 0, y: 0 }, false);
  const n2 = new QuestNavigation(stuck.player);
  assert.equal(n2.start(roland), 'unreachable');
  assert.equal(n2.active, false);
});

test('tutorial: after Mateus\'s last quest, while Roland offers the potion training, until Navigate was clicked once', () => {
  assert.equal(showNavigateHint('COMPLETED', 'OFFERED', false), true);
  assert.equal(showNavigateHint('COMPLETED', 'OFFERED', true), false, 'done: never again');
  assert.equal(showNavigateHint('TURN_IN_DIALOGUE', 'NOT_STARTED', false), false);
  assert.equal(showNavigateHint('COMPLETED', 'INTRO_DIALOGUE', false), false, 'already talking to Roland');
  assert.equal(showNavigateHint('COMPLETED', 'COMPLETED', false), false);
  assert.deepEqual(sanitizeHints(['navigate_to_roland', 'click_to_move']).state, ['navigate_to_roland', 'click_to_move'], 'saved with the other hints');
});

test('label: TH "พาไป" / EN "Navigate", ink centred in the box both ways', () => {
  initLanguage(null);
  setLanguage('th');
  assert.equal(translate('hud.navigate'), 'พาไป');
  setLanguage('en');
  assert.equal(translate('hud.navigate'), 'Navigate');
  setLanguage('th');
  // a 4 x 2 ink block inside a 10 x 6 canvas, at columns 3-6 / rows 1-2
  const w = 10;
  const h = 6;
  const px = new Uint8Array(w * h * 4);
  for (let y = 1; y <= 2; y++) for (let x = 3; x <= 6; x++) px[(y * w + x) * 4 + 3] = 255;
  const ink = inkBounds(px, w, h)!;
  assert.deepEqual(ink, { left: 3, right: 6, top: 1, bottom: 2 });
  const at = centerInkIn({ x: 118, y: 72, width: 39, height: 17 }, ink);
  const inkMid = { x: at.x + (ink.left + ink.right + 1) / 2, y: at.y + (ink.top + ink.bottom + 1) / 2 };
  assert.ok(Math.abs(inkMid.x - (118 + 39 / 2)) <= 0.5 && Math.abs(inkMid.y - (72 + 17 / 2)) <= 0.5);
  assert.equal(inkBounds(new Uint8Array(16), 2, 2), null);
});

test('wiring: button -> GameScene toggle; manual clicks cancel; never red; independent of Auto Combat', () => {
  const read = (f: string): string => fs.readFileSync(path.join(process.cwd(), f), 'utf8');
  const hud = read('src/ui/hud/DungeonHud.ts');
  assert.ok(!hud.includes('autoTag'), 'the old AUTO tag (red while Auto Play ran) is gone');
  assert.match(hud, /const NAV_COLORS = \{ enabled: PALETTE\.slate,/, 'the art\'s own colour');
  assert.match(hud, /if \(p\.button === 0 && this\.navEnabled\) this\.options\.onNavigate\?\.\(\);/);
  const game = read('src/scenes/GameScene.ts');
  assert.match(game, /this\.navigation\.cancel\(\); \/\/ \.\.\.and Navigate/);
  const toggle = game.slice(game.indexOf("toggleQuestNavigation(): NavigationStart | 'stopped' | 'unavailable' {"));
  assert.match(toggle, /if \(this\.navigation\.active\) \{\s*this\.navigation\.stop\(\);\s*return 'stopped';/);
  assert.ok(!toggle.slice(0, 800).includes('AutoPlayService'), 'Navigate never switches Auto Combat');
  const ui = read('src/scenes/GameUIScene.ts');
  assert.match(ui, /this\.hud\.setNavigationState\(navLocked \? 'locked' : this\.canOpenWindows\(\) && game\.canNavigate\(\) \? 'enabled' : 'disabled'\);/);
  assert.match(ui, /tutorial && \(result === 'started' \|\| result === 'arrived'\) && this\.character\) HintService\.complete\(this\.character, 'navigate_to_roland'\)/);
  assert.match(ui, /rect: \(\) => rectOfObject\(this, this\.hud\?\.navButton\)/);
});
