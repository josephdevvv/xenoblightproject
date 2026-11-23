import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CharacterData } from '../src/data/CharacterData';
import { DIALOGUES } from '../src/dialogue/Dialogues';
import { createHotbar, sanitizeHotbar, slotOfEntry } from '../src/hotbar/Hotbar';
import { HotbarService } from '../src/hotbar/HotbarService';
import { initLanguage, setLanguage, translate } from '../src/i18n';
import { labels } from '../src/i18n/labels';
import { characterInventorySource } from '../src/inventory/CharacterInventorySource';
import { InventoryService } from '../src/inventory/InventoryService';
import { bagIndexOf, itemCount } from '../src/inventory/InventoryState';
import { slotAction } from '../src/inventory/InventorySlots';
import { scrollProblem } from '../src/items/ConsumableUse';
import { ITEM_CATALOG, itemDefinition } from '../src/items/ItemCatalog';
import { itemInfo } from '../src/items/ItemInfoText';
import { MONSTER_DEFINITIONS } from '../src/monsters/MonsterDefinition';
import { PassiveTreeService } from '../src/passives/PassiveTreeService';
import { allocatedQuestExp, remainingQuestExp, TUTORIAL_QUEST_EXP_BUDGET } from '../src/progression/QuestExpBudget';
import { npcQuestMarker } from '../src/quests/QuestMarkers';
import { QuestRewards } from '../src/quests/QuestRewards';
import { QuestService } from '../src/quests/QuestService';
import { trackedQuest } from '../src/quests/QuestTracker';
import { restoreQuest04 } from '../src/quests/TutorialQuest04';
import {
  applyQuest06,
  createQuest06,
  isQuest06AtRoland,
  restoreQuest06,
  scrollGuideOf,
  scrollTutorialStep,
  TUTORIAL_QUEST_06,
  type Quest06Progress,
  type ScrollTutorialView,
} from '../src/quests/TutorialQuest06';
import { isSkillUnlocked } from '../src/skills/ActiveSkills';
import { sanitizeSkills } from '../src/skills/LearnedSkills';
import { DRIFTER_SKILLS, needsTarget, SKILL_DEFINITIONS, skillAtkPercent, skillHealAmount } from '../src/skills/SkillDefinitions';
import { SKILL_CURSOR } from '../src/ui/world/SkillTargetCursor';
import { readPng } from './helpers/png';
import path from 'node:path';
import { SkillService } from '../src/skills/SkillService';
import { skillWindowLayout } from '../src/ui/skills/SkillWindowLayout';
import { newCharacter, saveAndLoad, withoutStorage } from './helpers/session';

const THRUST = 'scroll_power_thrust';
const HEAL = 'scroll_heal';
const ROLAND = 'roland_01';
const AVIAN = MONSTER_DEFINITIONS.dark_avian.id;

/** Gives scrolls the way a quest does (grant ids, so each grant is paid once). */
function giveScroll(c: CharacterData, itemId: string, quantity = 1, grantId = `test:${itemId}:${quantity}`): void {
  assert.equal(InventoryService.grantOnce(c, { grantId, itemId, quantity }), null);
}

/** Uses a scroll as GameScene does: every rule first, then ONE is taken out and the skill is learned. */
function useScroll(c: CharacterData, itemId: string): ReturnType<typeof scrollProblem> {
  const problem = scrollProblem(itemId, { alive: true, blocked: false, quantity: itemCount(c.inventory, itemId), learned: (s) => SkillService.isLearned(c, s) });
  if (problem) return problem;
  assert.ok(InventoryService.consumeOne(c, itemId, bagIndexOf(c.inventory, itemId)));
  assert.ok(SkillService.learn(c, itemDefinition(itemId)!.teaches!));
  return null;
}

test('scroll items: exactly as specified, their own 32x32 icons, consumable and stackable, both languages', () => {
  for (const [id, skill] of [[THRUST, 'drifter_lv1'], [HEAL, 'drifter_heal']] as const) {
    const def = itemDefinition(id)!;
    assert.deepEqual([def.category, def.stackable, def.teaches], ['skill_scroll', true, skill], id);
    assert.deepEqual(def.icon, { url: `assets/items/scrolls/${id}_32x32.png`, width: 32, height: 32 });
  }
  assert.ok(ITEM_CATALOG.has(THRUST) && ITEM_CATALOG.has(HEAL));
  initLanguage(null);
  setLanguage('th');
  assert.deepEqual([labels.itemName(THRUST), labels.itemName(HEAL), labels.skillName('drifter_lv1'), labels.skillName('drifter_heal')], ['คัมภีร์ทิ่มสุดแรง', 'คัมภีร์ฟื้นฟู', 'ทิ่มสุดแรง', 'ฟื้นฟู']);
  setLanguage('en');
  assert.deepEqual([labels.itemName(THRUST), labels.itemName(HEAL), labels.skillName('drifter_lv1'), labels.skillName('drifter_heal')], ['Power Thrust Skill Scroll', 'Healing Skill Scroll', 'Power Thrust', 'Heal']);
  const info = itemInfo(THRUST)!;
  assert.ok(info.effects.some((e) => e.includes('Power Thrust')), info.effects.join());
  setLanguage('th');
});

test('skills: Power Thrust 200 % ATK, 5 SP, 3 s; Heal 30 % of max HP, 15 SP, 30 s; Drifter list order', () => {
  assert.deepEqual(DRIFTER_SKILLS, ['drifter_lv1', 'drifter_heal']);
  const thrust = SKILL_DEFINITIONS.drifter_lv1;
  const heal = SKILL_DEFINITIONS.drifter_heal;
  assert.deepEqual([thrust.kind, skillAtkPercent(thrust), thrust.cooldownMs, thrust.spCost, thrust.scrollItemId], ['attack', 200, 3_000, 5, THRUST]);
  assert.deepEqual([heal.kind, heal.cooldownMs, heal.spCost, heal.scrollItemId], ['heal', 30_000, 15, HEAL]);
  assert.deepEqual([skillHealAmount(heal, 120), skillHealAmount(heal, 77), skillAtkPercent(heal)], [36, 23, null]);
});

test('new characters: no scrolls, nothing learned, nothing on the hotbar', () => {
  const c = newCharacter('Alpha');
  assert.deepEqual([itemCount(c.inventory, THRUST), itemCount(c.inventory, HEAL)], [0, 0]);
  assert.deepEqual(SkillService.state(c).learned, []);
  assert.deepEqual(HotbarService.state(c), createHotbar());
  for (const id of DRIFTER_SKILLS) assert.equal(isSkillUnlocked(c, id), false);
});

test('using a scroll: exactly one is used and the skill is learned for good; a known skill uses nothing', () => {
  withoutStorage(() => {
    const c = newCharacter('Alpha');
    giveScroll(c, THRUST, 2);
    const learned: string[] = [];
    const off = SkillService.onLearned((x, id) => x === c && learned.push(id));
    assert.equal(useScroll(c, THRUST), null);
    assert.deepEqual([itemCount(c.inventory, THRUST), SkillService.isLearned(c, 'drifter_lv1'), learned], [1, true, ['drifter_lv1']]);
    assert.equal(useScroll(c, THRUST), 'alreadyLearned');
    assert.equal(itemCount(c.inventory, THRUST), 1, 'nothing consumed');
    assert.equal(SkillService.learn(c, 'drifter_lv1'), false, 'never twice');
    assert.equal(SkillService.isLearned(c, 'drifter_heal'), false, 'only its own skill');
    off();
    // the other rules
    const ctx = { alive: true, blocked: false, quantity: 1, learned: () => false };
    assert.equal(scrollProblem(HEAL, { ...ctx, alive: false }), 'dead');
    assert.equal(scrollProblem(HEAL, { ...ctx, blocked: true }), 'blocked');
    assert.equal(scrollProblem(HEAL, { ...ctx, quantity: 0 }), 'none');
    assert.equal(scrollProblem('consumable_red_healing_potion', ctx), 'notScroll');
    assert.equal(scrollProblem(HEAL, ctx), null);
  });
});

test('item panel: a scroll offers only USE (not equip, not the consumable USE + ASSIGN pair)', () => {
  const c = newCharacter('Alpha');
  giveScroll(c, HEAL);
  const source = characterInventorySource(c);
  const index = bagIndexOf(c.inventory, HEAL);
  assert.deepEqual(slotAction(source, { kind: 'bag', index }), { kind: 'scroll', itemId: HEAL });
  assert.equal(source.consumableAt?.(index), null);
});

test('hotbar: skills only once learned; items and skills side by side; one slot per entry; kept in the save file', () => {
  withoutStorage(() => {
    const c = newCharacter('Alpha');
    const thrust = { type: 'skill', skillId: 'drifter_lv1' } as const;
    assert.equal(HotbarService.assign(c, 0, thrust), false, 'locked skills cannot be assigned');
    giveScroll(c, THRUST);
    giveScroll(c, HEAL);
    assert.equal(useScroll(c, THRUST), null);
    assert.equal(HotbarService.assign(c, 0, thrust), true);
    assert.equal(HotbarService.assign(c, 5, thrust), true);
    assert.equal(slotOfEntry(HotbarService.state(c), thrust), 5, 'moved, not doubled');
    assert.equal(HotbarService.assign(c, 8, thrust), false);
    assert.equal(HotbarService.assign(c, 1, { type: 'skill', skillId: 'drifter_heal' }), false, 'Heal is not learned yet');
    // a potion beside the skill
    giveScroll(c, 'consumable_red_healing_potion', 3);
    assert.equal(HotbarService.assignItem(c, 1, 'consumable_red_healing_potion'), true);
    const loaded = saveAndLoad(c);
    assert.deepEqual(HotbarService.state(loaded).slice(0, 6), [null, { type: 'item', itemId: 'consumable_red_healing_potion' }, null, null, null, thrust]);
    assert.deepEqual([SkillService.state(loaded).learned, itemCount(loaded.inventory, THRUST), itemCount(loaded.inventory, HEAL)], [['drifter_lv1'], 0, 1]);
    // an edited file: unknown or repeated skills are dropped
    assert.deepEqual(sanitizeSkills({ learned: ['drifter_heal', 'drifter_heal', 'invented', 7] }).state.learned, ['drifter_heal']);
    assert.deepEqual(sanitizeSkills('nope').state.learned, []);
    assert.deepEqual(sanitizeHotbar([thrust, thrust]).state.slice(0, 2), [thrust, null], 'a skill appears once');
  });
});

// ---------------------------------------------------------------------------------------------
// Tutorial Quest 06 (Dark Avian hunt)
// ---------------------------------------------------------------------------------------------

const p = (state: Quest06Progress['state'], kills = 0): Quest06Progress => ({ state, kills });
const view = (v: Partial<ScrollTutorialView>): ScrollTutorialView => ({
  learned: false,
  hasScroll: true,
  inventoryOpen: false,
  scrollSelected: false,
  skillsOpen: false,
  skillSelected: false,
  assignOpen: false,
  ...v,
});

test('quest 06 rules: the order of the states, kills only while hunting (capped at 10), restored saves', () => {
  let q: Quest06Progress | null = createQuest06();
  for (const e of ['offer', 'talk', 'scrollGiven', 'skillAssigned', 'finalTalk', 'startHunt'] as const) {
    assert.equal(applyQuest06(q!, 'kill'), null, `no kills before the hunt (${q!.state})`);
    q = applyQuest06(q!, e);
    assert.ok(q, e);
  }
  assert.deepEqual(q, p('HUNTING'));
  for (let i = 0; i < 12; i++) q = applyQuest06(q!, 'kill') ?? q;
  assert.deepEqual(q, p('READY_TO_TURN_IN', 10));
  assert.deepEqual(applyQuest06(q!, 'complete'), p('COMPLETED', 10));
  assert.equal(applyQuest06(p('OFFERED'), 'scrollGiven'), null, 'no scroll before the conversation');
  assert.deepEqual(applyQuest06(p('INTRO_DIALOGUE'), 'cancelTalk'), p('OFFERED'));
  assert.deepEqual(applyQuest06(p('FINAL_DIALOGUE'), 'cancelFinal'), p('SKILL_ASSIGNED'));
  assert.deepEqual(
    (['NOT_STARTED', 'OFFERED', 'INTRO_DIALOGUE', 'SCROLL_TUTORIAL', 'SKILL_ASSIGNED', 'FINAL_DIALOGUE', 'HUNTING', 'READY_TO_TURN_IN', 'COMPLETED'] as const).map((s) => isQuest06AtRoland(p(s))),
    [false, true, true, false, true, true, false, true, false],
  );
  // restore
  assert.deepEqual(restoreQuest06({ state: 'INTRO_DIALOGUE' }, false), p('OFFERED'), 'cut off before the scroll: start over');
  assert.deepEqual(restoreQuest06({ state: 'INTRO_DIALOGUE' }, true), p('SCROLL_TUTORIAL'), 'the scroll was given: the tutorial goes on');
  assert.deepEqual(restoreQuest06({ state: 'FINAL_DIALOGUE' }, true), p('SKILL_ASSIGNED'));
  assert.deepEqual(restoreQuest06({ state: 'HUNTING', kills: 4.7 }, true), p('HUNTING', 4));
  assert.deepEqual(restoreQuest06({ state: 'HUNTING', kills: 99 }, true), p('READY_TO_TURN_IN', 10));
  assert.deepEqual(restoreQuest06({ state: 'HUNTING', kills: -3 }, true), p('HUNTING', 0));
  assert.deepEqual(restoreQuest06({ state: 'bogus' }, true), createQuest06());
  assert.deepEqual(restoreQuest06(null, true), createQuest06());
});

test('scroll tutorial steps: from what is really open, selected and learned; guide lines 11-13', () => {
  const s = p('SCROLL_TUTORIAL');
  assert.equal(scrollTutorialStep(p('HUNTING'), view({})), null);
  assert.equal(scrollTutorialStep(s, view({})), 'openInventory');
  assert.equal(scrollTutorialStep(s, view({ inventoryOpen: true })), 'selectScroll');
  assert.equal(scrollTutorialStep(s, view({ inventoryOpen: true, scrollSelected: true })), 'useScroll');
  assert.equal(scrollTutorialStep(s, view({ hasScroll: false })), null, 'never a dead end without the scroll');
  assert.equal(scrollTutorialStep(s, view({ learned: true, hasScroll: false, inventoryOpen: true })), 'openSkills');
  assert.equal(scrollTutorialStep(s, view({ learned: true, skillsOpen: true })), 'selectSkill');
  assert.equal(scrollTutorialStep(s, view({ learned: true, skillsOpen: true, skillSelected: true })), 'assignSkill');
  assert.equal(scrollTutorialStep(s, view({ learned: true, skillsOpen: true, skillSelected: true, assignOpen: true })), 'chooseSlot');
  assert.deepEqual(
    (['openInventory', 'selectScroll', 'useScroll', 'openSkills', 'selectSkill', 'assignSkill', 'chooseSlot'] as const).map(scrollGuideOf),
    ['learn', 'learn', 'learn', 'openSkills', 'assign', 'assign', 'assign'],
  );
});

/** A character whose Mutant Wolf hunt is turned in (earlier quests have their own tests). */
function afterWolves(name: string): CharacterData {
  const c = newCharacter(name);
  assert.equal(PassiveTreeService.upgrade(c, 'drifters_resolve'), null, 'as in play: the first passive node is unlocked');
  c.quests = {
    ...c.quests!,
    tutorial_01_find_mateus: { state: 'PASSIVE_TUTORIAL_STARTED', autoStart: true, rewardClaimed: false },
    tutorial_02_rusty_dagger: { state: 'TURNED_IN' },
    tutorial_03_void_mite_hunt: { state: 'COMPLETED', kills: 5 },
    tutorial_04_potion_training: restoreQuest04({ state: 'COMPLETED', useExplained: true }),
    tutorial_05_mutant_wolf_hunt: { state: 'COMPLETED', kills: 5 },
  };
  QuestService.sync(c);
  return c;
}

test('Dark Avian hunt: yellow !, intro, scroll once, tutorial, line 14, 10 Dark Avians, 150 EXP once; markers, tracker, saves', () => {
  withoutStorage(() => {
    initLanguage(null);
    setLanguage('th');
    const c = afterWolves('Alpha');
    const exp = (): [number, number] => [c.status.level, c.status.exp];
    assert.deepEqual([QuestService.quest06(c).state, npcQuestMarker(c, ROLAND), trackedQuest(c)], ['OFFERED', 'available', { questId: TUTORIAL_QUEST_06.id, objectiveKey: 'objective' }]);
    // intro (lines 1-10); the scroll is given when line 10 is clicked through - once
    assert.ok(QuestService.advance06(c, 'talk'));
    assert.equal(npcQuestMarker(c, ROLAND), 'available');
    assert.deepEqual(QuestService.quest06(saveAndLoad(c)).state, 'OFFERED', 'a cut-off conversation starts over');
    assert.equal(InventoryService.grantOnce(c, TUTORIAL_QUEST_06.reward), null);
    assert.equal(InventoryService.grantOnce(c, TUTORIAL_QUEST_06.reward), 'alreadyGranted');
    assert.ok(QuestService.advance06(c, 'scrollGiven'));
    assert.deepEqual([itemCount(c.inventory, THRUST), itemCount(c.inventory, HEAL)], [1, 0], 'one Power Thrust scroll, no Heal scroll');
    assert.deepEqual([npcQuestMarker(c, ROLAND), trackedQuest(c)?.objectiveKey], ['inProgress', 'objectiveTutorial']);
    const midTutorial = saveAndLoad(c);
    assert.deepEqual([QuestService.quest06(midTutorial).state, itemCount(midTutorial.inventory, THRUST)], ['SCROLL_TUTORIAL', 1]);
    // learn, then the hotkey ends the tutorial (only Power Thrust, only after learning)
    assert.equal(QuestService.skillAssigned(c, 'drifter_lv1'), false, 'not before it is learned');
    assert.equal(QuestService.quest06(c).state, 'SCROLL_TUTORIAL');
    assert.equal(useScroll(c, THRUST), null);
    assert.equal(HotbarService.assign(c, 2, { type: 'skill', skillId: 'drifter_lv1' }), true);
    assert.equal(QuestService.skillAssigned(c, 'drifter_heal'), false);
    assert.ok(QuestService.skillAssigned(c, 'drifter_lv1'));
    assert.deepEqual([QuestService.quest06(c).state, npcQuestMarker(c, ROLAND), trackedQuest(c)?.objectiveKey], ['SKILL_ASSIGNED', 'inProgress', 'objectiveReturn']);
    // line 14 starts the hunt; Dark Avians killed before it never count
    assert.equal(QuestService.recordKill(c, AVIAN), false);
    assert.ok(QuestService.advance06(c, 'finalTalk'));
    assert.ok(QuestService.advance06(c, 'startHunt'));
    assert.deepEqual([QuestService.quest06(c), npcQuestMarker(c, ROLAND)], [p('HUNTING'), 'inProgress']);
    assert.equal(QuestService.recordKill(c, MONSTER_DEFINITIONS.mutant_wolf.id), false, 'only Dark Avians');
    const before = exp();
    for (let i = 0; i < 4; i++) QuestService.recordKill(c, AVIAN);
    assert.deepEqual(exp(), before, 'quest kills pay no EXP here (monster EXP is separate)');
    assert.deepEqual(QuestService.quest06(saveAndLoad(c)), p('HUNTING', 4), 'kept in the save file');
    const tracked = (): string => {
      const t = trackedQuest(c)!;
      return translate(`quests.${t.questId}.${t.objectiveKey}`, t.params);
    };
    assert.equal(tracked(), 'กำจัด Dark Avian (4/10)');
    setLanguage('en');
    assert.equal(tracked(), 'Defeat Dark Avians (4/10)');
    for (let i = 0; i < 9; i++) QuestService.recordKill(c, AVIAN);
    assert.equal(tracked(), 'Defeat Dark Avians (10/10)');
    setLanguage('th');
    assert.deepEqual([QuestService.quest06(c), npcQuestMarker(c, ROLAND)], [p('READY_TO_TURN_IN', 10), 'completed']);
    // turn-in by talking to Roland: 150 EXP once, nothing else
    const items = JSON.stringify(c.inventory);
    const r = QuestRewards.quest06(c);
    assert.ok(r.ok && r.exp === 150, JSON.stringify(r));
    for (let i = 0; i < 3; i++) assert.equal(QuestRewards.quest06(c).ok, false);
    assert.equal(JSON.stringify(c.inventory), items, 'no items (the Heal scroll is not given by this quest)');
    const loaded = saveAndLoad(c);
    assert.equal(QuestRewards.quest06(loaded).ok, false, 'loaded: never paid again');
    assert.deepEqual([QuestService.quest06(loaded).state, npcQuestMarker(loaded, ROLAND), trackedQuest(loaded)], ['COMPLETED', null, null], 'no marker, no path');
    assert.deepEqual(SkillService.state(loaded).learned, ['drifter_lv1']);
  });
});

test('Dark Avian hunt: not offered before the wolves are turned in; EXP budget 600 / 900', () => {
  const c = newCharacter('Beta');
  QuestService.sync(c);
  assert.deepEqual([QuestService.quest06(c).state, npcQuestMarker(c, ROLAND)], ['NOT_STARTED', null]);
  assert.equal(TUTORIAL_QUEST_EXP_BUDGET.allocations.tutorial_06_dark_avian_hunt, 150);
  assert.deepEqual([allocatedQuestExp(), remainingQuestExp()], [600, 300]);
});

test('dialogue: Thai lines exactly as written, English translations, the Dark Avian with line 9', () => {
  const lines = (id: keyof typeof DIALOGUES, language: 'th' | 'en'): string[] => {
    setLanguage(language);
    return DIALOGUES[id].map((k) => translate(k));
  };
  assert.deepEqual(lines('roland_avian_intro', 'th'), [
    'เอาล่ะเจ้าพร้อมหรือยังกับบททดสอบ',
    'อยากฟังเรื่องเล่าก่อนหรอ โอเคๆ คือตอนเนี้ยโลกของเรามันเกิดเหตุแปลกๆ',
    'เมื่อ 5 ปีที่แล้วมีตัวอะไรก็ไม่รู้ขี่เรือแปลกๆลอยมาจากฟ้า',
    'ลงมาแล้วพวกนั้นมีหน้าตาประหลาดและดูไม่เหมือนสิ่งมีชีวิตที่เคยเห็นมาก่อน',
    'และหลังจากวันนั้นโลกก็ไม่เหมือนเดิมอีกต่อไป',
    'สิ่งมีชีวิตกลายพันธุ์กลายเป็นอย่างที่เจ้าเห็นนี่แหละ',
    'เจ้าจำอะไรไม่ได้เลยอย่างงั้นหรือ?',
    'น่าสงสารจริงๆ แต่ชีวิตต้องก้าวต่อไปนะ หลงเดินเข้ามาทางนี้แล้ว',
    'กลับที่บททดสอบ จงไปกำจัด Dark Avian ให้หน่อย เดินไปทางเหนือขึ้นไปอีกก็จะเจอ',
    'รอบนี้ขอซัก 10 ตัวนะ เอ้ย เกือบลืมไปเลย มีของจะให้นี่น่า',
  ]);
  assert.deepEqual(
    [lines('roland_avian_scroll', 'th'), lines('roland_avian_skills', 'th'), lines('roland_avian_hotkey', 'th'), lines('roland_avian_go', 'th')].flat(),
    ['เปิดช่องเก็บของแล้วเลือกไปที่คัมภีร์ กดใช้งานแล้วเจ้าจะได้รับพลัง', 'ลองกดเข้าไปดูที่หน้าต่างสกิลสิ มันจะมีบอกรายละเอียดของสกิลอยู่', 'กดไปที่สกิลแล้วตั้งค่าคีย์ลัดเข้าไปเพื่อใช้งานง่ายๆได้เลย', 'เอาล่ะ ไปลุยได้เลย'],
  );
  const en = lines('roland_avian_intro', 'en');
  assert.equal(en.length, 10);
  assert.ok(en.every((l) => l.length > 0 && !l.startsWith('dialogues.')));
  assert.equal(lines('roland_avian_go', 'en')[0], 'Alright, off you go.');
  setLanguage('th');
  assert.equal(TUTORIAL_QUEST_06.previewStep, 8, 'the picture with line 9');
  assert.deepEqual(TUTORIAL_QUEST_06.guideDialogueIds, { learn: 'roland_avian_scroll', openSkills: 'roland_avian_skills', assign: 'roland_avian_hotkey' });
});

test('Skill window layout: rows in the list, details and ASSIGN HOTKEY inside the detail panel, fits the screen', () => {
  const inside = ([x, y, w, h]: readonly number[], [px, py, pw, ph]: readonly number[]): boolean => x >= px && y >= py && x + w <= px + pw && y + h <= py + ph;
  for (const [sw, sh] of [[960, 480], [800, 450]] as const) {
    const L = skillWindowLayout(sw, sh, DRIFTER_SKILLS.length);
    const [wx, wy, ww, wh] = L.window;
    assert.ok(wx >= 0 && wy >= 0 && wx + ww <= sw && wy + wh <= sh, `${sw}x${sh}: ${L.window.join()}`);
    for (const r of L.rows) assert.ok(inside(r, L.panels.list), r.join());
    assert.ok(L.rows[1][1] >= L.rows[0][1] + L.rows[0][3], 'rows do not overlap');
    assert.ok(L.panels.detail[1] > L.panels.list[1] + L.panels.list[3] - 1, 'details below the list');
    assert.ok(inside(L.detail.icon, L.panels.detail));
    assert.ok(inside(L.detail.button, L.panels.detail));
    assert.ok(L.detail.button[1] > L.detail.cooldownY + 12, 'the button is below every text line');
    assert.ok(inside(L.close, L.footer));
  }
});

test('targeting: Power Thrust needs a target (target-select mode), Heal never does (cast at once on the player)', () => {
  assert.deepEqual(DRIFTER_SKILLS.map((id) => needsTarget(SKILL_DEFINITIONS[id])), [true, false]);
});

test('skill cursor: the delivered 2-frame sheet; both frames hold all of its pixels and share one click point', () => {
  const png = readPng(path.join(process.cwd(), 'public', SKILL_CURSOR.url));
  assert.deepEqual([png.width, png.height], [SKILL_CURSOR.sheetWidth, SKILL_CURSOR.sheetHeight]);
  const [idle, press] = SKILL_CURSOR.frames;
  assert.deepEqual([idle[2], idle[3]], [press[2], press[3]], 'same frame size');
  const inside = (x: number, y: number, [fx, fy, fw, fh]: readonly number[]): boolean => x >= fx && y >= fy && x < fx + fw && y < fy + fh;
  const counts = [0, 0];
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.data[(y * png.width + x) * 4 + 3] === 0) continue;
      const k = SKILL_CURSOR.frames.findIndex((fr) => inside(x, y, fr));
      assert.ok(k >= 0, `pixel (${x}, ${y}) outside both frames`);
      counts[k]++;
    }
  }
  assert.ok(counts[0] > 0 && counts[1] > 0, counts.join());
  // the drawing of each frame is centred on the hotspot: the click point does not move between idle and pressed
  for (const fr of SKILL_CURSOR.frames) {
    let minX = 99, maxX = -1, minY = 99, maxY = -1;
    for (let y = fr[1]; y < fr[1] + fr[3]; y++) for (let x = fr[0]; x < fr[0] + fr[2]; x++) if (png.data[(y * png.width + x) * 4 + 3] > 0) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    assert.deepEqual([(minX + maxX + 1) / 2 - fr[0], (minY + maxY + 1) / 2 - fr[1]], [SKILL_CURSOR.hotspot.x, SKILL_CURSOR.hotspot.y]);
  }
});
