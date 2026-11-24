import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { canvasRendering, detectTouchMode } from '../src/platform/DeviceMode';
import { inCircle, joystickState, screenToGround, slotOfButton, TOUCH, touchLayout, type Circle } from '../src/ui/touch/TouchLayout';
import { chooseTouchTarget, TOUCH_TARGET_RANGE } from '../src/combat/TouchTargeting';
import { hpFillWidth, targetHudLayout } from '../src/ui/touch/TargetHudLayout';
import { touchAutoButtonRect } from '../src/ui/hud/HotbarLayout';
import { BANNER_ICONS } from '../src/ui/tutorial/HintBannerLayout';
import { findMissingTranslations, initLanguage, setLanguage, setTouchWording, translate } from '../src/i18n';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/config/constants';

const read = (f: string): string => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const IPAD_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

test('device mode: phones and tablets are touch; desktops (also touch-screen laptops) are not; ?mobile forces it', () => {
  const env = (o: Partial<Parameters<typeof detectTouchMode>[0]>) => ({ search: '', maxTouchPoints: 0, coarsePointer: false, userAgent: DESKTOP_UA, ...o });
  assert.equal(detectTouchMode(env({})), false, 'desktop');
  assert.equal(detectTouchMode(env({ maxTouchPoints: 10, coarsePointer: false })), false, 'touch-screen laptop: fine primary pointer, desktop browser');
  assert.equal(detectTouchMode(env({ maxTouchPoints: 5, coarsePointer: true, userAgent: PHONE_UA })), true, 'Android phone');
  assert.equal(detectTouchMode(env({ maxTouchPoints: 5, coarsePointer: true, userAgent: IPAD_UA })), true, 'iPad (desktop-looking UA)');
  assert.equal(detectTouchMode(env({ maxTouchPoints: 5, userAgent: PHONE_UA })), true, 'mobile browser with touch');
  assert.equal(detectTouchMode(env({ userAgent: PHONE_UA })), false, 'no touch points: not touch');
  assert.equal(detectTouchMode(env({ search: '?mobile=1' })), true);
  assert.equal(detectTouchMode(env({ search: '?mobile=0', maxTouchPoints: 5, coarsePointer: true, userAgent: PHONE_UA })), false);
});

test('landscape only: portrait when taller than wide; the canvas is smoothed only when shown below 1x', () => {
  const gate = read('src/platform/OrientationGate.ts');
  assert.match(gate, /export function isPortrait\(width: number, height: number\): boolean \{\n\s+return height > width;/, 'portrait = taller than wide (a square counts as landscape)');
  assert.equal(canvasRendering(0.78), 'auto');
  assert.equal(canvasRendering(1), 'pixelated');
  assert.equal(canvasRendering(1.6), 'pixelated');
});

test('touch layout: joystick bottom-left, sword + four hotkeys + tab bottom-right, HP / SP side by side; on screen, apart, finger-sized', () => {
  const L = touchLayout(GAME_WIDTH, GAME_HEIGHT);
  const all: [string, Circle][] = [
    ['joystick', L.joystick],
    ['sword', L.sword],
    ...L.slots.map((c, i): [string, Circle] => [`slot ${i + 1}`, c]),
    ['tab', L.tab],
    ['hp', L.potions.hp],
    ['sp', L.potions.sp],
  ];
  for (const [name, c] of all) {
    assert.ok(c.x - c.r >= 0 && c.x + c.r <= GAME_WIDTH && c.y - c.r >= 0 && c.y + c.r <= GAME_HEIGHT, `${name} on screen`);
    assert.ok(Number.isInteger(c.x) && Number.isInteger(c.y), `${name} at whole pixels`);
  }
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const [a, ca] = all[i];
      const [b, cb] = all[j];
      assert.ok(Math.hypot(ca.x - cb.x, ca.y - cb.y) >= ca.r + cb.r + 4, `${a} and ${b} keep apart`);
    }
  }
  assert.ok(L.joystick.x < GAME_WIDTH / 4 && L.joystick.y > GAME_HEIGHT / 2, 'joystick bottom-left');
  assert.ok(L.sword.x > (GAME_WIDTH * 3) / 4 && L.sword.y > GAME_HEIGHT / 2, 'sword bottom-right');
  assert.ok(L.sword.r > L.slots[0].r, 'the sword is the big button');
  for (const s of L.slots) {
    assert.ok(2 * s.r >= 44, 'hotkey buttons are finger-sized');
    assert.ok(Math.abs(Math.hypot(s.x - L.sword.x, s.y - L.sword.y) - TOUCH.slot.arc) <= 1, 'on the arc around the sword');
    assert.ok(s.x <= L.sword.x + 20 && s.y <= L.sword.y + 10, 'around its upper-left');
  }
  // potions: the same size as the hotkeys, the same row, HP (red, Q) left of SP (blue, W), above the EXP bar
  const { hp, sp } = L.potions;
  assert.equal(hp.r, L.slots[0].r);
  assert.equal(sp.r, hp.r);
  assert.equal(hp.y, sp.y);
  assert.ok(hp.x < sp.x && sp.x - hp.x === 2 * hp.r + TOUCH.potion.gap, 'side by side with the hotkeys\' spacing');
  assert.ok(sp.y + sp.r <= GAME_HEIGHT - 14, 'clear of the EXP bar');
  assert.ok(L.joystick.grab > L.joystick.r, 'the joystick can be taken a bit outside its ring');
  assert.deepEqual([0, 1, 2, 3].map((b) => slotOfButton(0, b)), [0, 1, 2, 3]);
  assert.deepEqual([0, 1, 2, 3].map((b) => slotOfButton(1, b)), [4, 5, 6, 7]);
  assert.ok(inCircle(L.sword, L.sword.x + L.sword.r - 1, L.sword.y));
});

test('joystick: a dead zone, the knob clamped to the base, the screen direction turned into the isometric ground direction', () => {
  const r = TOUCH.joystick.radius;
  assert.equal(joystickState(3, 2, r, TOUCH.joystick.deadzone).direction, null, 'a slight touch does not walk');
  const far = joystickState(200, 0, r, TOUCH.joystick.deadzone);
  assert.deepEqual(far.knob, { x: r, y: 0 }, 'clamped to the base');
  assert.deepEqual(far.direction, { x: 1, y: 0 });
  const close = (p: { x: number; y: number }, x: number, y: number) => Math.abs(p.x - x) < 1e-9 && Math.abs(p.y - y) < 1e-9;
  const s = Math.SQRT1_2;
  // screen right = +col -row; screen up = -col -row; screen down-right = +col only (iso: x = (c - r) * 32, y = (c + r) * 16)
  assert.ok(close(screenToGround({ x: 1, y: 0 }), s, -s), 'right');
  assert.ok(close(screenToGround({ x: 0, y: -1 }), -s, -s), 'up');
  assert.ok(close(screenToGround({ x: 0, y: 1 }), s, s), 'down');
  const g = screenToGround({ x: 2, y: 1 });
  assert.ok(close({ x: g.x, y: g.y }, 1, 0), 'along a tile edge (2:1) = one ground axis');
  for (const d of [
    { x: 0.6, y: 0.8 },
    { x: -1, y: 0 },
  ])
    assert.ok(Math.abs(Math.hypot(screenToGround(d).x, screenToGround(d).y) - 1) < 1e-9, 'unit length (full speed)');
});

test('mobile targeting: nearest living monster within 3 tiles; kept while valid; dropped when dead or out of range; a fight wins', () => {
  type M = { id: string };
  const a: M = { id: 'a' };
  const b: M = { id: 'b' };
  const c: M = { id: 'c' };
  const me = { x: 0, y: 0 };
  const list = (pa: number, pb: number, aliveA = true) => [
    { ref: a, position: { x: pa, y: 0 }, alive: aliveA },
    { ref: b, position: { x: 0, y: pb }, alive: true },
    { ref: c, position: { x: 9, y: 9 }, alive: true },
  ];
  assert.equal(TOUCH_TARGET_RANGE, 3);
  assert.equal(chooseTouchTarget<M>(null, null, list(2.5, 1.5), me), b, 'the nearest');
  assert.equal(chooseTouchTarget<M>(a, null, list(2.5, 1.5), me), a, 'the current one stays while valid (no flicker)');
  assert.equal(chooseTouchTarget<M>(a, null, list(3.2, 1.5), me), b, 'out of range: dropped, the nearest taken');
  assert.equal(chooseTouchTarget<M>(a, null, list(1, 2, false), me), b, 'dead: dropped');
  assert.equal(chooseTouchTarget<M>(null, null, list(4, 5), me), null, 'none within 3 tiles');
  assert.equal(chooseTouchTarget<M>(b, c, list(1, 1), me), c, 'the monster being fought, even beyond 3 tiles');
  assert.equal(chooseTouchTarget<M>(null, a, list(1, 1, false), me), b, 'a dead fight target is not kept');
});

test('target HUD: top-centre, between the status block and the minimap; a green bar without numbers', () => {
  const L = targetHudLayout(GAME_WIDTH);
  assert.equal(L.centerX, GAME_WIDTH / 2);
  assert.equal(L.bar.x + L.bar.width / 2, GAME_WIDTH / 2);
  assert.ok(L.frame.x - 8 > 245 && L.frame.x + L.frame.width + 8 < 785, 'clear of the status block and the minimap');
  assert.ok(L.frame.y + L.frame.height < 0.215 * GAME_HEIGHT, 'above the tutorial banners');
  assert.equal(hpFillWidth(24, 24, 220), 220);
  assert.equal(hpFillWidth(12, 24, 220), 110);
  assert.equal(hpFillWidth(0.1, 500, 220), 1, 'a sliver while alive');
  assert.equal(hpFillWidth(0, 24, 220), 0);
  const src = read('src/ui/touch/TargetHud.ts') + read('src/ui/touch/TargetHudLayout.ts');
  assert.match(src, /HUD_GREEN/);
  assert.doesNotMatch(src, /hp\}\s*\/|\$\{target\.hp\}|maxHp\}/, 'no HP numbers are written');
});

test('mobile HUD: the AUTO button right under the map name, right-aligned with the minimap; the hotbar row hidden only on mobile', () => {
  assert.deepEqual(touchAutoButtonRect(947, 131), { x: 903, y: 131, width: 44, height: 37 });
  const hud = read('src/ui/hud/DungeonHud.ts');
  assert.match(hud, /if \(options\.touch\) \{[\s\S]*?for \(const o of this\.hotbarParts\)[\s\S]*?setVisible\(false\)[\s\S]*?disableInteractive\(\)/);
  assert.match(hud, /refreshHotbar\(\): void \{\n\s+if \(this\.options\.touch\) return;/);
  assert.match(hud, /\} else this\.belowMinimap = \{ right: mapFrame\.x \+ mapFrame\.width, top: belowMapName \};/, 'desktop: unchanged');
  assert.ok(BANNER_ICONS.joystick.every((row) => row.length <= 11), 'the joystick hint icon fits the icon slot');
});

test('touch wording: the tutorials say tap / the HP and SP buttons on mobile, and keep the mouse and keys on desktop', () => {
  initLanguage(null);
  const keys = ['hints.clickToMove', 'potionTutorial.assignHotkey', 'potionTutorial.qSlot', 'levelTutorial.assign', 'navigateTutorial.click', 'dialogues.roland_potion_hotkey.l1', 'autoPlay.start', 'hud.menuInventory'];
  for (const lang of ['th', 'en'] as const) {
    setLanguage(lang);
    setTouchWording(false);
    const desktop = keys.map((k) => translate(k));
    setTouchWording(true);
    const touch = keys.map((k) => translate(k));
    setTouchWording(false);
    keys.forEach((k, i) => assert.notEqual(touch[i], desktop[i], `${lang} ${k}: a touch version`));
    for (const s of touch) assert.doesNotMatch(s, /\((?:I|K|T|P|X)\)|[Cc]lick|คลิก|ปุ่ม [QW]\b|on Q\b|on W\b/, `${lang}: "${s}" names no mouse or key`);
    // keys without a touch version are unchanged
    setTouchWording(true);
    assert.equal(translate('death.title'), (setTouchWording(false), translate('death.title')));
  }
  setLanguage('th');
  assert.equal(translate('orientation.rotate'), 'กรุณาหมุนหน้าจอเป็นแนวนอนเพื่อเล่นเกม');
  setLanguage('en');
  assert.match(translate('orientation.rotate'), /rotate your device to landscape/);
  setLanguage('th');
  assert.deepEqual(findMissingTranslations(), { th: [], en: [] });
});

test('mobile wiring: decided once, landscape before the game exists, several fingers, page CSS only for html.touch; desktop paths untouched', () => {
  const main = read('src/main.ts');
  assert.ok(main.indexOf('initDeviceMode()') < main.indexOf('new Phaser.Game'), 'the mode is decided before the game');
  assert.ok(main.indexOf('await gate.waitForLandscape()') < main.indexOf('new Phaser.Game'), 'the game is created in landscape only');
  assert.match(main, /if \(gate\) attachTouchGame\(game, gate\);/);
  const page = read('src/platform/TouchPage.ts');
  assert.match(page, /if \(portrait\) \{\n\s+game\.pause\(\);/);
  assert.match(page, /game\.resume\(\);/);
  assert.match(read('src/config/GameConfig.ts'), /input: \{ activePointers: options\.touch \? 4 : 1 \}/);
  const html = read('index.html');
  assert.match(html, /user-scalable=no, viewport-fit=cover/);
  assert.match(html, /html\.touch #game-container \{[\s\S]*?env\(safe-area-inset-top, 0px\)/);
  assert.match(html, /html\.touch,\n\s+html\.touch body \{\n\s+touch-action: none;/);
  const ui = read('src/scenes/GameUIScene.ts');
  assert.match(ui, /if \(this\.touch\) this\.createTouchControls\(character\);/);
  assert.match(ui, /this\.touch \? 'joystick' : 'mouse'/);
  assert.match(ui, /\(this\.touchControls \?\? this\.hud\)\?\.potionZones\[flash\]/, 'the potion spotlight finds the HP button on mobile');
  assert.match(ui, /this\.game\.events\.on\(Phaser\.Core\.Events\.PAUSE, release\)/, 'the joystick lets go when the game pauses');
  const game = read('src/scenes/GameScene.ts');
  assert.match(game, /if \(this\.touch\) this\.updateTouch\(alive\);/);
  assert.match(game, /if \(this\.touch\) \{\n\s+const m = this\.touchSelection;\n\s+if \(!m \|\| !m\.isAlive\(\)\) notify\('notifications\.noTarget'\);/, 'a target skill goes off on the selected monster');
  assert.match(game, /this\.combat\.attack\(m\);\n\s+return true;/, 'the sword uses the normal attack');
  const player = read('src/player/PlayerController.ts');
  assert.match(player, /const moved = this\.steering \? this\.steerStep\(deltaMs\) : this\.path\.length > 0 && this\.followPath\(deltaMs\);/);
  // the touch controls use the hotbar's own icons, quantities and cooldown sweep (no new potion art)
  const controls = read('src/ui/touch/TouchControls.ts');
  assert.match(controls, /entryIcon\(e\)/);
  assert.match(controls, /remainingWedge\(/);
  assert.match(controls, /HotbarService\.potions\(c\)/);
  assert.doesNotMatch(controls, /\.png'/, 'no new image assets');
});
