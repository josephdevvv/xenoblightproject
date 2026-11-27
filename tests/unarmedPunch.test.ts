import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { PLAYER_COMBAT_SETS } from '../src/characters/combat/PlayerCombatArt';
import { ATTACK_IMPACT_FRAME } from '../src/combat/AttackTiming';
import { PLAYER_ATTACKS, playerImpactDelayMs, playerSwingMs } from '../src/combat/PlayerAttacks';
import { attackClipFor, equippedWeaponType, WEAPON_ATTACK_CLIPS } from '../src/combat/WeaponAttackClip';
import { createInventory } from '../src/inventory/InventoryState';
import { WEAPON_TYPES } from '../src/items/ItemDefinition';

const read = (f: string): string => fs.readFileSync(path.join(process.cwd(), f), 'utf8').replace(/\r\n/g, '\n');

test('attack clip: empty weapon slot = Unarmed Punch, a weapon = its own attack animation', () => {
  assert.equal(attackClipFor(null), 'unarmed_punch');
  assert.equal(attackClipFor('dagger'), 'dagger_thrust');
  for (const type of WEAPON_TYPES) assert.ok(WEAPON_ATTACK_CLIPS[type], `${type} has an attack animation`);
  const empty = createInventory();
  assert.equal(equippedWeaponType(empty), null);
  assert.equal(equippedWeaponType(undefined), null);
  const armed = { ...empty, equipment: { ...empty.equipment, weapon: { itemId: 'weapon_rusty_dagger', instanceId: 'w1' } } };
  assert.equal(equippedWeaponType(armed), 'dagger');
  assert.equal(attackClipFor(equippedWeaponType(armed)), 'dagger_thrust');
  const unknown = { ...empty, equipment: { ...empty.equipment, weapon: { itemId: 'no_such_item', instanceId: 'w2' } } };
  assert.equal(equippedWeaponType(unknown), null, 'an unknown item counts as no weapon');
});

test('every male / female hairstyle and colour with combat art has the punch, timed like the thrust: same hit frame and delay', () => {
  const sets = Object.values(PLAYER_COMBAT_SETS);
  assert.equal(sets.length, 30);
  for (const set of sets) {
    const punch = set.optional.unarmed_punch;
    assert.ok(punch, `${set.spriteId}: unarmed_punch exported`);
    assert.ok(punch.frames >= ATTACK_IMPACT_FRAME, `${set.spriteId}: the punch has a frame ${ATTACK_IMPACT_FRAME}`);
    assert.deepEqual(punch.rows, set.actions.dagger_thrust.rows, `${set.spriteId}: same facings`);
    for (const attack of Object.values(PLAYER_ATTACKS)) {
      const thrustDelay = playerImpactDelayMs(set.spriteId, attack, 'dagger_thrust');
      assert.equal(playerImpactDelayMs(set.spriteId, attack, 'unarmed_punch'), (ATTACK_IMPACT_FRAME - 1) * punch.frameMs, `${set.spriteId} ${attack.id}: hit on frame 4 of the punch`);
      assert.equal(playerImpactDelayMs(set.spriteId, attack, 'unarmed_punch'), thrustDelay, `${set.spriteId}: hit timing preserved`);
      assert.equal(playerSwingMs(set.spriteId, attack, 'unarmed_punch'), playerSwingMs(set.spriteId, attack, 'dagger_thrust'), `${set.spriteId}: swing length preserved`);
    }
  }
  // no combat art (bald): the reference timing, whatever the clip
  assert.equal(playerImpactDelayMs('char_male_bald_none_drifter', PLAYER_ATTACKS.basic, 'unarmed_punch'), 300);
});

test('wiring: each swing picks the clip from the weapon slot; the animation and the hit timing use that same clip', () => {
  const combat = read('src/combat/CombatSystem.ts');
  const swing = combat.slice(combat.indexOf('private playerAttack('), combat.indexOf('private resolvePendingHits('));
  assert.match(swing, /const clip = attackClipFor\(equippedWeaponType\(this\.character\.inventory\)\);/, 'read at every swing: equip / unequip counts at once');
  assert.match(swing, /playerSwingMs\(this\.spriteId, attack, clip\)/);
  assert.match(swing, /actions\.play\('attack', [^;]*, speed, clip\);/);
  assert.match(swing, /playerImpactDelayMs\(this\.spriteId, attack, clip\) \/ speed/);
  // manual attacks and Auto Combat both swing through playerAttack
  assert.equal((combat.match(/this\.playerAttack\(/g) ?? []).length >= 1, true);
  const animator = read('src/characters/combat/PlayerCombatAnimator.ts');
  assert.match(animator, /action === 'attack' \? \(attackClip === 'unarmed_punch' && !this\.set\.optional\.unarmed_punch \? 'dagger_thrust' : attackClip\)/);
  assert.doesNotMatch(animator, /attack: 'dagger_thrust'/, 'no fixed attack clip any more');
  // the optional punch sheets and their animations are loaded with the combat set
  assert.match(read('src/characters/combat/PlayerCombatAssets.ts'), /PLAYER_OPTIONAL_COMBAT_ACTIONS\.filter\(\(a\) => set\.optional\[a\]\)/);
});
