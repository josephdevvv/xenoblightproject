import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  availablePoints,
  changeClassTree,
  checkUpgrade,
  createPassiveProgress,
  modifiedHealPercent,
  modifiedSkillDamage,
  passiveDerivedBonus,
  passiveSkillModifiers,
  rankOf,
  resetOptionalNodes,
  sanitizePassiveProgress,
  syncLevelRewards,
  tutorialStep,
  upgradeNode,
  type PassiveProgress,
} from '../src/passives/PassiveProgress';
import { DRIFTER_TREE, PASSIVE_TREES, type PassiveTreeDefinition, type PassiveTreeId } from '../src/passives/PassiveTree';
import { PassiveSaveStore, passiveSaveKey } from '../src/passives/PassiveSaveStore';
import { applyDerivedBonus, combineDerivedBonuses, emptyDerivedBonus } from '../src/status/DerivedBonuses';
import { computeDerivedStats } from '../src/status/DerivedStats';
import { createStatBlock } from '../src/status/StatTypes';
import art from '../src/ui/passiveTree/passiveTreeArt.generated.json';
import { nodeCenter, NODE_FRAME, TREE_UI } from '../src/ui/passiveTree/PassiveTreeLayout';
import { readPng } from './helpers/png';

/** Progress for a character at `level` (rewards granted), then `ids` upgraded in order (each must succeed). */
function progressWith(level: number, ...ids: string[]): PassiveProgress {
  let p = createPassiveProgress();
  syncLevelRewards(p, level);
  for (const id of ids) {
    const r = upgradeNode(p, id);
    assert.ok(r.ok, `upgrade ${id}: ${r.ok ? '' : r.error}`);
    p = r.progress;
  }
  return p;
}

// ------------------------------------------------------------------------------------------- tree data

test('Drifter tree: exactly 10 nodes - center + 3 left + 3 right + 3 down, no upper branch, chained outward', () => {
  const nodes = DRIFTER_TREE.nodes;
  assert.equal(nodes.length, 10);
  const by = (b: string) => nodes.filter((n) => n.branch === b).sort((a, c) => a.step - c.step);
  assert.deepEqual(by('center').map((n) => n.id), ['drifters_resolve']);
  assert.deepEqual(by('left').map((n) => n.id), ['combat_training', 'precision', 'power_strike']);
  assert.deepEqual(by('right').map((n) => n.id), ['basic_guard', 'vitality', 'recovery']);
  assert.deepEqual(by('down').map((n) => n.id), ['swiftness', 'evasion', 'opportunity']);
  for (const branch of ['left', 'right', 'down']) {
    const chain = by(branch);
    assert.deepEqual(chain.map((n) => n.step), [1, 2, 3]);
    assert.equal(chain[0].requires, DRIFTER_TREE.centerId, `${branch} starts at the center`);
    assert.equal(chain[1].requires, chain[0].id);
    assert.equal(chain[2].requires, chain[1].id);
  }
  const icons = Object.fromEntries(nodes.map((n) => [n.id, n.icon]));
  assert.deepEqual(icons, {
    drifters_resolve: 'crossed_swords', combat_training: 'sword', precision: 'crosshair', power_strike: 'impact',
    basic_guard: 'shield', vitality: 'heart', recovery: 'medical_cross', swiftness: 'feather', evasion: 'eye', opportunity: 'star',
  });
  assert.equal(nodes.find((n) => n.id === 'drifters_resolve')!.maxRank, 1);
  for (const n of nodes.filter((x) => x.branch !== 'center')) assert.equal(n.maxRank, 2, n.id);
});

test('layout: no node above the center, branches run left / right / down, every node inside the tree panel', () => {
  const c = nodeCenter('center', 0);
  const [px, py, pw, ph] = TREE_UI.treePanel;
  for (const n of DRIFTER_TREE.nodes) {
    const p = nodeCenter(n.branch, n.step);
    const half = ((n.branch === 'center' ? NODE_FRAME.center.size : NODE_FRAME.branch.size) - 1) / 2;
    assert.ok(p.y >= c.y, `${n.id} is not above the center`);
    if (n.branch === 'left') assert.ok(p.x < c.x && p.y === c.y);
    if (n.branch === 'right') assert.ok(p.x > c.x && p.y === c.y);
    if (n.branch === 'down') assert.ok(p.x === c.x && p.y > c.y);
    assert.ok(p.x - half > px && p.x + half < px + pw - 1 && p.y - half > py && p.y + half < py + ph - 1, `${n.id} inside the panel`);
  }
});

// -------------------------------------------------------------------------------------------- points

test('points: 1 at level 1, +1 per level to 10 points at level 10, nothing after; never granted twice', () => {
  const p = createPassiveProgress();
  assert.equal(syncLevelRewards(p, 1), 1);
  assert.equal(availablePoints(p), 1);
  assert.equal(syncLevelRewards(p, 1), 0, 'same level again: no duplicate');
  for (let level = 2; level <= 10; level++) assert.equal(syncLevelRewards(p, level), 1, `level ${level}`);
  assert.equal(availablePoints(p), 10);
  assert.equal(syncLevelRewards(p, 25), 0, 'levels above 10 give no passive points');
  assert.equal(p.rewardedLevel, 10);
  const jump = createPassiveProgress();
  assert.equal(syncLevelRewards(jump, 7), 7, 'several levels at once');
  assert.equal(syncLevelRewards(jump, 6), 0, 'a lower level never takes points back or re-grants');
});

test('first point must go to Drifter\'s Resolve; nothing else can be upgraded before it', () => {
  const p = progressWith(10);
  for (const n of DRIFTER_TREE.nodes.filter((x) => x.id !== 'drifters_resolve')) assert.equal(checkUpgrade(p, n.id), 'requires', n.id);
  assert.equal(checkUpgrade(p, 'drifters_resolve'), null);
  const after = progressWith(10, 'drifters_resolve');
  for (const id of ['combat_training', 'basic_guard', 'swiftness']) assert.equal(checkUpgrade(after, id), null, `${id} is available after the center`);
  for (const id of ['precision', 'power_strike', 'vitality', 'recovery', 'evasion', 'opportunity']) assert.equal(checkUpgrade(after, id), 'requires', id);
});

test('prerequisites along each branch; branches can be mixed', () => {
  let p = progressWith(10, 'drifters_resolve', 'combat_training');
  assert.equal(checkUpgrade(p, 'precision'), null);
  assert.equal(checkUpgrade(p, 'power_strike'), 'requires');
  p = progressWith(10, 'drifters_resolve', 'combat_training', 'precision', 'power_strike', 'basic_guard', 'swiftness', 'evasion');
  assert.equal(rankOf(p, 'power_strike'), 1);
  assert.equal(checkUpgrade(p, 'vitality'), null, 'mixing: right branch continues');
  assert.equal(checkUpgrade(p, 'opportunity'), null, 'mixing: down branch continues');
  assert.equal(checkUpgrade(p, 'recovery'), 'requires');
});

test('rank caps: center 1, others 2; points run out; unknown nodes rejected', () => {
  let p = progressWith(10, 'drifters_resolve');
  assert.equal(checkUpgrade(p, 'drifters_resolve'), 'maxRank');
  p = progressWith(10, 'drifters_resolve', 'combat_training', 'combat_training');
  assert.equal(checkUpgrade(p, 'combat_training'), 'maxRank');
  assert.equal(checkUpgrade(p, 'nope'), 'unknownNode');
  p = progressWith(3, 'drifters_resolve', 'basic_guard', 'basic_guard');
  assert.equal(availablePoints(p), 0);
  assert.equal(checkUpgrade(p, 'vitality'), 'noPoints');
  const r = upgradeNode(p, 'vitality');
  assert.ok(!r.ok);
  assert.equal(rankOf(p, 'vitality'), 0, 'a failed upgrade changes nothing');
});

test('reset: optional nodes refunded for free, Drifter\'s Resolve stays unlocked', () => {
  const p = progressWith(8, 'drifters_resolve', 'combat_training', 'combat_training', 'basic_guard', 'swiftness', 'evasion');
  assert.equal(availablePoints(p), 2);
  const { progress, refunded } = resetOptionalNodes(p);
  assert.equal(refunded, 5);
  assert.equal(rankOf(progress, 'drifters_resolve'), 1);
  for (const n of DRIFTER_TREE.nodes.filter((x) => x.id !== 'drifters_resolve')) assert.equal(rankOf(progress, n.id), 0);
  assert.equal(availablePoints(progress), 7);
  assert.equal(rankOf(p, 'combat_training'), 2, 'the original is not mutated');
  assert.equal(resetOptionalNodes(progress).refunded, 0);
});

// ------------------------------------------------------------------------------------- status bonuses

test('status: passive bonuses on top of the derived formulas; Vitality multiplies (base + flat) Max HP', () => {
  const total = createStatBlock(1);
  const base = computeDerivedStats(1, total);
  const p = progressWith(10, 'drifters_resolve', 'combat_training', 'combat_training', 'precision', 'basic_guard', 'vitality', 'vitality', 'swiftness', 'evasion', 'opportunity');
  const d = applyDerivedBonus(base, passiveDerivedBonus(p));
  assert.equal(d.meleeAtk, base.meleeAtk + 3 + 6, "Resolve +3, Combat Training 2 x +3");
  assert.equal(d.hit, base.hit + 5);
  assert.equal(d.def, base.def + 3);
  assert.equal(d.mdef, base.mdef + 3);
  assert.equal(d.flee, base.flee + 4);
  assert.equal(d.attackSpeedBonus, base.attackSpeedBonus + 2);
  assert.equal(d.critRate, base.critRate + 1);
  assert.equal(d.maxHp, Math.floor((base.maxHp + 5) * 1.1), 'Max HP = (base + flat) x (1 + 10 %), whole HP (rounded down)');
  assert.equal(applyDerivedBonus({ ...base, maxHp: 120 }, { flat: { maxHp: 5 }, maxHpPercent: 10 }).maxHp, 137, '125 x 1.10 = 137.5 -> 137');
  assert.equal(d.critDamage, base.critDamage, 'untouched stats stay');
  assert.equal(base.meleeAtk, computeDerivedStats(1, total).meleeAtk, 'the formula values are not mutated (no double application)');
});

test('status: other bonus sources combine with passives instead of being overwritten', () => {
  const base = computeDerivedStats(1, createStatBlock(1));
  const equipment = { ...emptyDerivedBonus(), flat: { meleeAtk: 10, maxHp: 20 } };
  const p = progressWith(1, 'drifters_resolve');
  const d = applyDerivedBonus(base, combineDerivedBonuses(passiveDerivedBonus(p), equipment));
  assert.equal(d.meleeAtk, base.meleeAtk + 13);
  assert.equal(d.maxHp, base.maxHp + 25);
  assert.deepEqual(passiveDerivedBonus(undefined), emptyDerivedBonus(), 'no passives = no bonus');
  assert.deepEqual(passiveDerivedBonus(createPassiveProgress()), emptyDerivedBonus(), 'no ranks = no bonus');
});

test('future combat: Power Strike and Recovery are stored modifiers (Heal 30 % -> 36 % at Recovery 2)', () => {
  const p = progressWith(10, 'drifters_resolve', 'combat_training', 'precision', 'power_strike', 'power_strike', 'basic_guard', 'vitality', 'recovery', 'recovery');
  const mods = passiveSkillModifiers(p);
  assert.deepEqual(mods, { singleTargetSkillDamagePercent: 10, healPercent: 20 });
  assert.ok(Math.abs(modifiedHealPercent(30, mods) - 36) < 1e-9);
  assert.ok(Math.abs(modifiedSkillDamage(100, mods) - 110) < 1e-9);
  const bonus = passiveDerivedBonus(p);
  assert.equal(bonus.flat.meleeAtk, 6, 'skill modifiers do not leak into derived stats');
});

// ------------------------------------------------------------------------------------------- tutorial

test('tutorial: open the tree -> select the center -> unlock; closing resumes at "open"; done after unlock', () => {
  let p = progressWith(1);
  assert.equal(tutorialStep(p, false, null), 'open');
  assert.equal(tutorialStep(p, true, null), 'select');
  assert.equal(tutorialStep(p, true, 'combat_training'), 'select', 'only the center continues the tutorial');
  assert.equal(tutorialStep(p, true, 'drifters_resolve'), 'unlock');
  assert.equal(tutorialStep(p, false, 'drifters_resolve'), 'open', 'closed mid-tutorial: guide back to the tree');
  p = progressWith(1, 'drifters_resolve');
  assert.equal(p.tutorial, 'done');
  assert.equal(tutorialStep(p, false, null), null);
  assert.equal(tutorialStep(p, true, 'drifters_resolve'), null);
});

// ----------------------------------------------------------------------------------- save / reload

function withStorage(fn: (store: Map<string, string>) => void): void {
  const store = new Map<string, string>();
  const g = globalThis as { localStorage?: unknown };
  const previous = g.localStorage;
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  };
  try {
    fn(store);
  } finally {
    g.localStorage = previous;
  }
}

/** What CharacterStatusService.loadInto does for passives: load + repair + grant owed rewards + save. */
function reload(name: string, level: number): PassiveProgress {
  const r = PassiveSaveStore.load(name);
  const { progress } = sanitizePassiveProgress(r.kind === 'loaded' ? r.data : null, level);
  PassiveSaveStore.save(name, progress);
  return progress;
}

test('persistence: ranks, points, rewarded level and tutorial survive reloads; reloading never re-grants', () => {
  withStorage((store) => {
    let p = reload('Tester', 4);
    assert.equal(availablePoints(p), 4);
    const r = upgradeNode(p, 'drifters_resolve');
    assert.ok(r.ok);
    p = upgradeNode(r.progress, 'swiftness').ok ? (upgradeNode(r.progress, 'swiftness') as { progress: PassiveProgress }).progress : p;
    PassiveSaveStore.save('Tester', p);
    for (let i = 0; i < 3; i++) {
      const again = reload('Tester', 4);
      assert.deepEqual(again, p, `reload ${i + 1}: identical`);
      assert.equal(availablePoints(again), 2);
    }
    const leveled = reload('tester', 6);
    assert.equal(availablePoints(leveled), 4, 'case-insensitive name; levels 5-6 granted once');
    assert.equal(reload('Tester', 6).rewardedLevel, 6);
    assert.ok(store.has(passiveSaveKey('TESTER')));
    assert.ok(![...store.keys()].some((k) => k.startsWith('xenoblight.status.')), 'the status save is untouched');
  });
});

test('older saves (no passive data) start fresh with the owed level rewards; broken data is repaired', () => {
  withStorage((store) => {
    assert.equal(PassiveSaveStore.load('Old').kind, 'missing');
    const fresh = reload('Old', 7);
    assert.equal(availablePoints(fresh), 7);
    assert.equal(fresh.tutorial, 'pending');

    store.set(passiveSaveKey('Bad'), '{not json');
    assert.equal(PassiveSaveStore.load('Bad').kind, 'invalid');

    const { progress, repaired } = sanitizePassiveProgress(
      { activeTree: 'drifter', rewardedLevel: 3, trees: { drifter: { earned: 99, ranks: { drifters_resolve: 5, combat_training: 2, precision: 2, evasion: 1 } } }, tutorial: 'pending' },
      3,
    );
    assert.equal(rankOf(progress, 'drifters_resolve'), 1, 'clamped to max rank');
    assert.equal(rankOf(progress, 'evasion'), 0, 'missing prerequisite (Swiftness) refunded');
    assert.equal(progress.trees.drifter!.earned, 3, 'earned = rewarded levels, never the stored number');
    assert.ok(availablePoints(progress) >= 0);
    assert.ok(repaired.length > 0);
    assert.equal(progress.tutorial, 'done', 'center unlocked = tutorial done');
    // overspent: optional nodes are reset first
    assert.equal(rankOf(progress, 'combat_training') + rankOf(progress, 'precision') <= 2, true);
  });
});

// ------------------------------------------------------------------------------------- class change

test('prepared class change: Drifter bonuses stop applying, the new tree gets 10 points once', () => {
  const trees = PASSIVE_TREES as unknown as Record<string, PassiveTreeDefinition>;
  trees.test_class = { id: 'test_class' as PassiveTreeId, centerId: 'core', levelRewardsUntil: 0, nodes: [{ id: 'core', icon: 'star', maxRank: 1, branch: 'center', step: 0, requires: null, effects: [{ kind: 'flat', stat: 'def', amount: 1 }] }] };
  try {
    const drifter = progressWith(10, 'drifters_resolve', 'combat_training');
    assert.equal(passiveDerivedBonus(drifter).flat.meleeAtk, 6);
    const changed = changeClassTree(drifter, 'test_class' as PassiveTreeId);
    assert.equal(changed.activeTree, 'test_class');
    assert.deepEqual(passiveDerivedBonus(changed), emptyDerivedBonus(), 'Drifter passives no longer apply');
    assert.equal(availablePoints(changed), 10, 'the new class receives 10 points');
    assert.equal(rankOf(changed, 'combat_training', 'drifter'), 1, 'Drifter ranks are kept (not applied)');
    const back = changeClassTree(changeClassTree(changed, 'drifter'), 'test_class' as PassiveTreeId);
    assert.equal(availablePoints(back), 10, 'the one-time grant is never paid twice');
  } finally {
    delete trees.test_class;
  }
});

// --------------------------------------------------------------------------------------------- art

test('art: chrome layers halved to 1-px lines, 10 crisp icons sliced from the sheet (no blur, no cropping)', () => {
  assert.deepEqual(art.layers.map((l) => l.id), ['01_window_and_panels', '02_header', '06_detail_strip', '07_footer_buttons'], 'placeholder tree layers are not used');
  const pub = (u: string) => path.join(process.cwd(), 'public', u);
  for (const l of art.layers) {
    const img = readPng(pub(l.url));
    assert.equal(img.width, l.width);
    assert.equal(img.height, l.height);
    // every pixel is one of the pack's flat colours (point sampling, no blending)
    const colors = new Set<string>();
    for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3]) colors.add(`${img.data[i]},${img.data[i + 1]},${img.data[i + 2]},${img.data[i + 3]}`);
    for (const c of colors) assert.ok(['14,14,18,255', '231,231,238,255', '58,58,69,255', '211,66,75,255'].includes(c), `${l.id}: unexpected colour ${c}`);
  }
  // the window frame's left edge is exactly one pixel wide
  const frame = readPng(pub(art.layers[0].url));
  const lit = (x: number, y: number) => frame.data[(y * frame.width + x) * 4] > 150;
  assert.ok(lit(0, 200) && !lit(1, 200), 'window border is 1 px');

  const sheet = readPng(pub(art.icons.url));
  const size = art.icons.frameSize;
  assert.equal(sheet.width, size * 10);
  assert.equal(sheet.height, size);
  assert.equal(art.icons.frames.length, 10);
  art.icons.frames.forEach((f, i) => {
    let opaque = 0;
    let partial = 0;
    let minX = size, minY = size, maxX = -1, maxY = -1;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const a = sheet.data[(y * sheet.width + i * size + x) * 4 + 3];
      if (a === 255) opaque++;
      else if (a > 0) partial++;
      if (a) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    }
    assert.equal(partial, 0, `${f.id}: hard alpha only (crisp edges)`);
    assert.ok(opaque > 80, `${f.id}: has content`);
    assert.deepEqual([maxX - minX + 1, maxY - minY + 1], [f.width, f.height], `${f.id}: the whole icon is in its frame (not cropped)`);
    assert.ok(f.width >= 18 && f.height >= 18 && f.width <= size && f.height <= size, `${f.id}: native size ${f.width}x${f.height}`);
    assert.ok(Math.abs(f.grid.pitchX - f.grid.pitchY) < 1e-9, `${f.id}: square pixel grid`);
  });
  // the source sheet is stored unchanged (a PNG with transparency, despite the .jpg export name)
  const src = fs.readFileSync(path.join(process.cwd(), 'art-source/ui/passive_tree_icons/drifter_skill_icon_sheet.png'));
  assert.equal(src.readUInt32BE(0), 0x89504e47);
});
