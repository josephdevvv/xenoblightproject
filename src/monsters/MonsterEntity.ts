import Phaser from 'phaser';
import { DEPTH } from '../config/constants';
import { PALETTE, toColorInt } from '../config/palette';
import type { Point } from '../core/types';
import { PlayerMovement, type CollisionQuery } from '../player/PlayerMovement';
import { createNameLabel, NAME_LABEL_COLORS, nameLabelTop, placeNameLabel } from '../ui/world/WorldNameLabel';
import type { IsometricMap } from '../world/IsometricMap';
import type { TileBox } from '../world/structures/StructureLayer';
import { MONSTER_FACINGS, facingForDirection, type MonsterFacing } from './art/MonsterArt';
import { MonsterAnimator } from './MonsterAnimator';
import type { MonsterDefinition } from './MonsterDefinition';
import { WanderBehavior } from './WanderBehavior';

let nextMonsterId = 1;

const HP_BAR_WIDTH = 26;
/** Chasing / returning without progress for this long = give up (walk home / snap home). */
const STUCK_MS = 1500;
/** Seconds the corpse stays (after the death clip) before fading out. */
const CORPSE_MS = 900;
const FADE_MS = 450;

/**
 * Behaviour states. `wander` is the original idle wandering; `chase` starts when the monster is attacked
 * (retaliation: approach, then attack at its interval); `return` walks home and heals; `dying` plays the
 * death clip; `gone` waits to respawn at the spawn point.
 */
export type MonsterMode = 'wander' | 'chase' | 'return' | 'dying' | 'gone';

/** What a monster needs from the combat system each frame. */
export interface MonsterCombatContext {
  /** The player's position while it can be fought, else null (defeated / respawning). */
  player: Point | null;
  /** A monster attack reached its contact frame: resolve the hit there (once per attack). */
  onAttackContact(monster: MonsterEntity): void;
}

/**
 * One monster in the world: an animated sprite on its ground root (MonsterAnimator), its name and a small
 * HP bar under its feet, wandering / retaliating movement (same tile-space movement + collision as the
 * player) and its combat state (HP, death, respawn). Damage and hit chance are decided by the combat
 * system; the monster only receives the result.
 */
export class MonsterEntity {
  readonly id = `monster-${nextMonsterId++}`;
  readonly animator: MonsterAnimator;
  /** Name label, anchored to the ground root (never to the animated frame). */
  readonly label: Phaser.GameObjects.Text;
  /** Spawn point in continuous tile space (centre of the wander circle, respawn point). */
  readonly home: Point;
  private readonly hpBar: Phaser.GameObjects.Graphics;
  private readonly movement: PlayerMovement;
  private readonly behavior: WanderBehavior | null;
  private mode: MonsterMode = 'wander';
  private hp: number;
  private attackCooldownMs = 0;
  private stuckMs = 0;
  private respawnInMs = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly map: IsometricMap,
    readonly definition: MonsterDefinition,
    /** Spawn position in continuous tile space. */
    position: Point,
    collision: CollisionQuery,
    seed: number,
  ) {
    this.home = { ...position };
    this.hp = definition.combat.maxHp;
    this.movement = new PlayerMovement(position, collision, {
      speed: definition.behavior?.speed ?? definition.combat.chaseSpeed,
      radius: definition.footprintRadius,
    });
    this.behavior = definition.behavior?.type === 'wander' ? new WanderBehavior(this.home, definition.behavior, seed) : null;

    // Deterministic starting facing so a group of the same monster does not all look the same way.
    const facing: MonsterFacing = MONSTER_FACINGS[Math.abs(seed) % MONSTER_FACINGS.length];
    this.animator = new MonsterAnimator(scene, definition.art, facing);
    this.label = createNameLabel(scene, definition.displayName, NAME_LABEL_COLORS.monster);
    this.hpBar = scene.add.graphics().setDepth(DEPTH.NamePlate).setVisible(false);
    this.syncSprite();
  }

  /** The animated body sprite (bounds, picking, depth). */
  get sprite(): Phaser.GameObjects.Sprite {
    return this.animator.sprite;
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

  getMode(): MonsterMode {
    return this.mode;
  }

  getHp(): number {
    return this.hp;
  }

  /** Can be targeted, damaged and blocks other monsters. */
  isAlive(): boolean {
    return this.mode !== 'dying' && this.mode !== 'gone';
  }

  isWalking(): boolean {
    return this.behavior?.isWalking() ?? false;
  }

  /** Ground footprint in tile space (at the current position, or at `at`). */
  footprint(at: Point = this.movement.position): TileBox {
    const r = this.definition.footprintRadius;
    return { minX: at.x - r, minY: at.y - r, maxX: at.x + r, maxY: at.y + r };
  }

  /** Marks the player's target (name highlighted). */
  setTargeted(on: boolean): void {
    this.label.setColor(on ? '#ffd27a' : NAME_LABEL_COLORS.monster);
  }

  /**
   * Applies a landed hit (amount already decided by the combat rules). Returns false when the monster
   * cannot be damaged (dying / gone) - so a late hit never counts twice. Getting hit makes it retaliate.
   */
  takeDamage(amount: number): boolean {
    if (!this.isAlive()) return false;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp === 0) {
      this.die();
      return true;
    }
    if (this.mode === 'wander' || this.mode === 'return') this.startChase();
    // mid-attack the attack still lands: only flash red; otherwise play the hit reaction
    if (this.animator.isAttacking()) this.animator.flash();
    else this.animator.hit();
    this.drawHpBar();
    return true;
  }

  /** Stops fighting (player defeated): walk home and heal. */
  disengage(): void {
    if (this.mode === 'chase') this.startReturn();
  }

  /**
   * Advances movement / combat by one frame.
   * @param canStand whether this monster may stand at a point (collision + other monsters + buildings)
   */
  update(deltaMs: number, canStand: (p: Point) => boolean, ctx: MonsterCombatContext): void {
    switch (this.mode) {
      case 'gone':
        this.respawnInMs -= deltaMs;
        // never pop up on top of the player
        if (this.respawnInMs <= 0 && (!ctx.player || Math.hypot(ctx.player.x - this.home.x, ctx.player.y - this.home.y) > 2)) this.respawn();
        return;
      case 'dying':
        return;
      case 'chase':
        this.updateChase(deltaMs, ctx);
        return;
      case 'return':
        this.updateReturn(deltaMs);
        return;
      case 'wander':
        this.updateWander(deltaMs, canStand);
        return;
    }
  }

  destroy(): void {
    this.animator.destroy();
    this.label.destroy();
    this.hpBar.destroy();
  }

  // ---------------------------------------------------------------------------------------------

  private updateWander(deltaMs: number, canStand: (p: Point) => boolean): void {
    if (!this.behavior) return;
    const direction = this.behavior.update(this.movement.position, deltaMs, canStand);
    if (!direction) {
      this.animator.setMotion(false);
      return;
    }
    const before = { ...this.movement.position };
    const moved = this.movement.step(direction, deltaMs / 1000);
    const radius = this.definition.behavior?.radiusTiles ?? 0;
    const p = this.movement.position;
    if (Math.hypot(p.x - this.home.x, p.y - this.home.y) > radius) {
      // Sliding along a wall pushed it outside its circle: step back and choose another destination.
      p.x = before.x;
      p.y = before.y;
      this.behavior.blocked();
      this.animator.setMotion(false);
      return;
    }
    if (!moved) {
      this.behavior.blocked();
      this.animator.setMotion(false);
      return;
    }
    this.animator.setMotion(true, facingForDirection(p.x - before.x, p.y - before.y, this.animator.getFacing()));
    this.syncSprite();
  }

  private updateChase(deltaMs: number, ctx: MonsterCombatContext): void {
    const c = this.definition.combat;
    const p = this.movement.position;
    this.attackCooldownMs = Math.max(0, this.attackCooldownMs - deltaMs);
    if (!ctx.player || Math.hypot(p.x - this.home.x, p.y - this.home.y) > c.leashTiles) {
      this.startReturn();
      return;
    }
    const target = ctx.player;
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    const dist = Math.hypot(dx, dy);
    const facing = facingForDirection(dx, dy, this.animator.getFacing());
    if (dist <= c.attackRange) {
      this.stuckMs = 0;
      if (!this.animator.isAttacking()) this.animator.setMotion(false, facing);
      if (this.attackCooldownMs === 0 && !this.animator.isAttacking()) {
        this.attackCooldownMs = c.attackIntervalMs;
        this.animator.setMotion(false, facing);
        this.animator.attack(undefined, () => ctx.onAttackContact(this));
      }
      this.syncSprite();
      return;
    }
    if (this.animator.isAttacking()) return; // finish the swing before moving again
    this.moveTowards(dx / dist, dy / dist, deltaMs, facing, () => this.startReturn());
  }

  private updateReturn(deltaMs: number): void {
    const p = this.movement.position;
    const dx = this.home.x - p.x;
    const dy = this.home.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.15) {
      this.mode = 'wander';
      this.heal();
      this.animator.setMotion(false);
      return;
    }
    const facing = facingForDirection(dx, dy, this.animator.getFacing());
    this.moveTowards(dx / dist, dy / dist, deltaMs, facing, () => {
      // cannot walk back (blocked): put it home rather than leave it stranded
      p.x = this.home.x;
      p.y = this.home.y;
      this.mode = 'wander';
      this.heal();
      this.animator.setMotion(false);
      this.syncSprite();
    });
  }

  private moveTowards(dx: number, dy: number, deltaMs: number, facing: MonsterFacing, onStuck: () => void): void {
    const base = this.definition.behavior?.speed ?? this.definition.combat.chaseSpeed;
    const moved = this.movement.step({ x: dx, y: dy }, deltaMs / 1000, this.definition.combat.chaseSpeed / base);
    this.animator.setMotion(moved, facing);
    if (!moved) {
      this.stuckMs += deltaMs;
      if (this.stuckMs > STUCK_MS) {
        this.stuckMs = 0;
        onStuck();
      }
      return;
    }
    this.stuckMs = 0;
    this.syncSprite();
  }

  private startChase(): void {
    this.mode = 'chase';
    this.stuckMs = 0;
    // first swing comes a moment after being provoked
    this.attackCooldownMs = Math.min(this.attackCooldownMs, this.definition.combat.attackIntervalMs * 0.4);
  }

  private startReturn(): void {
    this.mode = 'return';
    this.stuckMs = 0;
  }

  private heal(): void {
    this.hp = this.definition.combat.maxHp;
    this.drawHpBar();
  }

  private die(): void {
    this.mode = 'dying';
    this.hpBar.setVisible(false);
    this.animator.die(() => {
      const scene = this.sprite.scene;
      scene.time.delayedCall(CORPSE_MS, () => {
        scene.tweens.add({
          targets: [this.sprite, this.label],
          alpha: 0,
          duration: FADE_MS,
          onComplete: () => {
            this.sprite.setVisible(false);
            this.label.setVisible(false);
            this.mode = 'gone';
            this.respawnInMs = this.definition.combat.respawnMs;
          },
        });
      });
    });
  }

  private respawn(): void {
    const p = this.movement.position;
    p.x = this.home.x;
    p.y = this.home.y;
    this.hp = this.definition.combat.maxHp;
    this.attackCooldownMs = 0;
    this.mode = 'wander';
    this.animator.reset();
    this.sprite.setAlpha(1).setVisible(true);
    this.label.setAlpha(1).setVisible(true);
    this.drawHpBar();
    this.syncSprite();
  }

  private drawHpBar(): void {
    const max = this.definition.combat.maxHp;
    const show = this.isAlive() && this.hp < max;
    this.hpBar.setVisible(show);
    if (!show) return;
    const w = Math.max(1, Math.round((HP_BAR_WIDTH * this.hp) / max));
    this.hpBar.clear();
    this.hpBar.fillStyle(toColorInt(PALETTE.black), 0.85).fillRect(-HP_BAR_WIDTH / 2 - 1, 0, HP_BAR_WIDTH + 2, 4);
    this.hpBar.fillStyle(0xd74a51, 1).fillRect(-HP_BAR_WIDTH / 2, 1, w, 2);
  }

  private syncSprite(): void {
    const world = this.world;
    const x = Math.round(world.x);
    const y = Math.round(world.y);
    // Same depth rule as characters: screen Y of the feet, corrected against nearby structure walls.
    const depth = this.map.resolveDepth(this.footprint(), world.y, this.animator.sprite.getBounds());
    this.animator.setRoot(x, y, depth);
    placeNameLabel(this.label, x, y);
    this.hpBar.setPosition(x, nameLabelTop(y) + Math.round(this.label.height) + 1);
  }
}
