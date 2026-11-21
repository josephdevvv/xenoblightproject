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
import { getCharacterSpriteId } from '../characters/CharacterAssetIds';
import { PLAYER_IMPACT_VFX } from '../characters/combat/PlayerCombatArt';
import { monsterVfxAnimKey, monsterVfxKey } from '../monsters/art/MonsterArt';
import { PLAYER_ATTACKS, playerImpactDelayMs, type PlayerAttackDefinition, type PlayerAttackId } from './PlayerAttacks';
import type { AttackVfxLayer, VfxTarget } from './vfx/AttackVfxLayer';
import { spriteHitAnchor } from './vfx/HitAnchor';
import { monsterExpReward } from '../progression/MonsterExpRewards';
import { KillRewardLedger } from '../progression/LevelProgression';

/** How often the player re-plans the way to a moving target. */
const REPATH_MS = 350;
/** Extra reach allowed when a monster's swing lands (the player may have stepped a little). */
const CONTACT_SLACK = 0.35;
/** Fails in a row to reach a target before giving up on it. */
const MAX_PATH_FAILS = 3;
/** The combat stance stays this long after the last attack / hit. */
const COMBAT_STANCE_MS = 4000;

/** A player swing waiting for its hit frame (frame 4). Resolved once, then dropped. */
interface PendingPlayerHit {
  target: MonsterEntity;
  attack: PlayerAttackDefinition;
  /** Combat clock time of the hit frame. */
  at: number;
}

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
  private defeated = false;
  private elapsed = 0;
  private readonly rng: () => number;
  readonly monsterContext: MonsterCombatContext;
  /** Called once when the player's HP reaches 0 (the death flow takes over; there is no auto-respawn). */
  onPlayerDefeated: (() => void) | null = null;
  /** Attack VFX layer (on-hit effects drawn on the target's body). Set by the scene. */
  vfx: AttackVfxLayer | null = null;
  private pendingHits: PendingPlayerHit[] = [];
  private queuedSkill: PlayerAttackId | null = null;
  private lastCombatAt = -Infinity;
  /** Kill rewards already paid (once per monster life). */
  readonly killRewards = new KillRewardLedger();
  private readonly spriteId: string;
  private readonly playerTarget: VfxTarget;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly character: CharacterData,
    private readonly player: PlayerController,
    private readonly monsters: MonsterSpawner,
    rng: () => number = Math.random,
  ) {
    this.rng = rng;
    this.spriteId = getCharacterSpriteId(character.appearance);
    this.playerTarget = { hitAnchor: () => spriteHitAnchor(player.view.sprite) };
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

  /** Cancels the target - and any swing still waiting for its hit frame (an interrupted attack never lands). */
  clearTarget(): void {
    this.target?.setTargeted(false);
    this.target = null;
    this.marker.setVisible(false);
    if (this.pendingHits.length) {
      this.pendingHits = [];
      this.player.actions.reset?.();
    }
  }

  /**
   * Drifter Lv.1 attack skill (and future skills): replaces the NEXT swing on the current target -
   * same dagger_thrust animation and hit frame, different damage multiplier and impact scale.
   * Returns false without a target. (No SP cost or cooldown is defined yet.)
   */
  useSkill(id: PlayerAttackId): boolean {
    if (this.isDefeated() || !this.target || !this.target.isAlive()) return false;
    this.queuedSkill = id;
    return true;
  }

  getQueuedSkill(): PlayerAttackId | null {
    return this.queuedSkill;
  }

  /** In combat: a target, or an attack / hit in the last few seconds (combat stance). */
  isInCombat(): boolean {
    return !this.defeated && (this.target !== null || this.elapsed - this.lastCombatAt < COMBAT_STANCE_MS);
  }

  /** Swings waiting for their hit frame (for checks). */
  get pendingHitCount(): number {
    return this.pendingHits.length;
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
    return this.defeated;
  }

  // -------------------------------------------------------------------------------------------
  // Frame update (before the player and monsters move)
  // -------------------------------------------------------------------------------------------

  update(deltaMs: number): void {
    this.elapsed += deltaMs;
    this.attackCooldownMs = Math.max(0, this.attackCooldownMs - deltaMs);
    this.monsterContext.player = this.isDefeated() ? null : this.player.getTilePosition();

    if (this.defeated) return; // dead: no regeneration, no target, nothing hits the player
    this.regenerate(deltaMs);
    this.resolvePendingHits();
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

  /**
   * Starts a swing: the attack animation (dagger_thrust, or the standing frame for appearances without
   * combat art) and a pending hit at the animation's hit frame (frame 4), timed on the combat clock from the
   * animation's metadata - playback never decides damage. A queued skill replaces this swing.
   */
  private playerAttack(target: MonsterEntity, stats: CombatStats): void {
    this.attackCooldownMs = stats.attackIntervalMs;
    const attack = PLAYER_ATTACKS[this.queuedSkill ?? 'basic'];
    this.queuedSkill = null;
    this.lastCombatAt = this.elapsed;
    this.player.actions.play('attack', this.player.actionFacingTowards(target.position));
    this.pendingHits.push({ target, attack, at: this.elapsed + playerImpactDelayMs(this.spriteId, attack) });
  }

  private resolvePendingHits(): void {
    if (!this.pendingHits.length) return;
    const due = this.pendingHits.filter((h) => h.at <= this.elapsed);
    if (!due.length) return;
    this.pendingHits = this.pendingHits.filter((h) => h.at > this.elapsed);
    for (const h of due) this.resolvePlayerHit(h);
  }

  /**
   * The swing reached its hit frame: the existing rules decide (hit %, damage, crit). A target that died
   * meanwhile takes nothing; one that moved out of reach is missed. Only a hit shows the impact VFX - on the
   * target's body, scaled by the attack (1.0 basic, 1.5 Lv.1 skill).
   */
  private resolvePlayerHit(h: PendingPlayerHit): void {
    const target = h.target;
    if (!target.isAlive()) return;
    const stats = this.playerStats();
    const w = target.world;
    const top = w.y - target.sprite.displayHeight * 0.75;
    const me = this.player.getTilePosition();
    const inReach = Math.hypot(target.position.x - me.x, target.position.y - me.y) <= stats.attackRange + CONTACT_SLACK;
    const result = inReach ? rollAttack({ ...stats, atk: stats.atk * h.attack.atkMultiplier }, monsterCombatStats(target.definition), this.rng) : null;
    this.lastCombatAt = this.elapsed;
    if (!result || !result.hit) {
      this.numbers.show(w.x, top, 'MISS', 'miss');
      target.takeDamage(0); // provokes it all the same
      return;
    }
    if (!target.takeDamage(result.damage)) return; // already dying: no duplicate damage
    this.vfx?.spawn({ texture: PLAYER_IMPACT_VFX.key, anim: PLAYER_IMPACT_VFX.animKey, target: { hitAnchor: () => spriteHitAnchor(target.sprite) }, scale: h.attack.vfxScale });
    this.numbers.show(w.x, top, String(result.damage), result.crit ? 'crit' : 'damage');
    if (!target.isAlive()) this.onKill(target);
  }

  /** A monster this player defeated: EXP from the reward table, paid once for this death. */
  private onKill(monster: MonsterEntity): void {
    this.clearTarget();
    if (monster.isAlive() || !this.killRewards.claim(monster.id, monster.life)) return;
    const exp = monsterExpReward(monster.definition.id);
    const levels = CharacterStatusService.gainExp(this.character, exp);
    const w = this.player.getWorldPosition();
    this.numbers.show(w.x, w.y - 64, `+${exp} EXP`, 'exp');
    if (levels > 0) {
      this.playerHp = this.playerStats().maxHp; // level up: full heal
      this.numbers.show(w.x, w.y - 80, `LEVEL ${this.character.status.level}!`, 'crit');
    }
  }

  /**
   * A monster's swing reached its hit frame (frame 4, once per swing): the existing rules decide; a hit
   * shows that monster's own attack VFX on the player's body, then the hit reaction plays.
   */
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
    this.lastCombatAt = this.elapsed;
    this.vfx?.spawn({ texture: monsterVfxKey(monster.animator.art), anim: monsterVfxAnimKey(monster.animator.art, monster.animator.getFacing()), target: this.playerTarget });
    this.numbers.show(w.x, w.y - 58, String(result.damage), 'playerDamage');
    this.flashPlayer();
    this.player.actions.play('hit', this.player.actionFacingTowards(monster.position));
    if (this.playerHp === 0) this.defeat();
  }

  private flashPlayer(): void {
    const sprite = this.player.view.sprite;
    sprite.setTint(0xff5050);
    this.scene.time.delayedCall(140, () => {
      if (sprite.active) sprite.clearTint();
    });
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

  /** HP reached 0: stop every combat action at once and hand over to the death flow (once). */
  private defeat(): void {
    if (this.defeated) return;
    this.defeated = true;
    this.clearTarget();
    this.pendingHits = [];
    this.queuedSkill = null;
    this.player.actions.reset?.();
    this.player.halt();
    this.attackCooldownMs = 0;
    this.player.view.sprite.clearTint();
    for (const m of this.monsters.getMonsters()) m.disengage();
    this.onPlayerDefeated?.();
  }

  /**
   * Respawn (called by the death flow at the save point). Existing rule: full HP. Every temporary combat
   * state is cleared (target, cooldowns, regeneration timers, red flash).
   */
  respawnAt(point: Point): void {
    this.clearTarget();
    this.pendingHits = [];
    this.queuedSkill = null;
    this.lastCombatAt = -Infinity;
    this.player.actions.reset?.();
    this.defeated = false;
    this.player.teleport({ x: point.x, y: point.y });
    this.player.view.sprite.clearTint();
    this.playerHp = this.playerStats().maxHp;
    this.attackCooldownMs = 0;
    this.repathMs = 0;
    this.pathFails = 0;
    this.regenCarry = 0;
    this.lastHurtAt = -Infinity;
  }
}
