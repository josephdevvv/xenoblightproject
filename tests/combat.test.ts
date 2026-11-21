import assert from 'node:assert/strict';
import { test } from 'node:test';
import { actionDirectionFromGroundVector, directionFromGroundVector } from '../src/core/Direction';
import {
  COMBAT_RULES,
  hitChance,
  hitsToKill,
  normalDamage,
  playerCombatStats,
  rollAttack,
  type CombatStats,
} from '../src/combat/CombatRules';
import { MONSTER_DEFINITIONS, monsterCombatStats } from '../src/monsters/MonsterDefinition';
import { computeDerivedStats } from '../src/status/DerivedStats';
import { monsterExpReward } from '../src/progression/MonsterExpRewards';
import { createInitialStatus, totalStats } from '../src/status/StatTypes';
import { MapLayout } from '../src/world/MapLayout';
import { ASHEN_CROSSROADS } from '../src/world/maps/AshenCrossroads';
import { Pathfinder } from '../src/world/navigation/Pathfinder';

/** A brand-new level-1 Drifter: every stat 1, no equipment - straight from the real formulas. */
function level1Player(): CombatStats {
  const s = createInitialStatus();
  return playerCombatStats(computeDerivedStats(s.level, totalStats(s)));
}

const mite = monsterCombatStats(MONSTER_DEFINITIONS.voidmite);
const wolf = monsterCombatStats(MONSTER_DEFINITIONS.mutant_wolf);

test('level-1 Drifter combat stats come from the existing derived stats', () => {
  const p = level1Player();
  assert.equal(p.atk, 7); // meleeAtk 5 + STR 1 x 2
  assert.equal(p.def, 1);
  assert.equal(p.maxHp, 120);
  assert.equal(p.hit, 104);
  assert.equal(p.flee, 103);
  assert.ok(Math.abs(p.critRate - 5.1) < 1e-9);
  assert.equal(p.attackIntervalMs, Math.round(COMBAT_RULES.playerBaseAttackIntervalMs / 1.002));
});

/** Final configured balance (2026-11-21): exact ATK / HIT / HP; everything else as before. */
const EXPECTED = {
  voidmite: { atk: 15, hit: 120, maxHp: 24, def: 1, attackIntervalMs: 2600, chaseSpeed: 1.2 },
  mutant_wolf: { atk: 23, hit: 200, maxHp: 45, def: 2, attackIntervalMs: 1900, chaseSpeed: 2.4 },
} as const;

test('balance: exact configured ATK, HIT and HP; the other stats unchanged', () => {
  for (const id of ['voidmite', 'mutant_wolf'] as const) {
    const c = MONSTER_DEFINITIONS[id].combat;
    const e = EXPECTED[id];
    assert.equal(c.atk, e.atk, `${id} ATK`);
    assert.equal(c.hit, e.hit, `${id} HIT`);
    assert.equal(c.maxHp, e.maxHp, `${id} HP`);
    assert.equal(c.def, e.def);
    assert.equal(c.attackIntervalMs, e.attackIntervalMs);
    assert.equal(c.chaseSpeed, e.chaseSpeed);
  }
});

test('no double multiplication: combat uses the configured ATK / HIT as they are', () => {
  const p = level1Player();
  for (const id of ['voidmite', 'mutant_wolf'] as const) {
    const def = MONSTER_DEFINITIONS[id];
    const s = monsterCombatStats(def);
    assert.equal(s.atk, def.combat.atk);
    assert.equal(s.hit, def.combat.hit);
    assert.equal(s.maxHp, def.combat.maxHp);
    // a landed monster hit on a level-1 player: exactly ATK - DEF (no crit for monsters)
    const r = rollAttack(s, p, (() => { const v = [0.99, 0.0]; return () => v.shift() ?? 0; })());
    assert.deepEqual(r, { hit: true, crit: false, damage: def.combat.atk - p.def });
  }
  assert.equal(normalDamage(mite, level1Player()), 14);
  assert.equal(normalDamage(wolf, level1Player()), 22);
});

test('Void Mite: exactly 4 normal hits from a level-1 Drifter', () => {
  const p = level1Player();
  const dmg = normalDamage(p, mite);
  assert.equal(hitsToKill(p, mite), 4);
  assert.ok(dmg * 3 < mite.maxHp && dmg * 4 >= mite.maxHp, `${dmg} per hit vs ${mite.maxHp} HP`);
  assert.equal(hitChance(mite, p), 92, 'HIT 120 vs FLEE 103: 75 + 120 - 103');
  assert.ok(mite.attackIntervalMs > p.attackIntervalMs * 2, 'mite still attacks much slower than the player');
  assert.ok(hitChance(p, mite) >= 90, 'the player rarely misses a mite');
});

test('Mutant Wolf: tougher than the mite (more hits, harder bites, more EXP)', () => {
  const p = level1Player();
  assert.ok(hitsToKill(p, wolf) > hitsToKill(p, mite));
  assert.equal(hitsToKill(p, wolf), 9);
  assert.ok(wolf.maxHp > mite.maxHp && wolf.atk > mite.atk);
  assert.equal(hitChance(wolf, p), COMBAT_RULES.hitChanceMax);
  assert.ok(MONSTER_DEFINITIONS.mutant_wolf.combat.chaseSpeed > MONSTER_DEFINITIONS.voidmite.combat.chaseSpeed);
  assert.ok(monsterExpReward('mutant_wolf') > monsterExpReward('voidmite'));
});

test('attack rolls: misses, crits that cannot miss, normal damage otherwise', () => {
  const p = level1Player();
  const seq = (...v: number[]) => () => v.shift() ?? 0;
  // crit roll below 5.1 % -> crit for 150 %
  assert.deepEqual(rollAttack(p, mite, seq(0.01)), { hit: true, crit: true, damage: 9 });
  // no crit, hit roll above the hit chance -> miss
  assert.deepEqual(rollAttack(p, mite, seq(0.5, 0.999)), { hit: false, crit: false, damage: 0 });
  // no crit, hit
  assert.deepEqual(rollAttack(p, mite, seq(0.5, 0.1)), { hit: true, crit: false, damage: 6 });
  // never below the minimum damage
  assert.equal(normalDamage({ atk: 1 }, { def: 50 }), COMBAT_RULES.minDamage);
  assert.equal(hitChance({ hit: 0 }, { flee: 999 }), COMBAT_RULES.hitChanceMin);
  assert.equal(hitChance({ hit: 999 }, { flee: 0 }), COMBAT_RULES.hitChanceMax);
});

test('facing helpers: 8-way walk facing and 4-way action facing from ground vectors', () => {
  assert.equal(directionFromGroundVector(1, 0), 'SE'); // +x = screen down-right
  assert.equal(directionFromGroundVector(0, 1), 'SW');
  assert.equal(directionFromGroundVector(-1, -1), 'N');
  assert.equal(directionFromGroundVector(1, 1), 'S');
  assert.equal(directionFromGroundVector(1, -1), 'E');
  assert.equal(directionFromGroundVector(0, 0), null);
  assert.equal(actionDirectionFromGroundVector(1, 0), 'SE');
  assert.equal(actionDirectionFromGroundVector(0, 1), 'SW');
  assert.equal(actionDirectionFromGroundVector(-1, 0), 'NW');
  assert.equal(actionDirectionFromGroundVector(0, -1), 'NE');
  assert.equal(actionDirectionFromGroundVector(-1, -1, 'NW'), 'NW'); // straight up keeps the side
});

// ------------------------------------------------------------------------------------------------
// Pathfinding on the real map
// ------------------------------------------------------------------------------------------------

const map = new MapLayout(ASHEN_CROSSROADS);
const finder = new Pathfinder(map, { radius: 0.22 });
const R = 0.22;
const free = (x: number, y: number) => map.isAreaFree({ minX: x - R, minY: y - R, maxX: x + R, maxY: y + R });

function walkable(path: { x: number; y: number }[], start: { x: number; y: number }): boolean {
  let a = start;
  for (const b of path) {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.05));
    for (let i = 0; i <= steps; i++) if (!free(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps)) return false;
    a = b;
  }
  return true;
}

test('pathfinder: spawn to every zone (and into a building) along collision-free straight segments', () => {
  const spawn = { x: 14.5, y: 118.5 };
  for (const z of ASHEN_CROSSROADS.zones ?? []) {
    const goal = { x: z.probe.col + 0.5, y: z.probe.row + 0.5 };
    const path = finder.findPath(spawn, goal);
    assert.ok(path && path.length > 0, `no path to ${z.name}`);
    assert.ok(walkable(path, spawn), `path to ${z.name} touches something`);
    const end = path[path.length - 1];
    assert.ok(Math.hypot(end.x - goal.x, end.y - goal.y) < 0.01, `${z.name}: ends at the goal`);
    assert.ok(path.length < 40, `${z.name}: smoothed (${path.length} waypoints)`);
  }
  // through a doorway into the stone house of the broken street
  const inside = finder.findPath({ x: 14.5, y: 77.5 }, { x: 10.5, y: 77.5 });
  assert.ok(inside && walkable(inside, { x: 14.5, y: 77.5 }));
});

test('pathfinder: a blocked goal ends at the nearest reachable tile; unreachable goals give null', () => {
  // the monument (blocked) in the plaza
  const path = finder.findPath({ x: 14.5, y: 56.5 }, { x: 14.5, y: 51.5 });
  assert.ok(path && path.length > 0);
  const end = path![path!.length - 1];
  assert.ok(free(end.x, end.y), 'ends on a standable spot');
  assert.ok(Math.hypot(end.x - 14.5, end.y - 51.5) <= 2.6, 'next to the monument');
  // inside a sealed (collapsed) building: no way in
  assert.equal(finder.findPath({ x: 14.5, y: 84.5 }, { x: 10.5, y: 84.5 }) === null || !finder.standable(10, 84), true);
  // the city wall at the far edge
  const wall = finder.findPath({ x: 15.5, y: 6.5 }, { x: 15.5, y: 0.5 });
  if (wall) assert.ok(wall[wall.length - 1].y >= 3, 'stops in front of the wall');
});
