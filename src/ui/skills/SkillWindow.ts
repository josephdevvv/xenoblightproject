import Phaser from 'phaser';
import { PALETTE } from '../../config/palette';
import type { CharacterData } from '../../data/CharacterData';
import { t } from '../../i18n';
import { labels } from '../../i18n/labels';
import { localize } from '../../i18n/phaser';
import { DRIFTER_SKILLS, SKILL_DEFINITIONS, skillAtkPercent, type SkillId } from '../../skills/SkillDefinitions';
import { SkillService } from '../../skills/SkillService';
import { skillIcon } from '../hotbar/hotbarIcons';
import { drawOutline, drawPanelFrame, drawSlotFrame, INV_COLORS } from '../inventory/inventoryTheme';
import type { Rect } from '../passiveTree/PassiveTreeLayout';
import { FrameButton } from '../passiveTree/PassiveTreeWindow';
import { fitText } from '../text/fitText';
import { typo } from '../UITheme';
import { skillWindowLayout, type SkillWindowLayout } from './SkillWindowLayout';
import { uiView } from '../layout/UiLayers';

interface RowView {
  id: SkillId;
  icon: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  state: Phaser.GameObjects.Text;
  zone: Phaser.GameObjects.Zone;
}

/**
 * The Skill window (Inventory / Passive Tree style): the Drifter's skills, locked until their scroll was used.
 * A click on a row selects it and shows its details below the list; ASSIGN HOTKEY is offered for a learned skill
 * only (GameUIScene opens the assignment window). CLOSE / Esc / K close. Modal: a dim layer takes every click
 * outside, so nothing reaches the world behind it.
 */
export class SkillWindow {
  private readonly root: Phaser.GameObjects.Container;
  private readonly blocker: Phaser.GameObjects.Rectangle;
  private readonly layout: SkillWindowLayout;
  private readonly title: Phaser.GameObjects.Text;
  private readonly captions: Phaser.GameObjects.Text[];
  private readonly hint: Phaser.GameObjects.Text;
  private readonly marks: Phaser.GameObjects.Graphics;
  private readonly rows: RowView[];
  private readonly detailIcon: Phaser.GameObjects.Image;
  private readonly detailName: Phaser.GameObjects.Text;
  private readonly detailState: Phaser.GameObjects.Text;
  private readonly description: Phaser.GameObjects.Text;
  private readonly effect: Phaser.GameObjects.Text;
  private readonly cooldown: Phaser.GameObjects.Text;
  private readonly placeholder: Phaser.GameObjects.Text;
  private readonly assignButton: FrameButton;
  private readonly closeButton: FrameButton;
  private open = false;
  private selectedId: SkillId | null = null;

  /** ASSIGN HOTKEY on a learned skill. */
  onAssign: ((id: SkillId) => void) | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    depth: number,
    private readonly character: CharacterData,
    skills: readonly SkillId[] = DRIFTER_SKILLS,
  ) {
    const { width: sw, height: sh } = uiView(scene, 'windows');
    const L = skillWindowLayout(sw, sh, skills.length);
    this.layout = L;
    const [wx, wy, ww, wh] = L.window;
    this.blocker = scene.add.rectangle(0, 0, sw, sh, 0x000000, 0.55).setOrigin(0, 0).setDepth(depth).setInteractive();
    this.root = scene.add.container(wx, wy).setDepth(depth + 1);
    this.root.add(scene.add.zone(0, 0, ww, wh).setOrigin(0, 0).setInteractive());

    const g = scene.add.graphics();
    drawPanelFrame(g, [0, 0, ww, wh]);
    drawPanelFrame(g, L.title);
    const [tx, ty, tw, th] = L.title;
    g.fillStyle(INV_COLORS.red, 1);
    for (const x of [tx + 12, tx + tw - 16]) g.fillRect(x, ty + Math.floor(th / 2) - 2, 4, 4);
    const panels: Rect[] = [L.panels.list, L.panels.detail];
    for (const p of panels) {
      drawPanelFrame(g, p);
      g.fillStyle(INV_COLORS.dim, 1).fillRect(p[0] + L.caption.x, p[1] + L.caption.rule, p[2] - L.caption.x * 2, 1);
    }
    for (const r of L.rows) drawSlotFrame(g, offset(L.row.icon, r));
    drawSlotFrame(g, L.detail.icon);
    drawPanelFrame(g, L.footer);
    drawOutline(g, L.close, 0, INV_COLORS.red);
    this.marks = scene.add.graphics();
    this.root.add([g, this.marks]);

    this.title = scene.add.text(tx + Math.floor(tw / 2), ty + Math.floor(th / 2), '', typo('section', INV_COLORS.lineText)).setOrigin(0.5);
    this.captions = panels.map((p) => scene.add.text(p[0] + L.caption.x, p[1] + L.caption.y, '', typo('small', PALETTE.silver)));
    this.hint = scene.add.text(L.hint.x, L.hint.y, '', typo('small', PALETTE.slate)).setOrigin(0, 0.5);
    this.root.add([this.title, ...this.captions, this.hint]);

    this.rows = skills.map((id, i) => {
      const r = L.rows[i];
      const [ix, iy, iw, ih] = offset(L.row.icon, r);
      const pic = skillIcon(id);
      const icon = scene.add.image(ix + Math.floor(iw / 2), iy + Math.floor(ih / 2), pic.texture, pic.frame);
      const name = scene.add.text(r[0] + L.row.textX, r[1] + L.row.nameY, '', typo('label', INV_COLORS.lineText));
      const state = scene.add.text(r[0] + L.row.textX, r[1] + L.row.stateY, '', typo('small', PALETTE.silver));
      const zone = scene.add.zone(r[0], r[1], r[2], r[3]).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      zone.on('pointerup', (p: Phaser.Input.Pointer) => {
        if (p.button === 0) this.select(id);
      });
      this.root.add([icon, name, state, zone]);
      return { id, icon, name, state, zone };
    });

    const D = L.detail;
    this.detailIcon = scene.add.image(D.icon[0] + Math.floor(D.icon[2] / 2), D.icon[1] + Math.floor(D.icon[3] / 2), '__DEFAULT');
    this.detailName = scene.add.text(D.textX, D.nameY, '', typo('section', INV_COLORS.lineText));
    this.detailState = scene.add.text(D.textX, D.stateY, '', typo('small', PALETTE.silver));
    this.description = scene.add.text(D.icon[0], D.descriptionY, '', typo('body', PALETTE.pale, { wordWrap: { width: D.textWidth, useAdvancedWrap: true } }));
    this.effect = scene.add.text(D.icon[0], D.effectY, '', typo('body', INV_COLORS.lineText));
    this.cooldown = scene.add.text(D.icon[0], D.cooldownY, '', typo('body', PALETTE.silver));
    const [dx, dy, dw, dh] = L.panels.detail;
    this.placeholder = scene.add.text(dx + Math.floor(dw / 2), dy + Math.floor(dh / 2), '', typo('small', PALETTE.slate)).setOrigin(0.5);
    this.root.add([this.detailIcon, this.detailName, this.detailState, this.description, this.effect, this.cooldown, this.placeholder]);
    this.assignButton = new FrameButton(scene, this.root, D.button, INV_COLORS.lineText, () => {
      const id = this.selectedId;
      if (id && SkillService.isLearned(this.character, id)) this.onAssign?.(id);
    });
    this.closeButton = new FrameButton(scene, this.root, L.close, INV_COLORS.redText, () => this.close());

    // a scroll used anywhere (Inventory, an edited save) unlocks the row at once
    const off = SkillService.onLearned((c) => {
      if (c === this.character && this.open) this.refresh();
    });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
    localize(scene, () => this.refresh());
    this.setVisible(false);
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** The skill whose details are shown (null = none). */
  get selected(): SkillId | null {
    return this.selectedId;
  }

  /** A skill's row (tutorial spotlight target), while open. */
  rowZone(id: SkillId): Phaser.GameObjects.Zone | null {
    return this.open ? (this.rows.find((r) => r.id === id)?.zone ?? null) : null;
  }

  /** ASSIGN HOTKEY while it is offered (tutorial spotlight target). */
  get assignZone(): Phaser.GameObjects.Zone | null {
    return this.open && this.canAssign() ? this.assignButton.zone : null;
  }

  show(): void {
    this.setVisible(true);
    this.refresh();
  }

  close(): void {
    if (!this.open) return;
    this.selectedId = null;
    this.assignButton.resetHover();
    this.closeButton.resetHover();
    this.setVisible(false);
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  select(id: SkillId): void {
    this.selectedId = id;
    this.refresh();
  }

  refresh(): void {
    const L = this.layout;
    this.title.setText(t('skillWindow.title'));
    this.captions[0].setText(t('skillWindow.listTitle'));
    this.captions[1].setText(t('skillWindow.detailTitle'));
    this.hint.setText(t('skillWindow.keys'));
    this.closeButton.label.setText(t('skillWindow.close'));
    this.assignButton.label.setText(t('skillWindow.assign'));
    const nameWidth = L.rows[0] ? L.rows[0][2] - L.row.textX - 6 : 0;
    this.marks.clear();
    this.rows.forEach((row, i) => {
      const learned = SkillService.isLearned(this.character, row.id);
      row.icon.setAlpha(learned ? 1 : 0.35);
      fitText(row.name, labels.skillName(row.id), nameWidth);
      row.state.setText(t(learned ? 'skillWindow.learned' : 'skillWindow.locked')).setColor(learned ? PALETTE.silver : INV_COLORS.redText);
      if (row.id === this.selectedId) drawOutline(this.marks, L.rows[i], 0, INV_COLORS.red);
    });
    if (this.selectedId) drawOutline(this.marks, L.detail.button, 0, this.canAssign() ? INV_COLORS.line : INV_COLORS.dim);
    this.showDetail();
  }

  // ---------------------------------------------------------------------------------------------

  private canAssign(): boolean {
    return this.selectedId !== null && SkillService.isLearned(this.character, this.selectedId);
  }

  private showDetail(): void {
    const id = this.selectedId;
    const D = this.layout.detail;
    const parts = [this.detailIcon, this.detailName, this.detailState, this.description, this.effect, this.cooldown];
    for (const p of parts) p.setVisible(this.open && id !== null);
    this.placeholder.setVisible(this.open && id === null).setText(t('skillWindow.select'));
    this.assignButton.setVisible(this.open && id !== null);
    this.assignButton.setEnabled(this.canAssign());
    if (!id) return;
    const def = SKILL_DEFINITIONS[id];
    const learned = SkillService.isLearned(this.character, id);
    const pic = skillIcon(id);
    if (this.scene.textures.exists(pic.texture)) this.detailIcon.setTexture(pic.texture, pic.frame).setAlpha(learned ? 1 : 0.35);
    fitText(this.detailName, labels.skillName(id), D.textWidth - (D.textX - D.icon[0]));
    this.detailState.setText(t(learned ? 'skillWindow.learned' : 'skillWindow.locked')).setColor(learned ? PALETTE.silver : INV_COLORS.redText);
    const description = learned ? labels.skillDescription(id) : `${labels.skillDescription(id)} ${t('skillWindow.lockedHint', { scroll: labels.itemName(def.scrollItemId) })}`;
    this.description.setText(description);
    this.effect.setText(def.kind === 'attack' ? t('skillWindow.effectAttack', { percent: skillAtkPercent(def) ?? 0 }) : t('skillWindow.effectHeal', { percent: def.healPercentMaxHp }));
    const cooldown = def.cooldownMs > 0 ? t('skillWindow.cooldown', { seconds: Math.round(def.cooldownMs / 1000) }) : t('skillWindow.noCooldown');
    this.cooldown.setText(`${cooldown}  ·  ${t('skillWindow.spCost', { cost: def.spCost })}`);
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
    if (visible) this.showDetail();
  }
}

/** A rect given relative to `base`'s top-left corner, in base's coordinate space. */
function offset([x, y, w, h]: Rect, base: Rect): Rect {
  return [base[0] + x, base[1] + y, w, h];
}
