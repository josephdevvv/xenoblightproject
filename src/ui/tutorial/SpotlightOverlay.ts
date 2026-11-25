import Phaser from 'phaser';
import { typo } from '../UITheme';
import { cameraOf, layerZoom, TEXT_RESOLUTION_KEY, UI_LAYER_KEY } from '../layout/UiLayers';
import { clientToGame, isOnScreen, lerpRect, padRect, placeLabel, sameRect, surround, throughCamera, transformRect, type Rect } from './SpotlightGeometry';

export interface SpotlightTarget {
  /** A different id = another tutorial step (the spotlight glides there). */
  id: string;
  /** The target's rectangle on screen right now; null while it is not available. */
  rect: () => Rect | null;
  label: string;
}

const SHADE = { color: 0x000000, alpha: 0.7 } as const;
const LINE = 0xe7e7ee;
/** Space between the target and the edge of the cutout. */
const PADDING = 5;
const FADE_MS = 180;
const GLIDE_MS = 220;
/** Calm pulse of the outer outline. */
const PULSE = { ms: 1600, min: 0.15, max: 0.6 } as const;

/**
 * Tutorial spotlight: darkens the whole screen except the control the player has to use, with a pale
 * outline around it. Works for any target - give update() the target every frame; its rectangle is read
 * every frame too, so the spotlight follows it when it moves, resizes or the screen changes.
 *
 * Input: four invisible-but-rendered blockers lie AROUND the target (Phaser ranks click targets by what the
 * camera rendered, see DeathOverlay) and take every click there; nothing lies over the target itself, so it
 * always stays clickable. Without an available target there is no overlay and nothing is blocked - a
 * tutorial can never lock the game.
 */
export class SpotlightOverlay {
  private readonly blockers: Phaser.GameObjects.Rectangle[];
  private readonly shade: Phaser.GameObjects.Graphics;
  private readonly pulse: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private id: string | null = null;
  private hole: Rect | null = null;
  private cut: Rect | null = null;
  private drawn: Rect | null = null;
  private from: Rect | null = null;
  private glide = 1;
  private alpha = 0;
  private elapsed = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    depth: number,
  ) {
    // in-game UI layers (UiLayers): the shade and its blockers in screen pixels (the hole may be around a HUD or a
    // window control, each zoomed by its own UI scale); the label too - drawn last, so an open window never covers it -
    // scaled to the HUD's UI scale and rendered at that resolution, so it looks like the rest of the UI
    this.shade = scene.add.graphics().setDepth(depth).setVisible(false).setData(UI_LAYER_KEY, 'screen');
    this.pulse = scene.add.graphics().setDepth(depth + 1).setVisible(false).setData(UI_LAYER_KEY, 'screen');
    this.label = scene.add.text(0, 0, '', typo('label', '#e7e7ee')).setBackgroundColor('#0e0e12').setPadding(8, 3, 8, 3).setDepth(depth + 2).setVisible(false).setData(UI_LAYER_KEY, 'screen');
    // Interactive once, for good: only the hit area changes later. (Phaser loses an object whose input is
    // removed and set again within one frame.) Half open: the pixel next to the hole belongs to the target.
    const contains = (area: Phaser.Geom.Rectangle, x: number, y: number): boolean => x >= 0 && y >= 0 && x < area.width && y < area.height;
    this.blockers = Array.from({ length: 4 }, () => {
      const b = scene.add.rectangle(0, 0, 1, 1, 0x000000, 0.01).setOrigin(0, 0).setDepth(depth + 3).setVisible(false).setData(UI_LAYER_KEY, 'screen');
      b.setInteractive(new Phaser.Geom.Rectangle(0, 0, 1, 1), contains);
      b.input!.enabled = false;
      return b;
    });
  }

  /** A target is lit: clicks anywhere else are blocked. */
  get isActive(): boolean {
    return this.hole !== null;
  }

  /** The step shown now (null = none), and its cutout (for checks). */
  get current(): { id: string; hole: Rect; cut: Rect } | null {
    return this.id !== null && this.hole && this.cut ? { id: this.id, hole: this.hole, cut: this.cut } : null;
  }

  /** `target` null = no tutorial step needs a control now. */
  update(deltaMs: number, target: SpotlightTarget | null): void {
    this.elapsed += deltaMs;
    const screen = { width: this.scene.scale.gameSize.width, height: this.scene.scale.gameSize.height };
    const rect = target?.rect() ?? null;
    if (!target || !rect || !isOnScreen(rect, screen)) {
      this.unblock();
      this.alpha = Math.max(0, this.alpha - deltaMs / FADE_MS);
      this.paint(this.drawn, screen);
      return;
    }

    const hole = padRect(rect, 0, screen);
    const cut = padRect(rect, PADDING, screen);
    if (target.id !== this.id) {
      // another step: glide from the last cutout (fade in when there was none)
      this.from = this.alpha > 0 ? this.drawn : null;
      this.glide = this.from ? 0 : 1;
      this.id = target.id;
    }
    if (!sameRect(hole, this.hole)) this.block(hole, screen);
    this.cut = cut;
    this.alpha = Math.min(1, this.alpha + deltaMs / FADE_MS);
    this.glide = Math.min(1, this.glide + deltaMs / GLIDE_MS);
    const eased = 1 - (1 - this.glide) ** 3;
    if (this.label.text !== target.label) this.label.setText(target.label);
    this.paint(this.from && this.glide < 1 ? lerpRect(this.from, cut, eased) : cut, screen);
  }

  // ---------------------------------------------------------------------------------------------

  private block(hole: Rect, screen: { width: number; height: number }): void {
    this.hole = hole;
    surround(hole, screen).forEach((r, i) => {
      const b = this.blockers[i];
      const used = r.width > 0 && r.height > 0;
      b.setVisible(used);
      b.input!.enabled = used;
      if (!used) return;
      b.setPosition(r.x, r.y).setSize(r.width, r.height);
      (b.input!.hitArea as Phaser.Geom.Rectangle).setTo(0, 0, r.width, r.height);
    });
  }

  private unblock(): void {
    if (!this.hole) return;
    this.hole = null;
    this.cut = null;
    this.id = null;
    for (const b of this.blockers) {
      b.input!.enabled = false;
      b.setVisible(false);
    }
  }

  private paint(rect: Rect | null, screen: { width: number; height: number }): void {
    const visible = rect !== null && this.alpha > 0;
    for (const o of [this.shade, this.pulse, this.label]) o.setVisible(visible);
    if (!visible) {
      this.drawn = null;
      return;
    }
    if (!sameRect(rect, this.drawn)) {
      this.drawn = rect;
      this.shade.clear().fillStyle(SHADE.color, SHADE.alpha);
      for (const r of surround(rect, screen)) if (r.width > 0 && r.height > 0) this.shade.fillRect(r.x, r.y, r.width, r.height);
      outline(this.shade, rect, 0, 0.9);
      this.pulse.clear();
      outline(this.pulse, rect, 2, 1);
      outline(this.pulse, rect, 3, 0.45);
      // the label: screen pixels like the cutout, at the HUD's UI scale (sharp at that scale)
      const z = layerZoom(this.scene, 'hud');
      this.label.setScale(z).setData(TEXT_RESOLUTION_KEY, z);
      const at = placeLabel(rect, { width: this.label.width * z, height: this.label.height * z }, screen, 10);
      this.label.setPosition(at.x, at.y);
    }
    this.shade.setAlpha(this.alpha);
    this.label.setAlpha(this.alpha);
    const wave = (1 + Math.sin((this.elapsed / PULSE.ms) * Math.PI * 2)) / 2;
    this.pulse.setAlpha(this.alpha * (PULSE.min + (PULSE.max - PULSE.min) * wave));
  }
}

/** 1-px outline `grow` px around a rectangle, corner pixels left out (slightly rounded). */
function outline(g: Phaser.GameObjects.Graphics, r: Rect, grow: number, alpha: number): void {
  const x = r.x - 1 - grow;
  const y = r.y - 1 - grow;
  const w = r.width + 2 + grow * 2;
  const h = r.height + 2 + grow * 2;
  g.fillStyle(LINE, alpha);
  g.fillRect(x + 1, y, w - 2, 1).fillRect(x + 1, y + h - 1, w - 2, 1).fillRect(x, y + 1, 1, h - 2).fillRect(x + w - 1, y + 1, 1, h - 2);
}

/** Hidden itself or through any of its containers. */
function hiddenInTree(object: Phaser.GameObjects.GameObject): boolean {
  for (let o: Phaser.GameObjects.GameObject | null = object; o; o = (o as Phaser.GameObjects.Zone).parentContainer ?? null) {
    if ((o as Phaser.GameObjects.Zone).visible === false) return true;
  }
  return false;
}

/**
 * Screen rectangle of an area inside a UI container (e.g. a panel of a window, in the window's own coordinates):
 * through the container's world transform - its position, scale and every parent container - and the camera that
 * draws it. Measured from where the window really is now, never from where its layout once put it.
 */
export function rectInContainer(scene: Phaser.Scene, container: Phaser.GameObjects.Container | null | undefined, local: Rect): Rect | null {
  if (!container?.active || !container.scene || hiddenInTree(container)) return null;
  return throughCamera(transformRect(local, container.getWorldTransformMatrix()), cameraOf(scene, container));
}

/** Screen rectangle of a Phaser UI object; null while it is destroyed, hidden (or its container) or not clickable. */
export function rectOfObject(scene: Phaser.Scene, object: (Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.GetBounds) | null | undefined): Rect | null {
  if (!object?.active || !object.scene || (object.input && !object.input.enabled) || hiddenInTree(object)) return null;
  // its rendered bounds: size, origin, scale and every parent container's transform
  const b = object.getBounds();
  // through the camera that draws it (in-game: the HUD or the window layer, each with its own UI scale)
  return throughCamera({ x: b.x, y: b.y, width: b.width, height: b.height }, cameraOf(scene, object));
}

/** Screen rectangle of a DOM element over the game canvas; null while it is hidden. */
export function rectOfElement(scene: Phaser.Scene, element: Element | null | undefined): Rect | null {
  if (!element?.isConnected) return null;
  const e = element.getBoundingClientRect();
  if (e.width <= 0 || e.height <= 0) return null;
  const c = scene.game.canvas.getBoundingClientRect();
  return clientToGame(e, c, scene.scale.gameSize);
}
