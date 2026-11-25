import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { clampUiScale, HUD_SPACE, layerSpace, UI_SCALE, uiZooms, WINDOW_SPACE } from '../src/ui/layout/UiScale';
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
const SCALES = Array.from({ length: (UI_SCALE.max - UI_SCALE.min) / UI_SCALE.step + 1 }, (_, i) => UI_SCALE.min + i * UI_SCALE.step);

test('UI scale: 100-150 % in steps of 5, 100 by default; anything else is snapped or replaced', () => {
  assert.deepEqual(UI_SCALE, { min: 100, max: 150, step: 5, default: 100 });
  assert.equal(SCALES.length, 11);
  assert.equal(clampUiScale(125), 125);
  assert.equal(clampUiScale(127), 125);
  assert.equal(clampUiScale(128), 130);
  assert.equal(clampUiScale(90), 100);
  assert.equal(clampUiScale(400), 150);
  for (const bad of [undefined, null, 'big', NaN, Infinity]) assert.equal(clampUiScale(bad), 100);
});

test('UI scale: 100 % is the UI as it was; each layer zooms by the scale as far as its layout still fits the view', () => {
  for (const v of VIEWS) {
    const z1 = uiZooms(v, 100, v.touch);
    assert.deepEqual([z1.hud, z1.windows], [1, 1], `${v.label}: 100 % = zoom 1`);
    for (const s of SCALES) {
      const z = uiZooms(v, s, v.touch);
      assert.ok(z.hud >= 1 && z.hud <= s / 100 + 1e-9 && z.windows >= 1 && z.windows <= s / 100 + 1e-9, `${v.label} ${s}%: never more than chosen, never below 1`);
      const hud = layerSpace(v, z.hud);
      const win = layerSpace(v, z.windows);
      const room = v.touch ? HUD_SPACE.touch : HUD_SPACE.desktop;
      assert.ok(hud.width >= room.width && hud.height >= room.height, `${v.label} ${s}%: the HUD has ${hud.width} x ${hud.height}`);
      assert.ok(win.width >= WINDOW_SPACE.width && win.height >= WINDOW_SPACE.height, `${v.label} ${s}%: the windows have ${win.width} x ${win.height}`);
      assert.ok(z.hudLimit >= 100 && z.hudLimit <= 150 && z.hudLimit % 5 === 0);
    }
  }
  // a common desktop window (1920 x 1080 -> 960 x 540): the HUD gets the full 150 %, the windows as much as fits
  const fhd = desktopGameSize(1920, 1080);
  const z = uiZooms(fhd, 150);
  assert.equal(z.hud, 1.5);
  assert.ok(z.windows > 1.2 && z.windows < 1.5);
  assert.equal(z.hudLimit, 150);
  // a squat mobile view: the touch HUD needs more room, so it stops earlier (the Settings row says so)
  assert.equal(uiZooms(mobileGameSize(740, 360), 150, true).hudLimit, 120);
});

test('UI scale: every window and the HUD stay inside the view at every scale', () => {
  for (const v of VIEWS) {
    for (const s of [100, 125, 150]) {
      const z = uiZooms(v, s, v.touch);
      const win = layerSpace(v, z.windows);
      assert.ok(inside(inventoryLayout(win.width, win.height).window, win), `${v.label} ${s}%: Inventory`);
      assert.ok(inside(statusLayout(win.width, win.height).window, win), `${v.label} ${s}%: Status`);
      assert.ok(inside(skillWindowLayout(win.width, win.height, 2).window, win), `${v.label} ${s}%: Skills`);
      assert.ok(inside(autoPlayLayout(win.width, win.height, 4).window, win) || (AUTO_WINDOW.width <= win.width && AUTO_WINDOW.height <= win.height), `${v.label} ${s}%: Auto Play`);
      assert.ok(inside(hotbarAssignLayout(win.width, win.height).window, win), `${v.label} ${s}%: Assign Hotkey`);
      assert.ok(TREE_UI.window[2] <= win.width && TREE_UI.window[3] <= win.height, `${v.label} ${s}%: Passive Tree`);
      // the HUD: its layers, the minimap, the menu and the hotbar row on the screen
      const hud = layerSpace(v, z.hud);
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

test('UI scale setting: saved with the language, survives a reload, a language change keeps it; bad records fall back to 100', () => {
  const store = memory();
  assert.equal(loadSettings(store).uiScale, 100, 'nothing saved yet');
  saveSettings({ language: 'en', uiScale: 135 }, store);
  assert.deepEqual(loadSettings(store), { language: 'en', uiScale: 135 });
  store.data.set('xenoblight.settings.v1', JSON.stringify({ version: 1, language: 'th', uiScale: 'huge' }));
  assert.equal(loadSettings(store).uiScale, 100);
  store.data.set('xenoblight.settings.v1', JSON.stringify({ version: 1, language: 'th' }));
  assert.equal(loadSettings(store).uiScale, 100, 'older records');

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
  assert.match(ui, /uiScale: \{ value: \(\) => getUiScale\(\), set: \(percent\) => setUiScale\(percent\), limit: \(\) => this\.zooms\.hudLimit \}/);
  assert.ok(ui.indexOf('installUiLayers(this, this.zooms);') < ui.indexOf('this.hud = new DungeonHud('), 'the layers exist before any layout reads them');
  assert.match(ui, /const offScale = onUiScaleChange\(relayout\);/, 'a new scale rebuilds the UI at once');
  assert.match(ui, /const \{ x, y \} = pointerIn\(this, o, pointer\);/, 'the world is not clicked through scaled UI');
  const layers = read('src/ui/layout/UiLayers.ts');
  assert.match(layers, /o\.cameraFilter = \(ids\.hud \| ids\.windows \| ids\.screen\) & ~ids\[layer\];/);
  assert.match(layers, /if \(o\.style\.resolution !== zoom\) o\.setResolution\(zoom\);/, 'text stays sharp when scaled');
  assert.match(layers, /scene\.events\.on\(Phaser\.Scenes\.Events\.PRE_RENDER, assign\);/, 'assigned before every frame is drawn');
  // the world scene is never touched: no zoom, no UI layers
  assert.doesNotMatch(read('src/scenes/GameScene.ts'), /installUiLayers|setZoom\(/);
  for (const f of ['src/ui/inventory/InventoryWindow.ts', 'src/ui/StatusWindow.ts', 'src/ui/skills/SkillWindow.ts', 'src/ui/passiveTree/PassiveTreeWindow.ts', 'src/ui/autoplay/AutoPlayWindow.ts', 'src/ui/dialogue/DialogueWindow.ts', 'src/ui/death/DeathOverlay.ts', 'src/ui/ChoiceDialog.ts', 'src/ui/SettingsWindow.ts', 'src/ui/hotbar/HotbarAssignWindow.ts']) {
    assert.match(read(f), /uiView\(scene, 'windows'\)/, `${f}: laid out in the window layer's room`);
  }
  assert.match(read('src/ui/hud/DungeonHud.ts'), /const view = uiView\(scene, 'hud'\);/);
  assert.match(read('src/ui/tutorial/SpotlightOverlay.ts'), /throughCamera\(\{ x: b\.x, y: b\.y, width: b\.width, height: b\.height \}, cameraOf\(scene, object\)\)/);
  // desktop: the window's size is followed
  assert.match(read('src/main.ts'), /else attachDesktopViewport\(game\);/);
  assert.match(read('src/platform/DesktopViewport.ts'), /game\.scale\.setGameSize\(next\.width, next\.height\)/);
});
