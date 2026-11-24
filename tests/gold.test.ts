import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { GoldService, MAX_GOLD, sanitizeGold } from '../src/economy/GoldService';
import { MONSTER_DEFINITIONS } from '../src/monsters/MonsterDefinition';
import { monsterGoldReward, MONSTER_GOLD_REWARDS } from '../src/progression/MonsterGoldRewards';
import { checksum, parseSave, serializeSave } from '../src/save/SaveFile';
import { SaveService } from '../src/save/SaveService';
import { formatGold, GOLD_DISPLAY, GOLD_ICON, goldDisplayLayout, goldIconFor } from '../src/ui/hud/GoldIcon';
import { MENU_SLOT } from '../src/ui/hud/HudLayout';
import { readPng } from './helpers/png';
import { newCharacter, saveAndLoad, withoutStorage } from './helpers/session';

test('rewards: Void Mite 1, Mutant Wolf 3, Dark Avian 5 - every monster has one, kept apart from combat stats', () => {
  assert.deepEqual([monsterGoldReward('voidmite'), monsterGoldReward('mutant_wolf'), monsterGoldReward('dark_avian')], [1, 3, 5]);
  for (const id of Object.keys(MONSTER_DEFINITIONS)) assert.ok(id in MONSTER_GOLD_REWARDS, id);
  for (const def of Object.values(MONSTER_DEFINITIONS)) assert.ok(!('gold' in def.combat));
});

test('gold: starts at 0, adds whole amounts, never negative, capped; listeners hear every change', () => {
  withoutStorage(() => {
    const c = newCharacter('Alpha');
    assert.equal(GoldService.get(c), 0);
    const heard: number[] = [];
    const off = GoldService.onChange((x, g) => x === c && heard.push(g));
    for (const id of ['voidmite', 'mutant_wolf', 'dark_avian', 'voidmite'] as const) GoldService.add(c, monsterGoldReward(id));
    assert.deepEqual([GoldService.get(c), heard], [10, [1, 4, 9, 10]]);
    assert.equal(GoldService.add(c, -5), 0);
    assert.equal(GoldService.add(c, Number.NaN), 0);
    assert.equal(GoldService.add(c, 2.9), 2, 'whole Gold only');
    off();
    c.gold = MAX_GOLD - 1;
    assert.equal(GoldService.add(c, 10), 1, 'capped');
    assert.deepEqual([sanitizeGold(-3), sanitizeGold('12'), sanitizeGold(7.8), sanitizeGold(Infinity), sanitizeGold(42)], [0, 0, 7, 0, 42]);
  });
});

test('save / load: Gold is kept; files from before Gold load with 0; edited values are repaired', () => {
  withoutStorage(() => {
    const c = newCharacter('Beta');
    GoldService.add(c, 123);
    assert.equal(GoldService.get(saveAndLoad(c)), 123);
    const doc = JSON.parse(serializeSave(c, null)) as Record<string, unknown>;
    delete doc.checksum;
    const resign = (d: Record<string, unknown>): string => JSON.stringify({ ...d, checksum: checksum(d) });
    const { gold: _drop, ...old } = doc;
    const r1 = parseSave(resign(old));
    assert.ok(r1.ok);
    assert.equal(GoldService.get(SaveService.restore(r1.save)), 0, 'an older file: 0 Gold');
    const r2 = parseSave(resign({ ...doc, gold: -50 }));
    assert.ok(r2.ok);
    assert.equal(r2.save.gold, 0);
    assert.ok(r2.save.repaired.includes('gold'));
  });
});

test('kill credit: Gold comes with the EXP, once per monster life (the same code path)', () => {
  const combat = fs.readFileSync(path.join(process.cwd(), 'src/combat/CombatSystem.ts'), 'utf8');
  const onKill = combat.slice(combat.indexOf('private onKill'), combat.indexOf('showExpGain(exp: number'));
  assert.ok(onKill.indexOf('killRewards.claim') < onKill.indexOf('GoldService.add'), 'paid only after the once-per-life claim');
  assert.match(onKill, /monsterGoldReward\(monster\.definition\.id\)/);
});

test('icon: a 32 x 32 coin and its 16 x 16 reduction - transparent corners, hard pixels, gold; whole-number scales', () => {
  for (const icon of [GOLD_ICON.large, GOLD_ICON.small]) {
    const png = readPng(path.join(process.cwd(), 'public', icon.url));
    assert.deepEqual([png.width, png.height], [icon.size, icon.size]);
    const a = (x: number, y: number): number => png.data[(y * png.width + x) * 4 + 3];
    for (const [x, y] of [[0, 0], [icon.size - 1, 0], [0, icon.size - 1], [icon.size - 1, icon.size - 1]]) assert.equal(a(x, y), 0, 'round');
    for (let i = 3; i < png.data.length; i += 4) assert.ok(png.data[i] === 0 || png.data[i] === 255, 'hard pixels');
    const m = Math.floor(icon.size / 2);
    const i = (m * png.width + m - 6) * 4;
    assert.ok(png.data[i] > png.data[i + 2] + 60, 'gold (warm) on the face');
  }
  assert.deepEqual(goldIconFor(16), { key: GOLD_ICON.small.key, scale: 1 });
  assert.deepEqual(goldIconFor(40), { key: GOLD_ICON.large.key, scale: 1 });
  assert.deepEqual(goldIconFor(64), { key: GOLD_ICON.large.key, scale: 2 });
  assert.deepEqual([formatGold(0), formatGold(1234567), formatGold(-3)], ['0', '1,234,567', '0']);
});

test('HUD menu: Status, Passive Tree, Skills, Inventory keep slots 1-4 in that order', () => {
  assert.deepEqual([MENU_SLOT.status, MENU_SLOT.passive, MENU_SLOT.skills, MENU_SLOT.inventory], [0, 1, 2, 3]);
});

test('display: a 12 x 12 coin (16 px reduced ~20 %) - round, hard pixels, gold; whole pixels, digits centred on it', () => {
  const icon = GOLD_DISPLAY.icon;
  assert.deepEqual([icon.size, icon.key], [12, GOLD_ICON.hud.key]);
  const png = readPng(path.join(process.cwd(), 'public', icon.url));
  assert.deepEqual([png.width, png.height], [12, 12]);
  const at = (x: number, y: number): number => (y * png.width + x) * 4;
  for (const [x, y] of [[0, 0], [11, 0], [0, 11], [11, 11]]) assert.equal(png.data[at(x, y) + 3], 0, 'round');
  for (let i = 3; i < png.data.length; i += 4) assert.ok(png.data[i] === 0 || png.data[i] === 255, 'hard pixels');
  const face = at(3, 8);
  assert.ok(png.data[face] > png.data[face + 2] + 60, 'gold (warm) on the face');
  const L = goldDisplayLayout(240.4, 7, 21);
  assert.equal(L.textRight, 240);
  assert.equal(L.iconX + icon.size + GOLD_DISPLAY.gap + 21, L.textRight, 'coin, gap, amount');
  const inkTop = L.textY + GOLD_DISPLAY.digitInkTop;
  const above = inkTop - L.iconY;
  const below = L.iconY + icon.size - (inkTop + GOLD_DISPLAY.digitInkHeight);
  assert.ok(Math.abs(above - below) <= 1, 'digits centred on the coin');
  for (const v of Object.values(L)) assert.ok(Number.isInteger(v));
});

test('display: the HUD and the Inventory header share one display, fed from GoldService on every change', () => {
  const read = (f: string): string => fs.readFileSync(path.join(process.cwd(), f), 'utf8');
  assert.match(read('src/ui/hud/DungeonHud.ts'), /new GoldDisplay\(/);
  assert.match(read('src/ui/inventory/InventoryWindow.ts'), /new GoldDisplay\(/);
  const ui = read('src/scenes/GameUIScene.ts');
  assert.match(ui, /GoldService\.onChange\(\(c, gold\) => \{\s*if \(c === character\) inventoryWindow\.setGold\(gold\);/);
  assert.match(ui, /inventoryWindow\.setGold\(GoldService\.get\(character\)\)/);
  assert.match(read('src/scenes/GameScene.ts'), /GOLD_ICON\.hud\]/, 'the 12-px coin is loaded');
});
