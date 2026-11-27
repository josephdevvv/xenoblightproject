import Phaser from 'phaser';
import { t } from '../../i18n';
import { localize } from '../../i18n/phaser';
import { dissolveNoise, dissolvePixels, ghostPixels, opaqueRows } from '../../player/death/GhostPixels';
import { typo } from '../UITheme';
import { ButtonPress } from './ButtonPress';
import { layerZoom, TEXT_RESOLUTION_KEY, UI_LAYER_KEY } from '../layout/UiLayers';

/** The player's drawn frame at the moment of death, and where it is on screen. */
export interface DeathCapture {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  /** Screen position of the sprite's ground root (whole pixels). */
  screenX: number;
  screenY: number;
  originX: number;
  originY: number;
  scaleX: number;
  scaleY: number;
  flipX: boolean;
}

/** Death transition timing (ms). */
export const DEATH_TIMING = {
  /** dying: the body dissolves while the ghost appears; then the dead state starts */
  transition: 1000,
  dissolve: 900,
  ghostFrom: 250,
  overlayFrom: 650,
  overlayIn: 450,
  uiIn: 350,
  /** respawn: overlay, ghost and text fade out */
  out: 320,
} as const;

/** Overlay darkness while dead (the world stays faintly visible). */
export const DEATH_OVERLAY_ALPHA = 0.7;
const GHOST_ALPHA = 0.9;
/** Below the ghost's feet: the world name label (3 px gap + small text) and some air. */
const NAME_LABEL_SPACE = 22;
const GHOST_RISE = 4;
const HOVER_PERIOD = 2600;
const HOVER_AMPLITUDE = 2;

const BUTTON = { width: 168, height: 26, fill: 0x1c1c22, fillHover: 0x26262e, fillDown: 0x141418, line: 0x56565f, lineHover: 0x9a9aa3, text: '#d6d1c8' } as const;

type Phase = 'hidden' | 'dying' | 'dead' | 'leaving';

/**
 * Screen-space death presentation (GameUIScene, above the HUD and every window):
 *  - DYING: a copy of the player's current frame dissolves pixel by pixel while a ghost built from the same
 *    frame (GhostPixels) materialises and rises a few pixels; the dark overlay starts to fade in;
 *  - DEAD: overlay at ~70 %, the ghost hovering above it (so it stays visible), "ตาย..." and one respawn
 *    button - until it is clicked (no auto-respawn);
 *  - leaving: everything fades out, then the respawn callback runs.
 * The full-screen overlay is interactive from the first frame of DYING, so no click reaches the HUD or the
 * world while the player is not alive. Only one set of objects exists; textures are replaced per death.
 *
 * In-game UI layers (UiLayers): everything is on the SCREEN layer - drawn and hit-tested last, above every window
 * and the tutorial spotlight, in screen pixels like the captured body (the world camera never zooms). The title and
 * the button take the windows' UI scale (scaled, text rendered at that resolution), so they look like the rest of
 * the UI and are laid out with their scaled sizes - always on the screen.
 */
export class DeathOverlay {
  private readonly overlay: Phaser.GameObjects.Rectangle;
  private readonly title: Phaser.GameObjects.Text;
  private readonly buttonBox: Phaser.GameObjects.Graphics;
  private readonly buttonText: Phaser.GameObjects.Text;
  private body: Phaser.GameObjects.Image | null = null;
  private ghost: Phaser.GameObjects.Image | null = null;
  private bodyTexture: Phaser.Textures.CanvasTexture | null = null;
  private bodyPixels: Uint8ClampedArray | null = null;
  private noise: Float32Array | null = null;
  private capture: DeathCapture | null = null;
  private phase: Phase = 'hidden';
  private elapsed = 0;
  private hoverMs = 0;
  private lastDissolveStep = -1;
  private readonly press = new ButtonPress();
  private clicked = false;
  /** The windows' UI scale: the title and the button are drawn at it. */
  private readonly zoom: number;
  private onDead: (() => void) | null = null;
  private onRespawn: (() => void) | null = null;
  private onGone: (() => void) | null = null;
  private deathId = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth: number,
  ) {
    const { width: sw, height: sh } = scene.scale;
    const z = (this.zoom = layerZoom(scene, 'windows'));
    const screen = <T extends Phaser.GameObjects.GameObject>(o: T): T => o.setData(UI_LAYER_KEY, 'screen');
    this.overlay = screen(scene.add.rectangle(0, 0, sw, sh, 0x000000, 1).setOrigin(0, 0).setDepth(depth).setAlpha(0).setVisible(false));
    this.title = screen(scene.add.text(Math.round(sw / 2), Math.round(sh / 2) - 36, '', typo('display', '#cfc9c0', { stroke: '#000000', strokeThickness: 2 })).setOrigin(0.5).setDepth(depth + 3).setVisible(false));
    const bx = Math.round(sw / 2 - (BUTTON.width * z) / 2);
    const by = Math.round(sh / 2 + 6);
    this.buttonBox = screen(scene.add.graphics({ x: bx, y: by }).setDepth(depth + 3).setVisible(false));
    this.buttonText = screen(scene.add.text(Math.round(sw / 2), by + (BUTTON.height * z) / 2, '', typo('button', BUTTON.text)).setOrigin(0.5).setDepth(depth + 4).setVisible(false));
    for (const o of [this.title, this.buttonBox, this.buttonText]) o.setScale(z);
    for (const o of [this.title, this.buttonText]) o.setData(TEXT_RESOLUTION_KEY, z);
    // Hover and press are separate (ButtonPress): a touch tap gets pointerover after pointerdown - it must not
    // cancel the press, or the release would not count and the player could not respawn.
    this.buttonBox.on('pointerover', () => {
      this.press.over();
      this.drawButton();
    });
    this.buttonBox.on('pointerout', () => {
      this.press.out();
      this.drawButton();
    });
    this.buttonBox.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button !== 0) return;
      this.press.press();
      this.drawButton();
    });
    this.buttonBox.on('pointerup', () => {
      const click = this.press.release();
      this.drawButton();
      if (click) this.clickRespawn();
    });
    localize(scene, () => {
      this.title.setText(t('death.title'));
      this.buttonText.setText(t('death.respawn'));
    });
    this.resetButton();
  }

  get isActive(): boolean {
    return this.phase !== 'hidden';
  }

  get currentPhase(): Phase {
    return this.phase;
  }

  /** Starts the DYING transition. `onDead` when it ends, `onRespawn` once when the button is clicked. */
  play(capture: DeathCapture, onDead: () => void, onRespawn: () => void): void {
    this.clear();
    this.deathId++;
    this.capture = capture;
    this.onDead = onDead;
    this.onRespawn = onRespawn;
    this.phase = 'dying';
    this.elapsed = 0;
    this.hoverMs = 0;
    this.lastDissolveStep = -1;
    this.clicked = false;

    const keyBody = `death.body.${this.deathId}`;
    const keyGhost = `death.ghost.${this.deathId}`;
    this.bodyTexture = this.scene.textures.createCanvas(keyBody, capture.width, capture.height);
    this.bodyPixels = capture.rgba;
    this.noise = dissolveNoise(capture.width, capture.height, 0x5eed + this.deathId);
    this.writeBody(0);
    const ghostTexture = this.scene.textures.createCanvas(keyGhost, capture.width, capture.height)!;
    putPixels(ghostTexture, ghostPixels(capture.rgba, capture.width, capture.height), capture.width, capture.height);

    const place = (img: Phaser.GameObjects.Image) =>
      img.setOrigin(capture.originX, capture.originY).setScale(capture.scaleX, capture.scaleY).setFlipX(capture.flipX);
    this.body = place(this.scene.add.image(capture.screenX, capture.screenY, keyBody)).setDepth(this.depth + 1).setData(UI_LAYER_KEY, 'screen');
    this.ghost = place(this.scene.add.image(capture.screenX, capture.screenY, keyGhost)).setDepth(this.depth + 2).setAlpha(0).setData(UI_LAYER_KEY, 'screen');

    // block every click from the first frame (the overlay is still transparent)
    this.overlay.setVisible(true).setAlpha(0).setInteractive();
    this.title.setVisible(false).setAlpha(0);
    this.buttonBox.setVisible(false).setAlpha(0);
    this.buttonText.setVisible(false).setAlpha(0);
    this.disableButton();
    this.layoutAround(capture);
  }

  /** Respawn: fades everything out, then calls `onGone`. */
  leave(onGone: () => void): void {
    if (this.phase === 'hidden') {
      onGone();
      return;
    }
    this.phase = 'leaving';
    this.elapsed = 0;
    this.onGone = onGone;
    this.disableButton();
  }

  update(deltaMs: number): void {
    if (this.phase === 'hidden' || !this.capture) return;
    this.elapsed += deltaMs;
    const T = DEATH_TIMING;
    if (this.phase === 'dying') {
      const k = Math.min(1, this.elapsed / T.dissolve);
      this.writeBody(k);
      const g = clamp01((this.elapsed - T.ghostFrom) / (T.transition - T.ghostFrom));
      this.ghost?.setAlpha(GHOST_ALPHA * g);
      this.placeGhost(-Math.round(GHOST_RISE * g));
      this.overlay.setAlpha(DEATH_OVERLAY_ALPHA * clamp01((this.elapsed - T.overlayFrom) / T.overlayIn));
      if (this.elapsed >= T.transition) {
        this.phase = 'dead';
        this.elapsed = 0;
        this.body?.setVisible(false);
        this.title.setVisible(true);
        this.buttonBox.setVisible(true);
        this.buttonText.setVisible(true);
        this.enableButton();
        this.onDead?.();
      }
      return;
    }
    if (this.phase === 'dead') {
      // slow hover in place, faint pulse; UI fades in
      this.hoverMs += deltaMs;
      const s = Math.sin((this.hoverMs / HOVER_PERIOD) * Math.PI * 2);
      this.placeGhost(-GHOST_RISE + Math.round(s * HOVER_AMPLITUDE));
      this.ghost?.setAlpha(GHOST_ALPHA + 0.06 * Math.sin((this.hoverMs / (HOVER_PERIOD * 1.7)) * Math.PI * 2));
      const timeIn = this.elapsed + (T.transition - T.overlayFrom);
      this.overlay.setAlpha(DEATH_OVERLAY_ALPHA * clamp01(timeIn / T.overlayIn));
      const ui = clamp01(this.elapsed / T.uiIn);
      this.title.setAlpha(ui);
      this.buttonBox.setAlpha(ui);
      this.buttonText.setAlpha(ui);
      return;
    }
    // leaving
    const f = 1 - clamp01(this.elapsed / T.out);
    this.overlay.setAlpha(DEATH_OVERLAY_ALPHA * f);
    this.ghost?.setAlpha(GHOST_ALPHA * f);
    this.title.setAlpha(f);
    this.buttonBox.setAlpha(f);
    this.buttonText.setAlpha(f);
    if (this.elapsed >= T.out) {
      const done = this.onGone;
      this.clear();
      done?.();
    }
  }

  /**
   * Scene shutdown: the scene's game objects are already being destroyed, so only the generated textures
   * (which outlive the scene in the shared texture manager) are removed.
   */
  dispose(): void {
    this.phase = 'hidden';
    for (const key of [`death.body.${this.deathId}`, `death.ghost.${this.deathId}`]) if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
  }

  /** Removes the death objects of the current death and its textures (hides the overlay). */
  clear(): void {
    this.phase = 'hidden';
    this.body?.destroy();
    this.ghost?.destroy();
    this.body = null;
    this.ghost = null;
    for (const key of [`death.body.${this.deathId}`, `death.ghost.${this.deathId}`]) if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    this.bodyTexture = null;
    this.bodyPixels = null;
    this.noise = null;
    this.capture = null;
    this.onDead = null;
    this.onRespawn = null;
    this.onGone = null;
    this.overlay.setVisible(false).setAlpha(0);
    if (this.overlay.input) this.overlay.disableInteractive();
    this.title.setVisible(false);
    this.buttonBox.setVisible(false);
    this.buttonText.setVisible(false);
    this.disableButton();
    this.resetButton();
  }

  /** Respawn button: accepted once per death (duplicate clicks are ignored). */
  clickRespawn(): void {
    if (this.phase !== 'dead' || this.clicked) return;
    this.clicked = true;
    this.disableButton();
    this.onRespawn?.();
  }

  /**
   * Keeps the UI off the ghost: "ตาย..." above its head, the button under its name label, centred on
   * the screen horizontally. Near the top of the screen (map edge) both go below.
   */
  private layoutAround(capture: DeathCapture): void {
    const { width: sw, height: sh } = this.scene.scale;
    const rows = opaqueRows(capture.rgba, capture.width, capture.height);
    const headOffset = (capture.originY * capture.height - (rows?.top ?? 0)) * capture.scaleY;
    const ghostTop = Math.round(capture.screenY - headOffset - GHOST_RISE - HOVER_AMPLITUDE);
    const below = Math.round(capture.screenY + NAME_LABEL_SPACE);
    const z = this.zoom;
    const buttonW = BUTTON.width * z;
    const buttonH = BUTTON.height * z;
    const titleHalf = Math.ceil(this.title.displayHeight / 2);
    let titleY = ghostTop - 10 - titleHalf;
    let buttonY = below;
    if (titleY - titleHalf < 8) {
      titleY = below + titleHalf;
      buttonY = below + this.title.displayHeight + 8;
    }
    buttonY = Math.round(Math.max(8, Math.min(buttonY, sh - buttonH - 8)));
    const bx = Math.round(sw / 2 - buttonW / 2);
    this.title.setPosition(Math.round(sw / 2), Math.round(titleY));
    this.buttonBox.setPosition(bx, buttonY);
    this.buttonText.setPosition(Math.round(sw / 2), Math.round(buttonY + buttonH / 2));
    this.resetButton();
  }

  /**
   * The button's own (drawn) graphics is its hit area. A Zone would lose to the overlay: Phaser ranks
   * pointer targets by the camera's render list, and zones are never rendered.
   */
  private enableButton(): void {
    this.buttonBox.setInteractive({ hitArea: new Phaser.Geom.Rectangle(0, 0, BUTTON.width, BUTTON.height), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
  }

  private disableButton(): void {
    if (this.buttonBox.input) this.buttonBox.disableInteractive();
  }

  private placeGhost(offsetY: number): void {
    if (this.ghost && this.capture) this.ghost.setPosition(this.capture.screenX, this.capture.screenY + offsetY);
  }

  /** Dissolve step k (0..1), redrawn only when the visible step changes (16 steps). */
  private writeBody(k: number): void {
    if (!this.bodyTexture || !this.bodyPixels || !this.noise || !this.capture) return;
    const step = Math.round(k * 16);
    if (step === this.lastDissolveStep) return;
    this.lastDissolveStep = step;
    putPixels(this.bodyTexture, dissolvePixels(this.bodyPixels, this.noise, step / 16), this.capture.width, this.capture.height);
  }

  /** Back to the plain look (no hover, not pressed). */
  private resetButton(): void {
    this.press.reset();
    this.drawButton();
  }

  private drawButton(): void {
    const { hovered: hover, pressed: down } = this.press;
    const g = this.buttonBox;
    g.clear();
    g.fillStyle(down ? BUTTON.fillDown : hover ? BUTTON.fillHover : BUTTON.fill, 1);
    g.fillRect(0, 0, BUTTON.width, BUTTON.height);
    const line = hover ? BUTTON.lineHover : BUTTON.line;
    g.fillStyle(line, 1);
    g.fillRect(0, 0, BUTTON.width, 1);
    g.fillRect(0, BUTTON.height - 1, BUTTON.width, 1);
    g.fillRect(0, 0, 1, BUTTON.height);
    g.fillRect(BUTTON.width - 1, 0, 1, BUTTON.height);
    // small dark-fantasy accent: inner corner ticks
    g.fillRect(3, 3, 3, 1).fillRect(3, 3, 1, 3);
    g.fillRect(BUTTON.width - 6, BUTTON.height - 4, 3, 1).fillRect(BUTTON.width - 4, BUTTON.height - 6, 1, 3);
    this.buttonText.setY(Math.round(this.buttonBox.y + (BUTTON.height * this.zoom) / 2 + (down ? this.zoom : 0)));
    this.buttonText.setColor(hover ? '#efebe3' : BUTTON.text);
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function putPixels(texture: Phaser.Textures.CanvasTexture, rgba: Uint8ClampedArray, width: number, height: number): void {
  const ctx = texture.getContext();
  const image = ctx.createImageData(width, height);
  image.data.set(rgba);
  ctx.putImageData(image, 0, 0);
  texture.refresh();
}

/** Pixels of a sprite's current frame (no smoothing), for the death transition. */
export function captureSpriteFrame(sprite: Phaser.GameObjects.Sprite): { rgba: Uint8ClampedArray; width: number; height: number } {
  const frame = sprite.frame;
  const width = frame.cutWidth;
  const height = frame.cutHeight;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(frame.source.image as CanvasImageSource, frame.cutX, frame.cutY, width, height, 0, 0, width, height);
  return { rgba: ctx.getImageData(0, 0, width, height).data, width, height };
}
