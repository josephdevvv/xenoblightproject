import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Point } from '../src/core/types';
import { DEPTH } from '../src/config/constants';
import { NPC_DEFINITIONS } from '../src/npcs/NpcDefinition';
import { NPC_INTERACT_RANGE } from '../src/npcs/NpcInteraction';
import { PlayerMovement } from '../src/player/PlayerMovement';
import { TUTORIAL_QUEST_01 } from '../src/quests/TutorialQuest01';
import { MapLayout } from '../src/world/MapLayout';
import { ASHEN_CROSSROADS } from '../src/world/maps/AshenCrossroads';
import { Pathfinder } from '../src/world/navigation/Pathfinder';
import { PathTrail, TRAIL } from '../src/world/navigation/PathTrail';

const RADIUS = 0.22;
const SPEED = 3.6;
const DT = 1000 / 60;
const layout = new MapLayout(ASHEN_CROSSROADS);
const nav = new Pathfinder(layout, { radius: RADIUS });
const npc = NPC_DEFINITIONS[TUTORIAL_QUEST_01.npcId].tile;
const MATEUS: Point = { x: npc.col + 0.5, y: npc.row + 0.5 };
const SPAWN: Point = { x: ASHEN_CROSSROADS.spawn.col + 0.5, y: ASHEN_CROSSROADS.spawn.row + 0.5 };
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const free = (p: Point) => layout.isAreaFree({ minX: p.x - RADIUS, minY: p.y - RADIUS, maxX: p.x + RADIUS, maxY: p.y + RADIUS });

/** What must hold on every frame, wherever the player is. `settled` = no plan is being waited for. */
function checkTrail(trail: PathTrail, player: Point, label: string, settled: boolean): void {
  for (const d of trail.dots) assert.ok(free(d), `${label}: dot ${d.x.toFixed(2)},${d.y.toFixed(2)} on walkable ground`);
  const dots = trail.current;
  assert.ok(dots.length >= 1, `${label}: there is a trail`);
  if (trail.showsEnd) assert.ok(dist(dots[0], MATEUS) <= NPC_INTERACT_RANGE, `${label}: ends beside Mateus (${dist(dots[0], MATEUS).toFixed(2)})`);
  else assert.ok(dist(player, MATEUS) > 9, `${label}: the end is drawn when Mateus is near`);
  if (!settled) return;
  const first = dots[dots.length - 1];
  assert.ok(dist(first, player) <= TRAIL.startGap + TRAIL.spacing + 2 * TRAIL.deviation, `${label}: connected to the player (${dist(first, player).toFixed(2)})`);
}

/** Simulates the real movement (collision included); `steer` returns a ground direction or null. */
function walk(trail: PathTrail, start: Point, seconds: number, label: string, steer: (p: Point, t: number) => Point | null, each?: (p: Point) => void): Point {
  const movement = new PlayerMovement(start, layout, { speed: SPEED, radius: RADIUS });
  let sinceMove = 0;
  for (let f = 0; f < seconds * 60; f++) {
    const d = steer(movement.position, f / 60);
    if (d) {
      const l = Math.hypot(d.x, d.y) || 1;
      movement.step({ x: d.x / l, y: d.y / l }, DT / 1000);
      sinceMove = 0;
    } else sinceMove++;
    trail.update(DT, movement.position, MATEUS);
    checkTrail(trail, movement.position, `${label} @${(f / 60).toFixed(2)}s`, f > 30);
    each?.(movement.position);
  }
  return { ...movement.position };
}

function follower(target: Point): (p: Point) => Point | null {
  let path: Point[] | null = null;
  return (p) => {
    path ??= nav.findPath(p, target) ?? [];
    while (path.length && dist(p, path[0]) < 0.08) path.shift();
    return path.length ? { x: path[0].x - p.x, y: path[0].y - p.y } : null;
  };
}

test('direct walk: dots stay where they are on the ground, vanish behind, few plans, ends beside Mateus', () => {
  const trail = new PathTrail(nav);
  trail.update(DT, SPAWN, MATEUS);
  const before = trail.current.length;
  assert.ok(before > 15, `${before} dots at the start`);
  const seen = new Map<string, number>();
  let last: Point[] = trail.current.map((d) => ({ x: d.x, y: d.y }));
  let moved = 0;
  const end = walk(trail, SPAWN, 5, 'direct', follower({ x: MATEUS.x, y: MATEUS.y + 1.2 }), () => {
    trail.current.forEach((d, k) => {
      if (last[k] && dist(last[k], d) > 1e-6) moved = Math.max(moved, dist(last[k], d));
    });
    last = trail.current.map((d) => ({ x: d.x, y: d.y }));
    seen.set(String(trail.current.length), 1);
  });
  assert.ok(dist(end, MATEUS) <= NPC_INTERACT_RANGE, 'arrived');
  assert.ok(moved < 0.2, `no dot jumped (largest step ${moved.toFixed(3)} tiles)`);
  assert.ok(trail.plans <= 6, `${trail.plans} plans in 5 s (300 frames)`);
  assert.ok(trail.current.length >= TRAIL.keepEnd && trail.current.length < before / 3, 'the ones behind are gone, the end stays');
});

test('dots are evenly spaced along the route and only ahead of the player', () => {
  const trail = new PathTrail(nav);
  for (let i = 0; i < 30; i++) trail.update(DT, SPAWN, MATEUS);
  const dots = trail.current;
  for (let i = 1; i < dots.length; i++) assert.ok(Math.abs(dist(dots[i], dots[i - 1]) - TRAIL.spacing) < 0.03, `gap ${i}: ${dist(dots[i], dots[i - 1])}`);
  for (const d of dots) assert.ok(dist(d, SPAWN) >= TRAIL.startGap - 1e-6);
  assert.ok(dots.every((d) => d.alpha === 1), 'faded in');
  assert.ok(Math.abs(dist(dots[0], MATEUS) - TRAIL.endDistance) < 1e-3, 'the end is beside Mateus, not on him');
});

test('turning around, walking away and changing direction again and again keeps a correct trail', () => {
  const trail = new PathTrail(nav);
  let p = walk(trail, SPAWN, 1.5, 'towards', follower(MATEUS));
  p = walk(trail, p, 2, 'turn around', follower(SPAWN));
  p = walk(trail, p, 2, 'away (east)', () => ({ x: 1, y: 0 }));
  p = walk(trail, p, 3, 'away (west)', () => ({ x: -1, y: 0 }));
  const plansBefore = trail.plans;
  // a new direction every quarter second for 10 s (seeded)
  let seed = 7;
  let dir: Point = { x: 1, y: 0 };
  let next = 0;
  walk(trail, p, 10, 'zigzag', (_q, t) => {
    if (t >= next) {
      next = t + 0.25;
      seed = (seed * 16807) % 2147483647;
      const a = (seed / 2147483647) * Math.PI * 2;
      dir = { x: Math.cos(a), y: Math.sin(a) };
    }
    return dir;
  });
  assert.ok(trail.plans - plansBefore <= 10_000 / TRAIL.minReplanMs, 'never plans more than 5 times a second');
});

test('around buildings, walls and obstacles: from inside houses and the far end of the map', () => {
  const starts: [string, Point][] = [
    ['inside the original house', { x: 22.5, y: 97.5 }],
    ['inside a stone house', { x: 9.5, y: 77.5 }],
    ['inside the stone hall', { x: 2.5, y: 36.5 }],
    ['at the city gate', { x: 14.5, y: 4.5 }],
    ['chapel side of zone 5', { x: 8.5, y: 18.5 }],
  ];
  for (const [label, start] of starts) {
    const at = nav.nearestStandable(start, 4)!;
    const p = { x: at.col + 0.5, y: at.row + 0.5 };
    const route = nav.findPath(p, MATEUS);
    assert.ok(route, `${label}: there is a way`);
    const trail = new PathTrail(nav);
    walk(trail, p, 6, label, follower(MATEUS));
    // the trail's dots follow the route the pathfinder walks: every leg between dots is close to a clear line
    const dots = trail.current;
    for (let i = 1; i < dots.length; i++) assert.ok(dist(dots[i], dots[i - 1]) <= TRAIL.spacing + 0.01, `${label}: no gap in the trail`);
  }
});

test('hugging walls and wandering anywhere on the map never shows a dot on blocked ground', () => {
  let seed = 99;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let run = 0; run < 12; run++) {
    const at = nav.nearestStandable({ x: 1 + rnd() * 28, y: 4 + rnd() * 112 }, 6);
    if (!at || !nav.findPath({ x: at.col + 0.5, y: at.row + 0.5 }, MATEUS)) continue;
    const a = rnd() * Math.PI * 2;
    const trail = new PathTrail(nav);
    const movement = new PlayerMovement({ x: at.col + 0.5, y: at.row + 0.5 }, layout, { speed: SPEED, radius: RADIUS });
    for (let f = 0; f < 240; f++) {
      movement.step({ x: Math.cos(a + f / 60), y: Math.sin(a + f / 60) }, DT / 1000);
      trail.update(DT, movement.position, MATEUS);
      for (const d of trail.dots) assert.ok(free(d), `run ${run} frame ${f}: ${d.x.toFixed(2)},${d.y.toFixed(2)}`);
    }
  }
});

test('next to Mateus without talking: the trail stays; also right on top of him and after a reload there', () => {
  for (const [label, p] of [['1.4 away', { x: MATEUS.x, y: MATEUS.y + 1.4 }], ['0.9 away', { x: MATEUS.x - 0.9, y: MATEUS.y }], ['on top', { ...MATEUS }]] as [string, Point][]) {
    const trail = new PathTrail(nav); // a fresh one = the quest was resumed here
    for (let i = 0; i < 600; i++) {
      trail.update(DT, p, MATEUS);
      checkTrail(trail, p, label, false);
    }
    assert.equal(trail.plans, 1, `${label}: standing still plans once`);
    assert.ok(trail.current.every((d) => dist(d, MATEUS) >= TRAIL.endDistance - 0.01 || label === 'on top'), `${label}: not drawn under Mateus`);
  }
  // walking up to him and around him
  const trail = new PathTrail(nav);
  const p = walk(trail, { x: MATEUS.x, y: MATEUS.y + 3 }, 2, 'up to him', follower(MATEUS));
  walk(trail, p, 3, 'around him', (q, t) => (dist(q, MATEUS) > 1.4 ? { x: MATEUS.x - q.x, y: MATEUS.y - q.y } : { x: Math.cos(t * 3), y: Math.sin(t * 3) }));
});

test('quest over (or dead): every dot fades out; a new target later starts a fresh trail', () => {
  const trail = new PathTrail(nav);
  for (let i = 0; i < 20; i++) trail.update(DT, SPAWN, MATEUS);
  assert.ok(trail.dots.length > 0);
  trail.update(DT, SPAWN, null);
  assert.equal(trail.current.length, 0, 'removed at once');
  for (let i = 0; i < 20; i++) trail.update(DT, SPAWN, null);
  assert.equal(trail.dots.length, 0, 'and faded out');
  trail.update(DT, { x: 16.5, y: 112.5 }, MATEUS);
  assert.ok(trail.current.length > 5, 'back after a respawn');
});

test('no way there: nothing is drawn, and it is retried only once a second', () => {
  let calls = 0;
  const trail = new PathTrail({ findPath: () => (calls++, null), clearLine: () => true });
  for (let i = 0; i < 180; i++) trail.update(DT, SPAWN, MATEUS);
  assert.equal(trail.dots.length, 0);
  assert.ok(calls <= 4, `${calls} tries in 3 s`);
});

test('layer: above the ground, below characters, props and the click ripple', () => {
  const depth = DEPTH.GroundFx - 2;
  assert.ok(depth > DEPTH.Ground && depth > DEPTH.CloudShadow && depth < DEPTH.GroundFx - 1 && depth < 0);
});
