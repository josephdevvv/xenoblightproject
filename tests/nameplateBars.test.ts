import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { barFill, barTop, labelTopUnderBars, stackHeight, stackTop, NAME_INK_TOP, NAMEPLATE_BAR, NAMEPLATE_BAR_COLORS, NAMEPLATE_BAR_HEIGHT, NAMEPLATE_ROWS } from '../src/ui/world/NameplateBars';
import { nameLabelTop } from '../src/ui/world/WorldNameLabel';

test('bar fill: whole pixels, empty at 0, at least 1 px while alive, full only when full', () => {
  const w = NAMEPLATE_BAR.width;
  assert.deepEqual([barFill(0, 100), barFill(-5, 100), barFill(100, 100), barFill(150, 100), barFill(5, 0)], [0, 0, w, w, 0]);
  assert.equal(barFill(1, 1000), 1, 'a sliver while above 0');
  assert.equal(barFill(999, 1000), w - 1, 'never shows full before it is');
  assert.equal(barFill(50, 100), Math.round(w / 2));
  for (let v = 0; v <= 77; v++) assert.ok(Number.isInteger(barFill(v, 77)) && barFill(v, 77) >= barFill(v - 1, 77), `monotonic at ${v}`);
});

test('layout: HP, then SP, then the name - stacked under the ground root, no overlap; HP green, SP blue', () => {
  const root = 200;
  const hp = barTop(root, 0);
  const sp = barTop(root, 1);
  assert.equal(NAMEPLATE_ROWS, 2);
  assert.ok(hp > root && hp < nameLabelTop(root), 'just under the feet - higher than the name used to start');
  assert.equal(sp - hp, NAMEPLATE_BAR_HEIGHT + NAMEPLATE_BAR.gap, 'SP right below HP, same spacing for every bar');
  // the monster's one bar takes the lower row: where the player's SP bar is, next to the name
  const monsterBar = barTop(root, NAMEPLATE_ROWS - 1);
  assert.equal(monsterBar, sp);
  // the name: the same height for everyone; its first visible pixel one gap below the lower bar
  const name = labelTopUnderBars(root);
  const ink = name + NAME_INK_TOP;
  assert.equal(ink - (sp + NAMEPLATE_BAR_HEIGHT), NAMEPLATE_BAR.gap, 'letters 1 px under the bar');
  assert.ok(name + 19 - root < 32, 'the whole block stays compact under the sprite');
  for (const v of [hp, sp, name]) assert.ok(Number.isInteger(v));
  // the player's HP + SP: one block, the fills touching (no gap), ending where the SP bar ends; a monster's single
  // bar exactly on the lower row as before
  assert.equal(stackHeight(2), NAMEPLATE_BAR.fill * 2 + 2);
  assert.equal(stackTop(root, 2) + stackHeight(2), sp + NAMEPLATE_BAR_HEIGHT, 'the block ends where SP ended: the name stays');
  assert.equal(stackTop(root, 1), monsterBar, 'monster bar unchanged');
  assert.equal(stackHeight(1), NAMEPLATE_BAR_HEIGHT);
  assert.equal(barTop(200.6, 0), barTop(201, 0), 'whole pixels from a fractional root');
  const green = NAMEPLATE_BAR_COLORS.hp;
  const blue = NAMEPLATE_BAR_COLORS.sp;
  assert.ok(((green >> 8) & 255) > ((green >> 16) & 255) && ((green >> 8) & 255) > (green & 255), 'HP is green');
  assert.ok((blue & 255) > ((blue >> 16) & 255) && (blue & 255) > ((blue >> 8) & 255), 'SP is blue');
});

test('wiring: the player gets HP + SP bars, monsters an HP bar (always while alive), all through the shared component', () => {
  const read = (f: string): string => fs.readFileSync(path.join(process.cwd(), f), 'utf8');
  assert.match(read('src/ui/GameHud.ts'), /new NameplateBars\(scene, \['hp', 'sp'\]\)/);
  const monster = read('src/monsters/MonsterEntity.ts');
  assert.match(monster, /new NameplateBars\(scene, \['hp'\]\)/);
  assert.ok(!/0xd74a51/.test(monster), 'the old red monster bar is gone');
});
