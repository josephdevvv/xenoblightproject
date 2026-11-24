import type Phaser from 'phaser';
import { isValidSlot, sameSlot, type InventorySource, type SlotRef, type SlotSelection } from '../../inventory/InventorySlots';
import type { Rect } from '../passiveTree/PassiveTreeLayout';
import { iconScale } from './InventoryLayout';
import { drawOutline, drawSlotFrame, INV_COLORS } from './inventoryTheme';
import { PALETTE } from '../../config/palette';
import { typo } from '../UITheme';

export interface SlotSpec {
  /** May change (the bag grid scrolls: a cell shows another bag slot); a ref past the bag shows nothing. */
  readonly ref: SlotRef;
  rect: Rect;
}

/**
 * A set of slots (the bag grid, the equipment slots): pixel frames, hover and selection highlight, clicks,
 * and the item icon when the source has one. All frames share one Graphics; one click zone per slot.
 */
export class SlotGroup {
  private readonly frames: Phaser.GameObjects.Graphics;
  private readonly highlight: Phaser.GameObjects.Graphics;
  private readonly icons = new Map<SlotSpec, Phaser.GameObjects.Image>();
  /** Stack quantity at the bottom right (stackable items only), the same style as the hotbar's. */
  private readonly counts = new Map<SlotSpec, Phaser.GameObjects.Text>();
  private readonly zones = new Map<SlotSpec, Phaser.GameObjects.Zone>();
  private hovered: SlotSpec | null = null;
  private pressed: SlotSpec | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly root: Phaser.GameObjects.Container,
    private readonly slots: readonly SlotSpec[],
    private readonly source: InventorySource,
    private readonly selection: SlotSelection,
    private readonly onClick: (slot: SlotRef) => void,
    /** Drawn into an empty slot, on its frame. */
    private readonly drawEmpty: ((g: Phaser.GameObjects.Graphics, slot: SlotSpec) => void) | null = null,
  ) {
    this.frames = scene.add.graphics();
    this.highlight = scene.add.graphics();
    root.add([this.frames, this.highlight, ...slots.map((s) => this.buildZone(s))]);
    selection.onChange(() => this.drawHighlight());
    this.refresh();
  }

  /** Frames and icons again from the source. */
  refresh(): void {
    this.frames.clear();
    for (const slot of this.slots) {
      if (!isValidSlot(slot.ref)) {
        // past the last bag slot (the bag's last row is not full): an empty cell
        this.icons.get(slot)?.setVisible(false);
        this.counts.get(slot)?.setText('');
        continue;
      }
      drawSlotFrame(this.frames, slot.rect);
      const item = this.source.itemAt(slot.ref);
      const quantity = item?.quantity;
      if (quantity !== undefined) this.countOf(slot).setText(String(quantity));
      else this.counts.get(slot)?.setText('');
      const icon = item?.icon ?? null;
      if (icon && this.scene.textures.exists(icon.texture)) {
        const image = this.iconOf(slot).setTexture(icon.texture, icon.frame).setVisible(true);
        image.setScale(iconScale(image.frame.width, image.frame.height, slot.rect[2] - 4));
      } else {
        this.icons.get(slot)?.setVisible(false);
        this.drawEmpty?.(this.frames, slot);
      }
    }
    this.drawHighlight();
  }

  /** The click zone of a slot (tutorial spotlight target). */
  zoneOf(ref: SlotRef): Phaser.GameObjects.Zone | null {
    const slot = this.slots.find((s) => sameSlot(s.ref, ref));
    return slot ? (this.zones.get(slot) ?? null) : null;
  }

  /** Forgets hover and a started press (the window closed). */
  resetPointer(): void {
    this.hovered = null;
    this.pressed = null;
    this.drawHighlight();
  }

  private iconOf(slot: SlotSpec): Phaser.GameObjects.Image {
    let image = this.icons.get(slot);
    if (!image) {
      const [x, y, w, h] = slot.rect;
      image = this.scene.add.image(x + Math.floor(w / 2), y + Math.floor(h / 2), '__DEFAULT');
      this.icons.set(slot, image);
      this.root.addAt(image, this.root.getIndex(this.frames) + 1);
    }
    return image;
  }

  private countOf(slot: SlotSpec): Phaser.GameObjects.Text {
    let text = this.counts.get(slot);
    if (!text) {
      const [x, y, w, h] = slot.rect;
      text = this.scene.add.text(x + w - 2, y + h - 1, '', typo('small', PALETTE.white)).setOrigin(1, 1).setStroke(PALETTE.black, 3);
      this.counts.set(slot, text);
      this.root.addAt(text, this.root.getIndex(this.highlight));
    }
    return text;
  }

  private buildZone(slot: SlotSpec): Phaser.GameObjects.Zone {
    const [x, y, w, h] = slot.rect;
    const zone = this.scene.add.zone(x, y, w, h).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => {
      this.hovered = slot;
      this.drawHighlight();
    });
    zone.on('pointerout', () => {
      if (this.hovered === slot) this.hovered = null;
      if (this.pressed === slot) this.pressed = null;
      this.drawHighlight();
    });
    zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => (this.pressed = pointer.button === 0 ? slot : null));
    zone.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      const fire = this.pressed === slot && pointer.button === 0 && isValidSlot(slot.ref);
      this.pressed = null;
      if (fire) this.onClick(slot.ref);
    });
    this.zones.set(slot, zone);
    return zone;
  }

  private drawHighlight(): void {
    const g = this.highlight.clear();
    const selected = this.slots.find((s) => this.selection.isSelected(s.ref));
    if (this.hovered && this.hovered !== selected && isValidSlot(this.hovered.ref)) drawOutline(g, this.hovered.rect, 0, INV_COLORS.line);
    if (selected) {
      drawOutline(g, selected.rect, 0, INV_COLORS.red);
      drawOutline(g, selected.rect, 2, INV_COLORS.red);
    }
  }
}
