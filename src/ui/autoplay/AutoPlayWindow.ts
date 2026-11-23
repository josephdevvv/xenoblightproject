import Phaser from 'phaser';
import { AUTO_RADIUS, AUTO_RECOVERY_PERCENT, type AutoPlayRecovery, type AutoPlaySettings } from '../../autoplay/AutoPlaySettings';
import { displayedSkillOrder, healSkillOptions, moveSkill, resolveHealSkill } from '../../autoplay/AutoPlayRules';
import { labels } from '../../i18n/labels';
import { AutoPlayService } from '../../autoplay/AutoPlayService';
import { PALETTE } from '../../config/palette';
import type { CharacterData } from '../../data/CharacterData';
import { HotbarService } from '../../hotbar/HotbarService';
import { t } from '../../i18n';
import { localize } from '../../i18n/phaser';
import { INVENTORY_SLOT_COUNT } from '../../inventory/InventorySlots';
import { InventoryService } from '../../inventory/InventoryService';
import { MONSTER_DEFINITIONS, type MonsterId } from '../../monsters/MonsterDefinition';
import { monsterSheetKey } from '../../monsters/art/MonsterArt';
import type { SkillId } from '../../skills/SkillDefinitions';
import { SkillService } from '../../skills/SkillService';
import { skillIcon } from '../hotbar/hotbarIcons';
import { drawOutline, drawPanelFrame, drawSlotFrame, INV_COLORS } from '../inventory/inventoryTheme';
import type { Rect } from '../passiveTree/PassiveTreeLayout';
import { FrameButton } from '../passiveTree/PassiveTreeWindow';
import { fitText } from '../text/fitText';
import { typo } from '../UITheme';
import { autoPlayLayout, dropIndex, RECOVERY_ROWS, sliderValue, sliderX, SKILL_SLOT, type AutoPlayLayout } from './AutoPlayLayout';

type RecoveryKey = keyof AutoPlayRecovery;

/** The crop of a monster's first idle frame that holds its visible pixels (frames are mostly empty space). */
const ICON_FRAME = 'autoplay_icon';
const ICON_BOX = 30;
/** A press that moves less than this is a click, not a drag. */
const DRAG_START_PX = 4;

interface MonsterCardView {
  id: MonsterId;
  check: Rect;
  zone: Phaser.GameObjects.Zone;
}

/**
 * Auto Play settings (Inventory / Passive Tree style, modal like the other windows; X still toggles Auto Play while
 * it is open). Monsters to hunt (any number of types), the hotbar's skills in priority order (drag to sort, the
 * box under each switches it off; no hotkey numbers, never potions or Heal), combat toggles, hunting range (whole map
 * or a radius slider 4-18 tiles), recovery (HP Potion, SP Recovery, Heal Skill - each on / off with its own 5-95 %
 * threshold; the heal skill is picked from the learned ones and the row is disabled without one), and START / STOP.
 * Every change goes
 * through AutoPlayService at once (kept in the save file).
 */
export class AutoPlayWindow {
  private readonly root: Phaser.GameObjects.Container;
  private readonly blocker: Phaser.GameObjects.Rectangle;
  private readonly layout: AutoPlayLayout;
  private readonly marks: Phaser.GameObjects.Graphics;
  private readonly texts: Record<string, Phaser.GameObjects.Text> = {};
  private readonly cards: MonsterCardView[] = [];
  private readonly cardNames: Phaser.GameObjects.Text[] = [];
  private readonly skillIcons: Phaser.GameObjects.Image[];
  private readonly dragGhost: Phaser.GameObjects.Image;
  private readonly buttons: FrameButton[] = [];
  private readonly startStop: FrameButton;
  private readonly closeButton: FrameButton;
  private readonly allButton: FrameButton;
  private readonly noneButton: FrameButton;
  private open = false;
  private drag: { from: number; startX: number; moved: boolean } | null = null;
  private slider: 'range' | RecoveryKey | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    depth: number,
    private readonly character: CharacterData,
    private readonly monsters: readonly MonsterId[],
  ) {
    const { width: sw, height: sh } = scene.scale;
    const L = autoPlayLayout(sw, sh, monsters.length);
    this.layout = L;
    const [wx, wy, ww, wh] = L.window;
    this.blocker = scene.add.rectangle(0, 0, sw, sh, 0x000000, 0.55).setOrigin(0, 0).setDepth(depth).setInteractive();
    this.root = scene.add.container(wx, wy).setDepth(depth + 1);
    this.root.add(scene.add.zone(0, 0, ww, wh).setOrigin(0, 0).setInteractive());

    // chrome
    const g = scene.add.graphics();
    drawPanelFrame(g, [0, 0, ww, wh]);
    drawPanelFrame(g, L.title);
    const [tx, ty, tw, th] = L.title;
    g.fillStyle(INV_COLORS.red, 1);
    for (const x of [tx + 12, tx + tw - 16]) g.fillRect(x, ty + Math.floor(th / 2) - 2, 4, 4);
    const panels = [L.panels.monsters, L.panels.skills, L.panels.options, L.panels.range, L.panels.recovery];
    for (const p of panels) {
      drawPanelFrame(g, p);
      g.fillStyle(INV_COLORS.dim, 1).fillRect(p[0] + L.caption.x, p[1] + L.caption.rule, p[2] - L.caption.x * 2, 1);
    }
    for (const c of L.monsterCards) drawOutline(g, c, 0, INV_COLORS.dim);
    for (const s of L.skillSlots) drawSlotFrame(g, s);
    drawPanelFrame(g, L.footer);
    drawOutline(g, L.close, 0, INV_COLORS.red);
    this.marks = scene.add.graphics();
    this.root.add([g, this.marks]);

    const text = (key: string, x: number, y: number, role: Parameters<typeof typo>[0], color: string, origin: [number, number] = [0, 0]): Phaser.GameObjects.Text => {
      const o = scene.add.text(x, y, '', typo(role, color)).setOrigin(...origin);
      this.texts[key] = o;
      this.root.add(o);
      return o;
    };
    text('title', tx + Math.floor(tw / 2), ty + Math.floor(th / 2), 'section', INV_COLORS.lineText, [0.5, 0.5]);
    const captions: [string, Rect][] = [['monsters', L.panels.monsters], ['skills', L.panels.skills], ['options', L.panels.options], ['range', L.panels.range], ['recovery', L.panels.recovery]];
    for (const [key, p] of captions) text(`cap.${key}`, p[0] + L.caption.x, p[1] + L.caption.y, 'small', PALETTE.silver);
    text('retaliate', L.retaliate[0] + 16, L.retaliate[1] + 7, 'small', PALETTE.pale, [0, 0.5]);
    text('counter', L.counter[0] + 16, L.counter[1] + 7, 'small', PALETTE.pale, [0, 0.5]);
    text('rangeValue', L.rangeValue.x, L.rangeValue.y, 'small', INV_COLORS.lineText, [1, 0.5]);
    RECOVERY_ROWS.forEach((key, i) => {
      const r = L.recoveryRows[i];
      text(`rec.${key}`, r.toggle[0] + 16, r.toggle[1] + 7, 'small', PALETTE.pale, [0, 0.5]);
      text(`recValue.${key}`, r.value.x, r.value.y, 'small', INV_COLORS.lineText, [1, 0.5]);
    });
    text('healPicker', L.healPicker[0] + L.healPicker[2] / 2, L.healPicker[1] + 8, 'small', INV_COLORS.lineText, [0.5, 0.5]);
    text('noSkills', L.skillSlots[0][0], L.skillSlots[0][1] + SKILL_SLOT + 24, 'small', PALETTE.slate);
    text('status', L.status.x, L.status.y, 'small', PALETTE.silver, [0, 0.5]);
    text('bag', L.bag.x, L.bag.y, 'small', PALETTE.slate, [0, 0.5]);
    text('mode0', L.rangeModes[0][0] + L.rangeModes[0][2] / 2, L.rangeModes[0][1] + 9, 'small', PALETTE.pale, [0.5, 0.5]);
    text('mode1', L.rangeModes[1][0] + L.rangeModes[1][2] / 2, L.rangeModes[1][1] + 9, 'small', PALETTE.pale, [0.5, 0.5]);

    // monster cards: check box, icon, name, level - a click toggles the type
    monsters.forEach((id, i) => {
      const r = L.monsterCards[i];
      const check: Rect = [r[0] + 6, r[1] + Math.floor((r[3] - 10) / 2), 10, 10];
      const icon = this.monsterIcon(id);
      if (icon) {
        icon.setPosition(r[0] + 22 + ICON_BOX / 2, r[1] + r[3] / 2);
        this.root.add(icon);
      }
      const def = MONSTER_DEFINITIONS[id];
      this.cardNames.push(text(`card.${id}`, r[0] + 26 + ICON_BOX, r[1] + 6, 'small', INV_COLORS.lineText));
      text(`lv.${id}`, r[0] + 26 + ICON_BOX, r[1] + 21, 'small', PALETTE.slate).setText(`Lv ${def.combat.level}`);
      const zone = this.zone(r, () => this.toggleMonster(id));
      this.cards.push({ id, check, zone });
    });
    this.allButton = this.button(L.monsterButtons[0], INV_COLORS.lineText, () => this.change((s) => ({ ...s, monsters: [...this.monsters] })));
    this.noneButton = this.button(L.monsterButtons[1], INV_COLORS.lineText, () => this.change((s) => ({ ...s, monsters: [] })));

    // skills: icons (drag to sort) and the check box under each
    this.skillIcons = L.skillSlots.map(([x, y, w, h]) => {
      const img = scene.add.image(x + w / 2, y + h / 2, '__DEFAULT').setVisible(false);
      this.root.add(img);
      return img;
    });
    L.skillSlots.forEach((r, i) => {
      const zone = this.zone(r, () => undefined);
      zone.off('pointerup');
      zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (p.button === 0 && i < this.skillOrder().length) this.drag = { from: i, startX: p.x, moved: false };
      });
    });
    L.skillChecks.forEach((r, i) => this.zone([r[0] - 3, r[1] - 3, r[2] + 6, r[3] + 6], () => this.toggleSkill(i)));
    this.dragGhost = scene.add.image(0, 0, '__DEFAULT').setDepth(depth + 3).setAlpha(0.85).setVisible(false);

    // toggles, range, potion
    this.zone([L.retaliate[0], L.retaliate[1], L.retaliate[2], 14], () => this.change((s) => ({ ...s, retaliate: !s.retaliate })));
    this.zone([L.counter[0], L.counter[1], L.counter[2], 14], () => this.change((s) => ({ ...s, counterAttackers: !s.counterAttackers })));
    L.rangeModes.forEach((r, i) => this.zone(r, () => this.change((s) => ({ ...s, range: { ...s.range, mode: i === 0 ? 'map' : 'radius' } }))));
    RECOVERY_ROWS.forEach((key, i) => {
      const t = L.recoveryRows[i].toggle;
      // the Heal Skill toggle stops before the skill picker
      const width = key === 'healSkill' ? L.healPicker[0] - t[0] - 4 : t[2];
      this.zone([t[0], t[1], width, 14], () => {
        if (this.recoveryUsable(key)) this.changeRecovery(key, (r) => ({ ...r, enabled: !r.enabled }));
      });
    });
    this.zone(L.healPicker, () => this.nextHealSkill());
    const sliders: ['range' | RecoveryKey, Rect][] = [['range', L.rangeSlider], ...RECOVERY_ROWS.map((key, i): [RecoveryKey, Rect] => [key, L.recoveryRows[i].slider])];
    for (const [which, r] of sliders) {
      const zone = this.zone([r[0] - 6, r[1], r[2] + 12, r[3]], () => undefined);
      zone.off('pointerup');
      zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (p.button !== 0) return;
        if (which === 'range' ? this.settings().range.mode === 'map' : !this.recoveryUsable(which)) return;
        this.slider = which;
        this.slide(p.x);
      });
    }
    this.startStop = this.button(L.startStop, INV_COLORS.lineText, () => AutoPlayService.toggle(this.character));
    this.closeButton = this.button(L.close, INV_COLORS.redText, () => this.close());

    const onMove = (p: Phaser.Input.Pointer): void => this.onPointerMove(p);
    const onUp = (p: Phaser.Input.Pointer): void => this.onPointerUp(p);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, onMove);
    scene.input.on(Phaser.Input.Events.POINTER_UP, onUp);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, onUp);
    const offAuto = AutoPlayService.onChange((c) => c === this.character && this.open && this.refresh());
    const offBar = HotbarService.onChange((c) => c === this.character && this.open && this.refresh());
    const offBag = InventoryService.onChange((c) => c === this.character && this.open && this.refresh());
    const offLearned = SkillService.onLearned((c) => c === this.character && this.open && this.refresh());
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.input.off(Phaser.Input.Events.POINTER_MOVE, onMove);
      scene.input.off(Phaser.Input.Events.POINTER_UP, onUp);
      scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, onUp);
      offAuto();
      offBar();
      offBag();
      offLearned();
    });
    localize(scene, () => this.refresh());
    this.setVisible(false);
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(): void {
    this.setVisible(true);
    this.refresh();
  }

  close(): void {
    if (!this.open) return;
    this.drag = null;
    this.slider = null;
    this.dragGhost.setVisible(false);
    for (const b of this.buttons) b.resetHover();
    this.setVisible(false);
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  refresh(): void {
    if (!this.open) return;
    const L = this.layout;
    const s = this.settings();
    const on = AutoPlayService.isOn(this.character);
    const set = (key: string, value: string, maxWidth?: number): void => {
      if (maxWidth) fitText(this.texts[key], value, maxWidth);
      else this.texts[key].setText(value);
    };
    set('title', t('autoPlay.title'));
    const selected = this.monsters.filter((id) => s.monsters.includes(id)).length;
    set('cap.monsters', t('autoPlay.monsters', { count: selected, total: this.monsters.length }));
    set('cap.skills', t('autoPlay.skills'));
    set('cap.options', t('autoPlay.options'));
    set('cap.range', t('autoPlay.range'));
    set('cap.recovery', t('autoPlay.potion'));
    set('retaliate', t('autoPlay.retaliate'), L.retaliate[2] - 16);
    set('counter', t('autoPlay.counter'), L.counter[2] - 16);
    set('rangeValue', s.range.mode === 'map' ? '—' : t('autoPlay.radiusValue', { tiles: s.range.radius }));
    const heal = this.healSkill();
    RECOVERY_ROWS.forEach((key, i) => {
      const usable = this.recoveryUsable(key);
      const labelWidth = (key === 'healSkill' ? L.healPicker[0] - L.recoveryRows[i].toggle[0] - 4 : L.recoveryRows[i].toggle[2]) - 16;
      set(`rec.${key}`, t(`autoPlay.${key}`), labelWidth);
      this.texts[`rec.${key}`].setColor(usable ? PALETTE.pale : PALETTE.slate);
      const percent = s.recovery[key].percent;
      set(`recValue.${key}`, t(key === 'spRecovery' ? 'autoPlay.spAt' : 'autoPlay.hpAt', { percent }));
      this.texts[`recValue.${key}`].setColor(usable ? INV_COLORS.lineText : PALETTE.slate);
    });
    // SP: no SP item exists yet - the setting is kept for later; Heal: only learned self-heal skills
    set('healPicker', heal ? labels.skillName(heal) : t('autoPlay.healLocked'), L.healPicker[2] - 6);
    this.texts.healPicker.setColor(heal ? INV_COLORS.lineText : PALETTE.slate);
    set('mode0', t('autoPlay.wholeMap'));
    set('mode1', t('autoPlay.radius'));
    set('status', `${t('autoPlay.title')}: ${on ? t('autoPlay.running') : t('autoPlay.stopped')}`);
    this.texts.status.setColor(on ? INV_COLORS.redText : PALETTE.silver);
    const used = (this.character.inventory?.bag ?? []).filter(Boolean).length;
    set('bag', t('autoPlay.bag', { used, total: INVENTORY_SLOT_COUNT }));
    this.allButton.label.setText(t('autoPlay.all'));
    this.noneButton.label.setText(t('autoPlay.none'));
    this.startStop.label.setText(on ? t('autoPlay.stop') : t('autoPlay.start'));
    this.closeButton.label.setText(t('autoPlay.close'));
    this.cardNames.forEach((name, i) => fitText(name, MONSTER_DEFINITIONS[this.monsters[i]].displayName, L.monsterCards[i][2] - 32 - ICON_BOX));

    const order = this.skillOrder();
    this.skillIcons.forEach((img, i) => {
      const id = order[i];
      const pic = id ? skillIcon(id) : null;
      const shown = pic !== null && this.scene.textures.exists(pic.texture) && this.drag?.from !== i;
      img.setVisible(shown);
      if (shown && id) img.setTexture(pic.texture, pic.frame).setAlpha(s.skillsOff.includes(id) ? 0.35 : 1);
    });
    this.texts.noSkills.setText(order.length ? '' : t('autoPlay.noSkills'));
    this.drawMarks(s, order, on);
  }

  // ---------------------------------------------------------------------------------------------

  private settings(): AutoPlaySettings {
    return AutoPlayService.settings(this.character);
  }

  private change(f: (s: AutoPlaySettings) => AutoPlaySettings): void {
    AutoPlayService.update(this.character, f);
  }

  /** The hotbar's skills in the order Auto Play uses them (only learned ones are ever on the hotbar). */
  private skillOrder(): SkillId[] {
    return displayedSkillOrder(HotbarService.state(this.character), this.settings()).filter((id) => SkillService.isLearned(this.character, id));
  }

  private changeRecovery<K extends RecoveryKey>(key: K, f: (r: AutoPlayRecovery[K]) => AutoPlayRecovery[K]): void {
    this.change((s) => ({ ...s, recovery: { ...s.recovery, [key]: f(s.recovery[key]) } }));
  }

  /** Learned self-heal skills (the picker's choices). */
  private healOptions(): SkillId[] {
    return healSkillOptions((id) => SkillService.isLearned(this.character, id));
  }

  /** The heal skill recovery uses (null = none learned). */
  private healSkill(): SkillId | null {
    return resolveHealSkill(this.settings().recovery.healSkill.skillId, this.healOptions());
  }

  /** The Heal Skill row is disabled until a heal skill is learned; the others always work. */
  private recoveryUsable(key: RecoveryKey): boolean {
    return key !== 'healSkill' || this.healSkill() !== null;
  }

  /** The picker: the next learned heal skill. */
  private nextHealSkill(): void {
    const options = this.healOptions();
    if (options.length === 0) return;
    const current = this.healSkill();
    const next = options[(options.indexOf(current as SkillId) + 1) % options.length];
    this.changeRecovery('healSkill', (r) => ({ ...r, skillId: next }));
  }

  private toggleMonster(id: MonsterId): void {
    this.change((s) => ({ ...s, monsters: s.monsters.includes(id) ? s.monsters.filter((m) => m !== id) : [...s.monsters, id] }));
  }

  private toggleSkill(index: number): void {
    const id = this.skillOrder()[index];
    if (!id) return;
    this.change((s) => ({ ...s, skillsOff: s.skillsOff.includes(id) ? s.skillsOff.filter((x) => x !== id) : [...s.skillsOff, id] }));
  }

  private slide(screenX: number): void {
    const L = this.layout;
    const x = screenX - L.window[0];
    if (this.slider === 'range') {
      const radius = sliderValue(L.rangeSlider, x, AUTO_RADIUS.min, AUTO_RADIUS.max, AUTO_RADIUS.step);
      if (radius !== this.settings().range.radius) this.change((s) => ({ ...s, range: { ...s.range, radius } }));
    } else if (this.slider) {
      const key = this.slider;
      const row = L.recoveryRows[RECOVERY_ROWS.indexOf(key)];
      const percent = sliderValue(row.slider, x, AUTO_RECOVERY_PERCENT.min, AUTO_RECOVERY_PERCENT.max, AUTO_RECOVERY_PERCENT.step);
      if (percent !== this.settings().recovery[key].percent) this.changeRecovery(key, (r) => ({ ...r, percent }));
    }
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    if (!this.open) return;
    if (this.slider && p.isDown) this.slide(p.x);
    const d = this.drag;
    if (!d || !p.isDown) return;
    if (!d.moved && Math.abs(p.x - d.startX) < DRAG_START_PX) return;
    if (!d.moved) {
      d.moved = true;
      const pic = skillIcon(this.skillOrder()[d.from]);
      if (this.scene.textures.exists(pic.texture)) this.dragGhost.setTexture(pic.texture, pic.frame).setVisible(true);
      this.refresh();
    }
    this.dragGhost.setPosition(Math.round(p.x), Math.round(p.y));
  }

  private onPointerUp(p: Phaser.Input.Pointer): void {
    this.slider = null;
    const d = this.drag;
    this.drag = null;
    this.dragGhost.setVisible(false);
    if (!d || !this.open) return;
    if (d.moved) {
      const order = this.skillOrder();
      const to = dropIndex(this.layout.skillSlots, p.x - this.layout.window[0], order.length);
      this.change((s) => ({ ...s, skillOrder: moveSkill(order, d.from, to) }));
    }
    this.refresh();
  }

  private drawMarks(s: AutoPlaySettings, order: readonly SkillId[], on: boolean): void {
    const L = this.layout;
    const g = this.marks.clear();
    const box = ([x, y]: Rect, checked: boolean, enabled = true): void => {
      drawOutline(g, [x, y, 10, 10], 0, enabled ? INV_COLORS.line : INV_COLORS.dim);
      if (checked) g.fillStyle(enabled ? INV_COLORS.red : INV_COLORS.dim, 1).fillRect(x + 2, y + 2, 6, 6);
    };
    for (const c of this.cards) {
      const picked = s.monsters.includes(c.id);
      box(c.check, picked);
      if (picked) drawOutline(g, L.monsterCards[this.cards.indexOf(c)], 0, INV_COLORS.red);
    }
    L.skillChecks.forEach((r, i) => {
      if (i < order.length) box(r, !s.skillsOff.includes(order[i]));
    });
    box([L.retaliate[0], L.retaliate[1] + 2, 10, 10], s.retaliate);
    box([L.counter[0], L.counter[1] + 2, 10, 10], s.counterAttackers);
    RECOVERY_ROWS.forEach((key, i) => {
      const r = L.recoveryRows[i];
      const usable = this.recoveryUsable(key);
      box([r.toggle[0], r.toggle[1] + 2, 10, 10], usable && s.recovery[key].enabled, usable);
      this.drawSlider(r.slider, s.recovery[key].percent, AUTO_RECOVERY_PERCENT.min, AUTO_RECOVERY_PERCENT.max, usable && s.recovery[key].enabled);
    });
    drawOutline(g, L.healPicker, 0, this.healSkill() ? INV_COLORS.line : INV_COLORS.dim);
    // range mode: a segmented pair, the chosen one outlined red
    L.rangeModes.forEach((r, i) => {
      const chosen = (i === 0) === (s.range.mode === 'map');
      g.fillStyle(chosen ? INV_COLORS.body : INV_COLORS.slotFill, 1).fillRect(r[0], r[1], r[2], r[3]);
      drawOutline(g, r, 0, chosen ? INV_COLORS.red : INV_COLORS.dim);
    });
    this.texts.mode0.setColor(s.range.mode === 'map' ? INV_COLORS.lineText : PALETTE.slate);
    this.texts.mode1.setColor(s.range.mode === 'radius' ? INV_COLORS.lineText : PALETTE.slate);
    this.drawSlider(L.rangeSlider, s.range.radius, AUTO_RADIUS.min, AUTO_RADIUS.max, s.range.mode === 'radius');
    // running: the whole window frame turns red
    if (on) drawOutline(g, [0, 0, L.window[2], L.window[3]], 0, INV_COLORS.red);
    if (on) drawOutline(g, L.startStop, 0, INV_COLORS.red);
    else drawOutline(g, L.startStop, 0, INV_COLORS.line);
  }

  private drawSlider(r: Rect, value: number, min: number, max: number, enabled: boolean): void {
    const g = this.marks;
    const mid = r[1] + Math.floor(r[3] / 2);
    const kx = sliderX(r, value, min, max);
    g.fillStyle(INV_COLORS.dim, 1).fillRect(r[0], mid, r[2], 1);
    g.fillStyle(enabled ? INV_COLORS.red : INV_COLORS.dim, 1).fillRect(r[0], mid, kx - r[0], 1);
    g.fillStyle(enabled ? INV_COLORS.line : INV_COLORS.dim, 1).fillRect(kx - 2, mid - 5, 5, 11);
  }

  private zone(r: Rect, onClick: () => void): Phaser.GameObjects.Zone {
    const zone = this.scene.add.zone(r[0], r[1], r[2], r[3]).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    zone.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.button === 0) onClick();
    });
    this.root.add(zone);
    return zone;
  }

  private button(r: Rect, color: string, onClick: () => void): FrameButton {
    const b = new FrameButton(this.scene, this.root, r, color, onClick);
    this.buttons.push(b);
    return b;
  }

  /** A monster's icon: the visible part of its first idle frame, scaled to the card (whole steps when it fits). */
  private monsterIcon(id: MonsterId): Phaser.GameObjects.Image | null {
    const key = monsterSheetKey(MONSTER_DEFINITIONS[id].art, 'idle');
    if (!this.scene.textures.exists(key)) return null;
    const texture = this.scene.textures.get(key);
    if (!texture.has(ICON_FRAME)) {
      const f = texture.get(0);
      const c = document.createElement('canvas');
      c.width = f.cutWidth;
      c.height = f.cutHeight;
      const ctx = c.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(f.source.image as CanvasImageSource, f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, f.cutWidth, f.cutHeight);
      const px = ctx.getImageData(0, 0, f.cutWidth, f.cutHeight).data;
      let x0 = f.cutWidth, y0 = f.cutHeight, x1 = -1, y1 = -1;
      for (let y = 0; y < f.cutHeight; y++) {
        for (let x = 0; x < f.cutWidth; x++) {
          if (px[(y * f.cutWidth + x) * 4 + 3] === 0) continue;
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
        }
      }
      if (x1 < 0) return null;
      texture.add(ICON_FRAME, f.sourceIndex, f.cutX + x0, f.cutY + y0, x1 - x0 + 1, y1 - y0 + 1);
    }
    const img = this.scene.add.image(0, 0, key, ICON_FRAME);
    const size = Math.max(img.width, img.height);
    img.setScale(size <= ICON_BOX ? Math.max(1, Math.floor(ICON_BOX / size)) : ICON_BOX / size);
    return img;
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
