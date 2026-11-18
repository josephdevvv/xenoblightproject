import Phaser from 'phaser';
import { PERFORMANCE_CONFIG } from './PerformanceConfig';

type VisibleObject = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible;

interface Entry {
  object: VisibleObject;
  bounds: Phaser.Geom.Rectangle;
  visible: boolean;
  onChange?: (visible: boolean) => void;
}

export interface CullingStats {
  visible: number;
  total: number;
}

/**
 * Hides registered STATIC objects that are outside the camera view (plus a margin) so the renderer
 * skips them. Purely visual: positions, collision and gameplay never depend on visibility.
 *
 * Only register objects that never move and whose visibility nothing else controls
 * (ground tiles, props, particle emitters with a pause/resume callback).
 */
export class VisibilityCuller {
  private readonly entries: Entry[] = [];
  private lastX = Number.NaN;
  private lastY = Number.NaN;
  private lastZoom = Number.NaN;
  private stats: CullingStats = { visible: 0, total: 0 };
  private readonly view = new Phaser.Geom.Rectangle();

  constructor(
    private readonly camera: Phaser.Cameras.Scene2D.Camera,
    private readonly marginPx: number = PERFORMANCE_CONFIG.culling.marginPx,
  ) {}

  /** `bounds` defaults to the object's current bounds (it must not move afterwards). */
  add(object: VisibleObject & { getBounds?: () => Phaser.Geom.Rectangle }, bounds?: Phaser.Geom.Rectangle, onChange?: (visible: boolean) => void): void {
    const b = bounds ?? object.getBounds?.();
    if (!b) throw new Error('VisibilityCuller.add needs bounds for objects without getBounds().');
    this.entries.push({ object, bounds: Phaser.Geom.Rectangle.Clone(b), visible: object.visible, onChange });
  }

  /** Re-evaluates visibility when the camera moved enough (or when forced). */
  update(force = false): CullingStats {
    const cam = this.camera;
    const moved =
      Math.abs(cam.scrollX - this.lastX) >= PERFORMANCE_CONFIG.culling.minCameraMovePx ||
      Math.abs(cam.scrollY - this.lastY) >= PERFORMANCE_CONFIG.culling.minCameraMovePx ||
      cam.zoom !== this.lastZoom;
    if (!force && !moved) return this.stats;
    this.lastX = cam.scrollX;
    this.lastY = cam.scrollY;
    this.lastZoom = cam.zoom;

    // Derive the view from the same scroll values recorded above. (camera.worldView is only refreshed
    // in preRender, so after a camera jump it would still describe the OLD position.)
    const width = cam.width / cam.zoom;
    const height = cam.height / cam.zoom;
    const left = cam.scrollX + cam.width * cam.originX - width / 2;
    const top = cam.scrollY + cam.height * cam.originY - height / 2;
    this.view.setTo(left - this.marginPx, top - this.marginPx, width + this.marginPx * 2, height + this.marginPx * 2);

    let visible = 0;
    for (const e of this.entries) {
      const inView = Phaser.Geom.Rectangle.Overlaps(this.view, e.bounds);
      if (inView) visible++;
      if (inView === e.visible) continue;
      e.visible = inView;
      e.object.setVisible(inView);
      e.onChange?.(inView);
    }
    this.stats = { visible, total: this.entries.length };
    return this.stats;
  }

  getStats(): CullingStats {
    return this.stats;
  }

  /** Makes everything visible again (e.g. before tearing down or for debugging). */
  revealAll(): void {
    for (const e of this.entries) {
      if (e.visible) continue;
      e.visible = true;
      e.object.setVisible(true);
      e.onChange?.(true);
    }
  }
}
