import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCharacterData } from '../src/data/CharacterData';
import { getDictionary } from '../src/i18n';
import { addItem, createInventory, equipFromBag } from '../src/inventory/InventoryState';
import { CharacterStatusService } from '../src/status/CharacterStatusService';
import { computeDerivedStats, DERIVED_DISPLAY } from '../src/status/DerivedStats';
import { StatAllocationDraft } from '../src/status/StatAllocation';
import { createStatBlock, MAIN_STATS, STATUS_RULES, totalStats } from '../src/status/StatTypes';
import { inventoryLayout } from '../src/ui/inventory/InventoryLayout';
import { isCompleteStatOrder, SECONDARY_COLUMNS, STATUS_STAT_ORDER, statusLayout } from '../src/ui/status/StatusLayout';

type R = readonly [number, number, number, number];
const SCREENS: [number, number][] = [
  [960, 480],
  [1280, 720],
  [1920, 1080],
  [800, 480],
  [760, 420],
];
const overlap = (a: R, b: R): boolean => a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];
const within = (a: R, b: R): boolean => a[0] >= b[0] && a[1] >= b[1] && a[0] + a[2] <= b[0] + b[2] && a[1] + a[3] <= b[1] + b[3];

test('main stats are shown as STR, AGI, VIT, INT, DEX, LUK; the stored order is untouched', () => {
  assert.deepEqual([...STATUS_STAT_ORDER], ['str', 'agi', 'vit', 'int', 'dex', 'luk']);
  assert.deepEqual([...MAIN_STATS], ['str', 'dex', 'int', 'vit', 'agi', 'luk']);
  assert.ok(isCompleteStatOrder(STATUS_STAT_ORDER));
  const rows = statusLayout(960, 480).stats;
  assert.deepEqual(rows.map((r) => r.stat), ['str', 'agi', 'vit', 'int', 'dex', 'luk']);
  rows.forEach((r, i) => i > 0 && assert.ok(r.rect[1] > rows[i - 1].rect[1], 'top to bottom'));
});

test('every derived stat the game has is shown exactly once, and nothing else', () => {
  const shown = SECONDARY_COLUMNS.flatMap((c) => c.flatMap((s) => s.stats));
  assert.deepEqual([...shown].sort(), DERIVED_DISPLAY.map((d) => d.key).sort());
  assert.deepEqual([...shown].sort(), Object.keys(computeDerivedStats(1, createStatBlock(1))).sort());
  assert.equal(new Set(shown).size, shown.length);
  const keys = (l: 'th' | 'en') => Object.keys((getDictionary(l) as unknown as { status: { sections: object } }).status.sections).sort();
  const ids = SECONDARY_COLUMNS.flat().map((s) => s.id).sort();
  assert.deepEqual([keys('th'), keys('en')], [ids, ids]);
});

test('layout on every screen size: whole pixels, inside the window, nothing overlaps', () => {
  for (const [sw, sh] of SCREENS) {
    const l = statusLayout(sw, sh);
    const at = `${sw}x${sh}`;
    assert.ok(within(l.window, [0, 0, sw, sh]), at);
    const frame: R = [0, 0, l.window[2], l.window[3]];
    const blocks: R[] = [l.title, l.points, l.panels.primary, l.panels.secondary, l.footer];
    blocks.forEach((b, i) => {
      assert.ok(within(b, frame), at);
      blocks.slice(i + 1).forEach((o) => assert.equal(overlap(b, o), false, at));
    });
    const { primary, secondary } = l.panels;
    l.stats.forEach((row, i) => {
      assert.ok(within(row.rect, primary) && row.rect[1] >= primary[1] + l.caption.rule, at);
      assert.ok(within(row.plus, row.rect), at);
      assert.ok(row.labelX < row.descriptionRight && row.descriptionRight < row.valueRight && row.valueRight < row.plus[0], at);
      assert.ok(row.rect[2] === l.stats[0].rect[2] && row.rect[3] === l.stats[0].rect[3] && row.plus[0] === l.stats[0].plus[0], 'aligned');
      if (i > 1) assert.equal(row.rect[1] - l.stats[i - 1].rect[1], l.stats[1].rect[1] - l.stats[0].rect[1], 'same spacing');
      l.stats.slice(i + 1).forEach((o) => assert.equal(overlap(row.rect, o.rect), false, at));
    });
    const last = l.stats[l.stats.length - 1].rect;
    assert.ok(last[1] + last[3] <= l.message.y && l.message.y + 14 <= primary[1] + primary[3], `${at} message line`);
    for (const s of l.sections) {
      assert.ok(s.x >= secondary[0] && s.x + s.width <= secondary[0] + secondary[2] && s.captionY >= secondary[1] + l.caption.rule, at);
      assert.ok(s.ruleY > s.captionY && s.rows[0].y > s.ruleY, at);
      s.rows.forEach((r, i) => i > 0 && assert.ok(r.y - s.rows[i - 1].y >= 15, at));
      assert.ok(s.rows[s.rows.length - 1].y + 15 <= secondary[1] + secondary[3], `${at} ${s.id}`);
    }
    const columns = [...new Set(l.sections.map((s) => s.x))].sort((a, b) => a - b);
    assert.equal(columns.length, SECONDARY_COLUMNS.length);
    for (const x of columns) {
      const column = l.sections.filter((s) => s.x === x);
      column.forEach((s, i) => i > 0 && assert.ok(s.captionY >= column[i - 1].rows[column[i - 1].rows.length - 1].y + 15, `${at} sections do not touch`));
    }
    assert.ok(columns[0] + l.sections[0].width < columns[1]);
    const buttons: R[] = Object.values(l.buttons);
    buttons.forEach((b, i) => {
      assert.ok(within(b, l.footer), at);
      buttons.slice(i + 1).forEach((o) => assert.equal(overlap(b, o), false, at));
    });
    for (const r of [l.window, ...blocks, ...buttons, ...l.stats.flatMap((s) => [s.rect, s.plus])]) assert.ok(r.every(Number.isInteger), at);
  }
});

test('same window, title box, footer and close button as the Inventory', () => {
  for (const [sw, sh] of SCREENS) {
    const s = statusLayout(sw, sh);
    const i = inventoryLayout(sw, sh);
    assert.deepEqual([s.window, s.title, s.footer, s.buttons.close], [i.window, i.title, i.footer, i.close], `${sw}x${sh}`);
  }
});

test('allocation rules are unchanged: staged, limited by points and by 99, confirmed once', () => {
  const c = createCharacterData('Alpha', { gender: 'male', hairstyleId: 'mohawk' });
  c.status = { ...c.status, statPoints: 3, base: { ...c.status.base, str: STATUS_RULES.maxBaseStat - 1 } };
  const draft = new StatAllocationDraft(c.status);
  assert.ok(draft.add('str'));
  assert.equal(draft.add('str'), false, 'never above 99');
  assert.ok(draft.add('agi') && draft.add('luk'));
  assert.equal(draft.add('vit'), false, 'no points left');
  assert.deepEqual([draft.selected, draft.remainingAfterConfirm, c.status.base.agi], [3, 0, 1], 'nothing applied before CONFIRM');
  assert.equal(CharacterStatusService.confirmAllocation(c, draft), null);
  assert.deepEqual([c.status.base.str, c.status.base.agi, c.status.base.luk, c.status.statPoints], [99, 2, 2, 0]);
});

test('shown values include equipment: the window reads the same derived stats as combat', () => {
  const c = createCharacterData('Alpha', { gender: 'male', hairstyleId: 'mohawk' });
  const plain = CharacterStatusService.derived(c);
  assert.deepEqual(plain, computeDerivedStats(c.status.level, totalStats(c.status)));
  const added = addItem(createInventory(), 'weapon_rusty_dagger', 1);
  assert.ok(added.ok);
  const worn = equipFromBag(added.state, 0, 'weapon', 1);
  assert.ok(worn.ok);
  c.inventory = worn.state;
  assert.deepEqual(CharacterStatusService.derived(c), { ...plain, meleeAtk: plain.meleeAtk + 4 });
  // the preview of pending points has the same bonus
  assert.equal(CharacterStatusService.previewDerived(c, { ...c.status.base, str: 2 }).meleeAtk, plain.meleeAtk + 4 + 2);
});
