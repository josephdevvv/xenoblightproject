import Phaser from 'phaser';
import { PALETTE } from '../config/palette';
import type { CharacterData, LocalizedMessage } from '../data/CharacterData';
import { t, translate, type TranslationParams } from '../i18n';
import { labels } from '../i18n/labels';
import { localize } from '../i18n/phaser';
import { CharacterStatusService, STATUS_DEV_TOOLS_ENABLED } from '../status/CharacterStatusService';
import { DERIVED_DISPLAY, formatStatValue } from '../status/DerivedStats';
import { StatAllocationDraft } from '../status/StatAllocation';
import { MAIN_STATS, type MainStat, type StatBlock } from '../status/StatTypes';
import { drawOutline, drawPanelFrame, INV_COLORS as C } from './inventory/inventoryTheme';
import { FrameButton } from './passiveTree/PassiveTreeWindow';
import type { Rect } from './passiveTree/PassiveTreeLayout';
import { statusLayout, type SecondaryKey, type StatRowLayout } from './status/StatusLayout';
import { fitText } from './text/fitText';
import type { TypographyRole } from './text/Typography';
import { typo } from './UITheme';
import { throughCamera, type Rect as ScreenRect } from './tutorial/SpotlightGeometry';

/** A value that the selected (not yet confirmed) points would change. */
const PREVIEW_COLOR = '#ffd27a';
const PERCENT_STATS = new Set<string>(DERIVED_DISPLAY.filter((d) => d.percent).map((d) => d.key));

interface StatRow {
  layout: StatRowLayout;
  name: Phaser.GameObjects.Text;
  description: Phaser.GameObjects.Text;
  value: Phaser.GameObjects.Text;
  suffix: Phaser.GameObjects.Text;
  plus: FrameButton;
}

interface SecondaryRow {
  key: SecondaryKey;
  right: number;
  x: number;
  label: Phaser.GameObjects.Text;
  value: Phaser.GameObjects.Text;
}

/**
 * Character Status window in the style of the Passive Tree and Inventory windows: name and level, remaining
 * stat points, the six main stats with staged (+) allocation, and every derived stat in sections. Pending
 * points only become real on CONFIRM; RESET clears them; CLOSE / Esc discard them and close. A modal blocker
 * swallows every click outside, so nothing reaches the HUD or the world.
 */
export class StatusWindow {
  private readonly root: Phaser.GameObjects.Container;
  private readonly blocker: Phaser.GameObjects.Rectangle;
  private readonly plusFrames: Phaser.GameObjects.Graphics;
  private readonly draft: StatAllocationDraft;
  private readonly statRows = new Map<MainStat, StatRow>();
  private readonly secondaryRows: SecondaryRow[] = [];
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly levelText: Phaser.GameObjects.Text;
  private readonly pointsText: Phaser.GameObjects.Text;
  private readonly captionText: Phaser.GameObjects.Text;
  private readonly summaryText: Phaser.GameObjects.Text;
  private readonly messageText: Phaser.GameObjects.Text;
  private readonly confirmButton: FrameButton;
  private readonly resetButton: FrameButton;
  private readonly buttons: FrameButton[] = [];
  private readonly nameRight: number;
  private readonly messageWidth: number;
  /** Last result message, kept as a key so it follows language changes. */
  private message: { text: LocalizedMessage; color: string } | null = null;
  private shownHp = -1;
  private open = false;
  /** Screen rectangles the Status tutorial points at: the six stat rows with their + buttons, and CONFIRM. */
  private readonly tutorialAreas: { stats: Rect; confirm: Rect };

  /** `currentHp`: HP now (combat); max HP when absent. SP has no consumer yet and stays at max (as in the HUD). */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly character: CharacterData,
    depth: number,
    private readonly currentHp: () => number = () => Number.POSITIVE_INFINITY,
  ) {
    const { width: sw, height: sh } = scene.scale;
    const L = statusLayout(sw, sh);
    const [wx, wy, ww, wh] = L.window;
    this.draft = new StatAllocationDraft(character.status);
    this.blocker = scene.add.rectangle(0, 0, sw, sh, 0x000000, 0.55).setOrigin(0, 0).setDepth(depth).setInteractive();
    this.root = scene.add.container(wx, wy).setDepth(depth + 1);
    const rows = L.stats.map((s) => s.rect);
    const left = Math.min(...rows.map((r) => r[0]));
    const top = Math.min(...rows.map((r) => r[1]));
    const stats: Rect = [wx + left, wy + top, Math.max(...rows.map((r) => r[0] + r[2])) - left, Math.max(...rows.map((r) => r[1] + r[3])) - top];
    const c = L.buttons.confirm;
    this.tutorialAreas = { stats, confirm: [wx + c[0], wy + c[1], c[2], c[3]] };

    // 1. Chrome; a window-sized zone keeps clicks on empty areas inside.
    this.root.add(scene.add.zone(0, 0, ww, wh).setOrigin(0, 0).setInteractive());
    const g = scene.add.graphics();
    drawPanelFrame(g, [0, 0, ww, wh]);
    drawPanelFrame(g, L.title);
    drawPanelFrame(g, L.points);
    const [tx, ty, tw, th] = L.title;
    g.fillStyle(C.red, 1);
    for (const x of [tx + 12, tx + tw - 16]) g.fillRect(x, ty + Math.floor(th / 2) - 2, 4, 4);
    const panels: Rect[] = [L.panels.primary, L.panels.secondary];
    for (const p of panels) {
      drawPanelFrame(g, p);
      g.fillStyle(C.dim, 1).fillRect(p[0] + L.caption.x, p[1] + L.caption.rule, p[2] - L.caption.x * 2, 1);
    }
    drawPanelFrame(g, L.footer);
    for (const r of [L.buttons.reset, L.buttons.confirm]) drawOutline(g, r, 0, C.line);
    drawOutline(g, L.buttons.close, 0, C.red);
    if (STATUS_DEV_TOOLS_ENABLED) drawOutline(g, L.buttons.dev, 0, C.dim);
    for (const { rect } of L.stats) {
      g.fillStyle(C.slotFill, 1).fillRect(...rect);
      drawOutline(g, rect, 0, C.dim);
      g.fillStyle(C.slotCorner, 1).fillRect(rect[0], rect[1], 2, rect[3]);
    }
    for (const s of L.sections) g.fillStyle(C.dim, 1).fillRect(s.x, s.ruleY, s.width, 1);
    this.plusFrames = scene.add.graphics();
    this.root.add([g, this.plusFrames]);

    // 2. Header: name + level on the left, title in the centre box, remaining points in the right box.
    this.nameText = this.text(L.name.x, L.name.y, 'label', PALETTE.white).setOrigin(0, 0.5);
    this.levelText = this.text(L.name.x, L.name.y, 'label', PALETTE.silver).setOrigin(0, 0.5);
    this.nameRight = L.name.right;
    const title = this.text(tx + Math.floor(tw / 2), ty + Math.floor(th / 2), 'section', C.lineText).setOrigin(0.5);
    const [px, py, pw, ph] = L.points;
    this.pointsText = this.text(px + Math.floor(pw / 2), py + Math.floor(ph / 2), 'label', C.lineText).setOrigin(0.5);
    this.root.add([this.nameText, this.levelText, title, this.pointsText]);

    // 3. Panel captions.
    const [primary, secondary] = panels;
    const primaryTitle = this.text(primary[0] + L.caption.x, primary[1] + L.caption.y, 'small', PALETTE.silver);
    const secondaryTitle = this.text(secondary[0] + L.caption.x, secondary[1] + L.caption.y, 'small', PALETTE.silver);
    this.captionText = this.text(secondary[0] + secondary[2] - L.caption.x, secondary[1] + L.caption.y, 'small', PALETTE.gray).setOrigin(1, 0);
    this.root.add([primaryTitle, secondaryTitle, this.captionText]);

    // 4. Main stats and the message line under them.
    for (const row of L.stats) this.buildStatRow(row);
    this.messageText = this.text(L.message.x, L.message.y, 'small', PALETTE.error);
    this.messageWidth = L.message.width;
    this.root.add(this.messageText);

    // 5. Secondary stats in sections.
    const captions = L.sections.map((s) => {
      const caption = this.text(s.x, s.captionY, 'small', C.redText);
      this.root.add(caption);
      for (const { key, y } of s.rows) {
        const label = this.text(s.x, y, 'small', PALETTE.silver);
        const value = this.text(s.x + s.width, y, 'small', PALETTE.white).setOrigin(1, 0);
        this.root.add([label, value]);
        this.secondaryRows.push({ key, x: s.x, right: s.x + s.width, label, value });
      }
      return { id: s.id, caption };
    });

    // 6. Footer: allocation summary and buttons.
    this.summaryText = this.text(L.summary.x, L.summary.y, 'small', PALETTE.silver).setOrigin(0, 0.5);
    this.root.add(this.summaryText);
    if (STATUS_DEV_TOOLS_ENABLED) {
      // DEV ONLY: +10 test points (Shift + click: +100).
      const dev = new FrameButton(scene, this.root, L.buttons.dev, PALETTE.gray, () => {
        const shift = this.scene.input.activePointer.event?.shiftKey ?? false;
        CharacterStatusService.devGrantPoints(this.character, shift ? 100 : 10);
      });
      dev.label.setText(t('status.devGrant'));
      this.buttons.push(dev);
    }
    this.resetButton = new FrameButton(scene, this.root, L.buttons.reset, C.lineText, () => this.reset());
    this.confirmButton = new FrameButton(scene, this.root, L.buttons.confirm, C.lineText, () => this.confirm());
    const close = new FrameButton(scene, this.root, L.buttons.close, C.redText, () => this.close());
    this.buttons.push(this.resetButton, this.confirmButton, close);

    const unsubscribe = CharacterStatusService.onChange((changed) => {
      if (changed !== this.character) return;
      this.draft.rebase(changed.status);
      this.refresh();
    });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);

    localize(scene, () => {
      title.setText(t('status.title'));
      primaryTitle.setText(t('status.primaryTitle'));
      secondaryTitle.setText(t('status.derivedTitle'));
      for (const { id, caption } of captions) caption.setText(t(`status.sections.${id}`));
      for (const row of this.statRows.values()) row.name.setText(labels.statLabel(row.layout.stat));
      this.resetButton.label.setText(t('status.buttons.reset'));
      this.confirmButton.label.setText(t('status.buttons.confirm'));
      close.label.setText(t('status.buttons.close'));
      this.showMessage(this.message);
      this.refresh();
    });

    this.setVisible(false);
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Points are selected and not confirmed yet. */
  get hasPending(): boolean {
    return this.draft.hasPending();
  }

  /** Where the Status tutorial points (screen), only while the window is open. */
  tutorialArea(part: 'stats' | 'confirm'): ScreenRect | null {
    if (!this.open) return null;
    const [x, y, width, height] = this.tutorialAreas[part];
    return throughCamera({ x, y, width, height }, this.scene.cameras.main);
  }

  show(): void {
    this.draft.reset(this.character.status);
    this.showMessage(null);
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

  /** Every frame: current HP follows combat (redrawn only when it changes). */
  update(): void {
    if (this.open && this.hpNow() !== this.shownHp) this.refresh();
  }

  // ---------------------------------------------------------------------------------------------

  private buildStatRow(layout: StatRowLayout): void {
    const { stat } = layout;
    const name = this.text(layout.labelX, layout.nameY, 'label', PALETTE.white);
    const description = this.text(layout.labelX, layout.descriptionY, 'small', PALETTE.gray);
    const value = this.text(layout.valueRight, layout.valueY, 'section', PALETTE.white).setOrigin(1, 0.5);
    const suffix = this.text(0, layout.valueY, 'small', PREVIEW_COLOR).setOrigin(1, 0.5);
    this.root.add([name, description, value, suffix]);
    const plus = new FrameButton(this.scene, this.root, layout.plus, C.lineText, () => this.addPoint(stat));
    plus.label.setStyle(typo('heading', C.lineText)).setText('+');
    this.buttons.push(plus);
    this.statRows.set(stat, { layout, name, description, value, suffix, plus });
  }

  private addPoint(stat: MainStat): void {
    if (!this.draft.add(stat)) return;
    this.showMessage(null);
    this.refresh();
  }

  private reset(): void {
    this.draft.clear();
    this.showMessage(null);
    this.refresh();
  }

  private confirm(): void {
    if (!this.draft.hasPending()) return;
    const error = CharacterStatusService.confirmAllocation(this.character, this.draft);
    if (error) {
      this.showMessage({ text: error, color: PALETTE.error });
      return;
    }
    this.draft.reset(this.character.status);
    this.showMessage({ text: { key: 'status.applied' }, color: PALETTE.silver });
    this.refresh();
  }

  private showMessage(message: { text: LocalizedMessage; color: string } | null): void {
    this.message = message;
    if (message) this.messageText.setColor(message.color);
    fitText(this.messageText, message ? translate(message.text.key, message.text.params as TranslationParams | undefined) : '', this.messageWidth);
  }

  private hpNow(): number {
    return Math.min(Math.round(CharacterStatusService.derived(this.character).maxHp), Math.round(this.currentHp()));
  }

  private refresh(): void {
    if (!this.open) return;
    const status = this.character.status;
    this.levelText.setText(t('status.level', { level: status.level }));
    fitText(this.nameText, this.character.name, this.nameRight - this.nameText.x - this.levelText.width - 10);
    this.levelText.setX(this.nameText.x + Math.ceil(this.nameText.width) + 10);
    const left = this.draft.remainingAfterConfirm;
    this.pointsText.setText(t('status.statPoints', { points: left })).setColor(left > 0 ? C.redText : C.lineText);

    const preview: StatBlock = { ...status.base };
    this.plusFrames.clear();
    for (const stat of MAIN_STATS) {
      const row = this.statRows.get(stat)!;
      const p = this.draft.pendingFor(stat);
      preview[stat] = this.draft.previewBase(stat);
      const bonus = status.bonus[stat];
      row.value.setText(`${preview[stat]}`).setColor(p > 0 ? PREVIEW_COLOR : PALETTE.white);
      const parts: string[] = [];
      if (p > 0) parts.push(`+${p}`);
      if (bonus !== 0) parts.push(`(${bonus > 0 ? '+' : ''}${bonus})`);
      row.suffix.setText(parts.join(' ')).setX(row.layout.valueRight - Math.ceil(row.value.width) - 6);
      const descriptionRight = Math.min(row.layout.descriptionRight, row.suffix.x - Math.ceil(row.suffix.width) - 6);
      fitText(row.description, labels.statDescription(stat), descriptionRight - row.layout.labelX);
      const canAdd = this.draft.canAdd(stat);
      row.plus.setEnabled(canAdd);
      drawOutline(this.plusFrames, row.layout.plus, 0, canAdd ? C.line : C.dim);
    }

    // Secondary stats preview the pending allocation so players see what they are buying.
    const current = CharacterStatusService.derived(this.character);
    const next = CharacterStatusService.previewDerived(this.character, preview);
    this.shownHp = this.hpNow();
    for (const row of this.secondaryRows) {
      const percent = PERCENT_STATS.has(row.key);
      const now = formatStatValue(current[row.key], percent);
      const after = formatStatValue(next[row.key], percent);
      const filled = row.key === 'maxHp' ? `${this.shownHp} / ` : row.key === 'maxSp' ? `${now} / ` : '';
      row.value.setText(filled + (now === after ? now : `${now} > ${after}`)).setColor(now === after ? PALETTE.white : PREVIEW_COLOR);
      const name = row.key === 'maxHp' ? t('status.vitals.hp') : row.key === 'maxSp' ? t('status.vitals.sp') : labels.derived(row.key);
      fitText(row.label, name, row.right - row.x - Math.ceil(row.value.width) - 8);
    }

    const pending = this.draft.hasPending();
    this.captionText.setText(t(pending ? 'status.captionPreview' : 'status.captionCurrent')).setColor(pending ? PREVIEW_COLOR : PALETTE.gray);
    this.summaryText.setText(t('status.summary', { selected: this.draft.selected, left })).setColor(pending ? PREVIEW_COLOR : PALETTE.silver);
    this.confirmButton.setEnabled(pending);
    this.resetButton.setEnabled(pending);
  }

  private text(x: number, y: number, role: TypographyRole, color: string): Phaser.GameObjects.Text {
    return this.scene.add.text(Math.round(x), Math.round(y), '', typo(role, color));
  }

  private setVisible(visible: boolean): void {
    this.open = visible;
    this.root.setVisible(visible);
    this.blocker.setVisible(visible);
    // Hidden objects must not catch input.
    if (visible) this.blocker.setInteractive();
    else this.blocker.disableInteractive();
    this.root.each((child: Phaser.GameObjects.GameObject) => {
      if (child.input) child.input.enabled = visible;
    });
  }
}
