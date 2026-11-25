import Phaser from 'phaser';
import { PALETTE } from '../../config/palette';
import type { Point } from '../../core/types';
import type { CharacterData } from '../../data/CharacterData';
import type { HotbarEntry } from '../../hotbar/Hotbar';
import { HotbarService } from '../../hotbar/HotbarService';
import { POTION_SLOT_KEYS, type PotionSlotKey } from '../../hotbar/PotionSlots';
import { InventoryService } from '../../inventory/InventoryService';
import { itemCount } from '../../inventory/InventoryState';
import { isSkillUnlocked } from '../../skills/ActiveSkills';
import { SkillService } from '../../skills/SkillService';
import { cooldownSeconds, elapsedFraction, handAngle, remainingWedge, sweepStep } from '../hud/CooldownSweep';
import { entryIcon } from '../hotbar/hotbarIcons';
import { typo } from '../UITheme';
import { joystickState, screenToGround, slotOfButton, TOUCH, touchLayout, type Circle, type TouchLayout } from './TouchLayout';
import { uiView } from '../layout/UiLayers';

export interface TouchControlCallbacks {
  /** The joystick: a ground (tile-space) unit direction while pushed, null when let go. */
  onSteer(direction: Point | null): void;
  /** The sword: a normal attack on the selected target. */
  onAttack(): void;
  /** A hotkey button: hotbar slot 0-7 (the same as keys 1-8). */
  onSlot(slot: number): void;
  /** HP (Q) / SP (W) potion button. */
  onPotion(key: PotionSlotKey): void;
}

/** The dark-fantasy HUD metals (the minimap / hotbar frames' silver, the AUTO badge's gold for highlights). */
const C = {
  plate: 0x0a0a0d,
  fill: 0x0c0c10,
  rim: 0xa8a8b0,
  rimBright: 0xd8d8e0,
  inner: 0x2a2a30,
  dim: 0x55555d,
  glyph: 0xd8d8e0,
  glow: 0x7fc8dc,
  gold: 0xd6b25e,
} as const;

/** Knob emblem: a horned skull (as on the reference joystick), '#' = silver. */
const KNOB_EMBLEM = ['#.......#', '##.....##', '.#######.', '#########', '##.###.##', '#########', '.##.#.##.', '..#####..', '..#.#.#..'];

interface ButtonView {
  circle: Circle;
  ring: Phaser.GameObjects.Graphics;
  icon: Phaser.GameObjects.Image;
  gray: Phaser.GameObjects.Image;
  mask: Phaser.GameObjects.Graphics;
  cooldown: Phaser.GameObjects.Text;
  count: Phaser.GameObjects.Text;
  label: Phaser.GameObjects.Text;
  zone: Phaser.GameObjects.Zone;
  /** What the cooldown sweep shows now (redrawn only on a change). */
  sweepKey: string;
  usable: boolean;
}

/**
 * Mobile touch controls (GameUIScene, touch mode only): the virtual joystick bottom-left, the action wheel bottom-right
 * (sword + four hotkey buttons + the 1-4 / 5-8 tab) and the HP / SP potion buttons. Every control follows its own
 * finger (Phaser pointers), so the joystick and the buttons work at the same time. Icons, quantities and cooldown
 * sweeps are the desktop hotbar's (same rules, same pictures).
 */
export class TouchControls {
  private readonly layout: TouchLayout;
  private readonly knob: Phaser.GameObjects.Graphics;
  private stickPointer: number | null = null;
  private steering: Point | null = null;
  private page: 0 | 1 = 0;
  private readonly slots: ButtonView[];
  private readonly potions: Record<PotionSlotKey, ButtonView>;
  private readonly tabLabel: Phaser.GameObjects.Text;
  private readonly hands: Phaser.GameObjects.Graphics;
  /** The hotkey buttons' and the potion buttons' touch zones (tutorial spotlight targets, checks). */
  readonly slotZones: readonly Phaser.GameObjects.Zone[];
  readonly potionZones: Readonly<Record<PotionSlotKey, Phaser.GameObjects.Zone>>;
  readonly swordZone: Phaser.GameObjects.Zone;
  private readonly swordGraphics: Phaser.GameObjects.Graphics;
  /** What the action button shows: the crossed swords (attack) or a speech bubble (an NPC to talk to in range). */
  private actionMode: 'attack' | 'talk' = 'attack';
  readonly stickZone: Phaser.GameObjects.Zone;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly character: CharacterData,
    private readonly callbacks: TouchControlCallbacks,
    private readonly depth: number,
  ) {
    const view = uiView(scene, 'hud');
    this.layout = touchLayout(view.width, view.height);
    const L = this.layout;
    // joystick: translucent base, outer and inner rings, four direction thorns; the knob with its emblem on top
    const base = scene.add.graphics().setDepth(depth);
    const J = L.joystick;
    base.fillStyle(C.plate, 0.42).fillCircle(J.x, J.y, J.r);
    base.lineStyle(2, C.rim, 0.75).strokeCircle(J.x, J.y, J.r);
    base.lineStyle(1, C.dim, 0.8).strokeCircle(J.x, J.y, J.r - 13);
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]) {
      const tip = { x: J.x + dx * (J.r - 4), y: J.y + dy * (J.r - 4) };
      const back = { x: J.x + dx * (J.r - 11), y: J.y + dy * (J.r - 11) };
      base.fillStyle(C.rim, 0.8).fillTriangle(tip.x, tip.y, back.x - dy * 4, back.y - dx * 4, back.x + dy * 4, back.y + dx * 4);
    }
    this.knob = scene.add.graphics().setDepth(depth + 1);
    this.drawKnob(0, 0);
    this.stickZone = scene.add.zone(J.x, J.y, J.grab * 2, J.grab * 2).setDepth(depth + 4);
    this.stickZone.setInteractive(new Phaser.Geom.Circle(J.grab, J.grab, J.grab), Phaser.Geom.Circle.Contains);
    this.stickZone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.stickPointer !== null) return;
      this.stickPointer = p.id;
      this.moveStick(p);
    });
    const onMove = (p: Phaser.Input.Pointer): void => {
      if (p.id === this.stickPointer) this.moveStick(p);
    };
    const onUp = (p: Phaser.Input.Pointer): void => {
      if (p.id === this.stickPointer) this.release();
    };
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, onMove);
    scene.input.on(Phaser.Input.Events.POINTER_UP, onUp);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, onUp);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.input.off(Phaser.Input.Events.POINTER_MOVE, onMove);
      scene.input.off(Phaser.Input.Events.POINTER_UP, onUp);
      scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, onUp);
    });

    // action wheel: a dark plate under the sword, the sword button (crossed blades), the hotkey arc and the tab
    const plate = scene.add.graphics().setDepth(depth);
    const S = L.sword;
    plate.fillStyle(C.plate, 0.5).fillCircle(S.x, S.y, S.r + 12);
    plate.lineStyle(1, C.dim, 0.8).strokeCircle(S.x, S.y, S.r + 12);
    const sword = scene.add.graphics().setDepth(depth + 1);
    this.swordGraphics = sword;
    this.drawAction('attack');
    this.swordZone = this.circleZone(S, () => {
      this.flash(sword);
      callbacks.onAttack();
    });

    this.hands = scene.add.graphics().setDepth(depth + 2);
    this.slots = L.slots.map((c, i) =>
      this.button(c, '', () => {
        const slot = slotOfButton(this.page, i);
        callbacks.onSlot(slot);
      }),
    );
    this.slotZones = this.slots.map((b) => b.zone);
    this.potions = {
      hp: this.button(L.potions.hp, 'HP', () => callbacks.onPotion('hp')),
      sp: this.button(L.potions.sp, 'SP', () => callbacks.onPotion('sp')),
    };
    this.potionZones = { hp: this.potions.hp.zone, sp: this.potions.sp.zone };

    const T = L.tab;
    const tab = scene.add.graphics().setDepth(depth + 1);
    tab.fillStyle(C.fill, 0.88).fillCircle(T.x, T.y, T.r);
    tab.lineStyle(1, C.gold, 0.9).strokeCircle(T.x, T.y, T.r);
    this.tabLabel = scene.add.text(T.x, T.y, '', typo('small', PALETTE.pale)).setOrigin(0.5, 0.5).setStroke(PALETTE.black, 2).setDepth(depth + 3);
    this.circleZone(T, () => {
      this.flash(tab);
      this.page = this.page === 0 ? 1 : 0;
      this.refresh();
    });

    const refresh = (c: CharacterData): void => {
      if (c === character) this.refresh();
    };
    const offs = [InventoryService.onChange(refresh), HotbarService.onChange(refresh), SkillService.onLearned(refresh)];
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => offs.forEach((off) => off()));
    this.refresh();
  }

  /** The action button's face for what a tap does now (redrawn only when it changes). */
  setActionMode(mode: 'attack' | 'talk'): void {
    if (mode === this.actionMode) return;
    this.drawAction(mode);
  }

  get currentActionMode(): 'attack' | 'talk' {
    return this.actionMode;
  }

  private drawAction(mode: 'attack' | 'talk'): void {
    this.actionMode = mode;
    const S = this.layout.sword;
    const g = this.swordGraphics.clear();
    g.fillStyle(0x1b1b21, 0.92).fillCircle(S.x, S.y, S.r);
    // talk: the rim turns gold, so the change reads at a glance
    g.lineStyle(2, mode === 'talk' ? C.gold : C.rimBright, 1).strokeCircle(S.x, S.y, S.r);
    g.lineStyle(1, 0x4a4a52, 1).strokeCircle(S.x, S.y, S.r - 5);
    if (mode === 'talk') drawSpeechBubble(g, S.x, S.y);
    else drawCrossedSwords(g, S.x, S.y, S.r - 9);
  }

  /** The joystick is being held (for checks). */
  get isSteering(): boolean {
    return this.steering !== null;
  }

  /** Hotkey page shown: 0 = slots 1-4, 1 = slots 5-8. */
  get currentPage(): 0 | 1 {
    return this.page;
  }

  /** Lets go of the joystick (finger lifted, device turned, the game paused or left). */
  release(): void {
    this.stickPointer = null;
    this.drawKnob(0, 0);
    if (this.steering) {
      this.steering = null;
      this.callbacks.onSteer(null);
    }
  }

  /** Icons, quantities and the dimmed empty / unusable buttons of the page shown and of the potions. */
  refresh(): void {
    const c = this.character;
    const state = HotbarService.state(c);
    this.tabLabel.setText(this.page === 0 ? '1-4' : '5-8');
    this.slots.forEach((b, i) => {
      const slot = slotOfButton(this.page, i);
      const e = state[slot] ?? null;
      const count = e?.type === 'item' ? itemCount(c.inventory, e.itemId) : null;
      const usable = e?.type === 'item' ? count !== 0 : e ? isSkillUnlocked(c, e.skillId) : false;
      this.show(b, e, count, usable, String(slot + 1));
    });
    const potions = HotbarService.potions(c);
    for (const key of POTION_SLOT_KEYS) {
      const itemId = potions[key];
      const count = itemId ? itemCount(c.inventory, itemId) : null;
      this.show(this.potions[key], itemId ? { type: 'item', itemId } : null, count, count !== null && count > 0, key === 'hp' ? 'HP' : 'SP');
    }
  }

  /** Per frame: the cooldown sweep of the skill buttons on the page shown (the same sweep as the desktop hotbar). */
  update(cooldown: (skillId: string) => { remainingMs: number; totalMs: number } | null): void {
    const state = HotbarService.state(this.character);
    let dirty = false;
    this.slots.forEach((b, i) => {
      const e = state[slotOfButton(this.page, i)] ?? null;
      const c = e?.type === 'skill' && b.icon.visible ? cooldown(e.skillId) : null;
      const key = c ? `${this.page}:${sweepStep(c.remainingMs, c.totalMs)}:${cooldownSeconds(c.remainingMs)}` : 'ready';
      if (key === b.sweepKey) return;
      b.sweepKey = key;
      dirty = true;
      b.mask.clear();
      if (!c) {
        b.gray.setVisible(false);
        b.cooldown.setText('');
        return;
      }
      const wedge = remainingWedge({ x: b.icon.x, y: b.icon.y }, Math.ceil(Math.max(b.icon.displayWidth, b.icon.displayHeight)), elapsedFraction(c.remainingMs, c.totalMs));
      b.mask.fillStyle(0xffffff, 1).fillPoints(wedge, true);
      b.gray.setVisible(true);
      b.cooldown.setText(String(cooldownSeconds(c.remainingMs)));
    });
    if (!dirty) return;
    const g = this.hands.clear();
    this.slots.forEach((b, i) => {
      if (!b.gray.visible) return;
      const e = state[slotOfButton(this.page, i)];
      const c = e?.type === 'skill' ? cooldown(e.skillId) : null;
      if (!c) return;
      const r = Math.floor(Math.min(b.icon.displayWidth, b.icon.displayHeight) / 2);
      const a = handAngle(elapsedFraction(c.remainingMs, c.totalMs));
      g.lineStyle(1, 0xe7e7ee, 0.8).lineBetween(b.icon.x, b.icon.y, Math.round(b.icon.x + Math.cos(a) * r), Math.round(b.icon.y + Math.sin(a) * r));
    });
  }

  // -------------------------------------------------------------------------------------------

  private moveStick(p: Phaser.Input.Pointer): void {
    const J = this.layout.joystick;
    const s = joystickState(p.x - J.x, p.y - J.y, J.r, TOUCH.joystick.deadzone);
    this.drawKnob(s.knob.x, s.knob.y);
    const next = s.direction ? screenToGround(s.direction) : null;
    if (!next && !this.steering) return;
    this.steering = next;
    this.callbacks.onSteer(next);
  }

  private drawKnob(dx: number, dy: number): void {
    const J = this.layout.joystick;
    const x = J.x + dx;
    const y = J.y + dy;
    const g = this.knob.clear();
    g.fillStyle(0x34343c, 0.95).fillCircle(x, y, J.knob);
    g.lineStyle(2, C.rimBright, 1).strokeCircle(x, y, J.knob);
    g.fillStyle(0x222228, 1).fillCircle(x, y, J.knob - 5);
    const w = KNOB_EMBLEM[0].length;
    const left = x - Math.floor(w / 2);
    const top = y - Math.floor(KNOB_EMBLEM.length / 2);
    g.fillStyle(C.glyph, 0.9);
    KNOB_EMBLEM.forEach((row, j) => [...row].forEach((ch, i) => ch === '#' && g.fillRect(left + i, top + j, 1, 1)));
  }

  /** A round button: ring, icon (+ its grayscale cooldown copy), seconds left, quantity, its slot label. */
  private button(c: Circle, label: string, onPress: () => void): ButtonView {
    const d = this.depth;
    const scene = this.scene;
    const ring = scene.add.graphics().setDepth(d + 1);
    const icon = scene.add.image(c.x, c.y, '__DEFAULT').setDepth(d + 2).setVisible(false);
    const gray = scene.add.image(c.x, c.y, '__DEFAULT').setDepth(d + 2).setVisible(false);
    const fx = gray.preFX?.addColorMatrix();
    if (fx) {
      fx.grayscale(1);
      fx.brightness(0.55, true);
    } else gray.setTint(0x555555);
    const mask = scene.make.graphics({}, false);
    gray.setMask(mask.createGeometryMask());
    const cooldown = scene.add.text(c.x, c.y, '', typo('small', PALETTE.white)).setOrigin(0.5, 0.5).setStroke(PALETTE.black, 3).setDepth(d + 3);
    const count = scene.add.text(c.x + c.r - 4, c.y + c.r - 2, '', typo('small', PALETTE.white)).setOrigin(1, 1).setStroke(PALETTE.black, 3).setDepth(d + 3);
    const tag = scene.add.text(c.x - c.r + 5, c.y - c.r + 2, label, typo('small', PALETTE.gray)).setOrigin(0, 0).setStroke(PALETTE.black, 2).setDepth(d + 3);
    const view: ButtonView = { circle: c, ring, icon, gray, mask, cooldown, count, label: tag, zone: null as unknown as Phaser.GameObjects.Zone, sweepKey: '', usable: false };
    view.zone = this.circleZone(c, () => {
      this.flash(ring);
      onPress();
    });
    return view;
  }

  private show(b: ButtonView, e: HotbarEntry | null, count: number | null, usable: boolean, label: string): void {
    const pic = e ? entryIcon(e) : null;
    const shown = pic !== null && this.scene.textures.exists(pic.texture);
    b.icon.setVisible(shown);
    if (shown) {
      b.icon.setTexture(pic.texture, pic.frame).setScale(pic.largeScale).setAlpha(usable ? 1 : 0.35);
      b.gray.setTexture(pic.texture, pic.frame).setScale(pic.largeScale);
    } else b.gray.setVisible(false);
    b.count.setText(count === null ? '' : String(count));
    b.label.setText(label);
    b.sweepKey = '';
    b.usable = shown && usable;
    const { x, y, r } = b.circle;
    const g = b.ring.clear();
    // an empty or unusable button is drawn dimmed (the same frame, faded)
    const lit = b.usable;
    g.fillStyle(C.fill, lit ? 0.85 : 0.5).fillCircle(x, y, r);
    g.lineStyle(2, lit ? C.rim : C.dim, lit ? 1 : 0.75).strokeCircle(x, y, r);
    g.lineStyle(1, C.inner, 1).strokeCircle(x, y, r - 3);
    b.label.setAlpha(lit ? 1 : 0.6);
  }

  /** A circular touch area; it fires on touch-down (no waiting for the lift). */
  private circleZone(c: Circle, onPress: () => void): Phaser.GameObjects.Zone {
    const zone = this.scene.add.zone(c.x, c.y, c.r * 2, c.r * 2).setDepth(this.depth + 4);
    zone.setInteractive(new Phaser.Geom.Circle(c.r, c.r, c.r), Phaser.Geom.Circle.Contains);
    zone.on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      if (p.button !== 0) return;
      event.stopPropagation();
      onPress();
    });
    return zone;
  }

  /** A short press flash on a control. */
  private flash(g: Phaser.GameObjects.Graphics): void {
    g.setAlpha(0.55);
    this.scene.time.delayedCall(120, () => g.active && g.setAlpha(1));
  }
}

/** A speech bubble (talk): a pale rounded bubble with a gold edge, a tail to the lower left and three dark dots. */
function drawSpeechBubble(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
  const w = 34;
  const h = 24;
  const x = cx - w / 2;
  const y = cy - h / 2 - 3;
  g.fillStyle(C.glyph, 1).fillRoundedRect(x, y, w, h, 7);
  g.fillTriangle(cx - 11, y + h - 2, cx - 1, y + h - 2, cx - 14, y + h + 8);
  g.lineStyle(1, C.gold, 1).strokeRoundedRect(x, y, w, h, 7);
  g.fillStyle(0x1b1b21, 1);
  for (const dx of [-9, 0, 9]) g.fillRect(cx + dx - 2, y + Math.floor(h / 2) - 2, 4, 4);
}

/** Two crossed blades (pixel-stepped): silver steel with a pale-blue edge, gold cross-guards and pommels, dark grips. */
function drawCrossedSwords(g: Phaser.GameObjects.Graphics, cx: number, cy: number, size: number): void {
  const s = Math.max(8, Math.floor(size));
  for (const dir of [1, -1]) {
    // dir 1: grip lower-left, tip upper-right; dir -1: grip lower-right, tip upper-left
    const at = (t: number): Point => ({ x: cx - dir * s + dir * t, y: cy + s - t });
    for (let t = 9; t <= 2 * s; t++) {
      const p = at(t);
      g.fillStyle(C.glyph, 1).fillRect(p.x, p.y, 2, 2);
      g.fillStyle(C.glow, 0.9).fillRect(p.x + (dir > 0 ? 2 : -1), p.y + 1, 1, 1);
    }
    for (let t = 1; t <= 6; t++) {
      const p = at(t);
      g.fillStyle(0x5a4626, 1).fillRect(p.x, p.y, 2, 2);
    }
    // the guard runs across the blade: direction (dir, -1) -> across (1, dir)
    const guard = at(8);
    g.fillStyle(C.gold, 1);
    for (let k = -4; k <= 4; k++) g.fillRect(guard.x + k, guard.y + dir * k, 2, 2);
    const pommel = at(0);
    g.fillRect(pommel.x - 1, pommel.y - 1, 3, 3);
  }
}
