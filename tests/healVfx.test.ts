import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import type Phaser from 'phaser';
import { characterFeetOffset, HEAL_GREEN, HEAL_GREEN_DURATION_MS, HEAL_VFX_LAYERS, healVfxDelayMs } from '../src/combat/vfx/HealVfxArt';
import { HealVfxLayer, type HealVfxTarget } from '../src/combat/vfx/HealVfxLayer';
import { PLAYER_COMBAT_SETS } from '../src/characters/combat/PlayerCombatArt';
import { readPng } from './helpers/png';

const read = (f: string): string => fs.readFileSync(path.join(process.cwd(), f), 'utf8').replace(/\r\n/g, '\n');

// ------------------------------------------------------------------------------------------ stand-ins

/** A sprite as the handler uses it (chainable setters, play / stop, the animation-complete event). */
class FakeSprite {
  x = 0;
  y = 0;
  depth = 0;
  scaleX = 1;
  scaleY = 1;
  originX = 0;
  originY = 0;
  visible = false;
  active = true;
  texture = '';
  playing: string | null = null;
  private done: (() => void) | null = null;
  setTexture(key: string): this { this.texture = key; return this; }
  setOrigin(x: number, y: number): this { this.originX = x; this.originY = y; return this; }
  setScale(x: number, y = x): this { this.scaleX = x; this.scaleY = y; return this; }
  setAlpha(): this { return this; }
  setVisible(v: boolean): this { this.visible = v; return this; }
  setActive(v: boolean): this { this.active = v; return this; }
  setPosition(x: number, y: number): this { this.x = x; this.y = y; return this; }
  setDepth(d: number): this { this.depth = d; return this; }
  play(key: string): this { this.playing = key; return this; }
  stop(): this { this.playing = null; return this; }
  on(_event: string, fn: () => void): this { this.done = fn; return this; }
  /** The animation ran to its end. */
  complete(): void { this.done?.(); }
}

function world(loaded = true) {
  const made: FakeSprite[] = [];
  const scene = {
    add: { sprite: () => { const s = new FakeSprite(); made.push(s); return s; } },
    textures: { exists: () => loaded },
    anims: { exists: () => loaded },
  } as unknown as Phaser.Scene;
  return { layer: new HealVfxLayer(scene), made };
}

/** A character on the map: its sprite on the ground root, depth-sorted by its y. */
function character(x: number, y: number, scale = 1) {
  const body = new FakeSprite().setPosition(x, y).setDepth(y).setScale(scale).setVisible(true);
  const state = { alive: true, gone: false };
  const target: HealVfxTarget = { sprite: () => (state.gone ? null : (body as unknown as Phaser.GameObjects.Sprite)), alive: () => state.alive };
  return { body, state, target };
}

// ------------------------------------------------------------------------------------------ the approved art

test('heal_green: the approved Sprite Forge sheets, unchanged - two layers of 8 x 64 x 80, feet anchor (32, 72), 800 ms', () => {
  const v = HEAL_GREEN;
  assert.deepEqual(HEAL_VFX_LAYERS, ['behind', 'front']);
  for (const id of HEAL_VFX_LAYERS) {
    const file = path.join(process.cwd(), 'public', v.layers[id].url);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), v.layers[id].sha256, `${id}: byte-identical to the approved sheet`);
    const png = readPng(file);
    assert.deepEqual([png.width, png.height], [v.frameWidth * v.frames, v.frameHeight], `${id}: one row of frames`);
    for (let i = 3; i < png.data.length; i += 4) assert.ok(png.data[i] === 0 || png.data[i] === 255, `${id}: binary alpha`);
  }
  assert.deepEqual([v.frames, v.frameWidth, v.frameHeight], [8, 64, 80]);
  assert.deepEqual(v.anchor, { x: 32, y: 72 });
  assert.deepEqual(v.origin, { x: 0.5, y: 0.9 });
  assert.deepEqual(v.frameDurationsMs, [100, 100, 100, 100, 100, 100, 100, 100]);
  assert.equal(HEAL_GREEN_DURATION_MS, 800);
  assert.equal(v.loop, false);
  const meta = JSON.parse(read('public/assets/vfx/shared/heal_green/heal_green_metadata.json'));
  assert.equal(meta.status, 'approved');
  assert.equal(meta.direction, 'none (one set for every direction)');
  assert.notEqual(v.layers.behind.key, v.layers.front.key);
});

test('heal_green timing: its peak (F4) on the cast frame of the caster\'s cast clip; at the heal event without one', () => {
  assert.equal(HEAL_GREEN.peakFrame, 4);
  assert.equal(healVfxDelayMs({ castFrame: 5, frameMs: 100 }), 100, 'Self-Heal: one clip frame in - F4 lands on cast frame 5');
  assert.equal(healVfxDelayMs(null), 0, 'no cast clip: at the heal event');
  assert.equal(healVfxDelayMs({ castFrame: 2, frameMs: 100 }), 0, 'never before the heal');
  // every exported cast clip records the cast frame the rule reads (all hairstyles, colours, both genders)
  for (const set of Object.values(PLAYER_COMBAT_SETS)) {
    const clip = set.actions.self_heal_cast;
    assert.equal(typeof clip.events.castFrame, 'number', set.spriteId);
    const start = healVfxDelayMs({ castFrame: clip.events.castFrame as number, frameMs: clip.frameMs });
    assert.equal(start + (HEAL_GREEN.peakFrame - 1) * 100, ((clip.events.castFrame as number) - 1) * clip.frameMs, `${set.spriteId}: the peak starts with the cast frame`);
  }
});

test('heal_green anchor: on the feet of the shared 64 x 64 character canvas, whatever the character\'s scale', () => {
  assert.deepEqual(HEAL_GREEN.characterFeet, { x: 31, y: 57 });
  assert.deepEqual(characterFeetOffset(1, 1), { x: -1, y: 0 }, 'one pixel left of the canvas root (32, 57)');
  assert.deepEqual(characterFeetOffset(2, 2), { x: -2, y: 0 });
});

// ------------------------------------------------------------------------------------------ the handler

test('handler: around the healed character - one layer under it, one over it, on its feet; follows it; plays once, then pooled', () => {
  const { layer, made } = world();
  const c = character(200.4, 300.6);
  layer.play(c.target);
  assert.equal(layer.activeCount, 1);
  const [behind, front] = made;
  assert.deepEqual([behind.texture, front.texture], [HEAL_GREEN.layers.behind.key, HEAL_GREEN.layers.front.key]);
  assert.deepEqual([behind.playing, front.playing], [HEAL_GREEN.layers.behind.animKey, HEAL_GREEN.layers.front.animKey]);
  assert.ok(behind.depth < c.body.depth && front.depth > c.body.depth, 'the character is between the two layers');
  assert.ok(c.body.depth - behind.depth <= 0.5 && front.depth - c.body.depth <= 0.5, 'depth-sorted with it: objects in front still cover the aura');
  assert.deepEqual([behind.x, behind.y, front.x, front.y], [199, 301, 199, 301], 'feet, whole pixels');
  assert.deepEqual([behind.originX, behind.originY, behind.scaleX], [0.5, 0.9, 1], 'the approved anchor, scale 1');
  assert.ok(behind.visible && front.visible);
  // the character walks: the effect goes with it (position and depth)
  c.body.setPosition(260, 340).setDepth(340);
  layer.update(16);
  assert.deepEqual([front.x, front.y, behind.depth, front.depth], [259, 340, 339.5, 340.5]);
  // the animation ends: cleaned up by itself
  front.complete();
  assert.equal(layer.activeCount, 0);
  assert.ok(!behind.visible && !front.visible && behind.playing === null);
  assert.deepEqual(layer.stats, { created: 1, spawned: 1, pooled: 1 });
  // the next heal reuses the pair: nothing accumulates
  for (let i = 0; i < 20; i++) {
    layer.play(c.target);
    front.complete();
  }
  assert.equal(made.length, 2, 'still the same two sprites');
  assert.deepEqual(layer.stats, { created: 1, spawned: 21, pooled: 1 });
});

test('handler: starts after its delay; a target that dies or disappears first never gets it', () => {
  const { layer, made } = world();
  const c = character(10, 20);
  layer.play(c.target, 100);
  assert.deepEqual([layer.activeCount, layer.waitingCount], [0, 1]);
  layer.update(60);
  assert.equal(layer.activeCount, 0, 'not yet');
  layer.update(60);
  assert.deepEqual([layer.activeCount, layer.waitingCount], [1, 0]);
  made[1].complete();
  // died while waiting
  layer.play(c.target, 100);
  c.state.alive = false;
  layer.update(200);
  assert.deepEqual([layer.activeCount, layer.waitingCount], [0, 0]);
  // gone while waiting (despawned)
  c.state.alive = true;
  layer.play(c.target, 100);
  c.state.gone = true;
  layer.update(200);
  assert.deepEqual([layer.activeCount, layer.waitingCount], [0, 0]);
});

test('handler: a healed character that dies or leaves ends its effect at once; clear() and dispose() leave nothing', () => {
  const { layer, made } = world();
  const a = character(0, 0);
  layer.play(a.target);
  a.state.alive = false;
  layer.update(16);
  assert.equal(layer.activeCount, 0);
  assert.ok(!made[0].visible && !made[1].visible);
  const b = character(5, 5);
  layer.play(b.target);
  b.state.gone = true;
  layer.update(16);
  assert.equal(layer.activeCount, 0);
  const c = character(9, 9);
  layer.play(c.target);
  layer.play(character(1, 1).target, 500);
  layer.clear();
  assert.deepEqual([layer.activeCount, layer.waitingCount], [0, 0]);
  layer.play(c.target);
  layer.dispose();
  assert.deepEqual([layer.activeCount, layer.waitingCount, layer.stats.pooled], [0, 0, 0]);
});

test('handler: single-target and multi-target heals - one effect on each healed character, not on the caster', () => {
  const { layer, made } = world();
  const caster = character(0, 0);
  const ally = character(100, 50);
  // single target: the healed one gets it, the caster does not
  layer.play(ally.target);
  assert.equal(layer.activeCount, 1);
  assert.deepEqual([made[1].x, made[1].y], [99, 50]);
  assert.ok(made.every((s) => s.x !== caster.body.x - 1 || s.y !== caster.body.y));
  layer.clear();
  // multi target: everyone healed
  const party = [character(10, 10), character(20, 60), character(30, 110)];
  layer.playAll(party.map((p) => p.target));
  assert.equal(layer.activeCount, 3);
  layer.update(16);
  const fronts = made.filter((s) => s.visible && s.texture === HEAL_GREEN.layers.front.key).map((s) => [s.x, s.y]);
  assert.deepEqual(fronts.sort((p, q) => p[0] - q[0]), [[9, 10], [19, 60], [29, 110]]);
  // one of them ends (died): the others go on
  party[1].state.alive = false;
  layer.update(16);
  assert.equal(layer.activeCount, 2);
  layer.clear(party[0].target);
  assert.equal(layer.activeCount, 1, 'only that character\'s effect');
  // a second heal on the same character starts afresh - never two auras on one character
  layer.play(party[2].target);
  layer.play(party[2].target);
  assert.equal(layer.activeCount, 1);
});

test('handler: art not loaded -> nothing happens (the heal itself is never blocked by it)', () => {
  const { layer, made } = world(false);
  layer.play(character(0, 0).target);
  assert.deepEqual([layer.activeCount, made.length], [0, 0]);
});

// ------------------------------------------------------------------------------------------ wiring

test('wiring: only a healing SKILL that really restored HP shows it - manual and Auto Combat; never potions, regeneration or the respawn', () => {
  const scene = read('src/scenes/GameScene.ts');
  const cast = scene.slice(scene.indexOf('private castSelfSkill('), scene.indexOf('private castFrameTiming('));
  assert.match(cast, /const casting = this\.player\.actions\.play\('cast', CAST_FACING\[this\.player\.getFacing\(\)\]\);\s*const healed = this\.combat\.healPlayer\(skillHealAmount\(def, maxHp, passiveSkillModifiers\(this\.character\.passives\)\)\);/, 'the heal itself (with the Recovery passive)');
  assert.match(cast, /if \(healed > 0\) this\.healVfx\.play\(this\.playerHealTarget, healVfxDelayMs\(casting \? this\.castFrameTiming\(\) : null\)\);/);
  assert.ok(cast.indexOf('if (!this.activateSkill(id)) return') < cast.indexOf('this.healVfx.play('), 'after SP and cooldown: a refused cast shows nothing');
  assert.equal((scene.match(/this\.healVfx\.play(All)?\(/g) ?? []).length, 1, 'the one trigger: the skill heal');
  // Auto Combat casts through the same function
  assert.match(scene, /castSelfSkill: \(id\) => this\.castSelfSkill\(id\) === null,/);
  // potions / consumables go through useItem -> healPlayer; regeneration, level-up and respawn stay in CombatSystem
  const useItem = scene.slice(scene.indexOf('const restore = hpRestored('), scene.indexOf('private activateSkill('));
  assert.doesNotMatch(useItem, /healVfx/);
  assert.doesNotMatch(read('src/combat/CombatSystem.ts'), /healVfx|HealVfx/, 'healPlayer, regeneration, level-up and respawn know nothing of it');
  assert.doesNotMatch(read('src/player/death/PlayerDeathController.ts'), /healVfx|HealVfx/);
  // lifetime: follows every frame, dropped with the scene; the player's own target ends it on death
  assert.match(scene, /this\.healVfx\.update\(delta\);/);
  assert.match(scene, /this\.healVfx\?\.dispose\(\);/);
  assert.match(scene, /playerHealTarget: HealVfxTarget = \{ sprite: \(\) => this\.player\?\.view\.sprite \?\? null, alive: \(\) => this\.death\?\.life\.isAlive\(\) \?\? false \};/);
  // separate sprites, no input, no body, never a character sheet
  const layer = read('src/combat/vfx/HealVfxLayer.ts');
  assert.doesNotMatch(layer, /setInteractive|physics|setTint/);
  assert.match(layer, /entry\.pair\.behind\.setPosition\(x, y\)\.setDepth\(body\.depth - 0\.5\);\s*entry\.pair\.front\.setPosition\(x, y\)\.setDepth\(body\.depth \+ 0\.5\);/);
  // loaded and held with the shared player VFX (rebuilt if evicted)
  assert.match(read('src/characters/combat/PlayerCombatAssets.ts'), /const sheets = \[impactSheet\(\), redStabSheet\(\), \.\.\.healSheets\(\), \.\.\.\(set \? combatSheets\(set\) : \[\]\)\];/);
});
