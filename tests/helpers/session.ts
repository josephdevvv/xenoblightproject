import assert from 'node:assert/strict';
import { createCharacterData, type CharacterData } from '../../src/data/CharacterData';
import { parseSave, serializeSave } from '../../src/save/SaveFile';
import type { SavedLocation } from '../../src/save/SavedLocation';
import { SaveService } from '../../src/save/SaveService';
import { SETTINGS_STORAGE_KEY } from '../../src/settings/SettingsStore';
import { CharacterStatusService } from '../../src/status/CharacterStatusService';

/** New Game. */
export function newCharacter(name: string, hairstyleId = 'mohawk'): CharacterData {
  const c = createCharacterData(name, { gender: 'male', hairstyleId });
  CharacterStatusService.startNew(c);
  return c;
}

/** Save Game, close the game, Load Game: the only way progress survives. */
export function saveAndLoad(c: CharacterData, location: SavedLocation | null = null): CharacterData {
  const r = parseSave(serializeSave(c, location));
  assert.ok(r.ok, JSON.stringify(r));
  return SaveService.restore(r.save);
}

/** Runs `fn` in a browser whose storage must not be touched by gameplay (only the language setting may be). */
export function withoutStorage(fn: () => void): void {
  const touched: string[] = [];
  const touch = (op: string, key: string): void => {
    if (key !== SETTINGS_STORAGE_KEY) touched.push(`${op} ${key}`);
  };
  const g = globalThis as { localStorage?: unknown; sessionStorage?: unknown; indexedDB?: unknown };
  const previous = [g.localStorage, g.sessionStorage, g.indexedDB];
  const fake = (name: string) => ({
    getItem: (k: string) => (touch(`${name} read`, k), null),
    setItem: (k: string) => touch(`${name} write`, k),
    removeItem: (k: string) => touch(`${name} remove`, k),
  });
  g.localStorage = fake('localStorage');
  g.sessionStorage = fake('sessionStorage');
  g.indexedDB = { open: (k: string) => touch('indexedDB open', k) };
  const warn = console.warn;
  console.warn = () => undefined;
  try {
    fn();
  } finally {
    console.warn = warn;
    [g.localStorage, g.sessionStorage, g.indexedDB] = previous;
  }
  assert.deepEqual(touched, [], 'gameplay touches no browser storage');
}
