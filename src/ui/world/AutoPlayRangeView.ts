import type Phaser from 'phaser';
import { DEPTH } from '../../config/constants';
import type { Point } from '../../core/types';

/** Dots of the hunting circle, about one per this many tiles of its edge. */
const DOT_SPACING_TILES = 0.6;
const DOT_COLOR = 0xd3424b;

/**
 * The Auto Play hunting circle on the ground (radius mode while Auto Play runs): small 3 x 1 red dots, like the quest path
 * but red, on the ground layer below every character. Redrawn only when the circle changes.
 */
export class AutoPlayRangeView {
  private readonly g: Phaser.GameObjects.Graphics;
  private key = '';

  constructor(
    scene: Phaser.Scene,
    private readonly tileToWorld: (x: number, y: number) => { x: number; y: number },
  ) {
    this.g = scene.add.graphics().setDepth(DEPTH.GroundFx + 20);
  }

  /** `circle` null hides it. */
  show(circle: { center: Point; radius: number } | null): void {
    const key = circle ? `${circle.center.x.toFixed(2)},${circle.center.y.toFixed(2)},${circle.radius}` : '';
    if (key === this.key) return;
    this.key = key;
    this.g.clear();
    if (!circle) return;
    const { center, radius } = circle;
    const n = Math.max(24, Math.round((2 * Math.PI * radius) / DOT_SPACING_TILES));
    this.g.fillStyle(DOT_COLOR, 0.9);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const w = this.tileToWorld(center.x + Math.cos(a) * radius, center.y + Math.sin(a) * radius);
      this.g.fillRect(Math.round(w.x) - 1, Math.round(w.y), 3, 1);
    }
  }
}
