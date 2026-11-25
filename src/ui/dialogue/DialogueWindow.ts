import Phaser from 'phaser';
import { DialogueSession } from '../../dialogue/Dialogues';
import { translate } from '../../i18n';
import { localize } from '../../i18n/phaser';
import { typo } from '../UITheme';
import { wrapText } from '../text/wrapText';
import { uiView } from '../layout/UiLayers';
import type { Rect as ScreenRect } from '../tutorial/SpotlightGeometry';
import { rectInContainer } from '../tutorial/SpotlightOverlay';

/** Same flat palette as the Passive Tree window (minimal layer pack). */
const C = { line: 0xe7e7ee, dim: 0x3a3a45, fill: 0x0e0e12, red: 0xd3424b, name: '#e8dcb8', text: '#e7e7ee' } as const;
const PANEL = { width: 560, height: 88, bottom: 72 } as const;
const PAD_X = 20;
/** The NEXT arrow's box at the bottom right inside the panel (it lights up under the pointer). */
const NEXT = { width: 30, height: 24, inset: 5 } as const;
/** Gentle blink of the arrow. */
const BLINK = { from: 1, to: 0.35, ms: 650 } as const;

export interface DialogueHooks {
  /** Asked before a later step is shown (0-based). False = the conversation is broken off instead. */
  beforeStep?: (step: number) => boolean;
  /** The conversation was broken off (window already closed); onFinished does not run. */
  onInterrupted?: () => void;
  /** A picture shown above the window during a step (0-based), e.g. the creature a quest is about. */
  picture?: (step: number) => DialoguePicture | null;
  /**
   * false = a tutorial guide line: no dimming layer, so the controls a tutorial spotlight points at stay usable
   * (the spotlight decides what can be clicked). The window itself still advances on a click inside it.
   */
  modal?: boolean;
  /** 'top' = at the top of the screen (guide lines over a window whose lower part is in use). Default 'bottom'. */
  position?: 'bottom' | 'top';
  /**
   * A question: at `step` the line is shown with these answers (translation keys) above the window instead of the
   * continuation arrow. Clicking one closes the window and calls onChoose(index) - the caller opens the branch
   * (onFinished does not run). The window itself does not advance while answers are shown.
   */
  choices?: { step: number; options: readonly string[]; onChoose: (index: number) => void };
}

/** An open conversation as it is now: a rebuilt UI (new view size / UI scale) reopens it where it was. */
export interface DialogueSnapshot {
  speaker: string;
  lines: readonly string[];
  step: number;
  onFinished: () => void;
  hooks: DialogueHooks;
}

/** The answer boxes above the window: one under the other, the last one just above the window. */
const CHOICE = { width: 300, height: 26, gap: 6, above: 8 } as const;

/** Top edge of the window when it is shown at the top of the screen. */
const TOP_Y = 6;

/** A frame of a loaded texture, drawn at a whole-number scale (nearest neighbour). */
export interface DialoguePicture {
  texture: string;
  frame: string | number;
  scale: number;
}

/** Space between the picture's frame and the dialogue window, and inside the frame. */
const PICTURE = { gap: 8, padding: 8 } as const;

/**
 * NPC dialogue: speaker name, one line of dialogue at a time, a blinking arrow at the bottom right. A left
 * click anywhere inside the window (text, empty space or arrow) goes to the next step and closes it after
 * the last one; press and release inside = exactly one step. Clicks outside do nothing: a dim full-screen
 * layer takes them, so neither the HUD nor the world reacts. The click that opened the conversation never
 * counts, its press was not on the window.
 */
export class DialogueWindow {
  private readonly blocker: Phaser.GameObjects.Rectangle;
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly lineText: Phaser.GameObjects.Text;
  private readonly next: Phaser.GameObjects.Graphics;
  private readonly blink: Phaser.Tweens.Tween;
  private readonly textWidth: number;
  private session: DialogueSession | null = null;
  private lines: readonly string[] | null = null;
  private onFinished: (() => void) | null = null;
  private hooks: DialogueHooks = {};
  private speaker = '';
  /** A left press that began on the window and has not been released, moved off or used yet. */
  private pressed = false;
  private readonly pictureFrame: Phaser.GameObjects.Graphics;
  private readonly pictureImage: Phaser.GameObjects.Image;
  private panelTop: number;
  /** The answers shown now (each a frame, a label and its click zone). */
  private choiceObjects: Phaser.GameObjects.GameObject[] = [];
  private readonly scene: Phaser.Scene;
  private readonly depth: number;
  /** Bottom position of the panel; open() moves everything by the difference for 'top'. */
  private readonly baseY: number;

  constructor(scene: Phaser.Scene, depth: number) {
    this.scene = scene;
    this.depth = depth;
    const { width: sw, height: sh } = uiView(scene, 'windows');
    const x = Math.round((sw - PANEL.width) / 2);
    const y = sh - PANEL.bottom - PANEL.height;
    this.textWidth = PANEL.width - PAD_X * 2 - NEXT.width;
    this.baseY = y;

    this.blocker = scene.add.rectangle(0, 0, sw, sh, 0x000000, 0.25).setOrigin(0, 0).setDepth(depth);
    this.panel = scene.add.graphics({ x, y }).setDepth(depth + 1);
    this.nameText = scene.add.text(x + PAD_X, y + 8, '', typo('section', C.name)).setDepth(depth + 2);
    this.lineText = scene.add.text(x + PAD_X, y + 33, '', typo('section', C.text, { fontStyle: '400' })).setLineSpacing(2).setDepth(depth + 2);
    this.next = scene.add
      .graphics({ x: x + PANEL.width - NEXT.inset - NEXT.width, y: y + PANEL.height - NEXT.inset - NEXT.height })
      .setDepth(depth + 3);

    // The whole panel is one click area; text and arrow lie on it and take no input of their own.
    const overArrow = (x: number, y: number): boolean => x >= this.next.x - this.panel.x && y >= this.next.y - this.panel.y;
    this.panel.on('pointermove', (_p: Phaser.Input.Pointer, x: number, y: number) => this.drawNext(overArrow(x, y), this.pressed));
    this.panel.on('pointerout', () => {
      this.pressed = false;
      this.drawNext(false, false);
    });
    this.panel.on('pointerdown', (pointer: Phaser.Input.Pointer, x: number, y: number) => {
      this.pressed = pointer.leftButtonDown() && pointer.button === 0;
      this.drawNext(overArrow(x, y), this.pressed);
    });
    this.panel.on('pointerup', (pointer: Phaser.Input.Pointer, x: number, y: number) => {
      const fire = this.pressed && pointer.button === 0;
      this.pressed = false;
      this.drawNext(overArrow(x, y), false);
      if (fire) this.advance();
    });
    this.blink = scene.tweens.add({ targets: this.next, alpha: { from: BLINK.from, to: BLINK.to }, duration: BLINK.ms, ease: 'Sine.easeInOut', yoyo: true, repeat: -1, paused: true });
    // the picture of a step: centred above the window, in a frame like the window's own
    this.panelTop = y;
    this.pictureFrame = scene.add.graphics().setDepth(depth + 1);
    this.pictureImage = scene.add.image(Math.round(sw / 2), 0, '__DEFAULT').setOrigin(0.5, 1).setDepth(depth + 2);
    this.setVisible(false);
    // the current line follows a language change
    localize(scene, () => this.showLine());
  }

  get isOpen(): boolean {
    return this.session !== null;
  }

  /** Open and dimming everything else (an ordinary conversation, not a tutorial guide line). */
  get isModal(): boolean {
    return this.session !== null && this.hooks.modal !== false;
  }

  /**
   * The box of a tutorial guide line on the screen (non-modal: the step waits for a click on it), for the spotlight
   * to light and leave clickable; null while none is shown.
   */
  guideArea(): ScreenRect | null {
    if (!this.session || this.hooks.modal !== false) return null;
    return rectInContainer(this.scene, this.panel, { x: 0, y: 0, width: PANEL.width, height: PANEL.height });
  }

  /** Where the guide line shown now sits (null = none, or an ordinary conversation). */
  get guidePosition(): 'top' | 'bottom' | null {
    return this.session && this.hooks.modal === false ? (this.hooks.position ?? 'bottom') : null;
  }

  /** Moves the guide line shown now to the top or the bottom (kept in its hooks: a UI rebuild reopens it there). */
  moveGuide(position: 'top' | 'bottom'): void {
    if (!this.session || this.hooks.modal !== false) return;
    this.hooks = { ...this.hooks, position };
    this.placeAt(position === 'top' ? TOP_Y : this.baseY);
  }

  /** The conversation open now was opened with these lines (for tutorials that show guide lines). */
  isShowing(lines: readonly string[]): boolean {
    return this.session !== null && this.lines === lines;
  }

  /** Closes the window without finishing the conversation (onFinished and onInterrupted do not run). */
  dismiss(): void {
    if (this.session) this.close();
  }

  /** A picture is shown above the window now (for checks). */
  get pictureShown(): boolean {
    return this.pictureImage.visible;
  }

  /** The step shown now (0-based), or null when closed. */
  get step(): number | null {
    return this.session?.step ?? null;
  }

  /** Opens a conversation; `onFinished` runs once, after the last step was confirmed and the window closed. */
  open(speaker: string, lines: readonly string[], onFinished: () => void, hooks: DialogueHooks = {}): void {
    this.speaker = speaker;
    this.session = new DialogueSession(lines);
    this.lines = lines;
    this.onFinished = onFinished;
    this.hooks = hooks;
    this.placeAt(hooks.position === 'top' ? TOP_Y : this.baseY);
    this.nameText.setText(speaker);
    this.drawPanel();
    this.setVisible(true);
    this.showLine();
  }

  /** The conversation open now (null = none) - the same lines, step, callback and hooks. */
  snapshot(): DialogueSnapshot | null {
    if (!this.session || !this.lines || !this.onFinished) return null;
    return { speaker: this.speaker, lines: this.lines, step: this.session.step, onFinished: this.onFinished, hooks: this.hooks };
  }

  /** Reopens a conversation at the step it was on (nothing is asked or run for the steps passed again). */
  restore(s: DialogueSnapshot): void {
    this.open(s.speaker, s.lines, s.onFinished, s.hooks);
    for (let i = 0; i < s.step && this.session && !this.session.isLastStep; i++) this.session.next();
    this.showLine();
  }

  /** Moves the window so its top edge is at `y` (text, arrow and click area move with it). */
  private placeAt(y: number): void {
    const dy = y - this.panel.y;
    if (dy === 0) return;
    for (const o of [this.panel, this.nameText, this.lineText, this.next]) o.y += dy;
    this.panelTop = y;
  }

  /** Answers are shown now (for checks / tests). */
  get choicesShown(): number {
    return this.choiceObjects.length / 3;
  }

  /** Picks answer `index` of the question shown now (what a click on it does). */
  choose(index: number): void {
    const q = this.hooks.choices;
    if (!this.session || !q || this.session.step !== q.step || index < 0 || index >= q.options.length) return;
    this.close();
    q.onChoose(index);
  }

  private advance(): void {
    const session = this.session;
    if (!session) return;
    if (this.hooks.choices?.step === session.step) return; // a question: only an answer goes on
    const { onFinished, hooks } = this;
    if (!session.isLastStep && hooks.beforeStep?.(session.step + 1) === false) {
      this.close();
      hooks.onInterrupted?.();
      return;
    }
    if (!session.next()) {
      this.showLine();
      return;
    }
    this.close();
    onFinished?.();
  }

  private close(): void {
    this.showChoices(null);
    this.session = null;
    this.lines = null;
    this.onFinished = null;
    this.hooks = {};
    this.setVisible(false);
  }

  private showLine(): void {
    if (!this.session) return;
    const { canvas, context, style } = this.lineText;
    style.syncFont(canvas, context);
    const measure = (s: string): number => context.measureText(s).width;
    this.lineText.setText(wrapText(translate(this.session.line), this.textWidth, measure));
    this.showPicture(this.hooks.picture?.(this.session.step) ?? null);
    const q = this.hooks.choices;
    this.showChoices(q && q.step === this.session.step ? q.options : null);
  }

  /** The answers of a question above the window, in its style (light frame, red on hover); null hides them. */
  private showChoices(options: readonly string[] | null): void {
    for (const o of this.choiceObjects) o.destroy();
    this.choiceObjects = [];
    this.next.setVisible(options === null && this.session !== null);
    if (!options) return;
    const x = Math.round(this.panel.x + (PANEL.width - CHOICE.width) / 2);
    options.forEach((key, i) => {
      const y = this.panelTop - CHOICE.above - (options.length - i) * (CHOICE.height + CHOICE.gap) + CHOICE.gap;
      const frame = this.scene.add.graphics({ x, y }).setDepth(this.depth + 2);
      const label = this.scene.add.text(x + CHOICE.width / 2, y + CHOICE.height / 2, translate(key), typo('body', C.text)).setOrigin(0.5).setDepth(this.depth + 3);
      const draw = (hover: boolean): void => {
        frame.clear();
        frame.fillStyle(C.fill, 0.96).fillRect(0, 0, CHOICE.width, CHOICE.height);
        frame.fillStyle(hover ? C.red : C.line, 1).fillRect(0, 0, CHOICE.width, 1).fillRect(0, CHOICE.height - 1, CHOICE.width, 1).fillRect(0, 0, 1, CHOICE.height).fillRect(CHOICE.width - 1, 0, 1, CHOICE.height);
        label.setColor(hover ? '#f0a0a5' : C.text);
      };
      draw(false);
      const zone = this.scene.add.zone(x, y, CHOICE.width, CHOICE.height).setOrigin(0, 0).setDepth(this.depth + 4).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => draw(true));
      zone.on('pointerout', () => draw(false));
      zone.on('pointerup', (p: Phaser.Input.Pointer) => p.button === 0 && this.choose(i));
      this.choiceObjects.push(frame, label, zone);
    });
  }

  /** The picture of the current step; hidden when it has none (or its texture is not loaded). */
  private showPicture(picture: DialoguePicture | null): void {
    const g = this.pictureFrame;
    g.clear();
    const shown = picture !== null && this.pictureImage.scene.textures.exists(picture.texture);
    this.pictureImage.setVisible(shown);
    g.setVisible(shown);
    if (!shown) return;
    const image = this.pictureImage.setTexture(picture.texture, picture.frame).setScale(Math.max(1, Math.round(picture.scale)));
    const w = Math.round(image.displayWidth) + PICTURE.padding * 2;
    const h = Math.round(image.displayHeight) + PICTURE.padding * 2;
    const x = Math.round(image.x - w / 2);
    const y = this.panelTop - PICTURE.gap - h;
    image.setY(y + h - PICTURE.padding);
    g.fillStyle(C.fill, 0.96).fillRect(x, y, w, h);
    g.fillStyle(C.line, 1).fillRect(x, y, w, 1).fillRect(x, y + h - 1, w, 1).fillRect(x, y, 1, h).fillRect(x + w - 1, y, 1, h);
    g.fillStyle(C.dim, 1).fillRect(x + 2, y + 2, w - 4, 1);
  }

  /** Dark panel, 1-px light border, dim inner line, a rule and red marks around the speaker name. */
  private drawPanel(): void {
    const g = this.panel;
    const { width: w, height: h } = PANEL;
    g.clear();
    g.fillStyle(C.fill, 0.96).fillRect(0, 0, w, h);
    g.fillStyle(C.line, 1).fillRect(0, 0, w, 1).fillRect(0, h - 1, w, 1).fillRect(0, 0, 1, h).fillRect(w - 1, 0, 1, h);
    g.fillStyle(C.dim, 1).fillRect(2, 2, w - 4, 1);
    g.fillRect(PAD_X, 28, w - PAD_X * 2, 1);
    g.fillStyle(C.red, 1).fillRect(PAD_X - 9, 15, 4, 4);
  }

  /** The continuation arrow: a solid triangle pointing down with a short bar under it. */
  private drawNext(hover: boolean, down: boolean): void {
    const g = this.next;
    g.clear();
    g.fillStyle(hover ? C.red : C.line, 1);
    const cx = Math.floor(NEXT.width / 2);
    const top = 7 + (down ? 1 : 0);
    for (let i = 0; i < 6; i++) g.fillRect(cx - 5 + i, top + i, 11 - i * 2, 1);
    g.fillRect(cx - 5, top + 8, 11, 1);
  }

  private setVisible(visible: boolean): void {
    for (const o of [this.blocker, this.panel, this.nameText, this.lineText, this.next]) o.setVisible(visible);
    if (!visible) {
      this.showPicture(null);
      this.showChoices(null);
    }
    const modal = visible && this.hooks.modal !== false;
    this.blocker.setVisible(modal);
    this.pressed = false;
    this.drawNext(false, false);
    if (visible) {
      if (modal) this.blocker.setInteractive();
      else if (this.blocker.input) this.blocker.disableInteractive();
      this.panel.setInteractive({ hitArea: new Phaser.Geom.Rectangle(0, 0, PANEL.width, PANEL.height), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
      this.blink.resume();
    } else {
      if (this.blocker.input) this.blocker.disableInteractive();
      if (this.panel.input) this.panel.disableInteractive();
      this.blink.pause();
    }
  }
}
