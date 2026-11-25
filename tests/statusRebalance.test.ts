import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { playerCombatStats } from '../src/combat/CombatRules';
import { swingTimeScale } from '../src/combat/PlayerAttacks';
import { initLanguage, setLanguage, translate } from '../src/i18n';
import { createInventory, equipmentDerivedBonus } from '../src/inventory/InventoryState';
import { createPassiveProgress, passiveDerivedBonus, syncLevelRewards, upgradeNode, type PassiveProgress } from '../src/passives/PassiveProgress';
import { ASPD_RULES, aspdIntervalMs, attacksPerSecond, CLASS_BASE_ASPD, finalAspd, rawAspd, statAspd } from '../src/status/Aspd';
import { CharacterStatusService } from '../src/status/CharacterStatusService';
import { applyDerivedBonus, emptyDerivedBonus } from '../src/status/DerivedBonuses';
import { computeDerivedStats, DERIVED_DISPLAY, formatStatValue, type DerivedStats } from '../src/status/DerivedStats';
import { createStatBlock, STATUS_RULES, type StatBlock } from '../src/status/StatTypes';
import { newCharacter, saveAndLoad, withoutStorage } from './helpers/session';

const close = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) < eps;
const stats = (over: Partial<StatBlock>): StatBlock => ({ ...createStatBlock(1), ...over });
/** The specified ASPD formula, written out independently of src/status/Aspd.ts. */
const specAspd = (agi: number, dex: number): number => 11 + 0.96 * (Math.sqrt(9.999 * agi + 0.19212 * dex) - Math.sqrt(10.19112));

test('Lv 1 Drifter, all stats 1: exactly the specified base status', () => {
  const d = computeDerivedStats(1, createStatBlock(1));
  const expected: DerivedStats = {
    maxHp: 100, maxSp: 20, meleeAtk: 6, rangedAtk: 6, matk: 6, def: 1, mdef: 0.5, hit: 104, flee: 103,
    aspd: 11, critRate: 5, critDamage: 150, materialFindBonus: 0,
  };
  for (const key of Object.keys(expected) as (keyof DerivedStats)[]) assert.ok(close(d[key], expected[key]), `${key}: ${d[key]}`);
  assert.deepEqual([STATUS_RULES.pointsPerLevel, STATUS_RULES.maxBaseStat, STATUS_RULES.startingStat], [3, 99, 1]);
  assert.equal(CLASS_BASE_ASPD.drifter, 11);
});

test('linear scaling per point above 1, decimals kept (no double counting of the initial 1)', () => {
  const d = computeDerivedStats(1, stats({ str: 2, vit: 3, int: 4, dex: 5, agi: 6, luk: 11 }));
  assert.equal(d.meleeAtk, 6.5, 'STR +0.5');
  assert.deepEqual([d.maxHp, d.def, d.mdef], [112, 1.5, 1], 'VIT: HP +6, DEF / MDEF +0.25');
  assert.deepEqual([d.matk, d.maxSp], [7.5, 23], 'INT: MATK +0.5, SP +1');
  assert.deepEqual([d.rangedAtk, d.hit], [8, 108], 'DEX: Ranged ATK +0.5, HIT +1');
  assert.equal(d.flee, 105.5, 'AGI: FLEE +0.5');
  assert.ok(close(d.critRate, 6) && close(d.materialFindBonus, 0.5), 'LUK: crit +0.1 %, material find +0.05 %');
  assert.ok(close(d.aspd, specAspd(6, 5)));
  // nothing else moves: e.g. STR changes only Melee ATK
  const base = computeDerivedStats(1, createStatBlock(1));
  const str = computeDerivedStats(1, stats({ str: 50 }));
  for (const key of Object.keys(base) as (keyof DerivedStats)[]) if (key !== 'meleeAtk') assert.equal(str[key], base[key], key);
  // the Status window shows at most two decimals
  assert.equal(formatStatValue(specAspd(10, 1)), (Math.round(specAspd(10, 1) * 100) / 100).toString());
  assert.ok(!DERIVED_DISPLAY.some((e) => (e.key as string) === 'attackSpeedBonus'), 'the old Attack Speed (bonus) row is gone');
  assert.ok(DERIVED_DISPLAY.some((e) => e.key === 'aspd' && !e.percent), 'ASPD is shown as points');
});

test('Lv 10 builds (27 points): level bonus on HIT / FLEE kept, each build gets what it invested in', () => {
  const lv = 10;
  const points = (lv - 1) * STATUS_RULES.pointsPerLevel;
  assert.equal(points, 27);
  const plain = computeDerivedStats(lv, createStatBlock(1));
  assert.deepEqual([plain.hit, plain.flee], [122, 121], '+2 per level');
  const strBuild = computeDerivedStats(lv, stats({ str: 28 }));
  assert.equal(strBuild.meleeAtk, 19.5);
  const vitBuild = computeDerivedStats(lv, stats({ vit: 28 }));
  assert.deepEqual([vitBuild.maxHp, vitBuild.def, vitBuild.mdef], [262, 7.75, 7.25]);
  const speed = computeDerivedStats(lv, stats({ agi: 19, dex: 10 }));
  assert.ok(close(speed.aspd, specAspd(19, 10)));
  assert.equal(speed.flee, 121 + 9);
  assert.equal(speed.hit, 122 + 9);
  assert.ok(speed.aspd > plain.aspd + 10 && speed.aspd < 22, `AGI 19 / DEX 10 -> ASPD ${speed.aspd.toFixed(2)}`);
});

test('ASPD: the specified interval table, 0..74 limits, raw values from AGI / DEX', () => {
  const table: [number, number, string][] = [
    [0, 1620, '0.62'], [11, 1400, '0.71'], [21, 1200, '0.83'], [31, 1000, '1.00'], [41, 800, '1.25'],
    [51, 600, '1.67'], [61, 400, '2.50'], [71, 200, '5.00'], [74, 140, '7.14'],
  ];
  for (const [aspd, ms, aps] of table) {
    assert.equal(aspdIntervalMs(aspd), ms, `ASPD ${aspd}`);
    assert.equal(attacksPerSecond(aspd).toFixed(2), aps, `ASPD ${aspd}`);
  }
  assert.deepEqual([ASPD_RULES.min, ASPD_RULES.max], [0, 74]);
  assert.equal(aspdIntervalMs(90), 140, 'never faster than ASPD 74');
  assert.equal(aspdIntervalMs(-5), 1620, 'never slower than ASPD 0');
  assert.equal(finalAspd(70, 0, 10), 74);
  assert.equal(finalAspd(5, 0, -10), 0);
  assert.equal(finalAspd(11, 100), 74, '100 % would reach 81 - clamped');
  assert.ok(close(finalAspd(11, 10), 18), '10 % of the gap 81 - 11 = +7');
  assert.ok(close(finalAspd(11, 10, 2), 20), 'percent first, then flat');
  assert.ok(close(statAspd(1, 1), 0) && statAspd(1, 1) >= 0, '0 at AGI 1 / DEX 1');
  for (const [agi, dex] of [[1, 1], [10, 1], [1, 10], [50, 30], [99, 99]]) assert.ok(close(rawAspd(agi, dex), specAspd(agi, dex)), `${agi}/${dex}`);
  assert.ok(statAspd(10, 1) > statAspd(1, 10) * 10, 'AGI weighs far more than DEX');
  assert.ok(rawAspd(99, 99) < ASPD_RULES.max, `AGI / DEX 99: ${rawAspd(99, 99).toFixed(2)} (bonuses can go further, up to 74)`);
});

test('ASPD bonuses: Swiftness is a percentage bonus; equipment can add flat or percent ASPD; applied once', () => {
  const base = computeDerivedStats(1, createStatBlock(1));
  const two = applyDerivedBonus(base, passiveDerivedBonus(withSwiftness(2)));
  assert.ok(close(two.aspd, 11 + 70 * 0.04), 'Swiftness 2 ranks: +4 % of the gap -> 13.8');
  const flat = applyDerivedBonus(base, { ...emptyDerivedBonus(), flat: { aspd: 3 } });
  assert.ok(close(flat.aspd, 14));
  const lookup = (id: string) => (id === 'ring' ? ({ id: 'ring', weaponType: null, bonuses: { physicalAtk: 0, magicAtk: 0 }, additionalStats: { aspd: 2, aspdPercent: 5 } } as never) : undefined);
  const inv = createInventory();
  const worn = { ...inv, equipment: { ...inv.equipment, hat: { itemId: 'ring', quantity: 1, instanceId: 'r1' } } };
  const eq = equipmentDerivedBonus(worn as never, lookup);
  assert.deepEqual(eq.flat, { aspd: 2, aspdPercent: 5 });
  assert.ok(close(applyDerivedBonus(base, eq).aspd, 11 + 70 * 0.05 + 2));
  assert.equal(base.aspd, computeDerivedStats(1, createStatBlock(1)).aspd, 'the formula value is never mutated');
  assert.ok(close(applyDerivedBonus(base, emptyDerivedBonus()).aspd, 11));
  initLanguage(null);
  setLanguage('en');
  assert.deepEqual([translate('status.derived.aspd'), translate('status.derived.aspdPercent'), translate('status.stats.agi.description')], ['ASPD', 'ASPD', 'FLEE, ASPD']);
  assert.equal(translate('status.stats.dex.description'), 'Ranged ATK, HIT, ASPD');
  setLanguage('th');
  assert.equal(translate('status.derived.aspd'), 'ASPD');
});

test('combat timing: the basic attack interval is 20 x (81 - ASPD); a swing longer than it speeds up, hit frame too', () => {
  const lv1 = playerCombatStats(computeDerivedStats(1, createStatBlock(1)));
  assert.equal(lv1.attackIntervalMs, 1400);
  const fast = playerCombatStats({ ...computeDerivedStats(1, createStatBlock(1)), aspd: 61 });
  assert.equal(fast.attackIntervalMs, 400);
  assert.equal(swingTimeScale(800, 1400), 1, 'the 800-ms swing fits: authored speed');
  assert.equal(swingTimeScale(800, 800), 1);
  assert.equal(swingTimeScale(800, 400), 2, 'ASPD 61: twice as fast');
  assert.equal(swingTimeScale(800, 140), 800 / 140);
  const combat = fs.readFileSync(path.join(process.cwd(), 'src/combat/CombatSystem.ts'), 'utf8');
  const swing = combat.slice(combat.indexOf('private playerAttack('));
  assert.match(swing, /this\.attackCooldownMs = stats\.attackIntervalMs;/);
  assert.match(swing, /swingTimeScale\(playerSwingMs\(this\.spriteId, attack, clip\), stats\.attackIntervalMs\)/);
  assert.match(swing, /actions\.play\('attack', [^)]*\), speed, clip\)/);
  assert.match(swing, /playerImpactDelayMs\(this\.spriteId, attack, clip\) \/ speed/, 'the hit moves with the animation');
  // manual attacks and Auto Combat share this path; HP / SP follow a lower maximum at once
  assert.match(combat, /this\.playerHp = Math\.min\(this\.playerHp, this\.playerStats\(\)\.maxHp\);\s*this\.playerSp = Math\.min\(this\.playerSp, this\.getPlayerMaxSp\(\)\);/);
});

test('saves: allocated points are kept and the derived stats are recalculated from them', () => {
  withoutStorage(() => {
    const c = newCharacter('Alpha');
    c.status = { ...c.status, level: 10, base: stats({ str: 10, agi: 12, vit: 7 }), statPoints: 2 };
    const loaded = saveAndLoad(c);
    assert.deepEqual([loaded.status.level, loaded.status.base, loaded.status.statPoints], [10, c.status.base, 2]);
    const d = CharacterStatusService.derived(loaded);
    assert.equal(d.meleeAtk - equipmentMelee(loaded) - passiveMelee(loaded), 10.5);
    assert.ok(close(d.aspd, specAspd(12, 1)));
    assert.deepEqual(CharacterStatusService.derived(loaded), CharacterStatusService.derived(c));
  });
});

function withSwiftness(rank: number): PassiveProgress {
  let p = createPassiveProgress();
  syncLevelRewards(p, 10);
  for (const id of ['drifters_resolve', ...Array.from({ length: rank }, () => 'swiftness')]) {
    const r = upgradeNode(p, id);
    assert.ok(r.ok, id);
    p = r.progress;
  }
  return p;
}

function equipmentMelee(c: ReturnType<typeof newCharacter>): number {
  return equipmentDerivedBonus(c.inventory).flat.meleeAtk ?? 0;
}

function passiveMelee(c: ReturnType<typeof newCharacter>): number {
  return passiveDerivedBonus(c.passives).flat.meleeAtk ?? 0;
}
