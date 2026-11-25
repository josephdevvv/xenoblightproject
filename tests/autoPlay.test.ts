import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Point } from '../src/core/types';
import { AUTO_ATTACKER_MS, AUTO_MANUAL_PAUSE_MS, AUTO_POTION_GAP_MS, AUTO_SP_GAP_MS, AUTO_TICK_MS, AutoPlayController, type AutoPlayPort } from '../src/autoplay/AutoPlayController';
import { autoSkillList, chooseTarget, displayedSkillOrder, healSkillOptions, inHuntingArea, lowHp, moveSkill, resolveHealSkill, type AutoCandidate } from '../src/autoplay/AutoPlayRules';
import { AutoPlayService } from '../src/autoplay/AutoPlayService';
import { AUTO_RADIUS, AUTO_RECOVERY_PERCENT, createAutoPlaySettings, sanitizeAutoPlay, snap, type AutoPlayRecovery, type AutoPlaySettings } from '../src/autoplay/AutoPlaySettings';
import type { HotbarState } from '../src/hotbar/Hotbar';
import type { MonsterId } from '../src/monsters/MonsterDefinition';
import type { SkillId } from '../src/skills/SkillDefinitions';
import { AUTO_WINDOW, autoPlayLayout, dropIndex, RECOVERY_ROWS, sliderValue, sliderX } from '../src/ui/autoplay/AutoPlayLayout';
import { hotbarLayout } from '../src/ui/hud/HotbarLayout';
import { newCharacter, saveAndLoad } from './helpers/session';

const settings = (s: Partial<AutoPlaySettings> = {}): AutoPlaySettings => ({ ...createAutoPlaySettings(), ...s });
/** Settings with recovery rules changed (the rest default). */
const recovery = (r: { [K in keyof AutoPlayRecovery]?: Partial<AutoPlayRecovery[K]> }, s: Partial<AutoPlaySettings> = {}): AutoPlaySettings => {
  const base = createAutoPlaySettings().recovery;
  return settings({
    ...s,
    recovery: { hpPotion: { ...base.hpPotion, ...r.hpPotion }, spRecovery: { ...base.spRecovery, ...r.spRecovery }, healSkill: { ...base.healSkill, ...r.healSkill } },
  });
};
const mon = (ref: string, monsterId: MonsterId, x: number, y: number, extra: Partial<AutoCandidate<string>> = {}): AutoCandidate<string> => ({
  ref,
  monsterId,
  position: { x, y },
  alive: true,
  engaged: false,
  ...extra,
});
const ME: Point = { x: 0, y: 0 };

test('settings: defaults, steps (radius 4-18 by 1, every threshold 5-95 by 5), repair of edited data, older files', () => {
  const d = createAutoPlaySettings();
  assert.deepEqual([d.retaliate, d.counterAttackers, d.range], [true, true, { mode: 'radius', radius: 10 }]);
  assert.deepEqual(d.recovery, { hpPotion: { enabled: true, percent: 30 }, spRecovery: { enabled: false, percent: 30 }, healSkill: { enabled: true, percent: 50, skillId: null } });
  assert.deepEqual(d.monsters, ['voidmite', 'mutant_wolf', 'dark_avian', 'mutant_boar']);
  assert.deepEqual(d.knownMonsters, ['voidmite', 'mutant_wolf', 'dark_avian', 'mutant_boar']);
  assert.deepEqual([AUTO_RADIUS.min, AUTO_RADIUS.max, AUTO_RADIUS.step, AUTO_RECOVERY_PERCENT.min, AUTO_RECOVERY_PERCENT.max, AUTO_RECOVERY_PERCENT.step], [4, 18, 1, 5, 95, 5]);
  assert.deepEqual([snap(2, AUTO_RADIUS), snap(30, AUTO_RADIUS), snap(9.6, AUTO_RADIUS), snap(33, AUTO_RECOVERY_PERCENT), snap(0, AUTO_RECOVERY_PERCENT), snap(NaN, AUTO_RADIUS)], [4, 18, 10, 35, 5, 4]);
  assert.deepEqual(sanitizeAutoPlay(undefined), { settings: d, repaired: [] });
  const { settings: s, repaired } = sanitizeAutoPlay({
    monsters: ['voidmite', 'dragon', 'voidmite'],
    skillOrder: ['drifter_heal', 'nope'],
    skillsOff: 'x',
    retaliate: false,
    counterAttackers: 'yes',
    range: { mode: 'map', radius: 99 },
    recovery: { hpPotion: { enabled: false, percent: 33 }, spRecovery: { enabled: true, percent: 120 }, healSkill: { enabled: 'no', percent: 70, skillId: 'fireball' } },
  });
  assert.deepEqual(s, {
    // an older record (no knownMonsters): the Mutant Boar, new since then, is hunted by default
    monsters: ['voidmite', 'mutant_boar'],
    knownMonsters: ['voidmite', 'mutant_wolf', 'dark_avian', 'mutant_boar'],
    skillOrder: ['drifter_heal'],
    skillsOff: [],
    retaliate: false,
    counterAttackers: true,
    range: { mode: 'map', radius: 18 },
    recovery: { hpPotion: { enabled: false, percent: 35 }, spRecovery: { enabled: true, percent: 95 }, healSkill: { enabled: true, percent: 70, skillId: null } },
  });
  assert.ok(repaired.length >= 7, repaired.join());
  assert.deepEqual(sanitizeAutoPlay('bad').settings, d);
  // a file from before the recovery update: its one potion setting becomes the HP Potion rule, the rest default
  const old = sanitizeAutoPlay({ monsters: ['voidmite'], potion: { enabled: false, hpPercent: 45 } });
  assert.deepEqual(old.settings.recovery, { ...d.recovery, hpPotion: { enabled: false, percent: 45 } });
  assert.deepEqual(old.repaired, []);
});

test('settings are saved; Auto Play itself always starts off (also after loading)', () => {
  const c = newCharacter('Alpha');
  AutoPlayService.update(c, (s) => ({
    ...s,
    monsters: ['dark_avian'],
    range: { mode: 'map', radius: 7 },
    recovery: { hpPotion: { enabled: false, percent: 55 }, spRecovery: { enabled: true, percent: 20 }, healSkill: { enabled: true, percent: 65, skillId: 'drifter_heal' } },
    skillOrder: ['drifter_lv1'],
  }));
  AutoPlayService.setOn(c, true);
  assert.equal(AutoPlayService.isOn(c), true);
  const loaded = saveAndLoad(c);
  assert.deepEqual(AutoPlayService.settings(loaded), AutoPlayService.settings(c));
  assert.equal(AutoPlayService.isOn(loaded), false);
  assert.equal(AutoPlayService.toggle(c), false);
  assert.equal(AutoPlayService.toggle(c), true);
  AutoPlayService.setOn(c, false);
});

test('target: nearest selected type inside the circle; whole map ignores the radius', () => {
  const list = [mon('far', 'voidmite', 8, 0), mon('near', 'voidmite', 3, 0), mon('wolf', 'mutant_wolf', 1, 0), mon('dead', 'voidmite', 0.5, 0, { alive: false })];
  const q = { me: ME, anchor: ME, candidates: list, current: null, attacker: null };
  assert.equal(chooseTarget({ ...q, settings: settings({ monsters: ['voidmite'] }) })?.ref, 'near');
  assert.equal(chooseTarget({ ...q, settings: settings() })?.ref, 'wolf', 'every type selected: the nearest of all');
  assert.equal(chooseTarget({ ...q, settings: settings({ monsters: ['voidmite'], range: { mode: 'radius', radius: 2 } }) }), null, 'nothing inside 2 tiles');
  assert.equal(chooseTarget({ ...q, settings: settings({ monsters: [] }) }), null);
  assert.equal(chooseTarget({ ...q, anchor: { x: 9, y: 0 }, settings: settings({ monsters: ['voidmite'], range: { mode: 'radius', radius: 2 } }) })?.ref, 'far', 'inside the circle around the anchor');
  assert.equal(chooseTarget({ ...q, anchor: { x: 100, y: 0 }, settings: settings({ monsters: ['voidmite'], range: { mode: 'map', radius: 4 } }) })?.ref, 'near');
  assert.deepEqual([inHuntingArea({ x: 5, y: 0 }, ME, settings({ range: { mode: 'radius', radius: 4 } })), inHuntingArea({ x: 50, y: 0 }, ME, settings({ range: { mode: 'map', radius: 4 } }))], [false, true]);
});

test('target: retaliate, counter-attack, keep the current target; both toggles can be off', () => {
  const list = [mon('near', 'voidmite', 1, 0), mon('hitter', 'dark_avian', 12, 0), mon('chaser', 'mutant_wolf', 6, 0, { engaged: true }), mon('mine', 'voidmite', 5, 0)];
  const base = { me: ME, anchor: ME, candidates: list, settings: settings({ monsters: ['voidmite'], range: { mode: 'radius', radius: 8 } }) };
  assert.equal(chooseTarget({ ...base, current: 'mine', attacker: 'hitter' })?.ref, 'hitter', 'the attacker first - any type, any range');
  assert.equal(chooseTarget({ ...base, current: 'mine', attacker: null })?.ref, 'chaser', 'then a monster already fighting me');
  const off = { ...base.settings, retaliate: false, counterAttackers: false };
  assert.equal(chooseTarget({ ...base, settings: off, current: 'mine', attacker: 'hitter' })?.ref, 'mine', 'the current target is kept (no switching mid-fight)');
  assert.equal(chooseTarget({ ...base, settings: off, current: null, attacker: 'hitter' })?.ref, 'near');
  assert.equal(chooseTarget({ ...base, current: null, attacker: 'gone' })?.ref, 'chaser', 'an attacker that is not there any more is ignored');
});

const BAR: HotbarState = [{ type: 'item', itemId: 'consumable_red_healing_potion' }, { type: 'skill', skillId: 'drifter_heal' }, null, { type: 'skill', skillId: 'drifter_lv1' }, null, null, null, null];

test('attack skills: only the hotbar attack skills (never potions, never Heal), learned, by drag order; heal skill choice', () => {
  const all = (): boolean => true;
  assert.deepEqual(autoSkillList(BAR, all, settings()), ['drifter_lv1'], 'Heal is a recovery option, not part of the rotation');
  assert.deepEqual(autoSkillList(BAR, (id) => id !== 'drifter_lv1', settings()), []);
  assert.deepEqual(autoSkillList([null, null, null, null, null, null, null, null], all, settings()), []);
  assert.deepEqual(displayedSkillOrder(BAR, settings({ skillOrder: ['drifter_lv1'], skillsOff: ['drifter_lv1'] })), ['drifter_lv1'], 'switched-off skills are still shown');
  const order: SkillId[] = ['drifter_lv1', 'drifter_heal'];
  assert.deepEqual(moveSkill(order, 0, 1), ['drifter_heal', 'drifter_lv1']);
  assert.deepEqual(moveSkill(order, 1, 0), ['drifter_heal', 'drifter_lv1']);
  assert.deepEqual(moveSkill(order, 1, 9), order);
  assert.deepEqual(moveSkill(order, 5, 0), order);
  assert.deepEqual([lowHp(30, 100, 30), lowHp(31, 100, 30), lowHp(100, 100, 95), lowHp(0, 0, 50)], [true, false, false, false]);
  // only LEARNED self-heal skills (on the hotbar or not); the choice falls back to the first learned one
  assert.deepEqual(healSkillOptions(all), ['drifter_heal']);
  assert.deepEqual(healSkillOptions(() => false), []);
  assert.deepEqual([resolveHealSkill(null, ['drifter_heal']), resolveHealSkill('drifter_heal', ['drifter_heal']), resolveHealSkill('drifter_heal', []), resolveHealSkill('drifter_lv1', ['drifter_heal'])], ['drifter_heal', 'drifter_heal', null, 'drifter_heal']);
});

/** A fake world for the controller. */
function world(over: Partial<AutoPlayPort<string>> & { list?: AutoCandidate<string>[] } = {}) {
  const log: string[] = [];
  let time = 0;
  let target: string | null = null;
  let queued = false;
  const state = { hp: 100, me: { x: 0, y: 0 } as Point, moving: false, potions: 99, sp: null as { sp: number; max: number } | null, spItems: 0 };
  const port: AutoPlayPort<string> = {
    now: () => time,
    canAct: () => true,
    me: () => state.me,
    hp: () => state.hp,
    maxHp: () => 100,
    candidates: () => over.list ?? [mon('a', 'voidmite', 2, 0), mon('b', 'voidmite', 5, 0)],
    currentTarget: () => target,
    attack: (t) => {
      target = t;
      queued = false;
      log.push(`attack ${t}`);
    },
    hasQueuedSkill: () => queued,
    inReach: () => true,
    hotbar: () => BAR,
    learned: () => true,
    skillReady: () => true,
    castAttackSkill: (id, t) => {
      queued = true;
      log.push(`skill ${id} ${t}`);
      return true;
    },
    castSelfSkill: (id) => (log.push(`self ${id}`), true),
    drinkPotion: () => {
      if (state.potions <= 0) return false;
      state.potions--;
      log.push('potion');
      return true;
    },
    sp: () => state.sp,
    recoverSp: () => {
      if (state.spItems <= 0) return false;
      state.spItems--;
      log.push('sp');
      return true;
    },
    moveTo: (p) => (log.push(`move ${p.x},${p.y}`), true),
    isMoving: () => state.moving,
    ...over,
  };
  const ctl = new AutoPlayController(port);
  return {
    ctl,
    log,
    state,
    step: (ms: number, s: AutoPlaySettings, on = true) => {
      time += ms;
      ctl.update(on, s);
    },
    setTarget: (t: string | null) => (target = t),
    useQueued: () => (queued = false),
  };
}

test('controller: nearest target, skills by priority then the basic attack loop; off = nothing', () => {
  const w = world();
  w.step(0, settings(), false);
  assert.deepEqual(w.log, []);
  w.step(16, settings());
  assert.deepEqual(w.log, ['attack a', 'skill drifter_lv1 a'], 'Heal is not an attack skill; Power Thrust is queued');
  w.step(16, settings());
  assert.equal(w.log.length, 2, `decisions every ${AUTO_TICK_MS} ms, not every frame`);
  w.step(AUTO_TICK_MS, settings());
  assert.equal(w.log.length, 2, 'a skill already waits for the swing');
  w.useQueued();
  w.step(AUTO_TICK_MS, settings({ skillsOff: ['drifter_lv1'] }));
  assert.equal(w.log.length, 2, 'switched off: the basic attack loop goes on alone');
  w.step(AUTO_TICK_MS, settings());
  assert.deepEqual(w.log.slice(2), ['skill drifter_lv1 a']);
});

test('recovery: each option at its own threshold; Heal only at its threshold; one action per tick', () => {
  // HP 40 %: under the Heal threshold (50) but above the potion threshold (30) - Heal only
  const w = world({ list: [] });
  w.state.hp = 40;
  w.step(AUTO_TICK_MS, recovery({ healSkill: { percent: 50 }, hpPotion: { percent: 30 } }));
  assert.deepEqual(w.log, ['self drifter_heal']);
  // HP 40 %, Heal threshold 30, potion threshold 45 - the potion, not Heal
  const p = world({ list: [] });
  p.state.hp = 40;
  p.step(AUTO_TICK_MS, recovery({ healSkill: { percent: 30 }, hpPotion: { percent: 45 } }));
  assert.deepEqual(p.log, ['potion']);
  // above every threshold: nothing
  const n = world({ list: [] });
  n.state.hp = 80;
  n.step(AUTO_TICK_MS, recovery({ healSkill: { percent: 75 }, hpPotion: { percent: 75 } }));
  assert.deepEqual(n.log, []);
  // both under: Heal first, one action per tick
  const b = world({ list: [] });
  b.state.hp = 10;
  b.step(AUTO_TICK_MS, settings());
  assert.deepEqual(b.log, ['self drifter_heal']);
});

test('recovery: Heal on cooldown / not learned / refused / switched off -> the other options go on; potions are used up', () => {
  const cooling = world({ list: [], skillReady: (id) => id !== 'drifter_heal' });
  cooling.state.hp = 20;
  cooling.step(AUTO_TICK_MS, settings());
  assert.deepEqual(cooling.log, ['potion'], 'cooldown: never cast, the potion instead');
  const unlearned = world({ list: [], learned: (id) => id !== 'drifter_heal' });
  unlearned.state.hp = 20;
  unlearned.step(AUTO_TICK_MS, settings());
  assert.deepEqual(unlearned.log, ['potion']);
  const refused = world({ list: [], castSelfSkill: () => false });
  refused.state.hp = 20;
  refused.step(AUTO_TICK_MS, settings());
  assert.deepEqual(refused.log, ['potion'], 'a skill the game refuses (e.g. its own restrictions) does not block recovery');
  const off = world({ list: [] });
  off.state.hp = 20;
  off.step(AUTO_TICK_MS, recovery({ healSkill: { enabled: false } }));
  assert.deepEqual(off.log, ['potion']);
  // potions: at most one a second, one taken per use, none left -> nothing more
  const v = world({ list: [], skillReady: () => false });
  v.state.hp = 20;
  v.state.potions = 2;
  v.step(AUTO_TICK_MS, settings());
  v.step(AUTO_TICK_MS, settings());
  assert.deepEqual([v.log, v.state.potions], [['potion'], 1], `one potion per ${AUTO_POTION_GAP_MS} ms`);
  v.step(AUTO_POTION_GAP_MS, settings());
  v.step(AUTO_POTION_GAP_MS, settings());
  assert.deepEqual([v.log, v.state.potions], [['potion', 'potion'], 0]);
  const none = world({ list: [], skillReady: () => false });
  none.state.hp = 20;
  none.step(AUTO_TICK_MS, recovery({ hpPotion: { enabled: false } }));
  assert.deepEqual(none.log, [], 'potions off');
});

test('recovery: SP Recovery is prepared - nothing without an SP system / items; with them it works at its own threshold', () => {
  const w = world({ list: [] });
  w.step(AUTO_TICK_MS, recovery({ spRecovery: { enabled: true, percent: 50 } }));
  assert.deepEqual(w.log, [], 'no SP system in the game yet');
  const s = world({ list: [] });
  s.state.sp = { sp: 10, max: 100 };
  s.state.spItems = 0;
  s.step(AUTO_TICK_MS, recovery({ spRecovery: { enabled: true, percent: 50 } }));
  assert.deepEqual(s.log, [], 'no SP item: nothing, and nothing invented');
  s.state.spItems = 2;
  s.step(AUTO_TICK_MS, recovery({ spRecovery: { enabled: true, percent: 5 } }));
  assert.deepEqual(s.log, [], 'above its threshold');
  s.step(AUTO_TICK_MS, recovery({ spRecovery: { enabled: true, percent: 50 } }));
  s.step(AUTO_TICK_MS, recovery({ spRecovery: { enabled: true, percent: 50 } }));
  assert.deepEqual(s.log, ['sp'], `one per ${AUTO_SP_GAP_MS} ms`);
});

test('recovery comes before attacking: a tick that healed queues no attack skill; the next one does', () => {
  const w = world();
  w.state.hp = 20;
  w.step(AUTO_TICK_MS, settings());
  assert.deepEqual(w.log, ['self drifter_heal', 'attack a'], 'healed, the target is kept, no skill queued this tick');
  w.state.hp = 90;
  w.step(AUTO_TICK_MS, settings());
  assert.deepEqual(w.log.slice(2), ['skill drifter_lv1 a']);
  // Heal is never used as an attack, even at full HP with nothing else to do
  const full = world();
  full.step(AUTO_TICK_MS, settings({ skillsOff: ['drifter_lv1'] }));
  assert.deepEqual(full.log, ['attack a']);
});

test('controller: retaliates, pauses after a manual command, idles or walks back into the circle', () => {
  const w = world({ list: [mon('a', 'voidmite', 2, 0), mon('z', 'dark_avian', 9, 0)] });
  w.step(AUTO_TICK_MS, settings({ monsters: ['voidmite'] }));
  w.ctl.notifyAttacked('z');
  w.useQueued();
  w.step(AUTO_TICK_MS, settings({ monsters: ['voidmite'] }));
  assert.equal(w.log[2], 'attack z', w.log.join());
  w.step(AUTO_ATTACKER_MS, settings({ monsters: ['voidmite'], counterAttackers: false }));
  // manual command: nothing for a moment
  const m = world();
  m.ctl.notifyManual();
  m.step(AUTO_TICK_MS, settings());
  assert.deepEqual(m.log, []);
  m.step(AUTO_MANUAL_PAUSE_MS, settings());
  assert.equal(m.log[0], 'attack a');
  // nothing to fight: idle inside the circle, back to its centre when outside
  const i = world({ list: [] });
  i.step(AUTO_TICK_MS, settings({ range: { mode: 'radius', radius: 4 } }));
  assert.deepEqual(i.log, []);
  i.state.me = { x: 10, y: 0 };
  i.step(AUTO_TICK_MS, settings({ range: { mode: 'radius', radius: 4 } }));
  assert.deepEqual(i.log, ['move 0,0']);
  i.state.moving = true;
  i.step(AUTO_TICK_MS, settings({ range: { mode: 'radius', radius: 4 } }));
  assert.equal(i.log.length, 1, 'not re-planned while walking');
  i.step(AUTO_TICK_MS, settings({ range: { mode: 'map', radius: 4 } }));
  assert.equal(i.log.length, 1, 'whole map: nowhere to return to');
  assert.deepEqual(i.ctl.anchor, { x: 10, y: 0 }, 'switching the mode moves the centre to the player');
  const dead = world({ canAct: () => false });
  dead.step(AUTO_TICK_MS, settings());
  assert.deepEqual(dead.log, [], 'cannot act (conversation, death): nothing');
});

test('UI: window fits the screen; cards, slots and controls inside their panels; slider and drop maths; button beside the hotbar', () => {
  const inside = ([x, y, w, h]: readonly number[], [px, py, pw, ph]: readonly number[]): boolean => x >= px && y >= py && x + w <= px + pw && y + h <= py + ph;
  const L = autoPlayLayout(960, 480, 6);
  const [wx, wy, ww, wh] = L.window;
  assert.ok(wx >= 0 && wy >= 0 && wx + ww <= 960 && wy + wh <= 480, L.window.join());
  assert.deepEqual([ww, wh], [AUTO_WINDOW.width, AUTO_WINDOW.height]);
  for (const c of L.monsterCards) assert.ok(inside(c, L.panels.monsters), c.join());
  for (const s of [...L.skillSlots, ...L.skillChecks]) assert.ok(inside(s, L.panels.skills), s.join());
  for (const r of [L.retaliate, L.counter]) assert.ok(inside(r, L.panels.options));
  for (const r of [...L.rangeModes, L.rangeSlider]) assert.ok(inside(r, L.panels.range));
  assert.equal(L.recoveryRows.length, RECOVERY_ROWS.length);
  for (const r of L.recoveryRows) for (const part of [r.toggle, r.slider]) assert.ok(inside(part, L.panels.recovery), part.join());
  assert.ok(inside(L.healPicker, L.panels.recovery));
  L.recoveryRows.forEach((r, i) => i > 0 && assert.ok(r.toggle[1] >= L.recoveryRows[i - 1].slider[1] + L.recoveryRows[i - 1].slider[3], 'rows do not overlap'));
  for (const [a, b] of [[L.panels.options, L.panels.range], [L.panels.range, L.panels.recovery]]) assert.ok(a[1] + a[3] <= b[1], 'panels stacked');
  for (const r of [L.startStop, L.close]) assert.ok(inside(r, L.footer));
  const t = L.rangeSlider;
  assert.deepEqual([sliderValue(t, t[0] - 50, 4, 18, 1), sliderValue(t, t[0] + t[2] + 9, 4, 18, 1), sliderValue(t, t[0] + t[2] / 2, 4, 18, 1)], [4, 18, 11]);
  for (const r of L.recoveryRows) assert.equal(sliderValue(r.slider, sliderX(r.slider, 45, 5, 95), 5, 95, 5), 45);
  assert.deepEqual([dropIndex(L.skillSlots, L.skillSlots[1][0] + 3, 3), dropIndex(L.skillSlots, 9999, 3), dropIndex(L.skillSlots, 0, 0)], [1, 2, 0]);
  const H = hotbarLayout(960, 430);
  const last = H.slots[7];
  assert.ok(H.autoButton.x >= last.x + last.width && H.autoButton.y === last.y && H.autoButton.x + H.autoButton.width <= 960, 'right of slot 8');
});

test('START: once Auto Play really started the window closes (tutorial finished first); STOP keeps it open', () => {
  const read = (f: string): string => fs.readFileSync(path.join(process.cwd(), f), 'utf8');
  const win = read('src/ui/autoplay/AutoPlayWindow.ts');
  const body = win.slice(win.indexOf('private startOrStop(): void {'));
  assert.match(body, /if \(!AutoPlayService\.toggle\(this\.character\)\) return;\s*this\.onStarted\?\.\(\);\s*this\.close\(\);/);
  assert.match(win, /this\.button\(L\.startStop, INV_COLORS\.lineText, \(\) => this\.startOrStop\(\)\)/);
  const ui = read('src/scenes/GameUIScene.ts');
  assert.match(ui, /this\.autoWindow\.onStarted = \(\) => this\.finishAutoTutorialOnStart\(\);/);
  const finish = ui.slice(ui.indexOf('private finishAutoTutorialOnStart(): void {'));
  assert.match(finish, /autoTutorialStep\(quest, true, this\.autoInfoIndex\) !== 'start'/);
  assert.match(finish, /QuestService\.advance07\(character, 'autoTutorialDone'\)/);
});

test('stop: while off nothing is commanded; the attacker it remembered is forgotten, so a restart never retaliates against it', () => {
  const w = world({ list: [mon('a', 'voidmite', 2, 0), mon('z', 'dark_avian', 9, 0)] });
  const s = settings({ monsters: ['voidmite'], counterAttackers: false });
  w.step(AUTO_TICK_MS, s);
  w.ctl.notifyAttacked('z');
  w.ctl.stop();
  w.setTarget(null);
  w.useQueued();
  const before = w.log.length;
  for (let i = 0; i < 10; i++) w.step(AUTO_TICK_MS, s, false);
  assert.equal(w.log.length, before, 'off: no attack, skill, potion or move');
  w.step(AUTO_TICK_MS, s);
  assert.equal(w.log[before], 'attack a', 'restarted: the nearest selected type, not the old attacker');
});

test('stop wiring: switching Auto Play off clears target, swing, skill and path and stands idle (GameScene)', () => {
  const game = fs.readFileSync(path.join(process.cwd(), 'src/scenes/GameScene.ts'), 'utf8');
  assert.match(game, /if \(autoWasOn && !on\) this\.stopAutoPlayActions\(\);/);
  const stop = game.slice(game.indexOf('private stopAutoPlayActions(): void {'));
  const body = stop.slice(0, stop.indexOf('\n  }\n'));
  for (const call of ['this.autoPlay.stop()', 'this.combat.clearTarget()', 'this.player.actions.reset?.()', 'this.player.halt()']) assert.ok(body.includes(call), call);
  assert.ok(!body.includes('AutoPlayService.update'), 'settings untouched');
  const combat = fs.readFileSync(path.join(process.cwd(), 'src/combat/CombatSystem.ts'), 'utf8');
  const clear = combat.slice(combat.indexOf('  clearTarget(): void {'));
  assert.match(clear.slice(0, 500), /this\.queuedSkill = null;[\s\S]*this\.pendingHits = \[\];/, 'the queued skill and the pending swing go with the target');
});

test('Auto Combat: the Mutant Boar is in the selection - new characters hunt it, older saves get it once, an untick sticks', () => {
  assert.ok(createAutoPlaySettings().monsters.includes('mutant_boar'), 'new characters');
  // a save from before the boar (no knownMonsters): the player's own choice is kept and the boar added
  assert.deepEqual(sanitizeAutoPlay({ monsters: ['mutant_wolf'] }).settings.monsters, ['mutant_wolf', 'mutant_boar']);
  assert.deepEqual(sanitizeAutoPlay({ monsters: [] }).settings.monsters, ['mutant_boar'], 'even when nothing else was ticked');
  // a save that already knows the boar: unticked stays unticked, ticked stays ticked
  assert.deepEqual(sanitizeAutoPlay({ monsters: ['voidmite'], knownMonsters: ['voidmite', 'mutant_wolf', 'dark_avian', 'mutant_boar'] }).settings.monsters, ['voidmite']);
  assert.deepEqual(sanitizeAutoPlay({ monsters: ['mutant_boar'], knownMonsters: ['voidmite', 'mutant_wolf', 'dark_avian', 'mutant_boar'] }).settings.monsters, ['mutant_boar']);
  // through a real save / load
  const c = newCharacter('Boar');
  AutoPlayService.update(c, (s) => ({ ...s, monsters: s.monsters.filter((m) => m !== 'mutant_boar') }));
  assert.ok(!saveAndLoad(c).autoPlay!.monsters.includes('mutant_boar'), 'unticked by the player: stays off after loading');
  // the window lists the monster types of the map: Ashen Crossroads now has four, the layout has room for them
  const ui = fs.readFileSync(path.join(process.cwd(), 'src/scenes/GameUIScene.ts'), 'utf8');
  assert.match(ui, /const monsterTypes = \[\.\.\.new Set\(\(MONSTER_SPAWNS\[game\.map\.definition\.id\] \?\? \[\]\)\.map\(\(p\) => p\.monster\)\)\];/);
  assert.equal(autoPlayLayout(AUTO_WINDOW.width + 40, AUTO_WINDOW.height + 40, 4).monsterCards.length, 4);
});
