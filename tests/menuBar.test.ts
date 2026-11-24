import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { HudSpace, MENU_SLOT, REF_ELEMENTS } from '../src/ui/hud/HudLayout';
import { GEAR_ICON, MENU_BAR, menuSlotLefts, MORE_ICON } from '../src/ui/hud/MenuBarArt';

test('menu bar: 6 slots centred in the bar, equal gaps between them and to both ends', () => {
  const lefts = menuSlotLefts();
  assert.equal(lefts.length, 6);
  const rights = lefts.map((l) => l + MENU_BAR.slotWidth - 1);
  const gaps = [lefts[0] - MENU_BAR.innerLeft, ...lefts.slice(1).map((l, i) => l - rights[i] - 1), MENU_BAR.innerLeft + MENU_BAR.innerWidth - 1 - rights[5]];
  assert.deepEqual(gaps, [7, 7, 7, 7, 7, 7, 7]);
});

test('menu bar: on screen every slot is a 19 x 15 frame, one row, evenly spaced; slots map to ordered buttons', () => {
  const space = new HudSpace(960, 480);
  const frames = REF_ELEMENTS.menuSlots.map((r) => space.frame('03_map_and_menu', r));
  for (const f of frames) assert.deepEqual([f.width, f.height, f.y], [19, 15, frames[0].y]);
  for (let i = 1; i < frames.length; i++) assert.equal(frames[i].x - frames[i - 1].x, 26);
  assert.deepEqual(Object.values(MENU_SLOT), [0, 1, 2, 3, 4, 5]);
  assert.equal(MENU_SLOT.settings, 5, 'Settings is the last slot');
});

test('icons: the three-bar placeholder sits inside its slot; the gear is symmetric with a hole and fits the slot', () => {
  for (const r of MORE_ICON.rows) assert.ok(r > 1 && r < 14);
  assert.ok(MORE_ICON.toCol < MENU_BAR.slotWidth - 1);
  assert.ok(GEAR_ICON.every((row) => row.length === 11) && GEAR_ICON.length === 11);
  assert.deepEqual([...GEAR_ICON].reverse(), [...GEAR_ICON], 'top / bottom symmetric');
  assert.ok(GEAR_ICON.every((row) => [...row].reverse().join('') === row), 'left / right symmetric');
  assert.equal(GEAR_ICON[5][5], '.', 'a hole in the middle');
});

test('wiring: slot 5 is drawn art only (no button); Settings opens from the gear in slot 6', () => {
  const hud = fs.readFileSync(path.join(process.cwd(), 'src/ui/hud/DungeonHud.ts'), 'utf8');
  assert.ok(!hud.includes('menuMore'));
  assert.ok(!/buildMenuButton\([^;]*MENU_SLOT\.more/.test(hud), 'the placeholder has no click');
  assert.match(hud, /menuSlots\[MENU_SLOT\.settings\]\), 'hud\.menuSettings', \(\) => this\.options\.onSettings\(\)/);
});
