import Phaser from 'phaser';
import type { Point } from '../core/types';
import type { CharacterData } from '../data/CharacterData';
import { monsterCombatStats } from '../monsters/MonsterDefinition';
import type { MonsterCombatContext, MonsterEntity } from '../monsters/MonsterEntity';
import type { MonsterSpawner } from '../monsters/MonsterSpawner';
import type { PlayerController } from '../player/PlayerController';
import { CharacterStatusService } from '../status/CharacterStatusService';
import { COMBAT_RULES, playerCombatStats, rollAttack, type CombatStats } from './CombatRules';
import { DamageNumbers } from './DamageNumbers';

/** How often the player re-plans the way to a moving target. */
const REPATH_MS = 350;
/** Extra reach allowed when a monster's swing lands (the player may have stepped a little). */
const CONTACT_SLACK = 0.35;
/** Fails in a row to reach a target before giving up on it. */
const MAX_PATH_FAILS = 3;

/**
 * Player-versus-monster combat: the player's target and auto-attack loop (approach with pathfinding,
 * attack in range at the attack interval until the target dies or the player cancels), damage resolution
 * for both sides (CombatRules), monster retaliation hooks, EXP, player HP / regeneration / defeat and
 * floating combat text. Visual feedback on monsters (hit reaction, red flash, death, VFX) is played by
 * MonsterEntity / MonsterAnimator; this class decides WHAT happens.
 */
export class CombatSystem {
  readonly numbers: DamageNumbers;
  private target: MonsterEntity | null = null;
  private readonly marker: Phaser.GameObjects.Ellipse;
  private playerHp: number;
  private attackCooldownMs = 0;
  private repathMs = 0;
  private pathFails = 0;
  private lastHurtAt = -Infinity;
  private regenCarry = 0;
  private defeatedUntil: number | null = null;
  private elapsed = 0;
  private readonly rng: () => number;
  readonly monsterContext: MonsterCombatContext;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly character: CharacterData,
    private readonly player: PlayerController,
    private readonly monsters: MonsterSpawner,
    private readonly spawn: Point,
    rng: () => number = Math.random,
  ) {
    this.rng = rng;
    this.numbers = new DamageNumbers(scene);
    this.playerHp = this.playerStats().maxHp;
    this.marker = scene.add.ellipse(0, 0, 30, 12).setStrokeStyle(1, 0xffd27a, 0.9).setVisible(false);
    this.monsterContext = {
      player: null,
      onAttackContact: (m) => this.resolveMonsterHit(m),
    };
    player.onManualMove = () => this.clearTarget();
    // level up / stat allocation: keep HP sensible (full heal on level up, clamp on max changes)
    const unsubscribe = CharacterStatusService.onChange((c) => {
      if (c !== character) return;
      this.playerHp = Math.min(this.playerHp, this.playerStats().maxHp);
    });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);
  }

  // -------------------------------------------------------------------------------------------
  // Player commands
  // -------------------------------------------------------------------------------------------

  /** Left click on a monster: target it, walk into range and attack until it dies. */
  attack(monster: MonsterEntity): void {
    if (this.isDefeated() || !monster.isAlive()) return;
    if (this.target !== monster) this.clearTarget();
    this.target = monster;
    monster.setTargeted(true);
    this.repathMs = 0;
    this.pathFails = 0;
  }

  /** Left click on the ground: cancel the target and walk there. Returns false when unreachable. */
  moveTo(point: Point): boolean {
    if (this.isDefeated()) return false;
    this.clearTarget();
    return this.player.moveTo(point);
  }

  clearTarget(): void {
    this.target?.setTargeted(false);
    this.target = null;
    this.marker.setVisible(false);
  }

  getTarget(): MonsterEntity | null {
    return this.target;
  }

  // -------------------------------------------------------------------------------------------
  // State for the HUD / tests
  // -------------------------------------------------------------------------------------------

  playerStats(): CombatStats {
    return playerCombatStats(CharacterStatusService.derived(this.character));
  }

  getPlayerHp(): number {
    return this.playerHp;
  }

  isDefeated(): boolean {
    return this.defeatedUntil !== null;
  }

  // -------------------------------------------------------------------------------------------
  // Frame update (before the player and monsters move)
  // -------------------------------------------------------------------------------------------

  update(deltaMs: number): void {
    this.elapsed += deltaMs;
    this.attackCooldownMs = Math.max(0, this.attackCooldownMs - deltaMs);
    this.monsterContext.player = this.isDefeated() ? null : this.player.getTilePosition();

    if (this.defeatedUntil !== null) {
      if (this.elapsed >= this.defeatedUntil) this.respawnPlayer();
      return;
    }
    this.regenerate(deltaMs);
    this.updateTarget(deltaMs);
  }

  /** Call after the monsters moved: keeps the target ring under the target's feet. */
  updateMarker(): void {
    if (!this.target) return;
    const s = this.target.sprite;
    this.marker.setPosition(s.x, s.y).setDepth(s.depth - 1).setVisible(true);
  }

  private updateTarget(deltaMs: number): void {
    const t = this.target;
    if (!t) return;
    if (!t.isAlive()) {
      this.clearTarget();
      return;
    }
    const me = this.player.getTilePosition();
    const tp = t.position;
    const dist = Math.hypot(tp.x - me.x, tp.y - me.y);
    const stats = this.playerStats();
    if (dist <= stats.attackRange) {
      this.player.stopPath();
      this.player.faceTowards(tp);
      this.pathFails = 0;
      if (this.attackCooldownMs === 0) this.playerAttack(t, stats);
      return;
    }
    // approach: re-plan regularly (the target moves) or when the last path ran out
    this.repathMs -= deltaMs;
    if (this.repathMs <= 0 || !this.player.hasPath()) {
      this.repathMs = REPATH_MS;
      if (this.player.moveTo(tp)) {
        this.pathFails = 0;
      } else if (++this.pathFails >= MAX_PATH_FAILS) {
        // cannot get there (blocked / unreachable): stop instead of pushing against a wall
        const w = t.world;
        this.numbers.show(w.x, w.y - 40, "Can't reach", 'miss');
        this.player.stopPath();
        this.clearTarget();
      }
    }
  }

  private playerAttack(target: MonsterEntity, stats: CombatStats): void {
    this.attackCooldownMs = stats.attackIntervalMs;
    // No player attack art yet: the hook returns false and the standing frame (turned to the target)
    // stays as the temporary visual. 4-direction clips plug in through PlayerController.actions.
    this.player.actions.play('attack', this.player.actionFacingTowards(target.position));
    const result = rollAttack(stats, monsterCombatStats(target.definition), this.rng);
    const w = target.world;
    const top = w.y - target.sprite.displayHeight * 0.75;
    if (!result.hit) {
      this.numbers.show(w.x, top, 'MISS', 'miss');
      target.takeDamage(0); // provokes it all the same
      return;
    }
    if (!target.takeDamage(result.damage)) return; // already dying: no duplicate damage
    this.numbers.show(w.x, top, String(result.damage), result.crit ? 'crit' : 'damage');
    if (!target.isAlive()) this.onKill(target);
  }

  private onKill(monster: MonsterEntity): void {
    this.clearTarget();
    const exp = monster.definition.combat.exp;
    const levels = CharacterStatusService.gainExp(this.character, exp);
    const w = this.player.getWorldPosition();
    this.numbers.show(w.x, w.y - 64, `+${exp} EXP`, 'exp');
    if (levels > 0) {
      this.playerHp = this.playerStats().maxHp; // level up: full heal
      this.numbers.show(w.x, w.y - 80, `LEVEL ${this.character.status.level}!`, 'crit');
    }
  }

  /** A monster's swing reached its contact frame (once per swing). */
  private resolveMonsterHit(monster: MonsterEntity): void {
    if (this.isDefeated() || !monster.isAlive()) return;
    const me = this.player.getTilePosition();
    const reach = monster.definition.combat.attackRange + CONTACT_SLACK;
    if (Math.hypot(monster.position.x - me.x, monster.position.y - me.y) > reach) return; // stepped out of reach
    const result = rollAttack(monsterCombatStats(monster.definition), this.playerStats(), this.rng);
    const w = this.player.getWorldPosition();
    if (!result.hit) {
      this.numbers.show(w.x, w.y - 58, 'MISS', 'miss');
      return;
    }
    this.playerHp = Math.max(0, this.playerHp - result.damage);
    this.lastHurtAt = this.elapsed;
    this.numbers.show(w.x, w.y - 58, String(result.damage), 'playerDamage');
    this.flashPlayer();
    this.player.actions.play('hit', this.player.actionFacingTowards(monster.position));
    if (this.playerHp === 0) this.defeat();
  }

  private flashPlayer(): void {
    const sprite = this.player.view.sprite;
    sprite.setTint(0xff5050);
    this.scene.time.delayedCall(140, () => sprite.clearTint());
  }

  private regenerate(deltaMs: number): void {
    const max = this.playerStats().maxHp;
    if (this.playerHp >= max || this.elapsed - this.lastHurtAt < COMBAT_RULES.regenDelayMs) return;
    this.regenCarry += (max * COMBAT_RULES.regenPerSecond * deltaMs) / 1000;
    const whole = Math.floor(this.regenCarry);
    if (whole > 0) {
      this.regenCarry -= whole;
      this.playerHp = Math.min(max, this.playerHp + whole);
    }
  }

  private defeat(): void {
    this.clearTarget();
    this.player.stopPath();
    this.player.actions.play('death', this.player.actionFacingTowards(this.player.getTilePosition()));
    const w = this.player.getWorldPosition();
    this.numbers.show(w.x, w.y - 70, 'DEFEATED', 'info');
    this.player.view.sprite.setAlpha(0.5);
    for (const m of this.monsters.getMonsters()) m.disengage();
    this.defeatedUntil = this.elapsed + COMBAT_RULES.playerRespawnMs;
  }

  private respawnPlayer(): void {
    this.defeatedUntil = null;
    this.player.teleport({ x: this.spawn.x, y: this.spawn.y });
    this.player.view.sprite.setAlpha(1);
    this.playerHp = this.playerStats().maxHp;
  }
}
