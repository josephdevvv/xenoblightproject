import Phaser from 'phaser';
import type { Point } from '../core/types';
import { PlayerMovement, type CollisionQuery } from '../player/PlayerMovement';
import type { IsometricMap } from '../world/IsometricMap';
import type { TileBox } from '../world/structures/StructureLayer';
import type { MonsterDefinition } from './MonsterDefinition';
import { WanderBehavior } from './WanderBehavior';

let nextMonsterId = 1;

/**
 * One monster in the world: a single full-sprite image anchored on its feet.
 *
 * Monsters with a `wander` behaviour walk around their spawn point using the same tile-space
 * movement + collision as the player (PlayerMovement is generic: a position, a speed and a collision
 * query). Monsters without a behaviour never move and are never updated.
 */
export class MonsterEntity {
  readonly id = `monster-${nextMonsterId++}`;
  readonly sprite: Phaser.GameObjects.Image;
  /** Spawn point in continuous tile space (centre of the wander circle). */
  readonly home: Point;
  private readonly movement: PlayerMovement;
  private readonly behavior: WanderBehavior | null;

  constructor(
    scene: Phaser.Scene,
    private readonly map: IsometricMap,
    readonly definition: MonsterDefinition,
    /** Spawn position in continuous tile space. */
    position: Point,
    collision: CollisionQuery,
    seed: number,
  ) {
    const s = definition.sprite;
    this.home = { ...position };
    this.movement = new PlayerMovement(position, collision, {
      speed: definition.behavior?.speed ?? 0,
      radius: definition.footprintRadius,
    });
    this.behavior = definition.behavior?.type === 'wander' ? new WanderBehavior(this.home, definition.behavior, seed) : null;

    this.sprite = scene.add.image(0, 0, s.textureKey);
    this.sprite.setOrigin(s.anchor.x / s.frameWidth, s.anchor.y / s.frameHeight);
    this.syncSprite();
  }

  /** Current position in continuous tile space. */
  get position(): Point {
    return this.movement.position;
  }

  /** World position of the feet. */
  get world(): Point {
    return this.map.tileToWorld(this.movement.position.x, this.movement.position.y);
  }

  get moves(): boolean {
    return this.behavior !== null;
  }

  isWalking(): boolean {
    return this.behavior?.isWalking() ?? false;
  }

  /** Ground footprint in tile space (at the current position, or at `at`). */
  footprint(at: Point = this.movement.position): TileBox {
    const r = this.definition.footprintRadius;
    return { minX: at.x - r, minY: at.y - r, maxX: at.x + r, maxY: at.y + r };
  }

  /**
   * Advances wandering by one frame.
   * @param canStand whether this monster may stand at a point (collision + other monsters + buildings)
   */
  update(deltaMs: number, canStand: (p: Point) => boolean): void {
    if (!this.behavior) return;
    const direction = this.behavior.update(this.movement.position, deltaMs, canStand);
    if (!direction) return;

    const before = { ...this.movement.position };
    const moved = this.movement.step(direction, deltaMs / 1000);
    const radius = this.definition.behavior?.radiusTiles ?? 0;
    const p = this.movement.position;
    if (Math.hypot(p.x - this.home.x, p.y - this.home.y) > radius) {
      // Sliding along a wall pushed it outside its circle: step back and choose another destination.
      p.x = before.x;
      p.y = before.y;
      this.behavior.blocked();
      return;
    }
    if (!moved) {
      this.behavior.blocked();
      return;
    }
    this.syncSprite();
  }

  destroy(): void {
    this.sprite.destroy();
  }

  private syncSprite(): void {
    const world = this.world;
    this.sprite.setPosition(Math.round(world.x), Math.round(world.y));
    // Same depth rule as characters: screen Y of the feet, corrected against nearby structure walls.
    this.sprite.setDepth(this.map.resolveDepth(this.footprint(), world.y, this.sprite.getBounds()));
  }
}
