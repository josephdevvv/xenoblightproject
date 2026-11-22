import type Phaser from 'phaser';
import type { InventorySource, SlotRef, SlotSelection } from '../../inventory/InventorySlots';
import type { InventoryLayout } from './InventoryLayout';
import { SlotGroup } from './SlotGroup';

/** Centre panel: the bag slots. */
export class InventoryGridPanel {
  readonly slots: SlotGroup;

  constructor(scene: Phaser.Scene, root: Phaser.GameObjects.Container, layout: InventoryLayout, source: InventorySource, selection: SlotSelection, onClick: (slot: SlotRef) => void) {
    this.slots = new SlotGroup(
      scene,
      root,
      layout.grid.map((rect, index) => ({ ref: { kind: 'bag', index } as const, rect })),
      source,
      selection,
      onClick,
    );
  }

  refresh(): void {
    this.slots.refresh();
  }
}
