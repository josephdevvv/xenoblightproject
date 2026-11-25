import Phaser from 'phaser';
import { PALETTE } from '../../config/palette';
import { t } from '../../i18n';
import { itemInfo } from '../../items/ItemInfoText';
import { typo } from '../UITheme';
import { NotificationQueue, type QueuedNotification } from './NotificationQueue';

const PANEL = { height: 24, itemHeight: 38, gap: 3, padX: 7, iconGap: 5, icon: 32, fill: 0x0e0e12, alpha: 0.86, border: 0x3a3a45, accent: 0xe7e7ee } as const;
/** Panels below this line would reach the middle of the screen: the others wait. */
const MAX_VISIBLE = 4;
/** How fast a panel moves up when one above it is gone (px per ms). */
const SLIDE = 0.18;

type Content = { kind: 'item'; itemId: string; quantity: number } | { kind: 'text'; text: string };

interface View {
  objects: (Phaser.GameObjects.Graphics | Phaser.GameObjects.Text | Phaser.GameObjects.Image)[];
  width: number;
  height: number;
  y: number;
  /** Positions everything with the panel's top-left at (x, y). */
  place: (x: number, y: number) => void;
}

/**
 * Small notices on the right, below the minimap: "ได้รับ [icon] มีดสนิม x1". For any item the player receives
 * (quest rewards now; drops and others later) - InventoryService.onGained feeds it, so a notice only ever
 * appears for items that were really given. Several stack downwards; the rest wait. Purely visual: no input.
 */
export class ItemNotifications {
  private readonly queue = new NotificationQueue<Content>(MAX_VISIBLE);
  private readonly views = new Map<QueuedNotification<Content>, View>();

  /** `anchor`: right edge (or, with `left`, left edge - mobile) and top of the first panel. */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly anchor: { right: number; top: number; left?: number },
    private readonly depth: number,
  ) {}

  /** The player received items. */
  showItem(itemId: string, quantity: number): void {
    this.queue.push({ kind: 'item', itemId, quantity });
    this.sync(0);
  }

  /** A plain line (something could not be done). */
  showText(text: string): void {
    this.queue.push({ kind: 'text', text });
    this.sync(0);
  }

  update(deltaMs: number): void {
    if (this.views.size === 0) return;
    this.queue.update(deltaMs);
    this.sync(deltaMs);
  }

  /** On screen now (for checks). */
  get visibleCount(): number {
    return this.views.size;
  }

  // ---------------------------------------------------------------------------------------------

  private sync(deltaMs: number): void {
    const visible = this.queue.visible;
    for (const [n, view] of this.views) {
      if (visible.includes(n)) continue;
      for (const o of view.objects) o.destroy();
      this.views.delete(n);
    }
    let target = this.anchor.top;
    visible.forEach((n) => {
      let view = this.views.get(n);
      if (!view) {
        view = { ...this.build(n.content), y: target };
        this.views.set(n, view);
      }
      const top = target;
      target += view.height + PANEL.gap;
      view.y = Math.max(top, view.y - deltaMs * SLIDE);
      view.place(Math.round(this.anchor.left ?? this.anchor.right - view.width), Math.round(view.y));
      const alpha = this.queue.alphaOf(n);
      for (const o of view.objects) o.setAlpha(alpha);
    });
  }

  private build(content: Content): Omit<View, 'y'> {
    const { scene } = this;
    const panel = scene.add.graphics().setDepth(this.depth);
    const text = (value: string, color: string): Phaser.GameObjects.Text => scene.add.text(0, 0, value, typo('small', color)).setOrigin(0, 0.5).setDepth(this.depth + 1);
    const info = content.kind === 'item' ? itemInfo(content.itemId) : null;
    const parts: { object: Phaser.GameObjects.Text | Phaser.GameObjects.Image; width: number }[] = [];
    const add = (object: Phaser.GameObjects.Text | Phaser.GameObjects.Image, width: number): void => void parts.push({ object, width });
    if (content.kind === 'item') {
      const obtained = text(t('notifications.obtained'), PALETTE.silver);
      add(obtained, obtained.width);
      if (info?.icon && scene.textures.exists(info.icon.texture)) {
        // own pixels, nearest-neighbour like every game texture (pixelArt)
        const icon = scene.add.image(0, 0, info.icon.texture, info.icon.frame).setOrigin(0, 0).setDepth(this.depth + 1);
        // whole steps only: 16 px icons x2, 32 px icons 1:1
        icon.setScale(Math.max(1, Math.floor(PANEL.icon / Math.max(icon.width, icon.height))));
        add(icon, icon.displayWidth);
      }
      const name = text(t('notifications.itemLine', { name: info?.name ?? content.itemId, quantity: content.quantity }), PALETTE.white);
      add(name, name.width);
    } else {
      const line = text(content.text, PALETTE.pale);
      add(line, line.width);
    }
    const width = Math.ceil(parts.reduce((sum, p) => sum + Math.ceil(p.width), 0) + PANEL.iconGap * (parts.length - 1) + PANEL.padX * 2);
    const height = content.kind === 'item' ? PANEL.itemHeight : PANEL.height;

    panel.fillStyle(PANEL.fill, PANEL.alpha).fillRect(0, 0, width, height);
    panel.fillStyle(PANEL.border, 1).fillRect(0, 0, width, 1).fillRect(0, height - 1, width, 1).fillRect(0, 0, 1, height).fillRect(width - 1, 0, 1, height);
    panel.fillStyle(PANEL.accent, 1).fillRect(0, 0, 1, height);

    return {
      objects: [panel, ...parts.map((p) => p.object)],
      width,
      height,
      place: (x, y) => {
        panel.setPosition(x, y);
        let left = x + PANEL.padX;
        for (const { object, width: w } of parts) {
          const middle = Math.round(y + height / 2);
          object.setPosition(left, object instanceof Phaser.GameObjects.Image ? Math.round(middle - object.displayHeight / 2) : middle);
          left += Math.ceil(w) + PANEL.iconGap;
        }
      },
    };
  }
}
