import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { PLAYER_COMBAT_SETS } from '../src/characters/combat/PlayerCombatArt';
import { CAST_LOCKED_ACTIONS, CastLock, castLockMs } from '../src/combat/CastLock';
import type { PlayerAction } from '../src/player/death/PlayerLifeState';

const read = (f: string): string => fs.readFileSync(path.join(process.cwd(), f), 'utf8').replace(/\r\n/g, '\n');
const ALL: PlayerAction[] = ['move', 'attack', 'cast', 'interact', 'loot', 'useItem', 'openWindow', 'chat'];

test('cast lock: as long as the Self-Heal clip (8 x 100 ms) for every appearance - also one without combat art', () => {
  for (const set of Object.values(PLAYER_COMBAT_SETS)) {
    const clip = set.actions.self_heal_cast;
    assert.equal(castLockMs(set.spriteId), clip.frames * clip.frameMs, set.spriteId);
    assert.equal(castLockMs(set.spriteId), 800, `${set.spriteId}: the animation's duration is unchanged`);
  }
  assert.equal(castLockMs('char_male_bald_none_drifter'), 800, 'no clip to show: held just as long');
  assert.equal(castLockMs(''), 800);
});

test('cast lock: holds movement, attacks, casts and NPC talk until the last frame is over; then everything is free', () => {
  const lock = new CastLock();
  assert.ok(ALL.every((a) => lock.allows(a)), 'nothing held before a cast');
  lock.lock(800);
  assert.equal(lock.locked, true);
  assert.deepEqual(ALL.filter((a) => !lock.allows(a)), ['move', 'attack', 'cast', 'interact']);
  assert.deepEqual([...CAST_LOCKED_ACTIONS].sort(), ['attack', 'cast', 'interact', 'move']);
  assert.ok(lock.allows('useItem') && lock.allows('chat') && lock.allows('openWindow'), 'potions, chat and windows are not animations');
  // frame by frame at 60 fps: locked through the whole clip, free on the frame it ends - reported once
  let ended = 0;
  let t = 0;
  while (lock.locked) {
    assert.ok(t < 800, 'never longer than the clip');
    if (lock.update(1000 / 60)) ended++;
    t += 1000 / 60;
  }
  assert.ok(t >= 800 && t < 800 + 1000 / 60 + 1e-6, `ends with the last frame (${t.toFixed(1)} ms)`);
  assert.equal(ended, 1);
  assert.equal(lock.update(16), false, 'no second end');
  assert.ok(ALL.every((a) => lock.allows(a)));
});

test('cast lock: never stuck - odd frame times, a long hitch, death; a cast again afterwards works', () => {
  const lock = new CastLock();
  lock.lock(800);
  for (const odd of [Number.NaN, Number.POSITIVE_INFINITY, -50, 0]) assert.equal(lock.update(odd), false, `${odd}: ignored, still counting`);
  assert.equal(lock.locked, true);
  assert.equal(lock.update(5000), true, 'a long hitch: over, not negative');
  assert.equal(lock.locked, false);
  // death overrides
  lock.lock(800);
  lock.update(100);
  lock.clear();
  assert.deepEqual([lock.locked, lock.allows('move'), lock.update(16)], [false, true, false]);
  // a new cast locks again; a shorter one never shortens a running lock; bad values never lock
  lock.lock(800);
  lock.update(300);
  lock.lock(100);
  lock.update(450);
  assert.equal(lock.locked, true, '50 ms of the first cast left');
  assert.equal(lock.update(50), true);
  lock.lock(Number.NaN);
  lock.lock(-5);
  assert.equal(lock.locked, false);
});

test('cast lock wiring: Self-Heal holds the character - manual and Auto Combat; the heal itself is as before; death overrides', () => {
  const scene = read('src/scenes/GameScene.ts');
  const cast = scene.slice(scene.indexOf('private castSelfSkill('), scene.indexOf('private beginCastLock('));
  // order: allowed -> SP / cooldown -> lock -> the cast clip -> the heal (same frame as before: at once)
  const order = ["!this.canPerform('cast')", 'if (!this.activateSkill(id)) return', 'this.beginCastLock();', "this.player.actions.play('cast'", 'this.combat.healPlayer('].map((s) => cast.indexOf(s));
  assert.ok(order.every((i) => i >= 0) && order.every((i, k) => k === 0 || i > order[k - 1]), `order ${order}`);
  assert.match(scene, /private beginCastLock\(\): void \{\s*this\.steerAfterCast = this\.steerDir;\s*this\.steerDir = null;\s*this\.player\.halt\(\);\s*this\.castLock\.lock\(castLockMs\(this\.combatSet\?\.spriteId \?\? ''\)\);\s*this\.combat\.setActionLocked\(true\);/);
  // one gate for every command: clicks, the joystick, the sword button, hotbar skills, NPC talk, Auto Combat
  assert.match(scene, /canPerform\(action: PlayerAction\): boolean \{\s*if \(!this\.death\?\.life\.canPerform\(action\)\) return false;[^}]*if \(!this\.castLock\.allows\(action\)\) return false;/);
  assert.match(scene, /canAct: \(\) => this\.ready && this\.death\.life\.isAlive\(\) && !this\.combat\.isDefeated\(\) && this\.canPerform\('attack'\),/, 'Auto Combat waits too');
  assert.match(scene, /if \(alive && !this\.isTalking\(\) && !this\.castLock\.locked\) this\.player\.update\(delta\);/, 'no step while held');
  // ends by the clock; death cuts it; a new scene starts clean
  assert.match(scene, /if \(!alive\) this\.endCastLock\(false\);\s*else if \(this\.castLock\.update\(delta\)\) this\.endCastLock\(true\);\s*this\.combat\.update\(delta\);/);
  assert.match(scene, /this\.failed = false;\s*this\.castLock\.clear\(\);\s*this\.steerAfterCast = null;/);
  assert.match(scene, /this\.castLock\.clear\(\);\s*this\.combat\.setActionLocked\(false\);\s*if \(resume && held\) this\.steer\(held\);/, 'a held joystick walks on afterwards');
  assert.match(scene, /if \(this\.castLock\.locked\) this\.steerAfterCast = direction;/);
  // the attack loop waits (the target is kept); monsters still attack; death and respawn clear the hold
  const combat = read('src/combat/CombatSystem.ts');
  assert.match(combat, /if \(this\.actionLocked\) \{\s*this\.player\.stopPath\(\);[^\n]*\n\s*return;\s*\}/);
  assert.equal((combat.match(/this\.actionLocked = false;/g) ?? []).length, 2, 'defeat and respawn');
  const monsterHit = combat.slice(combat.indexOf('private resolveMonsterHit('), combat.indexOf('private flashPlayer('));
  assert.doesNotMatch(monsterHit, /actionLocked/, 'being held does not protect the player');
  // a hit reaction never cuts the cast clip (the animator's own rule, unchanged)
  assert.match(read('src/characters/combat/PlayerCombatAnimator.ts'), /if \(clip === 'hit_reaction' && this\.acting && this\.acting !== 'hit_reaction'\) return false;/);
});
