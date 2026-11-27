import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { ATTACK_IMPACT_FRAME, ATTACK_IMPACT_INDEX, impactDelayMs, supportsImpactFrame } from '../src/combat/AttackTiming';
import { PLAYER_ATTACKS, playerImpactDelayMs } from '../src/combat/PlayerAttacks';
import { bodyCenterWorld } from '../src/combat/vfx/HitAnchor';
import { combatSetFor, PLAYER_COMBAT_ACTIONS, PLAYER_COMBAT_SETS, PLAYER_IMPACT_VFX } from '../src/characters/combat/PlayerCombatArt';
import { CHARACTER_CANVAS_ROOT } from '../src/characters/CharacterSheetLayout';
import { DEPTH } from '../src/config/constants';
import { readPng } from './helpers/png';

const PUBLIC = path.join(process.cwd(), 'public');

test('global hit frame: 4 (1-based) = index 3; the delay is the sum of the frames before it', () => {
  assert.equal(ATTACK_IMPACT_FRAME, 4);
  assert.equal(ATTACK_IMPACT_INDEX, 3);
  assert.equal(impactDelayMs(100, 8), 300, 'dagger_thrust: 3 x 100 ms');
  assert.equal(impactDelayMs([60, 60, 70, 80], 4), 190);
  assert.ok(supportsImpactFrame(4) && supportsImpactFrame(8) && !supportsImpactFrame(3));
  assert.throws(() => impactDelayMs(100, 3), /frame 4 does not exist/, 'too short: reported, no invented frames');
});

test('player attacks: basic and Drifter Lv.1 reuse dagger_thrust, hit on frame 4, 1.0 / 1.5 impact, 100 % / 200 % ATK', () => {
  const { basic, drifter_lv1 } = PLAYER_ATTACKS;
  for (const a of [basic, drifter_lv1]) {
    assert.equal(a.animation, 'dagger_thrust');
    assert.equal(a.impactFrame, 4);
    assert.equal(a.onHitVfx, 'impact');
  }
  assert.equal(basic.atkMultiplier, 1);
  assert.equal(drifter_lv1.atkMultiplier, 2);
  assert.equal(basic.vfxScale, 1);
  assert.equal(drifter_lv1.vfxScale, 1.5);
  // the hit time comes from the animation's timing - the same for appearances without combat art
  assert.equal(playerImpactDelayMs('char_male_mohawk_blonde_drifter', basic), 300);
  assert.equal(playerImpactDelayMs('char_female_bald_none_drifter', basic), 300);
});

test('player combat sheets: metadata matches the PNGs (frames, rows SE/SW/NE/NW, 64 x 64), attacks have a frame 4', () => {
  const sets = Object.values(PLAYER_COMBAT_SETS);
  assert.ok(sets.length >= 1);
  const set = combatSetFor('char_male_mohawk_blonde_drifter');
  assert.ok(set, 'Mohawk Blonde Drifter has combat art');
  for (const s of sets) {
    for (const action of PLAYER_COMBAT_ACTIONS) {
      const sheet = s.actions[action];
      const img = readPng(path.join(PUBLIC, s.basePath + sheet.file));
      assert.equal(img.width, sheet.frameWidth * sheet.frames, `${action}: width = frames x 64`);
      assert.equal(img.height, sheet.frameHeight * sheet.rows.length, `${action}: one row per facing`);
      assert.deepEqual(sheet.rows, ['SE', 'SW', 'NE', 'NW']);
      for (let i = 3; i < img.data.length; i += 4) assert.ok(img.data[i] === 0 || img.data[i] === 255, `${action}: binary alpha`);
    }
    assert.equal(s.actions.dagger_thrust.frames, 8);
    assert.equal(s.actions.dagger_thrust.frameMs, 100);
    assert.equal(s.actions.dagger_thrust.repeat, 0, 'attack plays once');
    assert.equal(s.actions.combat_idle.repeat, -1, 'combat idle loops');
    assert.ok(supportsImpactFrame(s.actions.dagger_thrust.frames));
  }
});

test('Male Side Swept, Middle Part, Slicked Back and Long Middle Part: combat art for all 5 colours (4 actions + optional unarmed_punch, same timing as the Mohawk set)', () => {
  const ref = combatSetFor('char_male_mohawk_blonde_drifter')!;
  for (const hair of ['side_swept', 'middle_part', 'slicked_back', 'long_middle_part']) for (const c of ['blonde', 'black', 'silver', 'brown', 'red']) {
    const s = combatSetFor(`char_male_${hair}_${c}_drifter`);
    assert.ok(s, `${hair} ${c} has combat art`);
    for (const action of PLAYER_COMBAT_ACTIONS) {
      assert.equal(s!.actions[action].frames, ref.actions[action].frames, `${c} ${action} frames`);
      assert.equal(s!.actions[action].frameMs, ref.actions[action].frameMs, `${c} ${action} timing`);
      assert.equal(s!.actions[action].repeat, ref.actions[action].repeat, `${c} ${action} loop`);
    }
    const punch = s!.optional.unarmed_punch;
    assert.ok(punch, `${c} unarmed_punch exported`);
    assert.equal(punch!.frames, 8);
    assert.equal(punch!.frameMs, 100);
    assert.equal(punch!.repeat, 0);
    assert.equal(punch!.events.impactFrame, 5);
    assert.deepEqual(punch!.rows, ['SE', 'SW', 'NE', 'NW']);
    const img = readPng(path.join(PUBLIC, s!.basePath + punch!.file));
    assert.deepEqual([img.width, img.height], [512, 256]);
  }
  assert.deepEqual(Object.keys(ref.optional), ['unarmed_punch'], 'the Mohawk Blonde r2 export adds unarmed_punch');
});

test('Mohawk and Straight Bangs: combat art for all 5 colours (Straight Bangs also exports its 1-frame combat_stance)', () => {
  for (const c of ['blonde', 'black', 'silver', 'brown', 'red']) {
    const m = combatSetFor(`char_male_mohawk_${c}_drifter`), f = combatSetFor(`char_female_straight_bangs_${c}_drifter`);
    assert.ok(m, `mohawk ${c}`);
    assert.ok(f, `straight_bangs ${c}`);
    for (const s of [m!, f!]) {
      for (const action of PLAYER_COMBAT_ACTIONS) assert.ok(fs.existsSync(path.join(PUBLIC, s.basePath + s.actions[action].file)), `${s.key} ${action}`);
      assert.equal(s.optional.unarmed_punch?.events.impactFrame, 5, `${s.key} punch`);
      assert.equal(s.actions.dagger_thrust.events.impactFrame, 5);
      assert.equal(s.actions.self_heal_cast.events.castFrame, 5);
      assert.equal(s.actions.hit_reaction.events.reactionFrame, 2);
    }
    assert.equal(f!.optional.combat_stance?.frames, 1);
    assert.equal(m!.optional.combat_stance, undefined);
  }
});

test('player combat frames stand on the static canvas root (feet on row 56): no jump between static and combat', () => {
  for (const s of Object.values(PLAYER_COMBAT_SETS)) {
    for (const action of PLAYER_COMBAT_ACTIONS) {
      const sheet = s.actions[action];
      const img = readPng(path.join(PUBLIC, s.basePath + sheet.file));
      for (let row = 0; row < sheet.rows.length; row++) {
        for (let col = 0; col < sheet.frames; col++) {
          let bottom = -1;
          for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (img.data[((row * 64 + y) * img.width + col * 64 + x) * 4 + 3] >= 128) bottom = Math.max(bottom, y);
          assert.equal(bottom + 1, CHARACTER_CANVAS_ROOT.y, `${action} ${sheet.rows[row]} frame ${col + 1}`);
        }
      }
    }
  }
});

test('impact VFX: shared grayscale sheet as exported (4 x 64, one-shot, 60/60/70/80 ms, centred), not edited', () => {
  const img = readPng(path.join(PUBLIC, PLAYER_IMPACT_VFX.url));
  assert.equal(img.width, PLAYER_IMPACT_VFX.frameWidth * PLAYER_IMPACT_VFX.frames);
  assert.equal(img.height, PLAYER_IMPACT_VFX.frameHeight);
  assert.deepEqual([...PLAYER_IMPACT_VFX.frameDurationsMs], [60, 60, 70, 80]);
  assert.equal(PLAYER_IMPACT_VFX.loop, false);
  assert.deepEqual(PLAYER_IMPACT_VFX.origin, { x: 0.5, y: 0.5 });
  for (let i = 0; i < img.data.length; i += 4) {
    if (!img.data[i + 3]) continue;
    assert.equal(img.data[i + 3], 255, 'binary alpha');
    assert.ok(Math.abs(img.data[i] - img.data[i + 1]) <= 8 && Math.abs(img.data[i + 1] - img.data[i + 2]) <= 8, 'grayscale');
  }
  const meta = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'assets/vfx/player/combat/impact.json'), 'utf8'));
  assert.equal(meta.frameCount, PLAYER_IMPACT_VFX.frames);
});

test('hit anchor: centre of the visible body (not the feet), for any origin, scale and flip', () => {
  const bounds = { left: 20, top: 6, right: 43, bottom: 56 }; // a 64 x 64 character, feet on row 56
  const frame = { width: 64, height: 64 };
  const base = { x: 500, y: 300, originX: 32 / 64, originY: 57 / 64, scaleX: 1, scaleY: 1, flipX: false };
  const p = bodyCenterWorld(bounds, frame, base);
  assert.deepEqual(p, { x: 500, y: 300 - 25.5 }, 'half the body height above the feet');
  const scaled = bodyCenterWorld(bounds, frame, { ...base, scaleX: 2, scaleY: 2 });
  assert.equal(scaled.y, 300 - 51);
  const off = { left: 30, top: 6, right: 49, bottom: 56 };
  assert.equal(bodyCenterWorld(off, frame, base).x, 500 + 8);
  assert.equal(bodyCenterWorld(off, frame, { ...base, flipX: true }).x, 500 - 8, 'mirrored');
  // a small monster: 48 x 32 frame, origin at its feet
  const mite = bodyCenterWorld({ left: 10, top: 12, right: 37, bottom: 30 }, { width: 48, height: 32 }, { x: 100, y: 100, originX: 24 / 48, originY: 31 / 32, scaleX: 1, scaleY: 1, flipX: false });
  assert.deepEqual(mite, { x: 100, y: 100 - 9.5 });
});

test('render order: attack VFX above every world object / character, below fog, name plates and UI', () => {
  assert.ok(DEPTH.AttackVfx > DEPTH.GroundFx);
  assert.ok(DEPTH.AttackVfx > 10000, 'far above any character depth (screen Y of the feet)');
  assert.ok(DEPTH.AttackVfx < DEPTH.HighFog && DEPTH.AttackVfx < DEPTH.NamePlate && DEPTH.AttackVfx < DEPTH.Hud);
});
