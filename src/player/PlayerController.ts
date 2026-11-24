import Phaser from 'phaser';
import type { TileBox } from '../world/structures/StructureLayer';
import { actionDirectionFromGroundVector, directionFromGroundVector, type ActionDirection, type Direction } from '../core/Direction';
import type { Point } from '../core/types';
import type { CharacterView } from '../characters/CharacterView';
import type { IsometricMap } from '../world/IsometricMap';
import { Pathfinder } from '../world/navigation/Pathfinder';
import { PlayerMovement } from './PlayerMovement';

export const PLAYER_MOVEMENT = {
  speed: 3.6, // tiles per second
  radius: 0.22, // tiles
} as const;

/** Logical movement state: drives the walk animation and is shown in the HUD. */
export type MovementState = 'idle' | 'walk';

/** Player actions that will get 4-direction animations (SE, SW, NE, NW). Walking stays 8-directional. */
export type PlayerAction = 'attack' | 'hit' | 'cast' | 'death';

/**
 * Hook for the future player action animations. No attack / hit / cast / death art exists yet, so the
 * default returns false and the controller keeps the existing visual state (standing frame turned towards
 * the target). Replace with an implementation that plays the 4-direction clips once the art arrives.
 */
export interface PlayerActionAnimations {
  /** Returns true when it played an animation for the action. `timeScale`: playback speed (attacks follow ASPD). */
  play(action: PlayerAction, facing: ActionDirection, timeScale?: number): boolean;
  /** Stops every action clip (interrupted attack, death, respawn). */
  reset?(): void;
}

const NO_ACTION_ANIMATIONS: PlayerActionAnimations = { play: () => false };

/** A blocked path (no progress for this long) is abandoned. */
const STUCK_MS = 400;

/**
 * Central player controller: input -> movement (tile space) -> view (world space) -> animator.
 * Movement rules live in PlayerMovement; sprite selection lives in CharacterAnimator.
 * While moving the walk clip plays; when movement stops the last facing direction is kept and its
 * static standing frame is shown immediately.
 */
export class PlayerController {
  private readonly movement: PlayerMovement;
  private readonly pathfinder: Pathfinder;
  private facing: Direction = 'S';
  private state: MovementState = 'idle';
  /** Click-to-move waypoints (tile space); empty when not following a path. */
  private path: Point[] = [];
  private stuckMs = 0;
  /** Mobile joystick: a ground unit direction while held (it wins over a path while it lasts). */
  private steering: Point | null = null;
  actions: PlayerActionAnimations = NO_ACTION_ANIMATIONS;

  constructor(
    private readonly map: IsometricMap,
    readonly view: CharacterView,
    spawn: Point,
  ) {
    this.movement = new PlayerMovement(spawn, map, PLAYER_MOVEMENT);
    this.pathfinder = new Pathfinder(map.layout, { radius: PLAYER_MOVEMENT.radius });
    this.syncView();
  }

  /**
   * Desktop: by mouse only (click-to-move along a found path; no keyboard movement keys). Mobile: the virtual joystick
   * steers directly (with the same collision and speed) and wins over a path while it is held.
   */
  update(deltaMs: number): void {
    const moved = this.steering ? this.steerStep(deltaMs) : this.path.length > 0 && this.followPath(deltaMs);
    this.state = moved ? 'walk' : 'idle';

    this.syncView();
  }

  /** Walks to a point (tile space) along a found path. Returns false when there is no way there. */
  moveTo(goal: Point): boolean {
    const path = this.pathfinder.findPath(this.movement.position, goal);
    if (!path || path.length === 0) {
      this.stopPath();
      return false;
    }
    this.path = path;
    this.stuckMs = 0;
    return true;
  }

  /** Mobile joystick: walk in a ground (tile-space) unit direction until it is let go (null). */
  steer(direction: Point | null): void {
    this.steering = direction && (direction.x !== 0 || direction.y !== 0) ? { x: direction.x, y: direction.y } : null;
  }

  isSteering(): boolean {
    return this.steering !== null;
  }

  private steerStep(deltaMs: number): boolean {
    const dir = this.steering!;
    const d = directionFromGroundVector(dir.x, dir.y);
    if (d) this.facing = d;
    return this.movement.step(dir, deltaMs / 1000);
  }

  stopPath(): void {
    this.path = [];
    this.stuckMs = 0;
  }

  hasPath(): boolean {
    return this.path.length > 0;
  }

  /** Turns the (standing) character towards a tile-space point. */
  faceTowards(p: Point): void {
    const d = directionFromGroundVector(p.x - this.movement.position.x, p.y - this.movement.position.y);
    if (d) this.facing = d;
    this.syncView();
  }

  /** 4-way facing for action animations towards a point (attack / hit / cast / death). */
  actionFacingTowards(p: Point): ActionDirection {
    return actionDirectionFromGroundVector(p.x - this.movement.position.x, p.y - this.movement.position.y);
  }

  /** Stops at once where the player stands: no path, standing frame of the current facing (death). */
  halt(): void {
    this.stopPath();
    this.steering = null;
    this.state = 'idle';
    this.syncView();
  }

  /** Puts the player on a point at once (respawn). */
  teleport(p: Point): void {
    this.stopPath();
    this.steering = null;
    this.movement.position.x = p.x;
    this.movement.position.y = p.y;
    this.state = 'idle';
    this.syncView();
  }

  private followPath(deltaMs: number): boolean {
    const dt = deltaMs / 1000;
    const pos = this.movement.position;
    let next = this.path[0];
    let dx = next.x - pos.x;
    let dy = next.y - pos.y;
    let dist = Math.hypot(dx, dy);
    while (dist < 0.02 && this.path.length) {
      this.path.shift();
      if (!this.path.length) return false;
      next = this.path[0];
      dx = next.x - pos.x;
      dy = next.y - pos.y;
      dist = Math.hypot(dx, dy);
    }
    const stepLength = PLAYER_MOVEMENT.speed * dt;
    // last bit: a shorter step lands exactly on the waypoint instead of overshooting it
    const scale = dist < stepLength ? dist / stepLength : 1;
    const moved = this.movement.step({ x: dx / dist, y: dy / dist }, dt, scale);
    const d = directionFromGroundVector(dx, dy);
    if (d) this.facing = d;
    if (!moved) {
      this.stuckMs += deltaMs;
      if (this.stuckMs > STUCK_MS) this.stopPath();
      return false;
    }
    this.stuckMs = 0;
    return true;
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
