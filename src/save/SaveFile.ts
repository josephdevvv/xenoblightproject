import { isApprovedCharacterSprite } from '../assets/CharacterSpriteManifest';
import { getCharacterSpriteId } from '../characters/CharacterAssetIds';
import { validateCharacterName, type CharacterData } from '../data/CharacterData';
import { parseCharacterProfile, type CharacterProfile } from '../data/CharacterProfileStore';
import { STARTER_CLASS_ID } from '../data/StarterCharacters';
import { createInventory, sanitizeInventory, type InventoryState } from '../inventory/InventoryState';
import { createPassiveProgress, sanitizePassiveProgress, type PassiveProgress } from '../passives/PassiveProgress';
import { parseSavedStatus } from '../status/StatusRecord';
import type { CharacterStatus } from '../status/StatTypes';
import { parseSavedLocation, type SavedLocation } from './SavedLocation';

/**
 * The exported save file - pure (no Phaser, no DOM, no storage), unit-tested.
 *
 * The only place progress is kept. One JSON document with the character's records (profile, status, passives,
 * quests, inventory + equipment + received grants) plus where the player stands. Derived stats, equipment bonuses and
 * anything that only exists while playing are never saved: they are rebuilt from these records.
 *
 * Reading never trusts the file: it is data only (JSON.parse, nothing is executed), limited in size, its
 * checksum must match (damaged files), and every record goes through the game's own repair rules before
 * anything is replaced. `version` is the schema version: older files are migrated step by step, newer ones
 * are refused.
 */
export const SAVE_FORMAT = 'xenoblight-save';
export const SAVE_FILE_VERSION = 1;
export const SAVE_FILE_NAME = 'xenoblight_save.json';
/** Far above any real save (a few kB). */
export const MAX_SAVE_CHARS = 1024 * 1024;

/** A checked save, ready to be restored. */
export interface GameSave {
  profile: CharacterProfile;
  status: CharacterStatus;
  passives: PassiveProgress;
  /** Quest records by quest id, as stored (QuestService checks each one when it loads them). */
  quests: Record<string, unknown>;
  inventory: InventoryState;
  /** Save point of this file (never a respawn point). */
  savedLocation: SavedLocation | null;
  savedAt: number | null;
  /** Fields that had to be repaired. */
  repaired: string[];
}

export type SaveFileError = 'tooLarge' | 'notJson' | 'notASave' | 'newerVersion' | 'corrupted' | 'unsupportedCharacter';
export type ParseResult = { ok: true; save: GameSave } | { ok: false; error: SaveFileError };

type Json = Record<string, unknown>;

/** Upgrades a document from version n to n + 1. Add one entry per schema change. */
const MIGRATIONS: Readonly<Record<number, (document: Json) => Json>> = {};

/** The save file of a character. */
export function serializeSave(character: CharacterData, savedLocation: SavedLocation | null, now: number = Date.now()): string {
  const { level, base, statPoints, exp } = character.status;
  const document: Json = {
    format: SAVE_FORMAT,
    version: SAVE_FILE_VERSION,
    savedAt: now,
    character: { name: character.name, appearance: { ...character.appearance }, classId: character.classId, createdAt: character.createdAt },
    status: { level, base: { ...base }, statPoints, exp },
    passives: character.passives ?? createPassiveProgress(),
    quests: character.quests ?? {},
    inventory: character.inventory ?? createInventory(),
    location: savedLocation,
  };
  return JSON.stringify({ ...document, checksum: checksum(document) }, null, 2);
}

export function parseSave(text: string): ParseResult {
  try {
    return parse(text);
  } catch {
    // e.g. absurdly deep nesting
    return { ok: false, error: 'corrupted' };
  }
}

function parse(text: string): ParseResult {
  if (text.length > MAX_SAVE_CHARS) return { ok: false, error: 'tooLarge' };
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return { ok: false, error: 'notJson' };
  }
  if (!isObject(raw) || raw.format !== SAVE_FORMAT) return { ok: false, error: 'notASave' };
  const { checksum: expected, ...rest } = raw;
  const version = rest.version;
  if (!Number.isInteger(version) || (version as number) < 1) return { ok: false, error: 'corrupted' };
  if ((version as number) > SAVE_FILE_VERSION) return { ok: false, error: 'newerVersion' };
  if (expected !== checksum(rest)) return { ok: false, error: 'corrupted' };

  let document = clean(rest) as Json;
  for (let v = version as number; v < SAVE_FILE_VERSION; v++) {
    const migrate = MIGRATIONS[v];
    if (!migrate) return { ok: false, error: 'corrupted' };
    document = migrate(document);
  }

  const { character, status, passives, quests, inventory, location } = document;
  if (![character, status, passives, quests, inventory].every(isObject)) return { ok: false, error: 'corrupted' };

  const profile = parseCharacterProfile(character);
  if (profile.kind !== 'loaded') return { ok: false, error: 'corrupted' };
  const name = validateCharacterName(profile.profile.name);
  if (!name.valid) return { ok: false, error: 'corrupted' };
  // Only what this build can show and play (never a made-up sprite or class).
  if (profile.profile.classId !== STARTER_CLASS_ID || !isApprovedCharacterSprite(getCharacterSpriteId(profile.profile.appearance))) return { ok: false, error: 'unsupportedCharacter' };

  const repaired: string[] = [];
  const parsedStatus = parseSavedStatus(status as Json);
  if (parsedStatus.kind !== 'loaded') return { ok: false, error: 'corrupted' };
  repaired.push(...parsedStatus.repaired.map((r) => `status: ${r}`));
  const parsedPassives = sanitizePassiveProgress(passives, parsedStatus.status.level);
  repaired.push(...parsedPassives.repaired.map((r) => `passives: ${r}`));
  const parsedInventory = sanitizeInventory(inventory);
  repaired.push(...parsedInventory.repaired.map((r) => `inventory: ${r}`));
  const questRecords: Record<string, unknown> = {};
  for (const [id, record] of Object.entries(quests as Json)) {
    if (isObject(record)) questRecords[id] = record;
    else repaired.push(`quest: ${id}`);
  }

  return {
    ok: true,
    save: {
      profile: { ...profile.profile, name: name.name },
      status: parsedStatus.status,
      passives: parsedPassives.progress,
      quests: questRecords,
      inventory: parsedInventory.state,
      savedLocation: parseSavedLocation(location),
      savedAt: typeof document.savedAt === 'number' && Number.isFinite(document.savedAt) ? document.savedAt : null,
      repaired,
    },
  };
}

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** A copy without keys that mean something to JavaScript objects themselves. */
function clean(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(clean);
  if (!isObject(v)) return v;
  const out: Json = {};
  for (const [key, value] of Object.entries(v)) if (!UNSAFE_KEYS.has(key)) out[key] = clean(value);
  return out;
}

/** Detects damaged files (FNV-1a over the compact document). Not a protection against editing. */
export function checksum(document: Json): string {
  const text = JSON.stringify(document);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
