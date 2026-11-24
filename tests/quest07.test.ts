import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import type { CharacterData } from '../src/data/CharacterData';
import { DIALOGUES } from '../src/dialogue/Dialogues';
import { initLanguage, setLanguage, translate } from '../src/i18n';
import { InventoryService } from '../src/inventory/InventoryService';
import { INVENTORY_SLOT_COUNT } from '../src/inventory/InventorySlots';
import { itemCount } from '../src/inventory/InventoryState';
import { npcQuestMarker } from '../src/quests/QuestMarkers';
import { QuestRewards } from '../src/quests/QuestRewards';
import { QuestService } from '../src/quests/QuestService';
import { trackedQuest } from '../src/quests/QuestTracker';
import { restoreQuest04 } from '../src/quests/TutorialQuest04';
import { TUTORIAL_QUEST_06 } from '../src/quests/TutorialQuest06';
import {
  applyQuest07,
  autoTutorialStep,
  createQuest07,
  isQuest07AtRoland,
  isQuest07Ready,
  isQuest07ToSonny,
  potionHotkeyFinished,
  potionHotkeyStep,
  restoreQuest07,
  TUTORIAL_QUEST_07,
  type PotionHotkeyView,
  type Quest07Progress,
} from '../src/quests/TutorialQuest07';
import { CharacterStatusService } from '../src/status/CharacterStatusService';
import { GoldService } from '../src/economy/GoldService';
import { newCharacter, saveAndLoad, withoutStorage } from './helpers/session';

const HP = 'consumable_red_healing_potion';
const SP = 'consumable_sp_recovery_potion';
const ROLAND = 'roland_01';
const active = (over: Partial<Quest07Progress> = {}): Quest07Progress => ({ state: 'ACTIVE', potionTutorialDone: false, autoTutorialDone: false, ...over });
const view = (v: Partial<PotionHotkeyView> = {}): PotionHotkeyView => ({ spInBag: true, wHasSp: false, inventoryOpen: false, spSelected: false, ...v });

/** What GameScene does at the last line of Roland's talk. */
function accept07(c: CharacterData): boolean {
  if (QuestService.quest07(c).state !== 'OFFERED') return false;
  for (const supply of TUTORIAL_QUEST_07.supplies) {
    const error = InventoryService.grantOnce(c, supply);
    if (error !== null && error !== 'alreadyGranted') return false;
  }
  return QuestService.advance07(c, 'accept');
}

/** A character whose Dark Avian hunt is 10/10 (earlier quests have their own tests). */
function readyForRoland(name: string): CharacterData {
  const c = newCharacter(name);
  c.quests = {
    ...c.quests!,
    tutorial_01_find_mateus: { state: 'PASSIVE_TUTORIAL_STARTED', autoStart: true, rewardClaimed: false },
    tutorial_02_rusty_dagger: { state: 'TURNED_IN' },
    tutorial_03_void_mite_hunt: { state: 'COMPLETED', kills: 5 },
    tutorial_04_potion_training: restoreQuest04({ state: 'COMPLETED', useExplained: true }),
    tutorial_05_mutant_wolf_hunt: { state: 'COMPLETED', kills: 5 },
    tutorial_06_dark_avian_hunt: { state: 'READY_TO_TURN_IN', kills: 10 },
  };
  return c;
}

test('rules: offer > accept; the tutorials one after the other, each once; restored saves', () => {
  let q: Quest07Progress | null = createQuest07();
  assert.equal(applyQuest07(q, 'accept'), null, 'not before the offer');
  q = applyQuest07(q, 'offer')!;
  assert.equal(applyQuest07(q, 'potionTutorialDone'), null, 'not before acceptance');
  q = applyQuest07(q, 'accept')!;
  assert.equal(applyQuest07(q, 'autoTutorialDone'), null, 'the potion tutorial comes first');
  q = applyQuest07(q, 'potionTutorialDone')!;
  assert.equal(applyQuest07(q, 'potionTutorialDone'), null, 'once');
  q = applyQuest07(q, 'autoTutorialDone')!;
  assert.deepEqual(q, active({ potionTutorialDone: true, autoTutorialDone: true }));
  assert.equal(applyQuest07(q, 'offer'), null);
  assert.deepEqual(restoreQuest07({ state: 'ACTIVE', potionTutorialDone: true, autoTutorialDone: true }), q);
  assert.deepEqual(restoreQuest07({ state: 'ACTIVE', potionTutorialDone: false, autoTutorialDone: true }), active(), 'auto never before potion');
  assert.deepEqual(restoreQuest07({ state: 'OFFERED', potionTutorialDone: true }), { state: 'OFFERED', potionTutorialDone: false, autoTutorialDone: false });
  assert.deepEqual(restoreQuest07({ state: 'COMPLETED', potionTutorialDone: true, autoTutorialDone: true }), { state: 'COMPLETED', potionTutorialDone: true, autoTutorialDone: true });
  assert.deepEqual(restoreQuest07({ state: 'TURN_IN_DIALOGUE' }).state, 'ACTIVE', 'an unfinished turn-in talk (nothing paid) waits again');
  assert.deepEqual(restoreQuest07({ state: 'DONE' }), createQuest07());
  assert.deepEqual(restoreQuest07(null), createQuest07());
});

test('potion hotkey tutorial: Inventory > SP potion > ASSIGN (W) > CLOSE; never a dead end', () => {
  const q = active();
  assert.equal(potionHotkeyStep(q, view()), 'openInventory');
  assert.equal(potionHotkeyStep(q, view({ inventoryOpen: true })), 'selectSp');
  assert.equal(potionHotkeyStep(q, view({ inventoryOpen: true, spSelected: true })), 'assign');
  assert.equal(potionHotkeyStep(q, view({ inventoryOpen: true, wHasSp: true })), 'closeInventory');
  assert.equal(potionHotkeyStep(q, view({ wHasSp: true })), null);
  assert.equal(potionHotkeyFinished(q, view({ wHasSp: true })), true, 'assigned and the Inventory closed: done');
  assert.equal(potionHotkeyFinished(q, view({ inventoryOpen: true })), false);
  assert.equal(potionHotkeyFinished(q, view({ spInBag: false })), true, 'without the potion it ends instead of blocking');
  assert.equal(potionHotkeyStep(active({ potionTutorialDone: true }), view()), null);
  assert.equal(potionHotkeyStep({ ...active(), state: 'OFFERED' }, view()), null);
});

test('Auto Combat tutorial: button > monsters, skills, combat, range, recovery (a line each) > START', () => {
  const q = active({ potionTutorialDone: true });
  assert.equal(autoTutorialStep(active(), false, 0), null, 'after the potion tutorial');
  assert.equal(autoTutorialStep(q, false, 0), 'open');
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => autoTutorialStep(q, true, i)), ['monsters', 'skills', 'options', 'range', 'recovery', 'start']);
  assert.equal(autoTutorialStep(q, false, 3), 'open', 'window closed: open it again, the lines go on where they were');
  assert.equal(autoTutorialStep({ ...q, autoTutorialDone: true }, true, 5), null);
  for (const id of Object.values(TUTORIAL_QUEST_07.autoGuideDialogueIds)) assert.equal(DIALOGUES[id].length, 1, id);
});

test('turn-in talk: line 1 pays 150 EXP + Heal scroll once; the last line accepts with 80 HP + 50 SP potions once', () => {
  withoutStorage(() => {
    const c = readyForRoland('Alpha');
    assert.deepEqual([npcQuestMarker(c, ROLAND), QuestService.quest07(c).state], ['completed', 'NOT_STARTED']);
    assert.ok(QuestService.advance06(c, 'turnIn'));
    const before = c.status.exp + c.status.level * 1_000_000;
    const r = QuestRewards.quest06(c);
    assert.ok(r.ok && r.exp === 150);
    assert.ok(c.status.exp + c.status.level * 1_000_000 > before, 'EXP paid through gainExp');
    assert.equal(itemCount(c.inventory, 'scroll_heal'), 1);
    assert.equal(QuestService.quest07(c).state, 'OFFERED', 'offered at once (the same talk)');
    assert.ok(accept07(c));
    assert.deepEqual([itemCount(c.inventory, HP), itemCount(c.inventory, SP)], [80, 50]);
    assert.equal(accept07(c), false, 'never twice');
    assert.deepEqual([itemCount(c.inventory, HP), itemCount(c.inventory, SP), itemCount(c.inventory, 'scroll_heal')], [80, 50, 1]);
    assert.equal(npcQuestMarker(c, ROLAND), 'inProgress');
    // the objective follows the level
    initLanguage(null);
    setLanguage('th');
    const text = (): string => {
      const t = trackedQuest(c)!;
      return translate(`quests.${t.questId}.${t.objectiveKey}`, t.params);
    };
    assert.equal(text(), `เก็บเลเวลให้ถึง 10 (Lv ${c.status.level}/10)`);
    CharacterStatusService.gainExp(c, 5_000);
    assert.equal(text(), 'กลับไปหา Roland', 'Lv 10 reached: back to Roland');
    setLanguage('en');
    assert.equal(text(), 'Return to Roland');
    setLanguage('th');
    // saved: state, tutorial progress, rewards - nothing repeats after loading
    QuestService.advance07(c, 'potionTutorialDone');
    const loaded = saveAndLoad(c);
    assert.deepEqual(QuestService.quest07(loaded), active({ potionTutorialDone: true }));
    assert.equal(accept07(loaded), false);
    assert.equal(QuestRewards.quest06(loaded).ok, false);
    assert.deepEqual([itemCount(loaded.inventory, HP), itemCount(loaded.inventory, SP)], [80, 50]);
  });
});

test('safety: a full bag stops line 1 (nothing paid, the turn-in waits); a talk cut after the reward re-offers lines 2-6', () => {
  withoutStorage(() => {
    const c = readyForRoland('Beta');
    c.inventory = { ...c.inventory!, bag: Array.from({ length: INVENTORY_SLOT_COUNT }, (_, i) => ({ itemId: 'weapon_rusty_dagger', quantity: 1, instanceId: `d${i}` })) };
    const exp = [c.status.level, c.status.exp];
    assert.ok(QuestService.advance06(c, 'turnIn'));
    assert.deepEqual(QuestRewards.quest06(c), { ok: false, error: 'bagFull' });
    assert.deepEqual([c.status.level, c.status.exp], exp, 'no EXP');
    assert.ok(QuestService.advance06(c, 'cancelTurnIn'), 'the talk breaks off: ready to turn in again');
    assert.equal(QuestService.quest06(c).state, 'READY_TO_TURN_IN');
    // cut off after the reward: Quest 06 done, Quest 07 offered - Roland repeats lines 2-6, then accepts
    const d = readyForRoland('Gamma');
    QuestService.advance06(d, 'turnIn');
    assert.ok(QuestRewards.quest06(d).ok);
    assert.equal(QuestService.advance06(d, 'cancelTurnIn'), false, 'no undo after the reward');
    const reloaded = saveAndLoad(d);
    assert.deepEqual([QuestService.quest07(reloaded).state, npcQuestMarker(reloaded, ROLAND)], ['OFFERED', 'available']);
    assert.deepEqual(DIALOGUES[TUTORIAL_QUEST_07.offerDialogueId], DIALOGUES[TUTORIAL_QUEST_06.turnInDialogueId].slice(1));
    assert.ok(accept07(reloaded));
    // the supplies: one grant each - a half-given set completes on the next try, never doubles
    const e = readyForRoland('Delta');
    QuestService.advance06(e, 'turnIn');
    QuestRewards.quest06(e);
    InventoryService.grantOnce(e, TUTORIAL_QUEST_07.supplies[0]);
    assert.ok(accept07(e));
    assert.deepEqual([itemCount(e.inventory, HP), itemCount(e.inventory, SP)], [80, 50]);
  });
});

test('dialogue: Roland\'s six turn-in lines exactly, in Thai, with English', () => {
  const lines = (language: 'th' | 'en'): string[] => {
    setLanguage(language);
    return DIALOGUES.roland_avian_done.map((k) => translate(k));
  };
  assert.deepEqual(lines('th'), [
    'เรียบร้อยดีสินะ เอาเป็นว่านี่คือรางวัลของเจ้า',
    'คัมภีร์ฟื้นฟูนี้จะทำให้เจ้าอยู่รอดกับการต่อสู้ได้ดีขึ้น',
    'ต่อไปเจ้าจะต้องเก็บเกี่ยวประสบการณ์ตรงนี้ก่อนที่จะเข้าเมืองไปทำความเข้าใจโลกใบใหม่นี้',
    'เก็บเลเวลจากการล่ามอนสเตอร์แถวนี้นี่แหละ จนถึงเลเวล 10',
    'ข้าจะมีทริคเล็กๆน้อยบอกเจ้าด้วย เอาไว้ให้การล่าของเจ้าสบายมากขึ้น',
    'เอาล่ะแล้วค่อยกลับมาตอนเจ้าถึงเลเวล 10 ก็แล้วกันนะ',
  ]);
  const en = lines('en');
  assert.equal(en.length, 6);
  assert.ok(en.every((l) => l.length > 0 && !l.startsWith('dialogues.')));
  setLanguage('th');
});

/** A character with Reach Level 10 running (accepted from Roland). */
function onQuest07(name: string): CharacterData {
  const c = readyForRoland(name);
  QuestService.advance06(c, 'turnIn');
  QuestRewards.quest06(c);
  accept07(c);
  return c;
}

test('Lv 10 turn-in rules: ready only from Lv 10; turnIn > reward > complete, each once; cut-offs and restored saves', () => {
  const p = active();
  assert.equal(isQuest07Ready(p, 9), false);
  assert.equal(applyQuest07(p, 'turnIn', 9), null, 'not before Lv 10');
  assert.equal(isQuest07AtRoland(p, 9), false);
  assert.ok(isQuest07Ready(p, 10) && isQuest07Ready(p, 12) && isQuest07AtRoland(p, 10));
  const talk = applyQuest07(p, 'turnIn', 10)!;
  assert.equal(talk.state, 'TURN_IN_DIALOGUE');
  assert.equal(applyQuest07(talk, 'complete'), null, 'never completed before the reward');
  assert.deepEqual(applyQuest07(talk, 'cancelTurnIn'), p, 'cut off before the reward: back to ACTIVE');
  const paid = applyQuest07(talk, 'reward')!;
  assert.equal(paid.state, 'REWARDED');
  assert.equal(applyQuest07(paid, 'reward'), null, 'paid once');
  assert.equal(applyQuest07(paid, 'cancelTurnIn'), null);
  assert.ok(isQuest07AtRoland(paid, 10), 'cut off after the reward: Roland resumes');
  const done = applyQuest07(paid, 'complete')!;
  assert.equal(done.state, 'COMPLETED');
  assert.ok(isQuest07ToSonny(done) && !isQuest07AtRoland(done, 10));
  for (const e of ['turnIn', 'reward', 'complete', 'accept', 'offer'] as const) assert.equal(applyQuest07(done, e, 10), null, e);
  assert.deepEqual(restoreQuest07(paid), paid);
});

test('Lv 10 turn-in: green check from Lv 10, 1,000 Gold once on line 1, completed at the end, then on to Sonny', () => {
  withoutStorage(() => {
    const c = onQuest07('Gamma');
    assert.equal(npcQuestMarker(c, ROLAND), 'inProgress');
    assert.equal(QuestService.advance07(c, 'turnIn'), false, 'below Lv 10');
    CharacterStatusService.gainExp(c, 5_000);
    assert.ok(c.status.level >= 10);
    assert.equal(npcQuestMarker(c, ROLAND), 'completed', 'green check mark');
    initLanguage(null);
    setLanguage('en');
    const objective = (): string => {
      const t = trackedQuest(c)!;
      return translate(`quests.${t.questId}.${t.objectiveKey}`, t.params);
    };
    assert.equal(objective(), 'Return to Roland');
    const gold0 = GoldService.get(c);
    assert.ok(QuestService.advance07(c, 'turnIn'));
    assert.equal(QuestService.advance07(c, 'turnIn'), false);
    assert.equal(QuestRewards.quest07(c), 1000);
    assert.equal(QuestRewards.quest07(c), 0, 'never twice (repeated clicks)');
    assert.equal(GoldService.get(c), gold0 + 1000);
    // saved between the reward and the last line: loads with the Gold, never pays again, resumes at line 2
    const mid = saveAndLoad(c);
    assert.deepEqual([QuestService.quest07(mid).state, GoldService.get(mid), QuestRewards.quest07(mid)], ['REWARDED', gold0 + 1000, 0]);
    assert.ok(QuestService.advance07(c, 'complete'));
    assert.equal(npcQuestMarker(c, ROLAND), null);
    assert.equal(objective(), 'Head north and talk to Sonny at the gate');
    setLanguage('th');
    assert.equal(objective(), 'เดินขึ้นเหนือไปคุยกับ Sonny ที่ประตู');
    const loaded = saveAndLoad(c);
    assert.deepEqual([QuestService.quest07(loaded).state, GoldService.get(loaded)], ['COMPLETED', gold0 + 1000]);
    assert.equal(QuestService.advance07(loaded, 'turnIn'), false);
    assert.equal(QuestRewards.quest07(loaded), 0);
    for (const npc of ['city_guard_sonny', 'city_guard_jack'] as const) assert.equal(npcQuestMarker(loaded, npc), null, 'no Sonny / Jack quests yet');
  });
});

test('Lv 10 talk: four lines TH / EN (exact Thai), resume = lines 2-4; GameScene wiring', () => {
  initLanguage(null);
  const lines = DIALOGUES[TUTORIAL_QUEST_07.turnInDialogueId];
  assert.equal(lines.length, 4);
  assert.deepEqual(DIALOGUES[TUTORIAL_QUEST_07.resumeDialogueId], lines.slice(1));
  setLanguage('th');
  assert.deepEqual(lines.map((k) => translate(k)), [
    'นี่สิ ผลของการฝึกฝน ใช่ไหมครับ',
    'เอาล่ะ เจ้าพร้อมแล้วล่ะถ้าทำได้ถึงขนาดนี้',
    'เดินขึ้นเหนือไปอีกสิ จะเจอยามเฝ้าหน้าประตู ให้คุยกับ Sonny นะ',
    'อย่าหลงไปคุยกับ Jack เชียวล่ะ มันพูดไม่รู้เรื่อง',
  ]);
  setLanguage('en');
  for (const k of lines) assert.ok(translate(k) !== k && /[a-z]/.test(translate(k)), k);
  setLanguage('th');
  const game = fs.readFileSync(path.join(process.cwd(), 'src/scenes/GameScene.ts'), 'utf8');
  const turnIn = game.slice(game.indexOf("QuestService.advance07(character, 'turnIn')"));
  assert.match(turnIn, /step === TUTORIAL_QUEST_07\.rewardBeforeStep\) this\.combat\.showGoldGain\(QuestRewards\.quest07\(character\)\)/);
  assert.ok(turnIn.indexOf("advance07(character, 'complete')") > 0);
  assert.match(game, /isQuest07ToSonny\(quest07\) && PortalService\.state\(c, 'dawnkeep_gate'\) === 'LOCKED' \? TUTORIAL_QUEST_07\.nextNpcId/, 'the dotted path leads to Sonny until he opened the portal');
  assert.equal(TUTORIAL_QUEST_07.nextNpcId, 'city_guard_sonny');
});
