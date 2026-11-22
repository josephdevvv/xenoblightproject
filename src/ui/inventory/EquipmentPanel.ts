import type Phaser from 'phaser';
import { PALETTE } from '../../config/palette';
import { t } from '../../i18n';
import { EQUIPMENT_SLOTS, type EquipmentSlotId, type InventorySource, type SlotRef, type SlotSelection } from '../../inventory/InventorySlots';
import { typo } from '../UITheme';
import type { InventoryLayout } from './InventoryLayout';
import { drawGlyph, INV_COLORS, SLOT_GLYPHS } from './inventoryTheme';
import { SlotGroup } from './SlotGroup';

/** The character silhouette on a 28 x 58 grid (SILHOUETTE_GRID): x, y, width, height. */
const BODY: readonly (readonly [number, number, number, number])[] = [
  // head, neck
  [11, 0, 6, 1], [10, 1, 8, 6], [11, 7, 6, 1], [12, 8, 4, 2],
  // shoulders, torso, hips
  [8, 10, 12, 1], [6, 11, 16, 2], [8, 13, 12, 14], [9, 27, 10, 4], [8, 31, 12, 3],
  // arms, hands
  [4, 12, 3, 1], [21, 12, 3, 1], [4, 13, 3, 14], [21, 13, 3, 14], [3, 27, 4, 3], [21, 27, 4, 3],
  // legs, feet
  [8, 34, 5, 20], [15, 34, 5, 20], [7, 54, 6, 4], [15, 54, 6, 4],
];

/** Left panel: a character silhouette with the five equipment slots around it. */
export class EquipmentPanel {
  readonly slots: SlotGroup;
  private readonly labels = new Map<EquipmentSlotId, Phaser.GameObjects.Text>();

  constructor(scene: Phaser.Scene, root: Phaser.GameObjects.Container, layout: InventoryLayout, source: InventorySource, selection: SlotSelection, onClick: (slot: SlotRef) => void) {
    const { x, y, unit } = layout.silhouette;
    const body = scene.add.graphics();
    body.fillStyle(INV_COLORS.body, 1);
    for (const [bx, by, bw, bh] of BODY) body.fillRect(x + bx * unit, y + by * unit, bw * unit, bh * unit);
    root.add(body);

    this.slots = new SlotGroup(
      scene,
      root,
      EQUIPMENT_SLOTS.map((slot) => ({ ref: { kind: 'equipment', slot } as const, rect: layout.equipment[slot] })),
      source,
      selection,
      onClick,
      (g, { ref, rect }) => {
        if (ref.kind === 'equipment') drawGlyph(g, SLOT_GLYPHS[ref.slot], rect, INV_COLORS.glyph);
      },
    );
    for (const id of EQUIPMENT_SLOTS) {
      const [sx, sy, sw] = layout.equipment[id];
      const label = scene.add.text(sx + Math.floor(sw / 2), sy + 1, '', typo('small', PALETTE.silver)).setOrigin(0.5, 1);
      this.labels.set(id, label);
      root.add(label);
    }
  }

  refresh(): void {
    for (const [id, label] of this.labels) label.setText(t(`inventory.equipment.${id}`));
    this.slots.refresh();
  }
}
