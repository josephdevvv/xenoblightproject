import Phaser from 'phaser';
import { PALETTE } from '../../config/palette';
import { sameEntry, type HotbarEntry, type HotbarState } from '../../hotbar/Hotbar';
import { t } from '../../i18n';
import { localize } from '../../i18n/phaser';
import { entryIcon } from './hotbarIcons';
import { drawOutline, drawPanelFrame, drawSlotFrame, INV_COLORS } from '../inventory/inventoryTheme';
import { FrameButton } from '../passiveTree/PassiveTreeWindow';
import type { Rect as ScreenRect } from '../tutorial/SpotlightGeometry';
import { rectInContainer } from '../tutorial/SpotlightOverlay';
import { fitText } from '../text/fitText';
import { typo } from '../UITheme';
import { hotbarAssignLayout, PAD, TITLE } from './HotbarAssignLayout';
import { uiView } from '../layout/UiLayers';

/**
 * "Assign Hotkey": which of the hotbar slots 1-8 a consumable goes on. Shows what every slot holds now (the
 * chosen item's current slot is outlined red). A click on a slot chooses it; CANCEL / Esc close. Modal: a dim
 * layer takes every click outside. Nothing is used or moved here - GameUIScene does the assignment.
 */
export class HotbarAssignWindow {
  private readonly root: Phaser.GameObjects.Container;
  private readonly blocker: Phaser.GameObjects.Rectangle;
  private readonly title: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly marks: Phaser.GameObjects.Graphics;
  private readonly icons: Phaser.GameObjects.Image[];
  private readonly cancel: FrameButton;
  private readonly layout: ReturnType<typeof hotbarAssignLayout>;
  private entry: HotbarEntry | null = null;
  private entryName = '';
  private hotbar: () => HotbarState = () => [];

  /** A slot was chosen (0-based) for the item / skill the window was opened with. */
  onChoose: ((slot: number, entry: HotbarEntry) => void) | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    depth: number,
  ) {
    const { width: sw, height: sh } = uiView(scene, 'windows');
    const L = hotbarAssignLayout(sw, sh);
    this.layout = L;
    const [wx, wy, ww, wh] = L.window;
    this.blocker = scene.add.rectangle(0, 0, sw, sh, 0x000000, 0.45).setOrigin(0, 0).setDepth(depth);
    this.root = scene.add.container(wx, wy).setDepth(depth + 1);
    this.root.add(scene.add.zone(0, 0, ww, wh).setOrigin(0, 0).setInteractive());
    const g = scene.add.graphics();
    drawPanelFrame(g, [0, 0, ww, wh]);
    g.fillStyle(INV_COLORS.dim, 1).fillRect(PAD, TITLE - 6, ww - PAD * 2, 1);
    g.fillStyle(INV_COLORS.red, 1).fillRect(PAD - 6, 14, 4, 4);
    for (const r of L.slots) drawSlotFrame(g, r);
    this.marks = scene.add.graphics();
    this.title = scene.add.text(PAD, 9, '', typo('section', INV_COLORS.lineText));
    this.hint = scene.add.text(L.hint[0], L.hint[1], '', typo('small', PALETTE.silver)).setOrigin(0.5, 0);
    const numbers = L.slots.map(([x, y], i) => scene.add.text(x + 3, y + 1, String(i + 1), typo('small', PALETTE.silver)));
    this.icons = L.slots.map(([x, y, w, h]) => scene.add.image(x + Math.floor(w / 2), y + Math.floor(h / 2) + 2, '__DEFAULT').setVisible(false));
    this.root.add([g, this.marks, this.title, this.hint, ...numbers, ...this.icons]);
    L.slots.forEach(([x, y, w, h], i) => {
      const zone = scene.add.zone(x, y, w, h).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      zone.on('pointerup', (p: Phaser.Input.Pointer) => {
        if (p.button === 0 && this.entry) this.onChoose?.(i, this.entry);
      });
      this.root.add(zone);
    });
    this.cancel = new FrameButton(scene, this.root, L.cancel, INV_COLORS.redText, () => this.close());
    drawOutline(g, L.cancel, 0, INV_COLORS.red);
    localize(scene, () => this.refresh());
    this.setVisible(false);
  }

  get isOpen(): boolean {
    return this.entry !== null;
  }

  /** The slot grid on the screen (tutorial spotlight target), while open. */
  slotArea(): ScreenRect | null {
    if (!this.isOpen) return null;
    const [x, y, width, height] = this.layout.slotArea;
    return rectInContainer(this.scene, this.root, { x, y, width, height });
  }

  /** `name`: the item's / skill's name in the current language (the hint line). */
  open(entry: HotbarEntry, name: string, hotbar: () => HotbarState): void {
    this.entry = entry;
    this.entryName = name;
    this.hotbar = hotbar;
    this.setVisible(true);
    this.refresh();
  }

  close(): void {
    if (!this.isOpen) return;
    this.entry = null;
    this.cancel.resetHover();
    this.setVisible(false);
  }

  /** Redraws the slots (e.g. after an assignment made elsewhere). */
  refresh(): void {
    this.title.setText(t('hotbar.assignTitle'));
    this.cancel.label.setText(t('hotbar.cancel'));
    const { entry } = this;
    fitText(this.hint, entry ? t('hotbar.assignHint', { name: this.entryName }) : '', this.layout.window[2] - PAD * 2);
    this.marks.clear();
    const state = this.hotbar();
    this.layout.slots.forEach((r, i) => {
      const e = state[i] ?? null;
      const icon = e ? entryIcon(e) : null;
      const shown = icon !== null && this.scene.textures.exists(icon.texture);
      this.icons[i].setVisible(shown);
      if (shown) this.icons[i].setTexture(icon.texture, icon.frame).setScale(icon.largeScale);
      if (entry && sameEntry(e, entry)) drawOutline(this.marks, r, 1, INV_COLORS.red);
    });
  }

  private setVisible(visible: boolean): void {
    this.root.setVisible(visible);
    this.blocker.setVisible(visible);
    if (visible) this.blocker.setInteractive();
    else if (this.blocker.input) this.blocker.disableInteractive();
    this.root.each((child: Phaser.GameObjects.GameObject) => {
      if (child.input) child.input.enabled = visible;
    });
  }
}
