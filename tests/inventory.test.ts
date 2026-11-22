import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EMPTY_INVENTORY, EQUIPMENT_SLOTS, INVENTORY_GRID, INVENTORY_SLOT_COUNT, isValidSlot, sameSlot, SlotSelection, type SlotRef } from '../src/inventory/InventorySlots';
import { getDictionary } from '../src/i18n';
import { iconScale, inventoryLayout, SILHOUETTE_GRID, type InventoryLayout } from '../src/ui/inventory/InventoryLayout';
import { GLYPH_SIZE, SLOT_GLYPHS } from '../src/ui/inventory/inventoryTheme';

type R = readonly [number, number, number, number];
const SCREENS: [number, number][] = [
  [960, 480],
  [1280, 720],
  [1920, 1080],
  [800, 480],
  [720, 400],
];
const overlap = (a: R, b: R): boolean => a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];
const within = (a: R, b: R): boolean => a[0] >= b[0] && a[1] >= b[1] && a[0] + a[2] <= b[0] + b[2] && a[1] + a[3] <= b[1] + b[3];
const equipmentRects = (l: InventoryLayout): R[] => EQUIPMENT_SLOTS.map((id) => l.equipment[id]);

test('exactly five equipment slots: weapon, hat, armor, shoes, charm - each with a name, a place and a mark', () => {
  assert.deepEqual([...EQUIPMENT_SLOTS], ['weapon', 'hat', 'armor', 'shoes', 'charm']);
  assert.deepEqual(Object.keys(inventoryLayout(960, 480).equipment).sort(), [...EQUIPMENT_SLOTS].sort());
  for (const language of ['th', 'en'] as const) {
    const { inventory } = getDictionary(language) as unknown as { inventory: { equipment: Record<string, string> } };
    assert.deepEqual(Object.keys(inventory.equipment), [...EQUIPMENT_SLOTS]);
    assert.ok(Object.values(inventory.equipment).every((s) => s.length > 0));
  }
  for (const id of EQUIPMENT_SLOTS) {
    assert.equal(SLOT_GLYPHS[id].length, GLYPH_SIZE);
    assert.ok(SLOT_GLYPHS[id].every((row) => row.length === GLYPH_SIZE && /^[.#]+$/.test(row)), id);
  }
});

test('everything is empty: there are no items anywhere', () => {
  const all: SlotRef[] = [...EQUIPMENT_SLOTS.map((slot) => ({ kind: 'equipment', slot }) as const), ...Array.from({ length: INVENTORY_SLOT_COUNT }, (_, index) => ({ kind: 'bag', index }) as const)];
  for (const s of all) assert.equal(EMPTY_INVENTORY.itemAt(s), null);
  assert.equal(typeof EMPTY_INVENTORY.onChange(() => undefined), 'function');
});

test('layout on every screen size: whole pixels, inside the screen, panels side by side, nothing overlaps', () => {
  for (const [sw, sh] of SCREENS) {
    const l = inventoryLayout(sw, sh);
    const at = `${sw}x${sh}`;
    const [, , w, h] = l.window;
    assert.ok(within(l.window, [0, 0, sw, sh]), at);
    const frame: R = [0, 0, w, h];
    const { equipment, grid, detail } = l.panels;
    const blocks: R[] = [l.title, equipment, grid, detail, l.footer];
    blocks.forEach((b, i) => {
      assert.ok(within(b, frame), at);
      blocks.slice(i + 1).forEach((o) => assert.equal(overlap(b, o), false, `${at} ${i}`));
    });
    assert.ok(equipment[0] < grid[0] && grid[0] < detail[0], 'equipment | grid | detail');
    assert.ok(within(l.close, l.footer), at);

    assert.equal(l.grid.length, INVENTORY_SLOT_COUNT);
    for (const s of l.grid) assert.ok(within(s, grid) && s[1] >= grid[1] + l.caption.rule, at);
    const eq = equipmentRects(l);
    for (const s of eq) assert.ok(within(s, equipment) && s[1] >= equipment[1] + l.caption.rule, at);
    const slots = [...l.grid, ...eq];
    slots.forEach((a, i) => {
      assert.ok(a[2] === slots[0][2] && a[3] === slots[0][2], 'square, all the same size');
      slots.slice(i + 1).forEach((b) => assert.equal(overlap(a, b), false, at));
    });
    for (const r of [...blocks, ...slots, l.window, l.close, l.detail.icon]) assert.ok(r.every(Number.isInteger), at);
  }
});

test('grid: regular spacing, row by row', () => {
  const l = inventoryLayout(960, 480);
  const step = l.grid[1][0] - l.grid[0][0];
  l.grid.forEach(([x, y], i) => {
    assert.equal(x - l.grid[0][0], (i % INVENTORY_GRID.columns) * step);
    assert.equal(y - l.grid[0][1], Math.floor(i / INVENTORY_GRID.columns) * step);
  });
});

test('equipment: hat on top, shoes at the bottom, weapon left and charm right of the armor; the body stays in its panel', () => {
  for (const [sw, sh] of SCREENS) {
    const l = inventoryLayout(sw, sh);
    const { weapon, hat, armor, shoes, charm } = l.equipment;
    assert.ok(hat[1] < armor[1] && armor[1] < shoes[1]);
    assert.ok(hat[0] === armor[0] && armor[0] === shoes[0]);
    assert.ok(weapon[0] + weapon[2] < armor[0] && charm[0] > armor[0] + armor[2] && weapon[1] === charm[1]);
    const { x, y, unit } = l.silhouette;
    assert.ok(within([x, y, unit * SILHOUETTE_GRID.width, unit * SILHOUETTE_GRID.height], l.panels.equipment), `${sw}x${sh}`);
    assert.ok(y >= hat[1] + hat[3] && y + unit * SILHOUETTE_GRID.height <= shoes[1]);
  }
});

test('detail panel: icon, name, type, description, effects from top to bottom, inside the panel', () => {
  for (const [sw, sh] of SCREENS) {
    const l = inventoryLayout(sw, sh);
    const d = l.detail;
    const [px, py, pw, ph] = l.panels.detail;
    const order = [py, d.icon[1], d.icon[1] + d.icon[3], d.nameY, d.typeY, d.description.ruleY, d.description.captionY, d.description.textY, d.effects.ruleY, d.effects.captionY, d.effects.textY, py + ph];
    assert.deepEqual(order, [...order].sort((a, b) => a - b), `${sw}x${sh}`);
    assert.ok(d.description.textY + d.description.lines * 14 <= d.effects.ruleY);
    assert.ok(d.effects.textY + d.effects.lines * 14 <= py + ph, `${sw}x${sh}`);
    assert.ok(d.textX > px && d.textX + d.textWidth < px + pw && d.description.lines >= 1 && d.effects.lines >= 1);
  }
  const full = inventoryLayout(960, 480).detail;
  assert.ok(full.description.lines >= 4 && full.effects.lines >= 2, 'room for real items at the normal size');
});

test('selection: one slot over equipment and bag, notifies on change only, invalid slots are ignored', () => {
  const s = new SlotSelection();
  const seen: (SlotRef | null)[] = [];
  const off = s.onChange((x) => seen.push(x));
  const bag: SlotRef = { kind: 'bag', index: 7 };
  const hat: SlotRef = { kind: 'equipment', slot: 'hat' };
  s.select(bag);
  s.select({ kind: 'bag', index: 7 });
  assert.ok(s.isSelected(bag) && !s.isSelected(hat));
  s.select(hat);
  assert.ok(s.isSelected(hat) && !s.isSelected(bag));
  for (const bad of [-1, INVENTORY_SLOT_COUNT, 1.5, Number.NaN]) s.select({ kind: 'bag', index: bad });
  s.select({ kind: 'equipment', slot: 'ring' as never });
  assert.ok(s.isSelected(hat));
  s.clear();
  s.clear();
  assert.equal(s.current, null);
  assert.deepEqual(seen, [bag, hat, null]);
  off();
  s.select(bag);
  assert.equal(seen.length, 3);
  assert.ok(sameSlot(null, null) && !sameSlot(bag, null) && !sameSlot(bag, hat));
  assert.ok(isValidSlot(bag) && isValidSlot(hat));
});

test('icon scale: whole pixels up, shrunk only when too large', () => {
  assert.equal(iconScale(16, 16, 36), 2);
  assert.equal(iconScale(32, 32, 36), 1);
  assert.equal(iconScale(36, 12, 36), 1);
  assert.equal(iconScale(72, 36, 36), 0.5);
});
