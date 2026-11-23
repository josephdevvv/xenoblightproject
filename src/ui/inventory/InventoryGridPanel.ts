import Phaser from 'phaser';
import { bagScrollToShow, clampBagScroll, INVENTORY_GRID, INVENTORY_ROWS, MAX_BAG_SCROLL, type InventorySource, type SlotRef, type SlotSelection } from '../../inventory/InventorySlots';
import type { Rect } from '../passiveTree/PassiveTreeLayout';
import type { InventoryLayout } from './InventoryLayout';
import { INV_COLORS } from './inventoryTheme';
import { SlotGroup, type SlotSpec } from './SlotGroup';

/**
 * Centre panel: the bag. 100 slots, 6 x 6 visible at a time: the mouse wheel over the panel or the scroll bar moves
 * it by rows; a selected slot (also one chosen by a tutorial) is scrolled into view.
 */
export class InventoryGridPanel {
  readonly slots: SlotGroup;
  private scrollRow = 0;
  private readonly bar: Phaser.GameObjects.Graphics;
  private dragging = false;

  constructor(
    scene: Phaser.Scene,
    root: Phaser.GameObjects.Container,
    private readonly layout: InventoryLayout,
    source: InventorySource,
    selection: SlotSelection,
    onClick: (slot: SlotRef) => void,
    private readonly isOpen: () => boolean = () => true,
  ) {
    const panel = this;
    // the visible cells: each shows the bag slot of the current scroll
    const specs: SlotSpec[] = layout.grid.map((rect, cell) => ({
      rect,
      get ref(): SlotRef {
        return { kind: 'bag', index: panel.scrollRow * INVENTORY_GRID.columns + cell };
      },
    }));
    this.slots = new SlotGroup(scene, root, specs, source, selection, onClick);
    this.bar = scene.add.graphics();
    const [bx, by, bw, bh] = layout.scrollbar;
    const zone = scene.add.zone(bx - 4, by, bw + 8, bh).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.button !== 0) return;
      this.dragging = true;
      this.scrollToPointer(p.y);
    });
    root.add([this.bar, zone]);
    const onMove = (p: Phaser.Input.Pointer): void => {
      if (this.dragging && p.isDown) this.scrollToPointer(p.y);
    };
    const onUp = (): void => {
      this.dragging = false;
    };
    const onWheel = (p: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number): void => {
      if (!this.isOpen() || dy === 0 || !this.overPanel(p)) return;
      this.setScroll(this.scrollRow + Math.sign(dy));
    };
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, onMove);
    scene.input.on(Phaser.Input.Events.POINTER_UP, onUp);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, onUp);
    scene.input.on(Phaser.Input.Events.POINTER_WHEEL, onWheel);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.input.off(Phaser.Input.Events.POINTER_MOVE, onMove);
      scene.input.off(Phaser.Input.Events.POINTER_UP, onUp);
      scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, onUp);
      scene.input.off(Phaser.Input.Events.POINTER_WHEEL, onWheel);
    });
    selection.onChange(() => {
      const s = selection.current;
      if (s?.kind === 'bag') this.ensureVisible(s.index);
    });
    this.drawBar();
  }

  /** First visible row (for checks). */
  get scroll(): number {
    return this.scrollRow;
  }

  setScroll(row: number): void {
    const next = clampBagScroll(row);
    if (next === this.scrollRow) return;
    this.scrollRow = next;
    this.slots.resetPointer();
    this.refresh();
  }

  /** Scrolls so that bag slot `index` is visible. */
  ensureVisible(index: number): void {
    this.setScroll(bagScrollToShow(this.scrollRow, index));
  }

  refresh(): void {
    this.slots.refresh();
    this.drawBar();
  }

  private drawBar(): void {
    const [x, y, w, h] = this.layout.scrollbar;
    const g = this.bar.clear();
    g.fillStyle(INV_COLORS.slotFill, 1).fillRect(x, y, w, h);
    g.fillStyle(INV_COLORS.dim, 1).fillRect(x, y, w, 1).fillRect(x, y + h - 1, w, 1).fillRect(x, y, 1, h).fillRect(x + w - 1, y, 1, h);
    const thumbH = Math.max(12, Math.round((h * INVENTORY_GRID.rows) / INVENTORY_ROWS));
    const thumbY = y + (MAX_BAG_SCROLL === 0 ? 0 : Math.round(((h - thumbH) * this.scrollRow) / MAX_BAG_SCROLL));
    g.fillStyle(INV_COLORS.slotCorner, 1).fillRect(x + 1, thumbY, w - 2, thumbH);
  }

  private scrollToPointer(screenY: number): void {
    const [, y, , h] = this.layout.scrollbar;
    const t = (screenY - this.layout.window[1] - y) / Math.max(1, h);
    this.setScroll(Math.round(t * MAX_BAG_SCROLL));
  }

  private overPanel(p: Phaser.Input.Pointer): boolean {
    const [wx, wy] = this.layout.window;
    const [x, y, w, h]: Rect = this.layout.panels.grid;
    return p.x >= wx + x && p.x < wx + x + w && p.y >= wy + y && p.y < wy + y + h;
  }
}
