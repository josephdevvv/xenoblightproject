import Phaser from 'phaser';
import { PALETTE } from '../../config/palette';
import { t } from '../../i18n';
import { localize } from '../../i18n/phaser';
import { EMPTY_INVENTORY, slotAction, SlotSelection, type InventorySource, type SlotAction, type SlotRef, type UnequipProblem } from '../../inventory/InventorySlots';
import type { Rect } from '../passiveTree/PassiveTreeLayout';
import { FrameButton } from '../passiveTree/PassiveTreeWindow';
import { typo } from '../UITheme';
import { EquipmentPanel } from './EquipmentPanel';
import { InventoryGridPanel } from './InventoryGridPanel';
import { inventoryLayout, type InventoryLayout } from './InventoryLayout';
import { drawOutline, drawPanelFrame, INV_COLORS } from './inventoryTheme';
import { ItemDetailPanel } from './ItemDetailPanel';

/**
 * After EQUIP the same button says UNEQUIP (and the other way round): further clicks are ignored for a moment,
 * so a double click never undoes itself.
 */
const ACTION_PAUSE_MS = 400;

/**
 * Inventory + Equipment: equipment slots | bag grid | item description, in one window. Click a slot to select
 * it (one at a time over both slot panels); the right panel shows its item, or "No item selected" for an empty
 * slot. Its one button equips the selected bag item (a worn one goes back to that bag slot) or takes the
 * selected worn item off; the selection follows the item. A modal blocker swallows every click outside, so nothing
 * reaches the HUD or the world. CLOSE / I (GameUIScene) / Esc (GameScene) closes.
 */
export class InventoryWindow {
  readonly selection = new SlotSelection();
  readonly layout: InventoryLayout;
  private readonly equipment: EquipmentPanel;
  private readonly grid: InventoryGridPanel;
  private readonly detail: ItemDetailPanel;
  private readonly root: Phaser.GameObjects.Container;
  private readonly blocker: Phaser.GameObjects.Rectangle;
  private readonly title: Phaser.GameObjects.Text;
  private readonly captions: Phaser.GameObjects.Text[];
  private readonly hint: Phaser.GameObjects.Text;
  private readonly closeButton: FrameButton;
  private open = false;
  private actionPauseUntil = 0;
  /** Equipping / taking off did not work (message for the player). */
  onProblem: ((action: SlotAction['kind'], problem: UnequipProblem | 'failed') => void) | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    depth: number,
    private readonly source: InventorySource = EMPTY_INVENTORY,
  ) {
    const { width: sw, height: sh } = scene.scale;
    const L = inventoryLayout(sw, sh);
    this.layout = L;
    const [wx, wy, ww, wh] = L.window;
    this.blocker = scene.add.rectangle(0, 0, sw, sh, 0x000000, 0.55).setOrigin(0, 0).setDepth(depth).setInteractive();
    this.root = scene.add.container(wx, wy).setDepth(depth + 1);

    // Chrome; a window-sized zone keeps clicks on empty areas inside.
    this.root.add(scene.add.zone(0, 0, ww, wh).setOrigin(0, 0).setInteractive());
    const g = scene.add.graphics();
    drawPanelFrame(g, [0, 0, ww, wh]);
    drawPanelFrame(g, L.title);
    const [tx, ty, tw, th] = L.title;
    g.fillStyle(INV_COLORS.red, 1);
    for (const x of [tx + 12, tx + tw - 16]) g.fillRect(x, ty + Math.floor(th / 2) - 2, 4, 4);
    const panels: Rect[] = [L.panels.equipment, L.panels.grid, L.panels.detail];
    for (const p of panels) {
      drawPanelFrame(g, p);
      g.fillStyle(INV_COLORS.dim, 1).fillRect(p[0] + L.caption.x, p[1] + L.caption.rule, p[2] - L.caption.x * 2, 1);
    }
    drawPanelFrame(g, L.footer);
    drawOutline(g, L.close, 0, INV_COLORS.red);
    this.root.add(g);

    this.title = scene.add.text(tx + Math.floor(tw / 2), ty + Math.floor(th / 2), '', typo('section', INV_COLORS.lineText)).setOrigin(0.5);
    this.captions = panels.map((p) => scene.add.text(p[0] + L.caption.x, p[1] + L.caption.y, '', typo('small', PALETTE.silver)));
    this.hint = scene.add.text(L.hint.x, L.hint.y, '', typo('small', PALETTE.slate)).setOrigin(0, 0.5);
    this.root.add([this.title, ...this.captions, this.hint]);

    const onClick = (slot: SlotRef): void => this.selection.select(slot);
    this.equipment = new EquipmentPanel(scene, this.root, L, source, this.selection, onClick);
    this.grid = new InventoryGridPanel(scene, this.root, L, source, this.selection, onClick);
    this.detail = new ItemDetailPanel(scene, this.root, L, () => this.doAction());
    this.closeButton = new FrameButton(scene, this.root, L.close, INV_COLORS.redText, () => this.close());

    this.selection.onChange(() => this.showSelected());
    const off = source.onChange(() => this.refresh());
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
    localize(scene, () => this.refresh());
    this.setVisible(false);
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** The click zone of a slot (tutorial spotlight target). */
  slotZone(slot: SlotRef): Phaser.GameObjects.Zone | null {
    return (slot.kind === 'bag' ? this.grid : this.equipment).slots.zoneOf(slot);
  }

  /** The click zone of EQUIP while it is offered (tutorial spotlight target). */
  get equipZone(): Phaser.GameObjects.Zone | null {
    return this.detail.actionZone('equip');
  }

  show(): void {
    this.setVisible(true);
    this.refresh();
  }

  close(): void {
    this.selection.clear();
    for (const panel of [this.equipment, this.grid]) panel.slots.resetPointer();
    this.closeButton.resetHover();
    this.setVisible(false);
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  // ---------------------------------------------------------------------------------------------

  private showSelected(): void {
    const slot = this.selection.current;
    this.detail.show(slot ? this.source.itemAt(slot) : null, slotAction(this.source, slot));
  }

  /** The item panel's button: equips or takes off the selected item. */
  private doAction(): void {
    const slot = this.selection.current;
    const action = slotAction(this.source, slot);
    const now = this.scene.time.now;
    if (!slot || !action || now < this.actionPauseUntil) return;
    if (slot.kind === 'bag') {
      if (action.kind !== 'equip' || action.problem !== null) return;
      if (!this.source.equip(slot.index, action.slot)) {
        this.onProblem?.('equip', 'failed');
        return;
      }
      this.selection.select({ kind: 'equipment', slot: action.slot });
    } else {
      const result = this.source.unequip(slot.slot);
      if ('error' in result) {
        this.onProblem?.('unequip', result.error);
        return;
      }
      this.selection.select({ kind: 'bag', index: result.bagIndex });
    }
    this.actionPauseUntil = now + ACTION_PAUSE_MS;
  }

  private refresh(): void {
    this.title.setText(t('inventory.title'));
    const captions = ['inventory.equipmentTitle', 'inventory.bagTitle', 'inventory.detailTitle'] as const;
    this.captions.forEach((text, i) => text.setText(t(captions[i])));
    this.hint.setText(t('inventory.keys'));
    this.closeButton.label.setText(t('inventory.close'));
    this.equipment.refresh();
    this.grid.refresh();
    this.showSelected();
  }

  private setVisible(visible: boolean): void {
    this.open = visible;
    this.root.setVisible(visible);
    this.blocker.setVisible(visible);
    if (visible) this.blocker.setInteractive();
    else this.blocker.disableInteractive();
    this.root.each((child: Phaser.GameObjects.GameObject) => {
      if (child.input) child.input.enabled = visible;
    });
  }
}
