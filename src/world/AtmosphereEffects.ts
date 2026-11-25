import Phaser from 'phaser';
import { DEPTH } from '../config/constants';
import { TextureKeys } from '../assets/TextureKeys';

interface Drifter {
  sprite: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
}

export interface DriftLayerOptions {
  textureKey: string;
  count: number;
  depth: number;
  scale: [number, number];
  alpha: [number, number];
  /** Horizontal drift speed in px/s (wind blows to the right). */
  speed: [number, number];
}

/**
 * Fog, drifting cloud shadows, smoke and the screen vignette.
 * Purely cosmetic; never affects gameplay.
 */
export class AtmosphereEffects {
  private readonly drifters: Drifter[] = [];
  /** Smoke emitters with their source point (for visibility management). */
  readonly smokeEmitters: { emitter: Phaser.GameObjects.Particles.ParticleEmitter; x: number; y: number }[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly bounds: Phaser.Geom.Rectangle,
  ) {}

  /** Large blobs that slowly drift across `bounds` and wrap around. */
  addDriftLayer(o: DriftLayerOptions): this {
    const between = Phaser.Math.FloatBetween;
    for (let i = 0; i < o.count; i++) {
      const x = between(this.bounds.left, this.bounds.right);
      const y = between(this.bounds.top, this.bounds.bottom);
      const sprite = this.scene.add.image(x, y, o.textureKey);
      const alpha = between(o.alpha[0], o.alpha[1]);
      sprite.setScale(between(o.scale[0], o.scale[1])).setAlpha(alpha).setDepth(o.depth);
      if (Math.random() < 0.5) sprite.setFlipX(true);
      // Gentle breathing so the fog never looks static.
      this.scene.tweens.add({
        targets: sprite,
        alpha: alpha * 0.45,
        duration: between(3500, 8000),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: between(0, 3000),
      });
      this.drifters.push({ sprite, vx: between(o.speed[0], o.speed[1]), vy: between(-1.5, 1.5) });
    }
    return this;
  }

  addSmoke(x: number, y: number, depth: number): this {
    const emitter = this.scene.add.particles(x, y, TextureKeys.fx.smoke, {
      lifespan: { min: 2400, max: 4200 },
      frequency: 260,
      quantity: 1,
      speedX: { min: -4, max: 6 },
      speedY: { min: -22, max: -10 },
      accelerationX: 3,
      scale: { start: 1.2, end: 4.5 },
      alpha: { start: 0.32, end: 0 },
      x: { min: -6, max: 6 },
    });
    emitter.setDepth(depth);
    this.smokeEmitters.push({ emitter, x, y });
    return this;
  }

  /** Soft additive accent glow (the minimal purple accent of the art direction). */
  addGlow(x: number, y: number, depth: number, scale: number, alpha: number): this {
    const glow = this.scene.add.image(x, y, TextureKeys.fx.glow);
    glow.setScale(scale).setAlpha(alpha).setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({
      targets: glow,
      alpha: alpha * 0.5,
      scale: scale * 0.92,
      duration: Phaser.Math.Between(1400, 2200),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    return this;
  }

  /** Screen-space darkening around the edges: always the whole view (the mobile view can be wider and change). */
  addVignette(depth: number = DEPTH.Vignette): this {
    const scene = this.scene;
    const image = scene.add.image(0, 0, TextureKeys.fx.vignette).setScrollFactor(0).setDepth(depth);
    const place = (): void => {
      image.setPosition(scene.scale.width / 2, scene.scale.height / 2).setDisplaySize(scene.scale.width, scene.scale.height);
    };
    place();
    scene.scale.on(Phaser.Scale.Events.RESIZE, place);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off(Phaser.Scale.Events.RESIZE, place));
    return this;
  }

  update(deltaMs: number): void {
    const dt = deltaMs / 1000;
    const b = this.bounds;
    for (const d of this.drifters) {
      const s = d.sprite;
      s.x += d.vx * dt;
      s.y += d.vy * dt;
      const hw = s.displayWidth / 2;
      const hh = s.displayHeight / 2;
      if (s.x - hw > b.right) s.x = b.left - hw;
      else if (s.x + hw < b.left) s.x = b.right + hw;
      if (s.y - hh > b.bottom) s.y = b.top - hh;
      else if (s.y + hh < b.top) s.y = b.bottom + hh;
    }
  }
}
