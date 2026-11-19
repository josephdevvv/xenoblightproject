import Phaser from 'phaser';
import { PALETTE } from '../config/palette';
import type { CharacterData } from '../data/CharacterData';
import { CharacterStatusService, STATUS_DEV_TOOLS_ENABLED } from '../status/CharacterStatusService';
import { computeDerivedStats, DERIVED_DISPLAY, formatStatValue, type DerivedStats } from '../status/DerivedStats';
import { StatAllocationDraft } from '../status/StatAllocation';
import { MAIN_STAT_INFO, MAIN_STATS, STATUS_RULES, totalStats, type MainStat, type StatBlock } from '../status/StatTypes';
import { Button } from './Button';
import { createPanel } from './Panel';
import { ScrollArea } from './ScrollArea';
import { textStyle, UI_COLORS } from './UITheme';

const WIDTH = 620;
const HEIGHT = 440;
const STAT_ROW_Y = 86;
const STAT_ROW_H = 40;
const DERIVED_X = 360;
const DERIVED_Y = 86;
const DERIVED_W = 244;
const DERIVED_H = 250;
const DERIVED_ROW_H = 22;

interface StatRow {
  value: Phaser.GameObjects.Text;
  pending: Phaser.GameObjects.Text;
  plus: Button;
}

interface DerivedRow {
  key: keyof DerivedStats;
  percent: boolean;
  value: Phaser.GameObjects.Text;
}

/**
 * Character Status window: level, stat points, the six main stats with staged (+) allocation and
 * every derived stat. Pending points only become real on CONFIRM; CANCEL / close / ESC discard them.
 * All objects live in a screen-space overlay scene, so clicks here never reach the world.
 */
export class StatusWindow {
  private readonly root: Phaser.GameObjects.Container;
  private readonly blocker: Phaser.GameObjects.Rectangle;
  private readonly derivedArea: ScrollArea;
  private readonly draft: StatAllocationDraft;
  private readonly statRows = new Map<MainStat, StatRow>();
  private readonly derivedRows: DerivedRow[] = [];
  private readonly levelText: Phaser.GameObjects.Text;
  private readonly pointsText: Phaser.GameObjects.Text;
  private readonly summaryText: Phaser.GameObjects.Text;
  private readonly messageText: Phaser.GameObjects.Text;
  private readonly confirmButton: Button;
  private readonly unsubscribe: () => void;
  private open = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly character: CharacterData,
    depth: number,
  ) {
    const { width: sw, height: sh } = scene.scale;
    const x = Math.round((sw - WIDTH) / 2);
    const y = Math.round((sh - HEIGHT) / 2);

    // Modal blocker: swallows every pointer event outside the window while it is open.
    this.blocker = scene.add.rectangle(0, 0, sw, sh, 0x000000, 0.45).setOrigin(0, 0).setDepth(depth).setInteractive();

    this.root = createPanel(scene, x, y, WIDTH, HEIGHT, 'STATUS').setDepth(depth + 1);
    // Make the panel itself absorb clicks so empty window areas never fall through.
    const hit = scene.add.zone(0, 0, WIDTH, HEIGHT).setOrigin(0, 0).setInteractive();
    this.root.addAt(hit, 0);
    this.draft = new StatAllocationDraft(character.status);

    const close = new Button(scene, WIDTH - 22, 20, { width: 24, height: 22, label: 'X', fontSize: 12, onClick: () => this.close() });
    this.root.add(close);

    // Header: name, level, available points.
    this.root.add(scene.add.text(16, 40, character.name.toUpperCase(), textStyle(14, PALETTE.white, { letterSpacing: 1 })));
    this.levelText = scene.add.text(WIDTH - 16, 40, '', textStyle(12, PALETTE.pale)).setOrigin(1, 0);
    this.pointsText = scene.add.text(16, 60, '', textStyle(12, PALETTE.accentLight));
    this.root.add([this.levelText, this.pointsText]);

    // Main stats (left column).
    MAIN_STATS.forEach((stat, i) => this.buildStatRow(stat, STAT_ROW_Y + i * STAT_ROW_H));
    this.root.add(scene.add.rectangle(DERIVED_X - 14, 62, 1, 290, UI_COLORS.panelBorder).setOrigin(0, 0));

    // Derived stats (right column, scrollable).
    this.root.add(scene.add.text(DERIVED_X, 66, 'DERIVED', textStyle(10, PALETTE.gray, { letterSpacing: 2 })));
    this.derivedArea = new ScrollArea(scene, x + DERIVED_X, y + DERIVED_Y, DERIVED_W, DERIVED_H, depth + 2);
    DERIVED_DISPLAY.forEach((entry, i) => {
      const rowY = i * DERIVED_ROW_H;
      const label = entry.note ? `${entry.label} (${entry.note})` : entry.label;
      const labelText = scene.add.text(0, rowY + 4, label, textStyle(10, PALETTE.silver));
      const value = scene.add.text(DERIVED_W - 10, rowY + 4, '', textStyle(11, PALETTE.white)).setOrigin(1, 0);
      const line = scene.add.rectangle(0, rowY + DERIVED_ROW_H - 1, DERIVED_W - 8, 1, UI_COLORS.panelBorder, 0.5).setOrigin(0, 0);
      this.derivedArea.content.add([labelText, value, line]);
      this.derivedRows.push({ key: entry.key, percent: entry.percent ?? false, value });
    });
    this.derivedArea.setContentHeight(DERIVED_DISPLAY.length * DERIVED_ROW_H);

    // Footer: allocation summary, message, buttons.
    this.summaryText = scene.add.text(16, 340, '', textStyle(11, PALETTE.pale));
    this.messageText = scene.add.text(16, 362, '', textStyle(10, PALETTE.error));
    this.root.add([this.summaryText, this.messageText]);

    this.confirmButton = new Button(scene, WIDTH - 70, HEIGHT - 26, {
      width: 112, height: 28, label: 'CONFIRM', variant: 'primary', onClick: () => this.confirm(),
    });
    const cancel = new Button(scene, WIDTH - 190, HEIGHT - 26, { width: 112, height: 28, label: 'CANCEL', onClick: () => this.close() });
    this.root.add([this.confirmButton, cancel]);

    if (STATUS_DEV_TOOLS_ENABLED) {
      const grant = (n: number) => () => CharacterStatusService.devGrantPoints(this.character, n);
      this.root.add([
        new Button(scene, 56, HEIGHT - 26, { width: 80, height: 24, label: 'DEV +10', fontSize: 11, onClick: grant(10) }),
        new Button(scene, 142, HEIGHT - 26, { width: 80, height: 24, label: 'DEV +100', fontSize: 11, onClick: grant(100) }),
      ]);
    }

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
    this.setVisible(false);
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  private buildStatRow(stat: MainStat, rowY: number): void {
    const info = MAIN_STAT_INFO[stat];
    const value = this.scene.add.text(232, rowY + 2, '', textStyle(13, PALETTE.white)).setOrigin(1, 0);
    const pending = this.scene.add.text(240, rowY + 4, '', textStyle(11, PALETTE.accentLight));
    const plus = new Button(this.scene, 318, rowY + 12, {
      width: 26, height: 24, label: '+', fontSize: 14, onClick: () => this.addPoint(stat),
    });
    this.root.add([
      this.scene.add.text(16, rowY, info.label, textStyle(13, PALETTE.white, { letterSpacing: 1 })),
      this.scene.add.text(16, rowY + 17, info.description, textStyle(9, PALETTE.gray)),
      value,
      pending,
      plus,
      this.scene.add.rectangle(16, rowY + STAT_ROW_H - 4, 320, 1, UI_COLORS.panelBorder, 0.5).setOrigin(0, 0),
    ]);
    this.statRows.set(stat, { value, pending, plus });
  }

  private addPoint(stat: MainStat): void {
    if (!this.draft.add(stat)) return;
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
    this.levelText.setText(`Level ${status.level}`);
    this.pointsText.setText(`Stat Points  ${status.statPoints}`);

    const preview: StatBlock = { ...status.base };
    for (const stat of MAIN_STATS) {
      const row = this.statRows.get(stat)!;
      const p = this.draft.pendingFor(stat);
      preview[stat] = this.draft.previewBase(stat);
      const bonus = status.bonus[stat];
      row.value.setText(`${preview[stat]}`).setColor(p > 0 ? PALETTE.accentLight : PALETTE.white);
      const parts: string[] = [];
      if (p > 0) parts.push(`+${p}`);
      if (bonus !== 0) parts.push(`(${bonus > 0 ? '+' : ''}${bonus} bonus)`);
      if (preview[stat] >= STATUS_RULES.maxBaseStat) parts.push('MAX');
      row.pending.setText(parts.join(' '));
      row.plus.setEnabled(this.draft.canAdd(stat));
    }

    // Derived stats preview the pending allocation so players see what they are buying.
    const current = CharacterStatusService.derived(this.character);
    const totals = totalStats({ ...status, base: preview });
    const next = computeDerivedStats(status.level, totals);
    for (const row of this.derivedRows) {
      const now = formatStatValue(current[row.key], row.percent);
      const after = formatStatValue(next[row.key], row.percent);
      row.value.setText(now === after ? now : `${now} > ${after}`).setColor(now === after ? PALETTE.white : PALETTE.accentLight);
    }

    this.summaryText.setText(`Selected ${this.draft.selected}    Remaining after confirm ${this.draft.remainingAfterConfirm}`);
    this.confirmButton.setEnabled(this.draft.hasPending());
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
      const target = child instanceof Button ? child.list[0] : child;
      if (!target.input) return;
      target.input.enabled = visible;
    });
  }
}
