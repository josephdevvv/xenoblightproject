import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EARLY_EXP_TO_NEXT, expToNextLevel, FIRST_MAP_TARGET_LEVEL, legacyExpToNextLevel, totalExpBetween } from '../src/progression/ExpCurve';
import { addExp, KillRewardLedger, levelProgress } from '../src/progression/LevelProgression';
import { MONSTER_EXP_REWARDS, monsterExpReward } from '../src/progression/MonsterExpRewards';
import { allocatedQuestExp, remainingQuestExp, TUTORIAL_QUEST_EXP_BUDGET, validateQuestAllocations } from '../src/progression/QuestExpBudget';
import { MONSTER_DEFINITIONS } from '../src/monsters/MonsterDefinition';
import { applyLevelUp, createInitialStatus, pointsEarnedAtLevel, STATUS_RULES } from '../src/status/StatTypes';

const MAX = STATUS_RULES.maxLevel;

test('curve: the Level 1-10 table (80 ... 420), 2,080 EXP in total; Level 10 is a target, not a cap', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map(expToNextLevel), [80, 110, 140, 180, 220, 260, 310, 360, 420]);
  assert.equal(totalExpBetween(1, 10), 2080);
  assert.equal(FIRST_MAP_TARGET_LEVEL, 10);
  // levels 10+ keep the pre-existing curve unchanged
  for (const l of [10, 11, 25, 50, 98]) assert.equal(expToNextLevel(l), legacyExpToNextLevel(l));
  assert.equal(expToNextLevel(10), Math.round(25 * Math.pow(10, 1.5)));
  assert.ok(MAX > 10, 'no Level 10 cap');
  assert.equal(addExp(10, 0, expToNextLevel(10), MAX).level, 11, 'Level 10 -> 11 works');
  for (const v of Object.values(EARLY_EXP_TO_NEXT)) assert.ok(Number.isInteger(v) && v > 0);
});

test('level-ups: Level 1 starts at 0, each threshold levels exactly, excess carries, several at once', () => {
  const s = createInitialStatus();
  assert.equal(s.level, 1);
  assert.equal(s.exp, 0);
  assert.deepEqual(addExp(1, 0, 79, MAX), { level: 1, exp: 79, levelsGained: 0 });
  assert.deepEqual(addExp(1, 79, 1, MAX), { level: 2, exp: 0, levelsGained: 1 });
  let level = 1;
  for (let l = 1; l < 10; l++) {
    const r = addExp(level, 0, expToNextLevel(l), MAX);
    assert.deepEqual(r, { level: l + 1, exp: 0, levelsGained: 1 }, `exactly ${expToNextLevel(l)} at Lv ${l}`);
    level = r.level;
  }
  assert.deepEqual(addExp(1, 70, 25, MAX), { level: 2, exp: 15, levelsGained: 1 }, 'excess carries over');
  assert.deepEqual(addExp(1, 0, 80 + 110 + 140 + 7, MAX), { level: 4, exp: 7, levelsGained: 3 }, 'one reward, three level-ups');
  assert.deepEqual(addExp(1, 0, 2080, MAX), { level: 10, exp: 0, levelsGained: 9 });
  assert.deepEqual(addExp(MAX, 0, 10_000, MAX), { level: MAX, exp: 0, levelsGained: 0 });
});

test('level-ups: integer EXP only, invalid values cleaned (negative / fractional / NaN never trusted)', () => {
  assert.deepEqual(addExp(1, 10.9, 5.7, MAX), { level: 1, exp: 15, levelsGained: 0 });
  assert.deepEqual(addExp(1, 10, -50, MAX), { level: 1, exp: 10, levelsGained: 0 });
  assert.deepEqual(addExp(1, Number.NaN, Number.NaN, MAX), { level: 1, exp: 0, levelsGained: 0 });
  assert.deepEqual(addExp(1, -5, 0, MAX), { level: 1, exp: 0, levelsGained: 0 });
  assert.equal(levelProgress(1, 40, MAX), 0.5);
  assert.equal(levelProgress(MAX, 0, MAX), 1);
});

test('existing level-up rewards stay: 3 stat points per level gained (no new stat scaling)', () => {
  const s = createInitialStatus();
  const r = addExp(s.level, s.exp, 80 + 110 + 3, MAX);
  applyLevelUp(s, r.level);
  assert.equal(s.level, 3);
  assert.equal(s.statPoints, pointsEarnedAtLevel(3));
  assert.equal(s.statPoints, 6);
});

test('monster EXP: Void Mite 20, Mutant Wolf 32 (separate from combat stats); reference pacing', () => {
  assert.equal(monsterExpReward('voidmite'), 20);
  assert.equal(monsterExpReward('mutant_wolf'), 32);
  for (const id of Object.keys(MONSTER_DEFINITIONS)) assert.ok(id in MONSTER_EXP_REWARDS, `${id} has a reward`);
  for (const def of Object.values(MONSTER_DEFINITIONS)) assert.ok(!('exp' in def.combat), 'no EXP in combat stats');
  const monsterExp = 20 * monsterExpReward('voidmite') + 25 * monsterExpReward('mutant_wolf');
  assert.equal(monsterExp, 1200);
  assert.equal(monsterExp + TUTORIAL_QUEST_EXP_BUDGET.total, 2100);
  assert.ok(monsterExp + TUTORIAL_QUEST_EXP_BUDGET.total >= totalExpBetween(1, 10), 'the plan reaches Level 10');
});

test('kill rewards: once per monster life (a respawn pays again, a repeat never)', () => {
  const ledger = new KillRewardLedger();
  assert.equal(ledger.claim('monster-3', 1), true);
  assert.equal(ledger.claim('monster-3', 1), false, 'same death: no second reward');
  assert.equal(ledger.claim('monster-4', 1), true, 'another monster');
  assert.equal(ledger.claim('monster-3', 2), true, 'respawned: new life');
  assert.equal(ledger.size, 3);
});

test('Tutorial Quest budget: 900 reserved, 600 allocated to the four quests that pay EXP, allocations validated', () => {
  assert.equal(TUTORIAL_QUEST_EXP_BUDGET.total, 900);
  assert.deepEqual(
    TUTORIAL_QUEST_EXP_BUDGET.allocations,
    { tutorial_02_rusty_dagger: 100, tutorial_03_void_mite_hunt: 200, tutorial_05_mutant_wolf_hunt: 150, tutorial_06_dark_avian_hunt: 150 },
    'the potion training and the scroll tutorial pay nothing',
  );
  assert.equal(allocatedQuestExp(), 600);
  assert.equal(remainingQuestExp(), 300);
  assert.deepEqual(validateQuestAllocations(TUTORIAL_QUEST_EXP_BUDGET.allocations), []);
  assert.deepEqual(validateQuestAllocations({ a: 300, b: 600 }), []);
  assert.equal(validateQuestAllocations({ a: 600, b: 400 }).length, 1, 'over budget');
  assert.equal(validateQuestAllocations({ a: 12.5 }).length, 1, 'whole numbers only');
});
