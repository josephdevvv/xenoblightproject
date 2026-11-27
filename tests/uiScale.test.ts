import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { clampUiScale, DEFAULT_UI_SCALE, defaultUiScale, HUD_SPACE, layerSpace, UI_SCALE, uiZooms, WINDOW_SPACE } from '../src/ui/layout/UiScale';
import { initDeviceMode } from '../src/platform/DeviceMode';
import { desktopGameSize, mobileGameSize } from '../src/platform/MobileViewport';
import { inventoryLayout } from '../src/ui/inventory/InventoryLayout';
import { statusLayout } from '../src/ui/status/StatusLayout';
import { skillWindowLayout } from '../src/ui/skills/SkillWindowLayout';
import { autoPlayLayout, AUTO_WINDOW } from '../src/ui/autoplay/AutoPlayLayout';
import { hotbarAssignLayout } from '../src/ui/hotbar/HotbarAssignLayout';
import { TREE_UI } from '../src/ui/passiveTree/PassiveTreeLayout';
import { HudSpace, REF_ELEMENTS, HUD_LAYERS } from '../src/ui/hud/HudLayout';
import { hotbarLayout } from '../src/ui/hud/HotbarLayout';
import { loadSettings, saveSettings, type SettingsStorage } from '../src/settings/SettingsStore';
import { getUiScale, onUiScaleChange, setUiScale, useUiScaleStorage } from '../src/settings/UiScaleSetting';
import { getLanguage, initLanguage, setLanguage } from '../src/i18n';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/config/constants';

const read = (f: string): string => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const memory = (): SettingsStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};
type R = readonly [number, number, number, number];
const inside = (r: R, space: { width: number; height: number }): boolean => r[0] >= 0 && r[1] >= 0 && r[0] + r[2] <= space.width && r[1] + r[3] <= space.height;

/** Desktop windows of common sizes, a few odd ones, and mobile screens - as game views. */
const VIEWS = [
  ...[
    [1920, 969],
    [1920, 1080],
    [1366, 768],
    [1280, 720],
    [2560, 1080],
    [1280, 1024],
    [3840, 2160],
    [800, 400],
    [1000, 1200],
  ].map(([w, h]) => ({ ...desktopGameSize(w, h), touch: false, label: `desktop ${w}x${h}` })),
  ...[
    [740, 360],
    [932, 430],
    [667, 375],
    [1024, 768],
  ].map(([w, h]) => ({ ...mobileGameSize(w, h), touch: true, label: `mobile ${w}x${h}` })),
];
/** 100-150 in steps, and well beyond (there is no upper limit). */
const SCALES = [...Array.from({ length: 11 }, (_, i) => UI_SCALE.min + i * UI_SCALE.step), 175, 200, 250, 300];

test('UI scale: from 100 % in steps of 5, 100 by default, no upper limit; anything else is snapped or replaced', () => {
  assert.deepEqual(UI_SCALE, { min: 100, step: 5, default: 100 });
  assert.equal(clampUiScale(125), 125);
  assert.equal(clampUiScale(127), 125);
  assert.equal(clampUiScale(128), 130);
  assert.equal(clampUiScale(90), 100);
  assert.equal(clampUiScale(400), 400, 'no maximum');
  assert.equal(clampUiScale(1003), 1005, 'no hidden clamp - only the step');
  for (const bad of [undefined, null, 'big', NaN, Infinity]) assert.equal(clampUiScale(bad), 100);
});

test('UI scale: 100 % is the UI as it was; the HUD zooms by exactly the chosen scale; windows as far as a full-size one fits', () => {
  for (const v of VIEWS) {
    const z1 = uiZooms(v, 100);
    assert.deepEqual([z1.hud, z1.windows], [1, 1], `${v.label}: 100 % = zoom 1`);
    const room = v.touch ? HUD_SPACE.touch : HUD_SPACE.desktop;
    const hud100 = layerSpace(v, 1);
    assert.ok(hud100.width >= room.width && hud100.height >= room.height, `${v.label}: at the default 100 % the HUD's pieces all fit side by side`);
    for (const s of SCALES) {
      const z = uiZooms(v, s);
      assert.equal(z.hud, s / 100, `${v.label} ${s}%: the HUD takes the chosen scale - no clamp`);
      assert.ok(z.windows >= 1 && z.windows <= s / 100 + 1e-9, `${v.label} ${s}%: windows never more than chosen`);
      const win = layerSpace(v, z.windows);
      assert.ok(win.width >= WINDOW_SPACE.width && win.height >= WINDOW_SPACE.height, `${v.label} ${s}%: the windows have ${win.width} x ${win.height}`);
      assert.ok(z.windowsLimit >= 100 && z.windowsLimit % 5 === 0);
      if (s <= z.windowsLimit) assert.equal(z.windows, s / 100, `${v.label} ${s}%: windows take the scale while they fit`);
    }
  }
  // a common desktop window (1920 x 1080 -> 960 x 540): the HUD gets the full scale, the windows as much as fits
  const z = uiZooms(desktopGameSize(1920, 1080), 150);
  assert.equal(z.hud, 1.5);
  assert.ok(z.windows > 1.2 && z.windows < 1.5);
  assert.equal(z.windowsLimit, 125);
  assert.equal(uiZooms(mobileGameSize(740, 360), 200).hud, 2, 'mobile too: no cap');
});

test('UI scale: every window stays inside the view at every scale; the HUD wherever its pieces have their room', () => {
  for (const v of VIEWS) {
    for (const s of SCALES) {
      const z = uiZooms(v, s);
      const win = layerSpace(v, z.windows);
      assert.ok(inside(inventoryLayout(win.width, win.height).window, win), `${v.label} ${s}%: Inventory`);
      assert.ok(inside(statusLayout(win.width, win.height).window, win), `${v.label} ${s}%: Status`);
      assert.ok(inside(skillWindowLayout(win.width, win.height, 2).window, win), `${v.label} ${s}%: Skills`);
      assert.ok(inside(autoPlayLayout(win.width, win.height, 4).window, win) || (AUTO_WINDOW.width <= win.width && AUTO_WINDOW.height <= win.height), `${v.label} ${s}%: Auto Play`);
      assert.ok(inside(hotbarAssignLayout(win.width, win.height).window, win), `${v.label} ${s}%: Assign Hotkey`);
      assert.ok(TREE_UI.window[2] <= win.width && TREE_UI.window[3] <= win.height, `${v.label} ${s}%: Passive Tree`);
      // the HUD: its layers, the minimap and the hotbar row on the screen while it has the room it needs
      const hud = layerSpace(v, z.hud);
      const room = v.touch ? HUD_SPACE.touch : HUD_SPACE.desktop;
      if (hud.width < room.width || hud.height < room.height) continue;
      const space = new HudSpace(hud.width, hud.height);
      for (const l of HUD_LAYERS.filter((x) => x.id !== '04_chat' && x.id !== '05_hotbar')) {
        const id = l.id as Parameters<HudSpace['x']>[0];
        const r: R = [space.x(id, l.refX), space.y(id, l.refY), l.width, l.height];
        assert.ok(inside(r, hud), `${v.label} ${s}%: HUD layer ${l.id}`);
      }
      const map = space.frame('03_map_and_menu', REF_ELEMENTS.minimap);
      assert.ok(inside([map.x, map.y, map.width, map.height], hud), `${v.label} ${s}%: minimap`);
      const row = hotbarLayout(hud.width, space.frame('05_hotbar', REF_ELEMENTS.hotbarSlots[0]).y);
      const last = row.autoButton;
      assert.ok(row.slots[0].x >= 0 && last.x + last.width <= hud.width, `${v.label} ${s}%: hotbar row`);
    }
  }
});

test('desktop resolution: the game fills the browser window at the world scale it always had, never smaller than 960 x 480', () => {
  assert.deepEqual(desktopGameSize(1920, 1080), { width: 960, height: 540 });
  assert.deepEqual(desktopGameSize(1920, 960), { width: 960, height: 480 }, 'the old 2:1 shape: unchanged');
  assert.deepEqual(desktopGameSize(2560, 1080), { width: 1138, height: 480 }, 'ultrawide: more world to the sides');
  assert.deepEqual(desktopGameSize(1280, 1024), { width: 960, height: 768 });
  assert.deepEqual(desktopGameSize(0, 0), { width: GAME_WIDTH, height: GAME_HEIGHT });
  for (const [w, h] of [
    [1920, 969],
    [1366, 768],
    [1440, 900],
    [1000, 1200],
    [3840, 2160],
    [700, 500],
  ]) {
    const g = desktopGameSize(w, h);
    // ENVELOP covers the window: the world scale (window px per game px) is FIT's old one, and less than one game
    // pixel in all is cut instead of a bar
    const k = Math.max(w / g.width, h / g.height);
    assert.ok(Math.abs(k - Math.min(w / GAME_WIDTH, h / GAME_HEIGHT)) < 0.01, `${w}x${h}: same world scale`);
    assert.ok((g.width * k - w) / k < 1 && (g.height * k - h) / k < 1, `${w}x${h}: no black bars - under one game pixel cut`);
    assert.ok(g.width >= GAME_WIDTH && g.height >= GAME_HEIGHT);
  }
});

test('UI scale setting: saved with the language, survives a reload, a language change keeps it; bad records = never chosen', () => {
  const store = memory();
  assert.equal(loadSettings(store).uiScale, null, 'nothing saved yet: the platform default');
  saveSettings({ language: 'en', uiScale: 135 }, store);
  assert.deepEqual(loadSettings(store), { language: 'en', uiScale: 135 });
  saveSettings({ language: 'en', uiScale: 100 }, store);
  assert.equal(loadSettings(store).uiScale, 100, 'a chosen 100 stays 100 (also on mobile)');
  saveSettings({ language: 'en', uiScale: null }, store);
  assert.ok(!('uiScale' in JSON.parse(store.data.get('xenoblight.settings.v1')!)), 'never chosen: nothing written');
  store.data.set('xenoblight.settings.v1', JSON.stringify({ version: 1, language: 'th', uiScale: 'huge' }));
  assert.equal(loadSettings(store).uiScale, null);
  store.data.set('xenoblight.settings.v1', JSON.stringify({ version: 1, language: 'th' }));
  assert.equal(loadSettings(store).uiScale, null, 'older records');
  store.data.set('xenoblight.settings.v1', JSON.stringify({ version: 1, language: 'th', uiScale: 100 }));
  assert.equal(loadSettings(store).uiScale, null, 'version 1 wrote the old default 100 with every save: not a choice');
  store.data.set('xenoblight.settings.v1', JSON.stringify({ version: 1, language: 'th', uiScale: 135 }));
  assert.equal(loadSettings(store).uiScale, 135, 'a custom version 1 scale is kept');

  const s2 = memory();
  useUiScaleStorage(s2);
  const heard: number[] = [];
  const off = onUiScaleChange((p) => heard.push(p));
  assert.equal(getUiScale(), 100);
  assert.equal(setUiScale(118), 120, 'snapped to a step');
  assert.equal(setUiScale(120), 120, 'no change: nothing announced');
  off();
  assert.deepEqual(heard, [120]);
  assert.equal(loadSettings(s2).uiScale, 120, 'saved');
  useUiScaleStorage(s2);
  assert.equal(getUiScale(), 120, 'read back after a reload');
  // changing the language saves the settings again - the UI scale stays
  initLanguage(s2);
  setLanguage(getLanguage() === 'th' ? 'en' : 'th');
  assert.equal(loadSettings(s2).uiScale, 120);
  setLanguage('th');
  useUiScaleStorage(null);
});

test('UI scale wiring: in-game Settings only; two zoomed UI cameras + a screen camera; layouts, pointer and spotlight per layer', () => {
  const settings = read('src/ui/SettingsWindow.ts');
  assert.match(settings, /uiScale\?: \{ value: \(\) => number; set: \(percent: number\) => void; limit: \(\) => number \};/);
  assert.match(settings, /if \(uiScale\) \{/, 'the row exists only when the in-game UI passes it');
  for (const f of ['src/scenes/MainMenuScene.ts', 'src/scenes/CharacterCreationScene.ts']) assert.doesNotMatch(read(f), /uiScale/, `${f}: no UI Scale`);
  const ui = read('src/scenes/GameUIScene.ts');
  assert.match(ui, /uiScale: \{ value: \(\) => getUiScale\(\), set: \(percent\) => setUiScale\(percent\), limit: \(\) => this\.zooms\.windowsLimit \}/);
  assert.ok(ui.indexOf('installUiLayers(this, this.zooms);') < ui.indexOf('this.hud = new DungeonHud('), 'the layers exist before any layout reads them');
  assert.match(ui, /const offScale = onUiScaleChange\(relayout\);/, 'a new scale rebuilds the UI at once');
  assert.match(ui, /const \{ x, y \} = pointerIn\(this, o, pointer\);/, 'the world is not clicked through scaled UI');
  const layers = read('src/ui/layout/UiLayers.ts');
  assert.match(layers, /o\.cameraFilter = \(ids\.hud \| ids\.windows \| ids\.screen\) & ~ids\[layer\];/);
  assert.match(layers, /const resolution = \(o\.getData\(TEXT_RESOLUTION_KEY\) as number \| undefined\) \?\? zoom;\s*if \(o\.style\.resolution !== resolution\) o\.setResolution\(resolution\);/, 'text stays sharp when scaled (its layer\'s zoom, or its own scale)');
  assert.match(layers, /scene\.events\.on\(Phaser\.Scenes\.Events\.PRE_RENDER, assign\);/, 'assigned before every frame is drawn');
  // the world scene is never touched: no zoom, no UI layers
  assert.doesNotMatch(read('src/scenes/GameScene.ts'), /installUiLayers|setZoom\(/);
  for (const f of ['src/ui/inventory/InventoryWindow.ts', 'src/ui/StatusWindow.ts', 'src/ui/skills/SkillWindow.ts', 'src/ui/passiveTree/PassiveTreeWindow.ts', 'src/ui/autoplay/AutoPlayWindow.ts', 'src/ui/dialogue/DialogueWindow.ts', 'src/ui/ChoiceDialog.ts', 'src/ui/SettingsWindow.ts', 'src/ui/hotbar/HotbarAssignWindow.ts']) {
    assert.match(read(f), /uiView\(scene, 'windows'\)/, `${f}: laid out in the window layer's room`);
  }
  assert.match(read('src/ui/hud/DungeonHud.ts'), /const view = uiView\(scene, 'hud'\);/);
  assert.match(read('src/ui/tutorial/SpotlightOverlay.ts'), /throughCamera\(\{ x: b\.x, y: b\.y, width: b\.width, height: b\.height \}, cameraOf\(scene, object\)\)/);
  // desktop: the window's size is followed
  assert.match(read('src/main.ts'), /else attachDesktopViewport\(game\);/);
  assert.match(read('src/platform/DesktopViewport.ts'), /game\.scale\.setGameSize\(next\.width, next\.height\)/);
});

test('UI scale default by platform: mobile 120 %, desktop 100 %, until the player picks one - a saved choice wins', () => {
  assert.deepEqual(DEFAULT_UI_SCALE, { desktop: 100, touch: 120 });
  assert.deepEqual([defaultUiScale(false), defaultUiScale(true)], [100, 120]);
  const env = (mobile: boolean) => ({ search: mobile ? '?mobile=1' : '?mobile=0', maxTouchPoints: 0, coarsePointer: false, userAgent: '' });
  try {
    for (const [mobile, want] of [[false, 100], [true, 120]] as const) {
      initDeviceMode(env(mobile));
      const store = memory();
      useUiScaleStorage(store);
      assert.equal(getUiScale(), want, `${mobile ? 'mobile' : 'desktop'}: default`);
      // a language change saves the settings - the scale stays unchosen (still the platform default)
      initLanguage(store);
      setLanguage('en');
      useUiScaleStorage(store);
      assert.equal(getUiScale(), want);
      setLanguage('th');
      // old version 1 record (100 written automatically): the platform default
      store.data.set('xenoblight.settings.v1', JSON.stringify({ version: 1, language: 'th', uiScale: 100 }));
      useUiScaleStorage(store);
      assert.equal(getUiScale(), want);
      // the player's choice is kept, whatever the platform
      for (const chosen of [100, 110, 135, 200]) {
        useUiScaleStorage(store);
        setUiScale(chosen);
        useUiScaleStorage(store);
        assert.equal(getUiScale(), chosen, `${mobile ? 'mobile' : 'desktop'}: chosen ${chosen}`);
      }
    }
  } finally {
    initDeviceMode(env(false));
    useUiScaleStorage(null);
    setLanguage('th');
  }
});

test('mobile default 120 %: every mobile view keeps the HUD pieces their room, windows inside, nothing past the edges', () => {
  for (const v of VIEWS.filter((x) => x.touch)) {
    const z = uiZooms(v, DEFAULT_UI_SCALE.touch);
    assert.equal(z.hud, 1.2);
    const hud = layerSpace(v, z.hud);
    assert.ok(hud.width >= HUD_SPACE.touch.width && hud.height >= HUD_SPACE.touch.height, `${v.label}: HUD room ${hud.width} x ${hud.height}`);
    const win = layerSpace(v, z.windows);
    assert.ok(win.width >= WINDOW_SPACE.width && win.height >= WINDOW_SPACE.height, `${v.label}: windows fit`);
  }
  const ui = read('src/settings/UiScaleSetting.ts');
  assert.match(ui, /\.uiScale \?\? defaultUiScale\(isTouchMode\(\)\)/, 'detected platform, read once at startup');
});
