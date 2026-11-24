import type { Point } from '../core/types';
import type { HotbarState } from '../hotbar/Hotbar';
import { SKILL_DEFINITIONS, type SkillId } from '../skills/SkillDefinitions';
import type { AutoPlaySettings } from './AutoPlaySettings';
import { autoSkillList, chooseTarget, healSkillOptions, inHuntingArea, lowHp, resolveHealSkill, type AutoCandidate } from './AutoPlayRules';

/** What Auto Play may read and do in the game - GameScene implements it with its existing commands. */
export interface AutoPlayPort<T> {
  now(): number;
  /** Alive, not in a conversation, the world is loaded. */
  canAct(): boolean;
  me(): Point;
  hp(): number;
  maxHp(): number;
  candidates(): readonly AutoCandidate<T>[];
  currentTarget(): T | null;
  /** The normal target command (approach + attack loop). */
  attack(target: T): void;
  /** A skill already waits for the next swing. */
  hasQueuedSkill(): boolean;
  /** Close enough for a melee skill swing soon. */
  inReach(target: T): boolean;
  hotbar(): HotbarState;
  learned(id: SkillId): boolean;
  /** Learned and its cooldown is over. */
  skillReady(id: SkillId): boolean;
  /** Target skill on that monster (same rules as the manual click). */
  castAttackSkill(id: SkillId, target: T): boolean;
  /** Self skill (Heal), same rules as its hotkey. */
  castSelfSkill(id: SkillId): boolean;
  /** One healing potion from the bag (the normal USE). */
  drinkPotion(): boolean;
  /** Current / max SP, or null while the game has no SP system (SP Recovery then never acts). */
  sp(): { sp: number; max: number } | null;
  /** One SP consumable from the bag; false when there is none (no SP item exists yet). */
  recoverSp(): boolean;
  moveTo(p: Point): boolean;
  isMoving(): boolean;
}

/** Decisions are made this often (not every frame). */
export const AUTO_TICK_MS = 150;
/** A manual command (a click) pauses Auto Play this long, so the player's own command is not overridden. */
export const AUTO_MANUAL_PAUSE_MS = 1500;
/** "Retaliate": the attacker stays the one to answer this long after its swing. */
export const AUTO_ATTACKER_MS = 4000;
/** At least this long between two potions (the potion itself has no cooldown). */
export const AUTO_POTION_GAP_MS = 1000;
/** The same pause for SP consumables. */
export const AUTO_SP_GAP_MS = 1000;

/**
 * Auto Play (attack only): every tick it first recovers (Heal skill, HP potion, SP item - each at its own threshold;
 * a tick that recovered queues no attack skill), then picks the target
 * by the rules (AutoPlayRules.chooseTarget), hands it to the normal combat loop (approach, basic attacks, range
 * checks), queues the first ready attack skill of the priority list on it, and walks back into the hunting circle
 * when there is nothing to fight. Pure - no Phaser - so it is unit-tested with a fake port.
 */
export class AutoPlayController<T> {
  private wasOn = false;
  private anchorPoint: Point = { x: 0, y: 0 };
  private lastMode: AutoPlaySettings['range']['mode'] | null = null;
  private nextTickAt = 0;
  private lastManualAt = -Infinity;
  private potionReadyAt = 0;
  private spReadyAt = 0;
  private attacker: { ref: T; at: number } | null = null;

  constructor(private readonly port: AutoPlayPort<T>) {}

  /** Centre of the hunting circle (where Auto Play was switched on, or radius mode was chosen). */
  get anchor(): Point {
    return this.anchorPoint;
  }

  /** A monster swung at the player. */
  notifyAttacked(monster: T): void {
    this.attacker = { ref: monster, at: this.port.now() };
  }

  /** The player gave a command by hand. */
  notifyManual(): void {
    this.lastManualAt = this.port.now();
  }

  /**
   * Auto Play was switched off: nothing it remembered carries over (the attacker to retaliate against, the tick),
   * so it cannot retarget by itself; the next start begins fresh (new anchor).
   */
  stop(): void {
    this.wasOn = false;
    this.attacker = null;
    this.nextTickAt = 0;
  }

  update(on: boolean, settings: AutoPlaySettings): void {
    if (!on) {
      this.wasOn = false;
      return;
    }
    const now = this.port.now();
    if (!this.wasOn || settings.range.mode !== this.lastMode) {
      this.wasOn = true;
      this.lastMode = settings.range.mode;
      this.anchorPoint = { ...this.port.me() };
      this.nextTickAt = 0;
    }
    if (now < this.nextTickAt) return;
    this.nextTickAt = now + AUTO_TICK_MS;
    if (!this.port.canAct() || now - this.lastManualAt < AUTO_MANUAL_PAUSE_MS) return;

    const recovered = this.recover(settings, now);
    const skills = autoSkillList(this.port.hotbar(), (id) => this.port.learned(id), settings).filter((id) => !settings.skillsOff.includes(id));

    const attacker = this.attacker && now - this.attacker.at < AUTO_ATTACKER_MS ? this.attacker.ref : null;
    const me = this.port.me();
    const target = chooseTarget({ me, anchor: this.anchorPoint, settings, candidates: this.port.candidates(), current: this.port.currentTarget(), attacker });
    if (!target) {
      // nothing to fight: stand still (safer than roaming) - only walk back when outside the hunting circle
      if (!inHuntingArea(me, this.anchorPoint, settings) && !this.port.isMoving()) this.port.moveTo(this.anchorPoint);
      return;
    }
    if (target.ref !== this.port.currentTarget()) this.port.attack(target.ref);
    // recovery comes first: a tick that healed queues no attack skill (the swing in progress goes on)
    if (recovered || this.port.hasQueuedSkill() || !this.port.inReach(target.ref)) return;
    for (const id of skills) {
      if (SKILL_DEFINITIONS[id].kind !== 'attack' || !this.port.skillReady(id)) continue;
      if (this.port.castAttackSkill(id, target.ref)) return;
    }
    // no skill could be used: the combat loop's basic attack goes on
  }

  /**
   * One recovery action at most per tick, each option at its own threshold: the Heal skill (when learned, ready and
   * not refused), else an HP potion, else an SP item. Anything unavailable is skipped, never blocking the others.
   */
  private recover(settings: AutoPlaySettings, now: number): boolean {
    const { healSkill, hpPotion, spRecovery } = settings.recovery;
    const hp = this.port.hp();
    const maxHp = this.port.maxHp();
    if (healSkill.enabled && lowHp(hp, maxHp, healSkill.percent)) {
      const id = resolveHealSkill(healSkill.skillId, healSkillOptions((s) => this.port.learned(s)));
      if (id && this.port.skillReady(id) && this.port.castSelfSkill(id)) return true;
    }
    if (hpPotion.enabled && lowHp(hp, maxHp, hpPotion.percent) && now >= this.potionReadyAt && this.port.drinkPotion()) {
      this.potionReadyAt = now + AUTO_POTION_GAP_MS;
      return true;
    }
    const sp = this.port.sp();
    if (spRecovery.enabled && sp && lowHp(sp.sp, sp.max, spRecovery.percent) && now >= this.spReadyAt && this.port.recoverSp()) {
      this.spReadyAt = now + AUTO_SP_GAP_MS;
      return true;
    }
    return false;
  }
}
