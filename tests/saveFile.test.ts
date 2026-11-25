import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import type { CharacterData } from '../src/data/CharacterData';
import { CharacterStore } from '../src/data/CharacterStore';
import { findMissingTranslations, getDictionary } from '../src/i18n';
import { InventoryService } from '../src/inventory/InventoryService';
import { bagIndexOf } from '../src/inventory/InventoryState';
import { PassiveTreeService } from '../src/passives/PassiveTreeService';
import { QuestService } from '../src/quests/QuestService';
import { TUTORIAL_QUEST_02 } from '../src/quests/TutorialQuest02';
import { checksum, MAX_SAVE_CHARS, parseSave, SAVE_FILE_NAME, SAVE_FILE_VERSION, SAVE_FORMAT, serializeSave, type GameSave } from '../src/save/SaveFile';
import { SaveService } from '../src/save/SaveService';
import { CharacterStatusService } from '../src/status/CharacterStatusService';
import { StatAllocationDraft } from '../src/status/StatAllocation';
import { LOGO_ASPECT, mainMenuLayout } from '../src/ui/menu/MainMenuLayout';
import { newCharacter, withoutStorage } from './helpers/session';

const DAGGER = 'weapon_rusty_dagger';
const { reward } = TUTORIAL_QUEST_02;
const LOCATION = { mapId: 'ashen_crossroads', x: 14.25, y: 106.5 };

/** A character with progress in every system: level, stats, passives, both quests, dagger worn and a second one in the bag. */
function played(name: string): CharacterData {
  const c = newCharacter(name);
  for (const e of ['start', 'talk', 'finishDialogue', 'startPassiveTutorial'] as const) QuestService.advance(c, e);
  CharacterStatusService.gainExp(c, 300);
  const draft = new StatAllocationDraft(c.status);
  draft.add('str');
  draft.add('agi');
  CharacterStatusService.confirmAllocation(c, draft);
  PassiveTreeService.upgrade(c, 'drifters_resolve');
  PassiveTreeService.upgrade(c, 'combat_training');
  QuestService.sync02(c);
  QuestService.advance02(c, 'talk');
  InventoryService.grantOnce(c, reward);
  QuestService.advance02(c, 'grantReward');
  QuestService.advance02(c, 'finishDialogue');
  InventoryService.grantOnce(c, { grantId: 'second', itemId: DAGGER, quantity: 1 });
  InventoryService.equip(c, 0, 'weapon');
  QuestService.sync02(c);
  assert.equal(QuestService.quest02(c).state, 'COMPLETED');
  return c;
}

const state = (c: CharacterData) => ({ name: c.name, appearance: c.appearance, classId: c.classId, createdAt: c.createdAt, status: c.status, passives: c.passives, quests: c.quests, inventory: c.inventory, derived: CharacterStatusService.derived(c) });
const parsed = (text: string): GameSave => {
  const r = parseSave(text);
  assert.ok(r.ok, JSON.stringify(r));
  return r.save;
};
/** A file with changed content and a matching checksum (as if such a file existed). */
function tampered(text: string, change: (d: Record<string, any>) => void): string {
  const { checksum: _old, ...d } = JSON.parse(text) as Record<string, any>;
  change(d);
  return JSON.stringify({ ...d, checksum: checksum(d) });
}

// ------------------------------------------------------------------------------------------------- export

test('export: versioned JSON with every persistent record and nothing from the running game', () => {
  withoutStorage(() => {
    const c = played('Alpha');
    const text = serializeSave(c, LOCATION, 1234);
    const d = JSON.parse(text) as Record<string, unknown>;
    assert.deepEqual(Object.keys(d).sort(), ['autoPlay', 'character', 'checksum', 'format', 'gold', 'hints', 'hotbar', 'inventory', 'location', 'passives', 'portals', 'potionSlots', 'quests', 'savedAt', 'skills', 'status', 'unlocks', 'version']);
    assert.deepEqual([d.format, d.version, d.savedAt], [SAVE_FORMAT, SAVE_FILE_VERSION, 1234]);
    assert.deepEqual(Object.keys(d.status as object).sort(), ['base', 'exp', 'level', 'statPoints'], 'no bonus / derived values');
    assert.ok(text.length < 20_000);
    assert.equal(SAVE_FILE_NAME, 'xenoblight_save.json');
    const before = JSON.stringify(state(c));
    serializeSave(c, null);
    assert.equal(JSON.stringify(state(c)), before, 'exporting changes nothing');
  });
});

test('a brand-new character can be exported and restored too', () => {
  withoutStorage(() => {
    const c = newCharacter('Fresh');
    const text = serializeSave(c, null);
    assert.deepEqual(state(SaveService.restore(parsed(text))), state(c));
    assert.equal(parsed(text).savedLocation, null);
  });
});

// ------------------------------------------------------------------------------------------------ restore

test('save -> close -> load: everything is back, exactly once, and nothing was kept anywhere else', () => {
  withoutStorage(() => {
    const c = played('Alpha');
    const text = serializeSave(c, LOCATION);
    const before = JSON.parse(JSON.stringify(state(c)));
    const save = parsed(text);
    assert.deepEqual([save.repaired, save.savedLocation], [[], LOCATION]);
    const back = SaveService.restore(save);
    assert.deepEqual(JSON.parse(JSON.stringify(state(back))), before);
    assert.equal(back.inventory!.equipment.weapon?.instanceId, c.inventory!.equipment.weapon?.instanceId);
    assert.notEqual(back.id, c.id, 'a session of its own');
    // without the file there is nothing to come back to, whatever the name
    const fresh = newCharacter('Alpha');
    assert.deepEqual([fresh.status.level, fresh.status.exp, fresh.inventory!.bag.every((x) => x === null), QuestService.quest01(fresh).state, QuestService.quest01(fresh).autoStart], [1, 0, true, 'NOT_STARTED', true]);
  });
});

test('save at level 3, reach level 5, load: level 3 again - only what the file captured', () => {
  withoutStorage(() => {
    const c = newCharacter('Alpha');
    CharacterStatusService.setLevel(c, 3);
    const file = serializeSave(c, LOCATION);
    CharacterStatusService.setLevel(c, 5);
    InventoryService.grantOnce(c, reward);
    const back = SaveService.restore(parsed(file));
    assert.deepEqual([back.status.level, back.status.statPoints, bagIndexOf(back.inventory, DAGGER)], [3, 6, -1]);
    assert.equal(c.status.level, 5, 'the other session object is untouched');
  });
});

test('loading again and again never doubles items, bonuses, rewards, points or EXP', () => {
  withoutStorage(() => {
    const text = serializeSave(played('Alpha'), LOCATION);
    const first = JSON.stringify(state(SaveService.restore(parsed(text))));
    for (let i = 0; i < 5; i++) {
      const c = SaveService.restore(parsed(text));
      assert.equal(JSON.stringify(state(c)), first);
      assert.equal(InventoryService.grantOnce(c, reward), 'alreadyGranted');
      QuestService.sync02(c);
      assert.equal(QuestService.quest02(c).state, 'COMPLETED');
      assert.equal(QuestService.advance(c, 'start'), false);
      // export of the loaded character = the same content
      const again = JSON.parse(serializeSave(c, LOCATION, 1)) as { checksum: string };
      assert.equal(again.checksum, (JSON.parse(serializeSave(SaveService.restore(parsed(text)), LOCATION, 1)) as { checksum: string }).checksum);
    }
  });
});

test('an older file: exactly its state; the quest can be played again and gives exactly one dagger', () => {
  withoutStorage(() => {
    const early = serializeSave(newCharacter('Alpha'), null);
    const later = played('Alpha');
    const back = SaveService.restore(parsed(early));
    assert.deepEqual([back.status.level, bagIndexOf(back.inventory, DAGGER), QuestService.quest02(back).state], [1, -1, 'NOT_STARTED']);
    assert.ok(later.status.level > 1);
    assert.equal(InventoryService.grantOnce(back, reward), null);
    assert.equal(InventoryService.grantOnce(back, reward), 'alreadyGranted');
  });
});

test('tutorial in progress: the right step continues, a given dagger is not given again', () => {
  withoutStorage(() => {
    const c = newCharacter('Alpha');
    for (const e of ['start', 'talk', 'finishDialogue', 'startPassiveTutorial'] as const) QuestService.advance(c, e);
    PassiveTreeService.upgrade(c, 'drifters_resolve');
    QuestService.sync02(c);
    const atMateus = serializeSave(c, null);
    QuestService.advance02(c, 'talk');
    InventoryService.grantOnce(c, reward);
    QuestService.advance02(c, 'grantReward');
    QuestService.advance02(c, 'finishDialogue');
    const equipStep = serializeSave(c, null);
    const a = SaveService.restore(parsed(atMateus));
    assert.deepEqual([QuestService.quest01(a).state, QuestService.quest02(a).state], ['PASSIVE_TUTORIAL_STARTED', 'FIND_MATEUS']);
    const b = SaveService.restore(parsed(equipStep));
    assert.equal(QuestService.quest02(b).state, 'EQUIPMENT_TUTORIAL');
    assert.equal(InventoryService.grantOnce(b, reward), 'alreadyGranted');
    assert.equal(b.inventory!.bag.filter((x) => x?.itemId === DAGGER).length, 1);
  });
});

test('characters are independent whatever they are called; a session replaces the one before', () => {
  withoutStorage(() => {
    const text = serializeSave(played('Alpha'), null);
    const [a, b, loaded] = [newCharacter('Alpha'), newCharacter('Alpha'), SaveService.restore(parsed(text))];
    assert.equal(new Set([a.id, b.id, loaded.id]).size, 3);
    CharacterStatusService.gainExp(a, 500);
    InventoryService.grantOnce(a, reward);
    assert.deepEqual([b.status.level, b.inventory!.bag.every((x) => x === null)], [1, true]);
    assert.equal(InventoryService.grantOnce(b, reward), null, 'each has its own reward');
    CharacterStore.startSession(a);
    assert.equal(CharacterStore.getActive(), a);
    CharacterStore.startSession(b);
    assert.deepEqual([CharacterStore.getActive(), CharacterStore.getAll()], [b, [b]]);
    CharacterStore.endSession();
    assert.deepEqual([CharacterStore.getActive(), CharacterStore.getAll()], [null, []]);
  });
});

test('no gameplay code can write to the browser: only the settings use storage', () => {
  const root = path.join(process.cwd(), 'src');
  const users: string[] = [];
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (p.endsWith('.ts')) {
        const code = fs.readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
        const rel = path.relative(root, p).replace(/\\/g, '/');
        if (/\b(localStorage|sessionStorage|indexedDB|document\.cookie|caches\.open)\b/.test(code)) users.push(rel);
        // the earlier browser profiles exist only as a checked data shape
        if (/CharacterProfileStore\.(load|save|setLastPlayed|backupInvalid|loadLastPlayed)/.test(code) && rel !== 'data/CharacterProfileStore.ts') users.push(`${rel} (profiles)`);
      }
    }
  };
  walk(root);
  assert.deepEqual(users, ['settings/SettingsStore.ts']);
});

test('save files keep the Male Side Swept look in every colour (export -> load, unchanged)', () => {
  withoutStorage(() => {
    for (const colour of ['blonde', 'black', 'silver', 'brown', 'red']) {
      const c = newCharacter(`Swept ${colour}`);
      c.appearance = { gender: 'male', hairstyleId: 'side_swept', hairColorId: colour, outfitId: 'drifter' };
      const r = parseSave(serializeSave(c, LOCATION));
      assert.ok(r.ok, `${colour}: ${JSON.stringify(r)}`);
      if (r.ok) assert.deepEqual(r.save.profile.appearance, c.appearance);
    }
    // a colour without approved Side Swept art is refused, like any unsupported look
    const c = newCharacter('Swept Green');
    c.appearance = { gender: 'male', hairstyleId: 'side_swept', hairColorId: 'green', outfitId: 'drifter' };
    const r = parseSave(serializeSave(c, LOCATION));
    assert.equal(r.ok ? 'ok' : r.error, 'unsupportedCharacter');
  });
});

// ------------------------------------------------------------------------------------------- bad files

test('files that are not a usable save are refused with a reason', () => {
  withoutStorage(() => {
    const text = serializeSave(played('Alpha'), LOCATION);
    const error = (t: string): string => {
      const r = parseSave(t);
      return r.ok ? 'ok' : r.error;
    };
    for (const t of ['', 'hello', '{', '<html>', text.slice(0, -20)]) assert.equal(error(t), 'notJson', t.slice(0, 10));
    for (const t of ['null', '5', '[]', '"x"', '{}', '{"format":"other"}']) assert.equal(error(t), 'notASave', t);
    assert.equal(error('x'.repeat(MAX_SAVE_CHARS + 1)), 'tooLarge');
    assert.equal(error(text.replace('"level": ', '"level": 9')), 'corrupted', 'one changed digit');
    assert.equal(error(tampered(text, (d) => (d.version = SAVE_FILE_VERSION + 1))), 'newerVersion');
    for (const version of [0, -1, 1.5, '1', null]) assert.equal(error(tampered(text, (d) => (d.version = version))), 'corrupted', String(version));
    for (const section of ['character', 'status', 'passives', 'quests', 'inventory']) {
      assert.equal(error(tampered(text, (d) => delete d[section])), 'corrupted', section);
      for (const bad of [null, 5, 'x', []]) assert.equal(error(tampered(text, (d) => (d[section] = bad))), 'corrupted', section);
    }
    for (const name of ['', 'ab', 'x'.repeat(40), '<b>Alpha</b>', 5, '../../etc']) assert.equal(error(tampered(text, (d) => (d.character.name = name))), 'corrupted', String(name));
    assert.equal(error(tampered(text, (d) => (d.character.appearance.hairstyleId = 'ponytail'))), 'unsupportedCharacter');
    assert.equal(error(tampered(text, (d) => (d.character.appearance.outfitId = '__proto__'))), 'unsupportedCharacter');
    assert.equal(error(tampered(text, (d) => (d.character.classId = 'wizard'))), 'unsupportedCharacter');
    assert.equal(error(tampered(text, (d) => (d.status = {}))), 'corrupted');
    assert.equal(error(`{"format":"${SAVE_FORMAT}","version":1,"a":${'['.repeat(200_000)}${']'.repeat(200_000)}}`), 'corrupted', 'deep nesting does not crash');
    assert.equal(error(`﻿${text}`), 'ok', 'a byte order mark is fine');
    assert.equal(error(JSON.stringify(JSON.parse(text))), 'ok', 'reformatted JSON is the same save');
  });
});

test('missing or impossible fields inside a record are repaired by the game\'s own rules', () => {
  withoutStorage(() => {
    const text = serializeSave(played('Alpha'), LOCATION);
    const save = parsed(
      tampered(text, (d) => {
        d.status.level = 500;
        d.status.base.str = 9999;
        delete d.status.exp;
        d.passives.trees.drifter.ranks = { drifters_resolve: 99, power_strike: 2 };
        d.inventory.bag[3] = { itemId: DAGGER, quantity: 1, instanceId: d.inventory.equipment.weapon.instanceId };
        d.inventory.bag[4] = { nonsense: true };
        d.quests.tutorial_02_rusty_dagger = { state: 'HACKED' };
        d.quests.broken = 'x';
        d.location = { mapId: 5, x: 'a', y: null };
        delete d.savedAt;
      }),
    );
    assert.equal(save.status.level, 99);
    assert.equal(save.status.base.str, 99);
    assert.equal(save.status.exp, 0);
    assert.deepEqual(save.passives.trees.drifter!.ranks, { drifters_resolve: 1 });
    assert.deepEqual([save.savedLocation, save.savedAt, save.quests.broken], [null, null, undefined]);
    assert.ok(save.repaired.length > 3);
    const c = SaveService.restore(save);
    const ids = [...c.inventory!.bag.flatMap((x) => (x ? [x.instanceId] : [])), c.inventory!.equipment.weapon!.instanceId];
    assert.equal(new Set(ids).size, ids.length, 'every instance once');
    assert.equal(QuestService.quest02(c).state, 'TURNED_IN', 'the dagger was given: no restart, nothing paid again');
  });
});

test('the file is data only: keys with a meaning for JavaScript are dropped and nothing is polluted', () => {
  withoutStorage(() => {
    const text = serializeSave(played('Alpha'), LOCATION);
    const evil = text.replace('"quests": {', '"quests": { "__proto__": { "polluted": true }, "constructor": { "prototype": { "polluted": true } },');
    const { checksum: _c, ...d } = JSON.parse(evil) as Record<string, unknown>;
    const save = parsed(JSON.stringify({ ...d, checksum: checksum(d) }));
    assert.equal(({} as { polluted?: boolean }).polluted, undefined);
    assert.ok(!Object.keys(save.quests).some((k) => k === '__proto__' || k === 'constructor'));
    const c = SaveService.restore(save);
    assert.equal((c.quests as unknown as { polluted?: boolean }).polluted, undefined);
  });
});

test('quests this build does not know survive an export and a load', () => {
  withoutStorage(() => {
    const c = played('Alpha');
    c.quests = { ...c.quests!, future_quest: { state: 'X', n: 3 } };
    const back = SaveService.restore(parsed(serializeSave(c, null)));
    assert.deepEqual(back.quests!.future_quest, { state: 'X', n: 3 });
  });
});

// --------------------------------------------------------------------------------------------- menu

test('main menu: logo centred above three equal, centred buttons, on every screen size', () => {
  for (const [sw, sh] of [[960, 480], [1280, 720], [1920, 1080], [640, 360], [480, 320]]) {
    const l = mainMenuLayout(sw, sh);
    const at = `${sw}x${sh}`;
    const width = l.logo.height * LOGO_ASPECT;
    assert.equal(l.logo.cx, Math.floor(sw / 2), at);
    assert.ok(l.logo.cx - width / 2 >= 0 && l.logo.cx + width / 2 <= sw && l.logo.cy - l.logo.height / 2 >= 0, at);
    assert.equal(l.buttons.length, 3);
    l.buttons.forEach(([x, y, w, h], i) => {
      assert.ok(Math.abs(x + w / 2 - sw / 2) <= 1, at);
      assert.deepEqual([w, h], [l.buttons[0][2], l.buttons[0][3]]);
      assert.ok(y >= l.logo.cy + l.logo.height / 2 && y + h <= sh, at);
      if (i > 0) assert.ok(y >= l.buttons[i - 1][1] + l.buttons[i - 1][3], at);
      assert.ok([x, y, w, h].every(Number.isInteger));
    });
    assert.ok(l.message.y >= l.buttons[2][1] + l.buttons[2][3] && l.message.y + 14 <= sh + 4, `${at} message`);
  }
});

test('menu and save texts: the specified labels, and every error has a text in both languages', () => {
  assert.deepEqual(findMissingTranslations(), { th: [], en: [] });
  const th = getDictionary('th');
  const en = getDictionary('en');
  assert.deepEqual([th.menu.newGame, th.menu.loadGame, th.menu.settings, th.settings.saveGame], ['เริ่มต้นใหม่', 'โหลดเกม', 'ตั้งค่า', 'บันทึกเกม']);
  assert.deepEqual([en.menu.newGame, en.menu.loadGame, en.menu.settings, en.settings.saveGame], ['New Game', 'Load Game', 'Settings', 'Save Game']);
  for (const e of ['tooLarge', 'notJson', 'notASave', 'newerVersion', 'corrupted', 'unsupportedCharacter', 'unreadable'] as const) assert.ok(th.save.errors[e].length > 0 && en.save.errors[e].length > 0, e);
});
