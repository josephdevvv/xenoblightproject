import type Phaser from 'phaser';
import { PALETTE } from '../../config/palette';
import { t } from '../../i18n';
import type { ItemInfo, SlotAction } from '../../inventory/InventorySlots';
import { fitText } from '../text/fitText';
import type { TypographyRole } from '../text/Typography';
import { wrapText } from '../text/wrapText';
import { FrameButton } from '../passiveTree/PassiveTreeWindow';
import { typo } from '../UITheme';
import { DETAIL_LINE_HEIGHT, iconScale, type DetailSection, type InventoryLayout } from './InventoryLayout';
import { drawOutline, drawSlotFrame, INV_COLORS } from './inventoryTheme';

/**
 * Right panel: icon, name, type, description and stats / effects of one item, or the empty placeholder. One
 * button at the bottom: EQUIP for a bag item, UNEQUIP for a worn one, none otherwise.
 */
export class ItemDetailPanel {
  private readonly icon: Phaser.GameObjects.Image;
  private readonly name: Phaser.GameObjects.Text;
  private readonly type: Phaser.GameObjects.Text;
  private readonly descriptionCaption: Phaser.GameObjects.Text;
  private readonly description: Phaser.GameObjects.Text[];
  private readonly effectsCaption: Phaser.GameObjects.Text;
  private readonly effects: Phaser.GameObjects.Text[];
  private readonly buttonFrame: Phaser.GameObjects.Graphics;
  private readonly actionButton: FrameButton;
  private item: ItemInfo | null = null;
  private action: SlotAction | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    root: Phaser.GameObjects.Container,
    private readonly layout: InventoryLayout,
    onAction: () => void,
  ) {
    const D = layout.detail;
    const [ix, iy, iw, ih] = D.icon;
    const cx = ix + Math.floor(iw / 2);
    const g = scene.add.graphics();
    drawSlotFrame(g, D.icon);
    g.fillStyle(INV_COLORS.dim, 1);
    for (const s of [D.description, D.effects]) g.fillRect(D.textX, s.ruleY, D.textWidth, 1);

    this.icon = scene.add.image(cx, iy + Math.floor(ih / 2), '__DEFAULT').setVisible(false);
    this.name = this.text(cx, D.nameY, 'label', PALETTE.white).setOrigin(0.5, 0);
    this.type = this.text(cx, D.typeY, 'small', PALETTE.silver).setOrigin(0.5, 0);
    this.descriptionCaption = this.text(D.textX, D.description.captionY, 'small', PALETTE.gray);
    this.effectsCaption = this.text(D.textX, D.effects.captionY, 'small', PALETTE.gray);
    this.description = this.lines(D.description, PALETTE.pale);
    this.effects = this.lines(D.effects, PALETTE.white);
    root.add([g, this.icon, this.name, this.type, this.descriptionCaption, this.effectsCaption, ...this.description, ...this.effects]);

    this.buttonFrame = scene.add.graphics();
    drawOutline(this.buttonFrame, D.button, 0, INV_COLORS.line);
    root.add(this.buttonFrame);
    this.actionButton = new FrameButton(scene, root, D.button, INV_COLORS.lineText, onAction);
  }

  /** The click zone of the button while it does `kind` (tutorial spotlight target). */
  actionZone(kind: SlotAction['kind']): Phaser.GameObjects.Zone | null {
    return this.action?.kind === kind ? this.actionButton.zone : null;
  }

  /** Shows an item and what can be done with it; null = the "No item selected" placeholder. */
  show(item: ItemInfo | null, action: SlotAction | null = null): void {
    this.item = item;
    this.action = item ? action : null;
    this.refresh();
  }

  refresh(): void {
    const { item } = this;
    const { icon: box, textWidth } = this.layout.detail;
    this.descriptionCaption.setText(t('inventory.description'));
    this.effectsCaption.setText(t('inventory.effects'));
    this.name.setColor(item ? PALETTE.white : PALETTE.silver);
    fitText(this.name, item ? item.name : t('inventory.noItem'), textWidth);
    fitText(this.type, item?.type ?? '', textWidth);

    const icon = item?.icon && this.scene.textures.exists(item.icon.texture) ? item.icon : null;
    this.icon.setVisible(icon !== null);
    if (icon) {
      this.icon.setTexture(icon.texture, icon.frame);
      this.icon.setScale(iconScale(this.icon.frame.width, this.icon.frame.height, box[2] - 8));
    }
    this.fill(this.description, item ? this.wrap(item.description, this.description[0], textWidth) : [], textWidth);
    this.fill(this.effects, item?.effects ?? [], textWidth);
    const { action } = this;
    if (action) {
      this.actionButton.label.setText(actionLabel(action));
      this.actionButton.setEnabled(action.kind === 'unequip' || action.problem === null);
    }
    this.actionButton.setVisible(action !== null);
    this.buttonFrame.setVisible(action !== null);
  }

  /** One text per line; when there are more lines than texts, the last one ends in "..". */
  private fill(texts: readonly Phaser.GameObjects.Text[], lines: readonly string[], width: number): void {
    texts.forEach((text, i) => {
      const more = i === texts.length - 1 && lines.length > texts.length;
      fitText(text, (lines[i] ?? '').trimEnd() + (more ? '..' : ''), width);
    });
  }

  private wrap(value: string, like: Phaser.GameObjects.Text, width: number): string[] {
    const { canvas, context, style } = like;
    style.syncFont(canvas, context);
    return value.split('\n').flatMap((line) => wrapText(line, width, (s) => context.measureText(s).width));
  }

  private lines(section: DetailSection, color: string): Phaser.GameObjects.Text[] {
    return Array.from({ length: section.lines }, (_, i) => this.text(this.layout.detail.textX, section.textY + i * DETAIL_LINE_HEIGHT, 'small', color));
  }

  private text(x: number, y: number, role: TypographyRole, color: string): Phaser.GameObjects.Text {
    return this.scene.add.text(x, y, '', typo(role, color));
  }
}

/** The button says what it does, or why it cannot. */
function actionLabel(action: SlotAction): string {
  if (action.kind === 'unequip') return t('inventory.unequip');
  if (action.problem === 'levelTooLow') return t('inventory.equipNeedsLevel', { level: action.requiredLevel });
  return t('inventory.equip');
}
