import Phaser from 'phaser';
import type { Point } from '../core/types';
import type { IsometricMap } from '../world/IsometricMap';
import type { TileBox } from '../world/structures/StructureLayer';
import type { MonsterDefinition } from './MonsterDefinition';

let nextMonsterId = 1;

/**
 * One monster in the world. Currently a static visual entity: a single full-sprite image anchored on
 * its feet, depth-sorted once at spawn (it never moves, so it needs no per-frame update).
 */
export class MonsterEntity {
  readonly id = `monster-${nextMonsterId++}`;
  readonly sprite: Phaser.GameObjects.Image;
  readonly world: Point;

  constructor(
    scene: Phaser.Scene,
    map: IsometricMap,
    readonly definition: MonsterDefinition,
    /** Position in continuous tile space. */
    readonly position: Point,
  ) {
    const s = definition.sprite;
    this.world = map.tileToWorld(position.x, position.y);
    this.sprite = scene.add.image(Math.round(this.world.x), Math.round(this.world.y), s.textureKey);
    this.sprite.setOrigin(s.anchor.x / s.frameWidth, s.anchor.y / s.frameHeight);
    // Same depth rule as characters: screen Y of the feet, corrected against nearby structure walls.
    this.sprite.setDepth(map.resolveDepth(this.footprint(), this.world.y, this.sprite.getBounds()));
  }

  /** Ground footprint in tile space. */
  footprint(): TileBox {
    const r = this.definition.footprintRadius;
    return { minX: this.position.x - r, minY: this.position.y - r, maxX: this.position.x + r, maxY: this.position.y + r };
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
