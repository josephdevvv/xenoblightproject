import type Phaser from 'phaser';
import { characterFeetOffset, HEAL_GREEN } from './HealVfxArt';

/** Who is healed: any character with a sprite on its ground root (the caster, another player, an ally). */
export interface HealVfxTarget {
  /** Its sprite now; null once it is gone (despawned, left the map). */
  sprite(): Phaser.GameObjects.Sprite | null;
  /** False ends the effect (it died, was hidden). Default: as long as the sprite exists. */
  alive?(): boolean;
}

/** Phaser.Animations.Events.ANIMATION_COMPLETE (named here so this module needs Phaser's types only: unit-tested with stand-in sprites). */
const ANIMATION_COMPLETE = 'animationcomplete';

interface Pair {
  behind: Phaser.GameObjects.Sprite;
  front: Phaser.GameObjects.Sprite;
}

/**
 * The HP-healing VFX handler - one place for every healing skill (Self-Heal now; single-target and multi-target heals
 * call the same play / playAll with the characters that were really healed). The green aura is drawn around the
 * HEALED character, whoever cast: two extra sprites per effect, never the character's own sheet - `behind` just under
 * the character's depth (aura, ground ring: only what is outside its silhouette shows) and `front` just over it
 * (streaks, motes) - so it works for every gender, hairstyle, outfit, class and facing, and world objects in front of
 * the character still cover it. It follows the character while it plays once at the approved timing, then the pair
 * goes back to a small pool. No input, no body. A target that dies or disappears ends its effect; clear() ends all
 * (death, respawn); dispose() on scene shutdown.
 *
 * Not for potions, consumables, regeneration or the respawn: only skills call it, after their heal really restored HP.
 */
export class HealVfxLayer {
  private readonly waiting: { target: HealVfxTarget; ms: number }[] = [];
  private readonly active: { target: HealVfxTarget; pair: Pair }[] = [];
  private readonly pool: Pair[] = [];
  private spawned = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  /**
   * One healed character. `delayMs`: how long after the heal the effect starts (HealVfxArt.healVfxDelayMs: its peak on
   * the caster's cast frame; 0 = at the heal event). A second heal on the same character starts the effect afresh.
   */
  play(target: HealVfxTarget, delayMs = 0): void {
    this.clear(target);
    if (delayMs > 0) this.waiting.push({ target, ms: delayMs });
    else this.start(target);
  }

  /** Several healed characters at once (multi-target heals): one effect on each. */
  playAll(targets: readonly HealVfxTarget[], delayMs = 0): void {
    for (const target of targets) this.play(target, delayMs);
  }

  /** Every frame: starts the effects whose moment has come, keeps each on its character, ends those whose character is gone. */
  update(deltaMs: number): void {
    for (const w of [...this.waiting]) {
      w.ms -= deltaMs;
      if (w.ms > 0 && this.present(w.target)) continue;
      this.waiting.splice(this.waiting.indexOf(w), 1);
      if (this.present(w.target)) this.start(w.target);
    }
    for (const e of [...this.active]) {
      if (this.present(e.target)) this.place(e);
      else this.release(e.pair);
    }
  }

  /** Effects playing now (for checks). */
  get activeCount(): number {
    return this.active.length;
  }

  /** Effects waiting for their moment (for checks). */
  get waitingCount(): number {
    return this.waiting.length;
  }

  /** Sprite pairs ever created (pool size) and effects ever started (for checks). */
  get stats(): { created: number; spawned: number; pooled: number } {
    return { created: this.active.length + this.pool.length, spawned: this.spawned, pooled: this.pool.length };
  }

  /** Ends the effects of one character, or of all (waiting ones too). */
  clear(target?: HealVfxTarget): void {
    for (const w of [...this.waiting]) if (!target || w.target === target) this.waiting.splice(this.waiting.indexOf(w), 1);
    for (const e of [...this.active]) if (!target || e.target === target) this.release(e.pair);
  }

  /** Scene shutdown: Phaser destroys the sprites itself - only forget them. */
  dispose(): void {
    this.waiting.length = 0;
    this.active.length = 0;
    this.pool.length = 0;
  }

  private present(target: HealVfxTarget): boolean {
    const sprite = target.sprite();
    return !!sprite && sprite.active && (target.alive?.() ?? true);
  }

  private start(target: HealVfxTarget): void {
    const L = HEAL_GREEN.layers;
    const { textures, anims } = this.scene;
    if (!this.present(target) || !textures.exists(L.behind.key) || !textures.exists(L.front.key) || !anims.exists(L.behind.animKey) || !anims.exists(L.front.animKey)) return;
    const pair = this.pool.pop() ?? this.create();
    const entry = { target, pair };
    this.active.push(entry);
    this.spawned++;
    for (const id of ['behind', 'front'] as const) {
      pair[id].setTexture(L[id].key).setOrigin(HEAL_GREEN.origin.x, HEAL_GREEN.origin.y).setScale(1).setAlpha(1).setVisible(true).setActive(true);
    }
    this.place(entry);
    pair.behind.play(L.behind.animKey);
    pair.front.play(L.front.animKey);
  }

  private create(): Pair {
    const sprite = (): Phaser.GameObjects.Sprite => this.scene.add.sprite(0, 0, '__DEFAULT').setVisible(false);
    const pair = { behind: sprite(), front: sprite() };
    // both layers have the same timing: the pair is done when the front one is
    pair.front.on(ANIMATION_COMPLETE, () => this.release(pair));
    return pair;
  }

  /** On the character's feet, whole pixels; just under and just over its own depth (it is depth-sorted with the world). */
  private place(entry: { target: HealVfxTarget; pair: Pair }): void {
    const body = entry.target.sprite();
    if (!body) return;
    const feet = characterFeetOffset(Math.abs(body.scaleX), Math.abs(body.scaleY));
    const x = Math.round(body.x + feet.x);
    const y = Math.round(body.y + feet.y);
    entry.pair.behind.setPosition(x, y).setDepth(body.depth - 0.5);
    entry.pair.front.setPosition(x, y).setDepth(body.depth + 0.5);
  }

  private release(pair: Pair): void {
    const i = this.active.findIndex((e) => e.pair === pair);
    if (i < 0) return;
    this.active.splice(i, 1);
    for (const s of [pair.behind, pair.front]) {
      s.stop();
      s.setVisible(false).setActive(false);
    }
    this.pool.push(pair);
  }
}
