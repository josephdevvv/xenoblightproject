import Phaser from 'phaser';
import { DialogueSession } from '../../dialogue/Dialogues';
import { typo } from '../UITheme';
import { wrapText } from '../text/wrapText';

/** Same flat palette as the Passive Tree window (minimal layer pack). */
const C = { line: 0xe7e7ee, dim: 0x3a3a45, fill: 0x0e0e12, red: 0xd3424b, name: '#e8dcb8', text: '#e7e7ee' } as const;
const PANEL = { width: 560, height: 88, bottom: 72 } as const;
const PAD_X = 20;
/** The NEXT arrow's box at the bottom right inside the panel (it lights up under the pointer). */
const NEXT = { width: 30, height: 24, inset: 5 } as const;
/** Gentle blink of the arrow. */
const BLINK = { from: 1, to: 0.35, ms: 650 } as const;

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
  private onFinished: (() => void) | null = null;
  /** A left press that began on the window and has not been released, moved off or used yet. */
  private pressed = false;

  constructor(scene: Phaser.Scene, depth: number) {
    const { width: sw, height: sh } = scene.scale;
    const x = Math.round((sw - PANEL.width) / 2);
    const y = sh - PANEL.bottom - PANEL.height;
    this.textWidth = PANEL.width - PAD_X * 2 - NEXT.width;

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
    this.setVisible(false);
  }

  get isOpen(): boolean {
    return this.session !== null;
  }

  /** The step shown now (0-based), or null when closed. */
  get step(): number | null {
    return this.session?.step ?? null;
  }

  /** Opens a conversation; `onFinished` runs once, after the last step was confirmed and the window closed. */
  open(speaker: string, lines: readonly string[], onFinished: () => void): void {
    this.session = new DialogueSession(lines);
    this.onFinished = onFinished;
    this.nameText.setText(speaker);
    this.drawPanel();
    this.setVisible(true);
    this.showLine();
  }

  private advance(): void {
    const session = this.session;
    if (!session) return;
    if (!session.next()) {
      this.showLine();
      return;
    }
    const done = this.onFinished;
    this.session = null;
    this.onFinished = null;
    this.setVisible(false);
    done?.();
  }

  private showLine(): void {
    if (!this.session) return;
    const { canvas, context, style } = this.lineText;
    style.syncFont(canvas, context);
    const measure = (s: string): number => context.measureText(s).width;
    this.lineText.setText(wrapText(this.session.line, this.textWidth, measure));
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
    this.pressed = false;
    this.drawNext(false, false);
    if (visible) {
      this.blocker.setInteractive();
      this.panel.setInteractive({ hitArea: new Phaser.Geom.Rectangle(0, 0, PANEL.width, PANEL.height), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
      this.blink.resume();
    } else {
      if (this.blocker.input) this.blocker.disableInteractive();
      if (this.panel.input) this.panel.disableInteractive();
      this.blink.pause();
    }
  }
}
