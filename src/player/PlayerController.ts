import Phaser from 'phaser';
import type { TileBox } from '../world/structures/StructureLayer';
import { directionFromScreenInput, screenInputToGroundVector, type Direction } from '../core/Direction';
import type { Point } from '../core/types';
import type { CharacterView } from '../characters/CharacterView';
import type { IsometricMap } from '../world/IsometricMap';
import type { KeyboardMovementInput } from './KeyboardMovementInput';
import { PlayerMovement } from './PlayerMovement';

export const PLAYER_MOVEMENT = {
  speed: 3.6, // tiles per second
  radius: 0.22, // tiles
} as const;

/** Logical movement state: drives the walk animation and is shown in the HUD. */
export type MovementState = 'idle' | 'walk';

/**
 * Central player controller: input -> movement (tile space) -> view (world space) -> animator.
 * Movement rules live in PlayerMovement; sprite selection lives in CharacterAnimator.
 * While moving the walk clip plays; when movement stops the last facing direction is kept and its
 * static standing frame is shown immediately.
 */
export class PlayerController {
  private readonly movement: PlayerMovement;
  private facing: Direction = 'S';
  private state: MovementState = 'idle';

  constructor(
    private readonly map: IsometricMap,
    readonly view: CharacterView,
    private readonly input: KeyboardMovementInput,
    spawn: Point,
  ) {
    this.movement = new PlayerMovement(spawn, map, PLAYER_MOVEMENT);
    this.syncView();
  }

  update(deltaMs: number): void {
    const intent = this.input.read();
    const direction = directionFromScreenInput(intent.x, intent.y);

    let moved = false;
    if (direction) {
      this.facing = direction;
      moved = this.movement.step(screenInputToGroundVector(intent.x, intent.y), deltaMs / 1000);
    }
    this.state = moved ? 'walk' : 'idle';

    this.syncView();
  }

  /** Position in continuous tile space. */
  getTilePosition(): Point {
    return { ...this.movement.position };
  }

  getWorldPosition(): Point {
    return this.map.tileToWorld(this.movement.position.x, this.movement.position.y);
  }

  getFacing(): Direction {
    return this.facing;
  }

  getState(): MovementState {
    return this.state;
  }

  /** Collision footprint in tile space. */
  getFootprint(): TileBox {
    const { x, y } = this.movement.position;
    const r = PLAYER_MOVEMENT.radius;
    return { minX: x - r, minY: y - r, maxX: x + r, maxY: y + r };
  }

  /** Approximate on-screen area covered by the character sprite (for depth / occlusion tests). */
  getScreenRect(): Phaser.Geom.Rectangle {
    const world = this.getWorldPosition();
    // Covers both sheets: standing art reaches ~54 px above the feet, walk art ~60 px.
    return new Phaser.Geom.Rectangle(world.x - 15, world.y - 60, 30, 62);
  }

  private syncView(): void {
    const world = this.getWorldPosition();
    this.view.setPosition(world.x, world.y);
    this.view.setDepth(this.map.resolveDepth(this.getFootprint(), world.y, this.getScreenRect()));
    this.view.animator.setMotion(this.state === 'walk' ? 'walk' : 'stand', this.facing);
  }
}
