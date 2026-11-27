import Phaser from 'phaser';
import type { Point } from '../core/types';
import type { CharacterData } from '../data/CharacterData';
import { monsterCombatStats } from '../monsters/MonsterDefinition';
import type { MonsterCombatContext, MonsterEntity } from '../monsters/MonsterEntity';
import type { MonsterSpawner } from '../monsters/MonsterSpawner';
import type { PlayerController } from '../player/PlayerController';
import { CharacterStatusService } from '../status/CharacterStatusService';
import { QuestService } from '../quests/QuestService';
import { COMBAT_RULES, playerCombatStats, rollAttack, type CombatStats } from './CombatRules';
import { DamageNumbers } from './DamageNumbers';
import { getCharacterSpriteId } from '../characters/CharacterAssetIds';
import { PLAYER_IMPACT_VFX } from '../characters/combat/PlayerCombatArt';
import { monsterVfxAnimKey, monsterVfxKey } from '../monsters/art/MonsterArt';
import { attackClipFor, equippedWeaponType } from './WeaponAttackClip';
import { passiveSkillModifiers } from '../passives/PassiveProgress';
import { attackDamage, PLAYER_ATTACKS, playerImpactDelayMs, playerSwingMs, swingTimeScale, type PlayerAttackDefinition, type PlayerAttackId } from './PlayerAttacks';
import type { AttackVfxLayer, VfxTarget } from './vfx/AttackVfxLayer';
import type { SkillVfxLayer, SkillVfxRequest } from './vfx/SkillVfxLayer';
import { skillVfxDelayMs, skillVfxOf } from '../characters/combat/SkillVfxArt';
import { spriteHitAnchor } from './vfx/HitAnchor';
import { monsterExpReward } from '../progression/MonsterExpRewards';
import { monsterGoldReward } from '../progression/MonsterGoldRewards';
import { GoldService } from '../economy/GoldService';
import { formatGold } from '../ui/hud/GoldIcon';
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
  /** A conversation is open: no player commands, and the player cannot be fought (see setSuspended). */
  private suspended = false;
  /** A self-cast (Self-Heal) holds the player: no approach, no turn, no swing until it is over - monsters still attack. */
  private actionLocked = false;
  private elapsed = 0;
  private readonly rng: () => number;
  readonly monsterContext: MonsterCombatContext;
  /** A monster's swing reached the player (hit or miss) - Auto Play's "retaliate". */
  onPlayerAttacked: ((monster: MonsterEntity) => void) | null = null;
  /** Called once when the player's HP reaches 0 (the death flow takes over; there is no auto-respawn). */
  onPlayerDefeated: (() => void) | null = null;
  /** Attack VFX layer (on-hit effects drawn on the target's body). Set by the scene. */
  vfx: AttackVfxLayer | null = null;
  /** Skill effects on the player (the Drifter's red stab), started on the combat clock like the hits. */
  skillVfx: SkillVfxLayer | null = null;
  private pendingHits: PendingPlayerHit[] = [];
  /** Skill effects waiting for their moment in the swing (the peak frame on the hit frame). */
  private pendingVfx: { at: number; request: SkillVfxRequest }[] = [];
  private queuedSkill: PlayerAttackId | null = null;
  /** Pays for the queued skill when its swing starts (SP, cooldown); false = the swing stays a basic attack. */
  private queuedActivate: (() => boolean) | null = null;
  private playerSp: number;
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
    this.playerSp = this.getPlayerMaxSp();
    this.marker = scene.add.ellipse(0, 0, 30, 12).setStrokeStyle(1, 0xffd27a, 0.9).setVisible(false);
    this.monsterContext = {
      player: null,
      onAttackContact: (m) => this.resolveMonsterHit(m),
    };
    // level up / stat allocation: keep HP sensible (full heal on level up, clamp on max changes)
    const unsubscribe = CharacterStatusService.onChange((c) => {
      if (c !== character) return;
      this.playerHp = Math.min(this.playerHp, this.playerStats().maxHp);
      this.playerSp = Math.min(this.playerSp, this.getPlayerMaxSp());
    });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);
  }

  // -------------------------------------------------------------------------------------------
  // Player commands
  // -------------------------------------------------------------------------------------------

  /** Left click on a monster: target it, walk into range and attack until it dies. */
  attack(monster: MonsterEntity): void {
    if (this.isDefeated() || this.suspended || !monster.isAlive()) return;
    if (this.target !== monster) this.clearTarget();
    this.target = monster;
    monster.setTargeted(true);
    this.repathMs = 0;
    this.pathFails = 0;
  }

  /** Left click on the ground: cancel the target and walk there. Returns false when unreachable. */
  moveTo(point: Point): boolean {
    if (this.isDefeated() || this.suspended) return false;
    this.clearTarget();
    return this.player.moveTo(point);
  }

  /** Cancels the target - and any swing still waiting for its hit frame (an interrupted attack never lands). */
  clearTarget(): void {
    this.target?.setTargeted(false);
    this.target = null;
    this.marker.setVisible(false);
    // a skill waiting for a swing on that target is dropped (nothing was paid for it)
    this.queuedSkill = null;
    this.queuedActivate = null;
    if (this.pendingHits.length) {
      this.pendingHits = [];
      this.pendingVfx = [];
      this.player.actions.reset?.();
    }
  }

  /**
   * Drifter Lv.1 attack skill (and future skills): replaces the NEXT swing on the current target -
   * same dagger_thrust animation and hit frame, different damage multiplier and impact scale.
   * Returns false without a target. (No SP cost or cooldown is defined yet.)
   */
  useSkill(id: PlayerAttackId, activate: (() => boolean) | null = null): boolean {
    if (this.isDefeated() || this.suspended || !this.target || !this.target.isAlive()) return false;
    // one skill waits at a time: a new one replaces it (never two casts on one swing)
    this.queuedSkill = id;
    this.queuedActivate = activate;
    return true;
  }

  getQueuedSkill(): PlayerAttackId | null {
    return this.queuedSkill;
  }

  /**
   * Talking to an NPC: the target and any pending swing are dropped, and - as while defeated - monsters
   * see no player to fight (they walk home), since the player cannot act.
   */
  /** The cast lock (GameScene): the target is kept, the attack loop waits; death and respawn clear it. */
  setActionLocked(on: boolean): void {
    this.actionLocked = on;
  }

  setSuspended(on: boolean): void {
    this.suspended = on;
    if (!on) return;
    this.clearTarget();
    this.queuedSkill = null;
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

  /** Restores HP (items): never above max HP, nothing while defeated. Returns the HP actually restored. */
  healPlayer(amount: number): number {
    if (this.isDefeated() || !Number.isFinite(amount) || amount <= 0) return 0;
    const max = this.playerStats().maxHp;
    const healed = Math.min(Math.floor(amount), Math.max(0, max - this.playerHp));
    if (healed <= 0) return 0;
    this.playerHp += healed;
    const w = this.player.getWorldPosition();
    this.numbers.show(w.x, w.y - 64, `+${healed} HP`, 'exp');
    return healed;
  }

  /** Max SP now (derived stats, whole points). */
  getPlayerMaxSp(): number {
    return Math.max(0, Math.round(CharacterStatusService.derived(this.character).maxSp));
  }

  getPlayerSp(): number {
    return this.playerSp;
  }

  /** Pays SP for a skill. False (nothing paid) while defeated or with too little SP. */
  spendSp(amount: number): boolean {
    if (this.isDefeated() || !Number.isFinite(amount) || amount < 0 || this.playerSp < amount) return false;
    this.playerSp -= amount;
    return true;
  }

  /** Restores SP (items): never above max SP, nothing while defeated. Returns the SP actually restored. */
  restoreSp(amount: number): number {
    if (this.isDefeated() || !Number.isFinite(amount) || amount <= 0) return 0;
    const restored = Math.min(Math.floor(amount), Math.max(0, this.getPlayerMaxSp() - this.playerSp));
    if (restored <= 0) return 0;
    this.playerSp += restored;
    const w = this.player.getWorldPosition();
    this.numbers.show(w.x, w.y - 64, `+${restored} SP`, 'info');
    return restored;
  }

  /** Max HP now (derived stats). */
  getPlayerMaxHp(): number {
    return this.playerStats().maxHp;
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
    this.monsterContext.player = this.isDefeated() || this.suspended ? null : this.player.getTilePosition();

    if (this.defeated) return; // dead: no regeneration, no target, nothing hits the player
    this.regenerate(deltaMs);
    if (this.suspended) return;
    this.startPendingVfx();
    this.resolvePendingHits();
    this.updateTarget(deltaMs);
  }

  private startPendingVfx(): void {
    if (!this.pendingVfx.length) return;
    const due = this.pendingVfx.filter((v) => v.at <= this.elapsed);
    if (!due.length) return;
    this.pendingVfx = this.pendingVfx.filter((v) => v.at > this.elapsed);
    for (const v of due) this.skillVfx?.spawn(v.request);
  }

  /** Call after the monsters moved: keeps the target ring under the target's feet. */
  updateMarker(): void {
    if (!this.target) return;
    // on the ground point (a flying monster's body is drawn above it)
    const w = this.target.world;
    this.marker.setPosition(Math.round(w.x), Math.round(w.y)).setDepth(this.target.sprite.depth - 1).setVisible(true);
  }

  private updateTarget(deltaMs: number): void {
    const t = this.target;
    if (!t) return;
    if (!t.isAlive()) {
      this.clearTarget();
      return;
    }
    if (this.actionLocked) {
      this.player.stopPath(); // held in a cast: the attack loop goes on when it is over
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
   * Starts a swing: the attack animation (Unarmed Punch with an empty weapon slot, the weapon's own clip otherwise -
   * read at every swing, so equipping / unequipping counts at once; the standing frame for appearances without
   * combat art) and a pending hit at the animation's hit frame (frame 4), timed on the combat clock from the
   * animation's metadata - playback never decides damage. A queued skill replaces this swing.
   */
  private playerAttack(target: MonsterEntity, stats: CombatStats): void {
    this.attackCooldownMs = stats.attackIntervalMs;
    let id = this.queuedSkill;
    const activate = this.queuedActivate;
    this.queuedSkill = null;
    this.queuedActivate = null;
    if (id && activate && !activate()) id = null; // not enough SP / on cooldown by now: a basic swing
    const attack = PLAYER_ATTACKS[id ?? 'basic'];
    this.lastCombatAt = this.elapsed;
    // the clip follows the weapon slot right now; its own timing places the hit frame
    const clip = attackClipFor(equippedWeaponType(this.character.inventory));
    // ASPD: a swing longer than the attack interval plays faster, its hit frame (and so the damage) with it
    const speed = swingTimeScale(playerSwingMs(this.spriteId, attack, clip), stats.attackIntervalMs);
    const facing = this.player.actionFacingTowards(target.position);
    this.player.actions.play('attack', facing, speed, clip);
    const impactMs = playerImpactDelayMs(this.spriteId, attack, clip) / speed;
    this.pendingHits.push({ target, attack, at: this.elapsed + impactMs });
    // the attack skill's own effect on the player (basic attacks have none): its peak on the hit frame
    const art = skillVfxOf(attack.id);
    if (art) this.pendingVfx.push({ at: this.elapsed + skillVfxDelayMs(art, impactMs, speed), request: { art, facing, gender: this.character.appearance.gender, speed } });
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
    // an attack skill's damage with the Power Strike passive (basic attacks as rolled)
    const damage = attackDamage(h.attack, result.damage, passiveSkillModifiers(this.character.passives));
    if (!target.takeDamage(damage)) return; // already dying: no duplicate damage
    this.vfx?.spawn({ texture: PLAYER_IMPACT_VFX.key, anim: PLAYER_IMPACT_VFX.animKey, target: { hitAnchor: () => spriteHitAnchor(target.sprite) }, scale: h.attack.vfxScale });
    this.numbers.show(w.x, top, String(damage), result.crit ? 'crit' : 'damage');
    if (!target.isAlive()) this.onKill(target);
  }

  /**
   * A monster this player defeated: EXP and Gold from the reward tables, paid once for this death (the same kill
   * credit); quests count it once too.
   */
  private onKill(monster: MonsterEntity): void {
    this.clearTarget();
    if (monster.isAlive() || !this.killRewards.claim(monster.id, monster.life)) return;
    const exp = monsterExpReward(monster.definition.id);
    const levels = CharacterStatusService.gainExp(this.character, exp);
    const gold = GoldService.add(this.character, monsterGoldReward(monster.definition.id));
    QuestService.recordKill(this.character, monster.definition.id);
    this.showExpGain(exp, levels);
    this.showGoldGain(gold);
  }

  /** Gold the player just gained (kills, quest rewards): "+N Gold" over the head, under "+EXP" (and "LEVEL n!"). */
  showGoldGain(gold: number): void {
    if (gold <= 0) return;
    const w = this.player.getWorldPosition();
    this.numbers.show(w.x, w.y - 52, `+${formatGold(gold)} Gold`, 'info');
  }

  /** EXP the player just gained (kills, quest rewards): +EXP over the head; a level-up shows LEVEL n! and heals fully. */
  showExpGain(exp: number, levels: number): void {
    const w = this.player.getWorldPosition();
    this.numbers.show(w.x, w.y - 64, `+${exp} EXP`, 'exp');
    if (levels > 0) {
      this.playerHp = this.playerStats().maxHp; // level up: full heal (HP and SP)
      this.playerSp = this.getPlayerMaxSp();
      this.numbers.show(w.x, w.y - 80, `LEVEL ${this.character.status.level}!`, 'crit');
    }
  }

  /**
   * A monster's swing reached its hit frame (frame 4, once per swing): the existing rules decide; a hit
   * shows that monster's own attack VFX on the player's body, then the hit reaction plays.
   */
  private resolveMonsterHit(monster: MonsterEntity): void {
    if (this.isDefeated() || this.suspended || !monster.isAlive()) return;
    const me = this.player.getTilePosition();
    const reach = monster.definition.combat.attackRange + CONTACT_SLACK;
    if (Math.hypot(monster.position.x - me.x, monster.position.y - me.y) > reach) return; // stepped out of reach
    this.onPlayerAttacked?.(monster);
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
    this.pendingVfx = [];
    this.skillVfx?.clear();
    this.actionLocked = false; // death overrides a cast lock
    this.queuedSkill = null;
    this.player.actions.reset?.();
    this.player.halt();
    this.attackCooldownMs = 0;
    this.player.view.sprite.clearTint();
    for (const m of this.monsters.getMonsters()) m.disengage();
    this.onPlayerDefeated?.();
  }

  /**
   * Respawn (called by the death flow at the spawn point). Existing rule: full HP. Every temporary combat
   * state is cleared (target, cooldowns, regeneration timers, red flash).
   */
  respawnAt(point: Point): void {
    this.clearTarget();
    this.actionLocked = false;
    this.pendingHits = [];
    this.pendingVfx = [];
    this.skillVfx?.clear();
    this.queuedSkill = null;
    this.lastCombatAt = -Infinity;
    this.player.actions.reset?.();
    this.defeated = false;
    this.player.teleport({ x: point.x, y: point.y });
    this.player.view.sprite.clearTint();
    this.playerHp = this.playerStats().maxHp;
    this.playerSp = this.getPlayerMaxSp();
    this.queuedActivate = null;
    this.attackCooldownMs = 0;
    this.repathMs = 0;
    this.pathFails = 0;
    this.regenCarry = 0;
    this.lastHurtAt = -Infinity;
  }
}
