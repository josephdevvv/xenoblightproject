import Phaser from 'phaser';
import { PALETTE, toColorInt } from '../config/palette';
import type { CharacterData } from '../data/CharacterData';
import { CharacterStatusService, STATUS_DEV_TOOLS_ENABLED } from '../status/CharacterStatusService';
import { computeDerivedStats, DERIVED_DISPLAY, formatStatValue, type DerivedStats } from '../status/DerivedStats';
import { StatAllocationDraft } from '../status/StatAllocation';
import { MAIN_STAT_INFO, MAIN_STATS, totalStats, type MainStat, type StatBlock } from '../status/StatTypes';
import { GameServices } from '../systems/GameServices';
import { ScrollArea } from './ScrollArea';
import { STATUS_KIT, STATUS_KIT_HEIGHT, STATUS_KIT_LAYERS, STATUS_KIT_WIDTH, statusKitTextureKey, type KitRect } from './status/StatusKitLayout';
import { textStyle } from './UITheme';

const ACCENT = toColorInt(PALETTE.accentLight);

interface StatRow {
  value: Phaser.GameObjects.Text;
  desc: Phaser.GameObjects.Text;
  suffix: Phaser.GameObjects.Text;
  plus: KitButton;
}

interface DerivedRow {
  key: keyof DerivedStats;
  percent: boolean;
  value: Phaser.GameObjects.Text;
}

/**
 * A control baked into the kit art: an invisible hit zone, a 1-px hover outline on the art's inner
 * border, an optional game-rendered label, and a dimming veil when disabled.
 */
class KitButton {
  private readonly outline: Phaser.GameObjects.Graphics;
  private readonly veil: Phaser.GameObjects.Rectangle;
  private readonly zone: Phaser.GameObjects.Zone;
  readonly label: Phaser.GameObjects.Text | null;
  private enabled = true;
  private pressed = false;

  constructor(scene: Phaser.Scene, root: Phaser.GameObjects.Container, rect: KitRect, label: string | null, onClick: () => void) {
    const [x, y, w, h] = rect;
    this.label = label
      ? scene.add.text(x + w / 2, y + h / 2, label, textStyle(9, PALETTE.pale, { letterSpacing: 1 })).setOrigin(0.5)
      : null;
    if (this.label) this.label.setPosition(Math.round(this.label.x), Math.round(this.label.y));
    this.outline = scene.add.graphics().setVisible(false);
    // Inner (light) border of the art: 2 px dark outer frame + 1 px light line.
    strokePixelRect(this.outline, x + 2, y + 2, w - 4, h - 4, ACCENT);
    this.veil = scene.add.rectangle(x, y, w, h, STATUS_KIT.fill, 0.62).setOrigin(0, 0).setVisible(false);
    this.zone = scene.add.zone(x, y, w, h).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    this.zone.on('pointerover', () => this.outline.setVisible(this.enabled));
    this.zone.on('pointerout', () => {
      this.pressed = false;
      this.outline.setVisible(false);
    });
    this.zone.on('pointerdown', () => (this.pressed = true));
    this.zone.on('pointerup', () => {
      const fire = this.pressed && this.enabled;
      this.pressed = false;
      if (fire) onClick();
    });
    root.add([this.outline, ...(this.label ? [this.label] : []), this.veil, this.zone]);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.veil.setVisible(!enabled);
    if (!enabled) this.outline.setVisible(false);
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Clear hover state (used when a modal change swallows the pointerout). */
  resetHover(): void {
    this.outline.setVisible(false);
    this.pressed = false;
  }
}

/** Crisp 1-px rectangle outline from filled strips (stroked shapes straddle pixel edges). */
function strokePixelRect(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number): void {
  g.fillStyle(color, 1);
  g.fillRect(x, y, w, 1);
  g.fillRect(x, y + h - 1, w, 1);
  g.fillRect(x, y, 1, h);
  g.fillRect(x + w - 1, y, 1, h);
}

/**
 * Character Status window, drawn with the Moonsteel status kit: level, stat points, the six main
 * stats with staged (+) allocation, and every derived stat. Pending points only become real on
 * CONFIRM; RESET clears them; CANCEL / X / Esc discard them and close.
 * All objects live in a screen-space overlay scene, so clicks here never reach the world.
 */
export class StatusWindow {
  /** Loads the kit layer textures (once). A missing layer is reported and skipped. */
  static async load(): Promise<void> {
    const services = await GameServices.ready();
    await Promise.all(
      STATUS_KIT_LAYERS.map((layer) =>
        services.assets
          .load({ key: statusKitTextureKey(layer.id), type: 'image', url: layer.url })
          .catch((e: Error) => console.warn(`[status] ${e.message}`)),
      ),
    );
  }

  private readonly root: Phaser.GameObjects.Container;
  private readonly blocker: Phaser.GameObjects.Rectangle;
  private readonly derivedArea: ScrollArea;
  private readonly draft: StatAllocationDraft;
  private readonly statRows = new Map<MainStat, StatRow>();
  private readonly derivedRows: DerivedRow[] = [];
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly levelText: Phaser.GameObjects.Text;
  private readonly pointsText: Phaser.GameObjects.Text;
  private readonly captionText: Phaser.GameObjects.Text;
  private readonly summaryText: Phaser.GameObjects.Text;
  private readonly messageText: Phaser.GameObjects.Text;
  private readonly confirmButton: KitButton;
  private readonly resetButton: KitButton;
  private readonly buttons: KitButton[] = [];
  private readonly unsubscribe: () => void;
  private open = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly character: CharacterData,
    depth: number,
  ) {
    const { width: sw, height: sh } = scene.scale;
    const ox = Math.round((sw - STATUS_KIT_WIDTH) / 2);
    const oy = Math.round((sh - STATUS_KIT_HEIGHT) / 2);

    // Modal blocker: swallows every pointer event outside the window while it is open.
    this.blocker = scene.add.rectangle(0, 0, sw, sh, 0x000000, 0.45).setOrigin(0, 0).setDepth(depth).setInteractive();
    this.root = scene.add.container(ox, oy).setDepth(depth + 1);

    // 1. Kit layers in render order; a window-sized zone keeps clicks on empty areas from falling through.
    const frame = STATUS_KIT_LAYERS[0];
    if (frame) this.root.add(scene.add.zone(frame.x, frame.y, frame.width, frame.height).setOrigin(0, 0).setInteractive());
    for (const layer of STATUS_KIT_LAYERS) {
      const key = statusKitTextureKey(layer.id);
      if (scene.textures.exists(key)) this.root.add(scene.add.image(layer.x, layer.y, key).setOrigin(0, 0));
    }
    this.draft = new StatAllocationDraft(character.status);

    // 2. Header: title next to the kit's accent bars; name + level on the right; close button.
    const H = STATUS_KIT.header;
    this.root.add(this.text(H.titleX, H.textY, 'STATUS', 10, PALETTE.white, { letterSpacing: 2 }));
    this.levelText = this.text(H.rightX, H.textY, '', 10, PALETTE.accentLight).setOrigin(1, 0);
    this.nameText = this.text(H.rightX, H.textY, '', 10, PALETTE.white).setOrigin(1, 0);
    this.root.add([this.levelText, this.nameText]);
    this.buttons.push(new KitButton(scene, this.root, STATUS_KIT.close, null, () => this.close()));

    // 3. Section captions under the y-37 rules.
    this.pointsText = this.text(STATUS_KIT.sectionLeft.cx, STATUS_KIT.sectionLeft.y, '', 8, PALETTE.silver, { letterSpacing: 1 }).setOrigin(0.5, 0);
    const derivedTitle = this.text(STATUS_KIT.sectionRight.cx, STATUS_KIT.sectionRight.y, 'DERIVED STATS', 8, PALETTE.silver, { letterSpacing: 1 }).setOrigin(0.5, 0);
    this.root.add([this.pointsText, derivedTitle]);

    // 4. Main stat rows.
    MAIN_STATS.forEach((stat, i) => this.buildStatRow(stat, i));

    // 5. Derived panel: caption on the panel's title rule, rows between the baked lines (scrolls by one row).
    const D = STATUS_KIT.derived;
    this.captionText = this.text(D.captionRight, D.captionY, '', 8, PALETTE.gray).setOrigin(1, 0);
    this.root.add(this.captionText);
    this.derivedArea = new ScrollArea(scene, ox + D.listX, oy + D.listY, D.listW, D.listH, depth + 2, D.rowPitch);
    DERIVED_DISPLAY.forEach((entry, i) => {
      const rowY = i * D.rowPitch + 2;
      const label = entry.note ? `${entry.label} (${entry.note})` : entry.label;
      const labelText = this.text(2, rowY, label, 8, PALETTE.silver);
      const value = this.text(D.valueRight - D.listX, rowY, '', 8, PALETTE.white).setOrigin(1, 0);
      this.derivedArea.content.add([labelText, value]);
      this.derivedRows.push({ key: entry.key, percent: entry.percent ?? false, value });
    });
    this.derivedArea.setContentHeight(DERIVED_DISPLAY.length * D.rowPitch);

    // 6. Message line, footer summary and buttons.
    this.messageText = this.text(STATUS_KIT.message.x, STATUS_KIT.message.y, '', 8, PALETTE.error);
    this.summaryText = this.text(STATUS_KIT.summary.cx, STATUS_KIT.summary.y, '', 8, PALETTE.pale).setOrigin(0.5, 0);
    this.root.add([this.messageText, this.summaryText]);

    const F = STATUS_KIT.footer;
    this.resetButton = new KitButton(scene, this.root, F.reset, 'RESET', () => this.reset());
    if (STATUS_DEV_TOOLS_ENABLED) {
      // DEV ONLY: +10 test points (Shift + click: +100).
      this.buttons.push(
        new KitButton(scene, this.root, F.dev, 'DEV +10', () => {
          const shift = this.scene.input.activePointer.event?.shiftKey ?? false;
          CharacterStatusService.devGrantPoints(this.character, shift ? 100 : 10);
        }),
      );
    } else {
      // The kit bakes a fourth button; without dev tools it is unused, so hide it.
      const [x, y, w, h] = F.dev;
      this.root.add(scene.add.rectangle(x, y, w, h, STATUS_KIT.fill).setOrigin(0, 0));
    }
    const cancel = new KitButton(scene, this.root, F.cancel, 'CANCEL', () => this.close());
    this.confirmButton = new KitButton(scene, this.root, F.confirm, 'CONFIRM', () => this.confirm());
    this.confirmButton.label?.setColor(PALETTE.white);
    this.buttons.push(this.resetButton, cancel, this.confirmButton);

    this.unsubscribe = CharacterStatusService.onChange((changed) => {
      if (changed !== this.character) return;
      this.draft.rebase(changed.status);
      this.refresh();
    });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe());

    this.setVisible(false);
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(): void {
    this.draft.reset(this.character.status);
    this.messageText.setText('');
    this.derivedArea.scrollTo(0);
    this.setVisible(true);
    this.refresh();
  }

  /** Closing always discards pending (unconfirmed) points. */
  close(): void {
    this.draft.clear();
    for (const b of this.buttons) b.resetHover();
    this.setVisible(false);
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  private buildStatRow(stat: MainStat, i: number): void {
    const info = MAIN_STAT_INFO[stat];
    const R = STATUS_KIT.row(i);
    const label = this.text(R.labelX, R.textY, info.label, 9, PALETTE.white);
    const desc = this.text(R.descX, R.textY + 1, '', 8, PALETTE.gray);
    const suffix = this.text(R.labelZoneRight, R.textY + 1, '', 8, PALETTE.accentLight).setOrigin(1, 0);
    const value = this.text(R.valueRight, R.textY, '', 9, PALETTE.white).setOrigin(1, 0);
    this.root.add([label, desc, suffix, value]);
    const plus = new KitButton(this.scene, this.root, R.plus, null, () => this.addPoint(stat));
    this.buttons.push(plus);
    this.statRows.set(stat, { value, desc, suffix, plus });
  }

  private addPoint(stat: MainStat): void {
    if (!this.draft.add(stat)) return;
    this.messageText.setText('');
    this.refresh();
  }

  private reset(): void {
    this.draft.clear();
    this.messageText.setText('');
    this.refresh();
  }

  private confirm(): void {
    if (!this.draft.hasPending()) return;
    const error = CharacterStatusService.confirmAllocation(this.character, this.draft);
    if (error) {
      this.messageText.setColor(PALETTE.error).setText(error);
      return;
    }
    this.draft.reset(this.character.status);
    this.messageText.setColor(PALETTE.silver).setText('Stat points applied.');
    this.refresh();
  }

  private refresh(): void {
    if (!this.open) return;
    const status = this.character.status;
    this.levelText.setText(`Lv ${status.level}`);
    this.nameText.setX(this.levelText.x - this.levelText.width - 8);
    fitText(this.nameText, this.character.name, 180);
    this.pointsText.setText(`STAT POINTS  ${status.statPoints}`);

    const preview: StatBlock = { ...status.base };
    for (const stat of MAIN_STATS) {
      const row = this.statRows.get(stat)!;
      const p = this.draft.pendingFor(stat);
      preview[stat] = this.draft.previewBase(stat);
      const bonus = status.bonus[stat];
      row.value.setText(`${preview[stat]}`).setColor(p > 0 ? PALETTE.accentLight : PALETTE.white);
      const parts: string[] = [];
      if (p > 0) parts.push(`+${p}`);
      if (bonus !== 0) parts.push(`(${bonus > 0 ? '+' : ''}${bonus})`);
      row.suffix.setText(parts.join(' '));
      // The description gives way to the pending / bonus marker when space runs out.
      const descRight = parts.length > 0 ? row.suffix.x - row.suffix.width - 4 : row.suffix.x;
      fitText(row.desc, MAIN_STAT_INFO[stat].description, descRight - row.desc.x);
      row.plus.setEnabled(this.draft.canAdd(stat));
    }

    // Derived stats preview the pending allocation so players see what they are buying.
    const current = CharacterStatusService.derived(this.character);
    const next = computeDerivedStats(status.level, totalStats({ ...status, base: preview }));
    for (const row of this.derivedRows) {
      const now = formatStatValue(current[row.key], row.percent);
      const after = formatStatValue(next[row.key], row.percent);
      row.value.setText(now === after ? now : `${now} > ${after}`).setColor(now === after ? PALETTE.white : PALETTE.accentLight);
    }

    const pending = this.draft.hasPending();
    this.captionText.setText(pending ? 'PREVIEW' : 'CURRENT').setColor(pending ? PALETTE.accentLight : PALETTE.gray);
    this.summaryText.setText(`Selected ${this.draft.selected}  Left ${this.draft.remainingAfterConfirm}`);
    this.confirmButton.setEnabled(pending);
    this.resetButton.setEnabled(pending);
  }

  private text(x: number, y: number, value: string, size: number, color: string, extra: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.GameObjects.Text {
    return this.scene.add.text(Math.round(x), Math.round(y), value, textStyle(size, color, extra));
  }

  private setVisible(visible: boolean): void {
    this.open = visible;
    this.root.setVisible(visible);
    this.blocker.setVisible(visible);
    this.derivedArea.setVisible(visible);
    // Hidden objects must not catch input.
    if (visible) this.blocker.setInteractive();
    else this.blocker.disableInteractive();
    this.root.each((child: Phaser.GameObjects.GameObject) => {
      if (child.input) child.input.enabled = visible;
    });
  }
}

/** Sets `value`, shortened with ".." until it fits `maxWidth`. */
function fitText(text: Phaser.GameObjects.Text, value: string, maxWidth: number): void {
  text.setText(value);
  let n = value.length;
  while (n > 1 && text.width > maxWidth) text.setText(`${value.slice(0, --n)}..`);
}
