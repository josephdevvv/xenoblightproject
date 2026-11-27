import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { CHARACTER_CANVAS_ROOT } from '../src/characters/CharacterSheetLayout';
import { DRIFTER_RED_STAB, skillVfxAnimKey, skillVfxDelayMs, skillVfxOf, skillVfxOrigin } from '../src/characters/combat/SkillVfxArt';
import { ATTACK_IMPACT_FRAME } from '../src/combat/AttackTiming';
import { PLAYER_ATTACKS, playerImpactDelayMs } from '../src/combat/PlayerAttacks';
import { readPng } from './helpers/png';

const read = (f: string): string => fs.readFileSync(path.join(process.cwd(), f), 'utf8').replace(/\r\n/g, '\n');
const FACINGS = ['SE', 'SW', 'NE', 'NW'] as const;

test('red stab: the approved Sprite Forge sheet, unchanged - 4 facings x 4 frames of 64 x 64, rows SE SW NE NW', () => {
  const v = DRIFTER_RED_STAB;
  const file = path.join(process.cwd(), 'public', v.url);
  const sha = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  assert.equal(sha, v.sheetSha256, 'byte-identical to the approved sheet');
  const png = readPng(file);
  assert.deepEqual([png.width, png.height], [v.frameWidth * v.frames, v.frameHeight * 4]);
  assert.deepEqual(v.rows, ['SE', 'SW', 'NE', 'NW']);
  assert.deepEqual([v.frames, v.frameWidth, v.frameHeight, v.peakFrame], [4, 64, 64, 2]);
  assert.deepEqual(v.frameDurationsMs, [100, 100, 100, 100]);
  // binary alpha, transparent background (no baked backdrop)
  for (let i = 3; i < png.data.length; i += 4) assert.ok(png.data[i] === 0 || png.data[i] === 255);
  assert.equal(png.data[3], 0, 'top-left transparent');
  const meta = JSON.parse(read('public/assets/vfx/player/skills/drifter_red_stab/vfx_drifter_red_stab_metadata.json'));
  assert.equal(meta.status, 'approved');
  assert.deepEqual(new Set(FACINGS.map((f) => skillVfxAnimKey(v, f))).size, 4);
});

test('red stab: only on the Drifter attack skill - never on a basic attack', () => {
  assert.equal(skillVfxOf('drifter_lv1'), DRIFTER_RED_STAB);
  assert.equal(skillVfxOf('basic'), null);
  assert.equal(skillVfxOf(PLAYER_ATTACKS.basic.id), null);
  assert.equal(skillVfxOf(PLAYER_ATTACKS.drifter_lv1.id), DRIFTER_RED_STAB);
});

test('red stab: placed by the forge rule (top-left = character frame top-left + offset), per gender and facing; mirrors match', () => {
  const v = DRIFTER_RED_STAB;
  for (const g of ['male', 'female'] as const) {
    for (const f of FACINGS) {
      const [dx, dy] = v.offsets[g][f];
      const o = skillVfxOrigin(v, g, f);
      // the VFX sprite sits on the character's ground root: its top-left lands at root - origin x size
      const topLeft = { x: CHARACTER_CANVAS_ROOT.x - o.x * v.frameWidth, y: CHARACTER_CANVAS_ROOT.y - o.y * v.frameHeight };
      assert.deepEqual(topLeft, { x: dx, y: dy }, `${g} ${f}`);
    }
    // SW / NW are exact mirrors of SE / NE: same height, the other way
    assert.deepEqual([v.offsets[g].SW[0], v.offsets[g].SW[1]], [-v.offsets[g].SE[0], v.offsets[g].SE[1]]);
    assert.deepEqual([v.offsets[g].NW[0], v.offsets[g].NW[1]], [-v.offsets[g].NE[0], v.offsets[g].NE[1]]);
    // the thrust goes forward: east facings to the right, north facings up
    assert.ok(v.offsets[g].SE[0] > 0 && v.offsets[g].SW[0] < 0 && v.offsets[g].NE[1] < v.offsets[g].SE[1]);
  }
});

test('red stab: its peak frame shows on the swing\'s hit frame, at any attack speed', () => {
  const v = DRIFTER_RED_STAB;
  const impact = playerImpactDelayMs('char_male_mohawk_blonde_drifter', PLAYER_ATTACKS.drifter_lv1);
  assert.equal(impact, (ATTACK_IMPACT_FRAME - 1) * 100, 'the hit frame (frame 4) of the 100-ms thrust');
  for (const speed of [1, 1.25, 2, 800 / 140]) {
    const at = skillVfxDelayMs(v, impact / speed, speed);
    // F1 then F2: the peak starts one (sped-up) VFX frame later - exactly on the hit
    assert.ok(Math.abs(at + v.frameDurationsMs[0] / speed - impact / speed) < 1e-9, `speed ${speed}`);
    assert.ok(at >= 0);
  }
  assert.equal(skillVfxDelayMs(v, 50, 1), 0, 'never before the swing starts');
});

test('red stab wiring: scheduled with the swing on the combat clock, spawned above the player, cleaned up with the swing', () => {
  const combat = read('src/combat/CombatSystem.ts');
  const swing = combat.slice(combat.indexOf('private playerAttack('), combat.indexOf('private resolvePendingHits('));
  assert.match(swing, /const art = skillVfxOf\(attack\.id\);\s*if \(art\) this\.pendingVfx\.push\(\{ at: this\.elapsed \+ skillVfxDelayMs\(art, impactMs, speed\), request: \{ art, facing, gender: this\.character\.appearance\.gender, speed \} \}\);/);
  assert.match(combat, /this\.startPendingVfx\(\);\s*this\.resolvePendingHits\(\);/, 'same clock as the hits');
  // an interrupted swing, death and respawn drop what is waiting and what is playing
  assert.match(combat, /this\.pendingHits = \[\];\s*this\.pendingVfx = \[\];\s*this\.player\.actions\.reset\?\.\(\);/);
  assert.equal((combat.match(/this\.skillVfx\?\.clear\(\);/g) ?? []).length, 2, 'defeat and respawn');
  const layer = read('src/combat/vfx/SkillVfxLayer.ts');
  assert.match(layer, /setDepth\(DEPTH\.AttackVfx\)/, 'above every character');
  assert.doesNotMatch(layer, /setInteractive|physics/, 'no input, no body');
  assert.match(layer, /if \(!this\.attacker\.stillSwinging\(\)\) \{\s*this\.clear\(\);/);
  assert.match(layer, /sprite\.on\(Phaser\.Animations\.Events\.ANIMATION_COMPLETE, \(\) => this\.release\(sprite\)\);/, 'plays once, then back to the pool');
  const scene = read('src/scenes/GameScene.ts');
  assert.match(scene, /stillSwinging: \(\) => this\.death\.life\.isAlive\(\) && \(!this\.playerCombat \|\| isAttackClip\(this\.playerCombat\.getActing\(\)\)\)/);
  assert.match(scene, /this\.skillVfx\?\.dispose\(\);/, 'scene shutdown (map change, reload)');
  assert.match(scene, /this\.skillVfx\.update\(\);/);
  // loaded and held with the rest of the player's combat art (animations rebuilt if the texture was evicted)
  assert.match(read('src/characters/combat/PlayerCombatAssets.ts'), /const sheets = \[impactSheet\(\), redStabSheet\(\), [^\n]*\.\.\.\(set \? combatSheets\(set\) : \[\]\)\];/);
});
