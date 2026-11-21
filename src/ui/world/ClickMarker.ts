import Phaser from 'phaser';
import { DEPTH, MOCKUP_PIXEL_SCALE } from '../../config/constants';
import { PixelCanvas } from '../../assets/mockup/PixelCanvas';

const KEY = 'fx_click_marker';
const ANIM = 'fx_click_marker.play';
/** Logical frame size (upscaled x2 like the map art). */
const FW = 28;
const FH = 14;
const FRAMES = 7;

/** Isometric (2:1) ring outline, 1 logical px wide, brighter on the near (lower) half. */
function ring(pc: PixelCanvas, ox: number, rx: number, alphaFar: number, alphaNear: number): void {
  const cx = ox + FW / 2;
  const cy = FH / 2;
  const ry = rx / 2;
  const seen = new Set<string>();
  for (let i = 0; i < 360; i++) {
    const a = (i / 360) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * rx - 0.5);
    const y = Math.round(cy + Math.sin(a) * ry - 0.5);
    const k = `${x},${y}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const near = Math.sin(a) > 0;
    pc.rect(x, y, 1, 1, near ? `rgba(214,236,246,${alphaNear})` : `rgba(140,178,196,${alphaFar})`);
  }
}

/** Builds the ripple sheet: a falling drop, the splash, then two rings spreading and fading. */
function drawSheet(): HTMLCanvasElement {
  const pc = new PixelCanvas(FW * FRAMES, FH);
  const cx = (f: number) => f * FW + FW / 2;
  const cy = FH / 2;
  // 1: the drop just above the ground point
  pc.rect(cx(0) - 1, cy - 5, 2, 1, 'rgba(214,236,246,0.9)');
  pc.rect(cx(0) - 1, cy - 4, 2, 2, 'rgba(170,210,228,0.95)');
  pc.rect(cx(0) - 1, cy, 2, 1, 'rgba(120,160,180,0.6)');
  // 2: splash
  pc.rect(cx(1) - 1, cy - 1, 2, 2, 'rgba(230,244,250,1)');
  ring(pc, FW, 3, 0.7, 0.95);
  // 3..7: two rings spreading out, fading
  const steps: [number, number, number][] = [
    [6, 2, 0.95],
    [8, 4, 0.85],
    [10, 6, 0.65],
    [12, 8, 0.45],
    [13, 10, 0.25],
  ];
  steps.forEach(([outer, inner, a], i) => {
    const ox = (i + 2) * FW;
    ring(pc, ox, outer, a * 0.7, a);
    if (inner > 0) ring(pc, ox, inner, a * 0.5, a * 0.75);
  });
  return pc.upscale(MOCKUP_PIXEL_SCALE);
}

/**
 * Destination marker for click-to-move: a small water-drop ripple played once on the ground where the
 * player clicked (beneath characters and props), then gone. One reused sprite - a new click restarts it.
 */
export class ClickMarker {
  private readonly sprite: Phaser.GameObjects.Sprite;

  constructor(private readonly scene: Phaser.Scene) {
    if (!scene.textures.exists(KEY)) {
      const tex = scene.textures.addCanvas(KEY, drawSheet());
      for (let i = 0; i < FRAMES; i++) tex?.add(i, 0, i * FW * MOCKUP_PIXEL_SCALE, 0, FW * MOCKUP_PIXEL_SCALE, FH * MOCKUP_PIXEL_SCALE);
    }
    if (!scene.anims.exists(ANIM)) {
      scene.anims.create({ key: ANIM, frames: Array.from({ length: FRAMES }, (_, i) => ({ key: KEY, frame: i })), frameRate: 16, repeat: 0 });
    }
    // above the ground tiles and cloud shadows, below every character / prop (those sort by screen Y)
    this.sprite = scene.add.sprite(0, 0, KEY, 0).setOrigin(0.5, 0.5).setDepth(DEPTH.GroundFx - 1).setVisible(false);
    this.sprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      scene.tweens.add({ targets: this.sprite, alpha: 0, duration: 160, onComplete: () => this.sprite.setVisible(false) });
    });
  }

  /** Plays the ripple centred on a world point (whole pixels). */
  show(worldX: number, worldY: number): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setPosition(Math.round(worldX), Math.round(worldY)).setAlpha(1).setVisible(true);
    this.sprite.play(ANIM);
  }

  /** For checks: is the marker currently showing, and where. */
  get state(): { visible: boolean; x: number; y: number; frame: number } {
    return { visible: this.sprite.visible, x: this.sprite.x, y: this.sprite.y, frame: Number(this.sprite.frame.name) };
  }
}
