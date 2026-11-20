import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GENDERS, HAIR_COLORS, HAIRSTYLES, OUTFITS } from '../src/data/AppearanceCatalog';
import { validateCharacterName } from '../src/data/CharacterData';
import { DIRECTIONS } from '../src/core/Direction';
import {
  collectKeys,
  findMissingTranslations,
  getDictionary,
  getLanguage,
  initLanguage,
  interpolate,
  LANGUAGES,
  onLanguageChange,
  setLanguage,
  t,
  translate,
} from '../src/i18n';
import { labels } from '../src/i18n/labels';
import { computeDerivedStats, DERIVED_DISPLAY, formatStatValue } from '../src/status/DerivedStats';
import { MAIN_STATS, createStatBlock } from '../src/status/StatTypes';
import { StatAllocationDraft } from '../src/status/StatAllocation';
import { createInitialStatus } from '../src/status/StatTypes';
import { loadSettings, SETTINGS_STORAGE_KEY, type SettingsStorage } from '../src/settings/SettingsStore';

function memoryStorage(initial: Record<string, string> = {}): SettingsStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

test('new player: Thai by default, regardless of browser language', () => {
  const store = memoryStorage();
  assert.equal(initLanguage(store), 'th');
  assert.equal(getLanguage(), 'th');
  assert.equal(t('settings.title'), 'ตั้งค่า');
});

test('switching to English applies, notifies and persists', () => {
  const store = memoryStorage();
  initLanguage(store);
  const seen: string[] = [];
  const off = onLanguageChange((l) => seen.push(l));
  setLanguage('en');
  off();
  assert.equal(getLanguage(), 'en');
  assert.deepEqual(seen, ['en']);
  assert.equal(t('settings.title'), 'Settings');
  assert.equal(JSON.parse(store.data[SETTINGS_STORAGE_KEY]).language, 'en');
});

test('reload restores the saved language', () => {
  const store = memoryStorage({ [SETTINGS_STORAGE_KEY]: JSON.stringify({ version: 1, language: 'en' }) });
  assert.equal(initLanguage(store), 'en');
  setLanguage('th');
  assert.equal(initLanguage(store), 'th');
});

test('invalid or corrupt saved values fall back to Thai', () => {
  for (const raw of ['{"language":"fr"}', '{"language":42}', 'not json', '[]', 'null', '{}']) {
    const store = memoryStorage({ [SETTINGS_STORAGE_KEY]: raw });
    assert.equal(loadSettings(store).language, 'th', raw);
    assert.equal(initLanguage(store), 'th', raw);
  }
  assert.equal(initLanguage(null), 'th', 'no storage available');
  // An invalid runtime value is ignored.
  setLanguage('xx' as never);
  assert.equal(getLanguage(), 'th');
});

test('both locales have exactly the same keys', () => {
  const missing = findMissingTranslations();
  assert.deepEqual(missing, { th: [], en: [] });
});

test('no empty or "undefined" strings in any locale', () => {
  for (const language of LANGUAGES) {
    const dict = getDictionary(language);
    for (const key of collectKeys(dict)) {
      const value = key.split('.').reduce<unknown>((n, p) => (n as Record<string, unknown>)[p], dict) as string;
      assert.ok(value.trim().length > 0, `${language}:${key} is empty`);
      assert.ok(!/undefined|null|\[object/i.test(value), `${language}:${key} = ${value}`);
    }
  }
});

test('placeholders match between locales', () => {
  const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  const th = getDictionary('th');
  const en = getDictionary('en');
  const get = (d: unknown, key: string) => key.split('.').reduce<unknown>((n, p) => (n as Record<string, unknown>)[p], d) as string;
  for (const key of collectKeys(th)) assert.deepEqual(placeholders(get(en, key)), placeholders(get(th, key)), key);
});

test('interpolation fills dynamic values and keeps unknown placeholders visible', () => {
  initLanguage(memoryStorage());
  assert.equal(t('hud.hp', { current: 120, max: 120 }), 'HP 120/120');
  assert.equal(t('status.statPoints', { points: 7 }), 'แต้มสเตตัส 7');
  assert.equal(interpolate('{a} and {b}', { a: 1 }), '1 and {b}');
});

test('missing keys never return undefined', () => {
  initLanguage(memoryStorage());
  assert.equal(translate('does.not.exist'), 'does.not.exist');
  setLanguage('en');
  assert.equal(typeof translate('appearance.hairstyle.unknown_id'), 'string');
  setLanguage('th');
});

test('every catalog / data ID has a display name in both locales', () => {
  for (const language of LANGUAGES) {
    initLanguage(memoryStorage({ [SETTINGS_STORAGE_KEY]: JSON.stringify({ language }) }));
    const check = (value: string, id: string) => assert.ok(!value.includes('.'), `${language}: no name for ${id} (${value})`);
    for (const g of GENDERS) check(labels.gender(g.id), g.id);
    for (const list of Object.values(HAIRSTYLES)) for (const h of list) check(labels.hairstyle(h.id), h.id);
    for (const c of HAIR_COLORS) check(labels.hairColor(c.id), c.id);
    for (const o of OUTFITS) check(labels.outfit(o.id), o.id);
    for (const d of DIRECTIONS) check(labels.direction(d), d);
    for (const s of MAIN_STATS) {
      check(labels.statLabel(s), s);
      check(labels.statDescription(s), s);
    }
    for (const d of DERIVED_DISPLAY) check(labels.derived(d.key), d.key);
    check(labels.map('ashen_crossroads'), 'ashen_crossroads');
  }
});

test('validation and allocation errors are translation keys that exist', () => {
  initLanguage(memoryStorage());
  for (const name of ['', 'ab', 'x'.repeat(30), 'bad!!name']) {
    const r = validateCharacterName(name);
    assert.equal(r.valid, false);
    if (!r.valid) assert.notEqual(translate(r.error.key, r.error.params), r.error.key, r.error.key);
  }
  const status = createInitialStatus();
  const result = new StatAllocationDraft(status).commit(status);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(translate(result.error.key), 'ยังไม่ได้เลือกแต้ม');
});

test('gameplay unchanged: level-1 derived stats are the specified values', () => {
  const d = computeDerivedStats(1, createStatBlock(1));
  const shown = Object.fromEntries(DERIVED_DISPLAY.map((e) => [e.key, formatStatValue(d[e.key], e.percent)]));
  assert.deepEqual(shown, {
    meleeAtk: '7', rangedAtk: '7', matk: '7', maxHp: '120', maxSp: '23', def: '1', mdef: '0.5',
    hit: '104', flee: '103', attackSpeedBonus: '0.2%', critRate: '5.1%', critDamage: '150%', materialFindBonus: '0.05%',
  });
});
