import Phaser from 'phaser';
import { DEPTH } from '../../config/constants';
import type { Point } from '../../core/types';
import type { PathTrail } from '../../world/navigation/PathTrail';

const KEY = 'fx_path_dot';
/** One dot: a small 2:1 ellipse lying on the ground - light grey, a lit middle, a dark rim for contrast. */
const PIXELS = [
  '..oooo..',
  '.oggggo.',
  'ogwwwwgo',
  '.oggggo.',
  '..oooo..',
];
const COLORS: Record<string, string> = { o: 'rgba(12,12,16,0.55)', g: '#b9bac4', w: '#e7e7ee' };
const WIDTH = PIXELS[0].length;
const HEIGHT = PIXELS.length;
/** Subtle: the ground stays readable through the dots. */
const MAX_ALPHA = 0.8;

/**
 * Draws a PathTrail on the ground: above the ground tiles, below every character and prop (those sort by
 * screen Y). World objects at whole pixels, so camera movement and zoom apply to them like to the map.
 * Images are reused; nothing is created while the trail just moves along.
 */
export class PathTrailView {
  private readonly pool: Phaser.GameObjects.Image[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly tileToWorld: (x: number, y: number) => Point,
  ) {
    if (scene.textures.exists(KEY)) return;
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d')!;
    PIXELS.forEach((row, y) => [...row].forEach((c, x) => {
      if (!COLORS[c]) return;
      ctx.fillStyle = COLORS[c];
      ctx.fillRect(x, y, 1, 1);
    }));
    scene.textures.addCanvas(KEY, canvas);
  }

  /** Images ever created (for checks). */
  get created(): number {
    return this.pool.length;
  }

  draw(trail: PathTrail): void {
    const dots = trail.dots;
    while (this.pool.length < dots.length) this.pool.push(this.scene.add.image(0, 0, KEY).setOrigin(0, 0).setDepth(DEPTH.GroundFx - 2));
    this.pool.forEach((image, i) => {
      const dot = dots[i];
      if (!dot) {
        image.setVisible(false);
        return;
      }
      const w = this.tileToWorld(dot.x, dot.y);
      image.setPosition(Math.round(w.x) - WIDTH / 2, Math.round(w.y) - Math.floor(HEIGHT / 2)).setAlpha(dot.alpha * MAX_ALPHA).setVisible(true);
    });
  }
}
