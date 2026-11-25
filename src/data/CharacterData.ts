import type { HotbarState } from '../hotbar/Hotbar';
import type { SkillsState } from '../skills/LearnedSkills';
import type { AutoPlaySettings } from '../autoplay/AutoPlaySettings';
import type { PotionSlots } from '../hotbar/PotionSlots';
import type { InventoryState } from '../inventory/InventoryState';
import type { PassiveProgress } from '../passives/PassiveProgress';
import type { QuestLog } from '../quests/QuestService';
import { createInitialStatus, type CharacterStatus } from '../status/StatTypes';
import type { Gender } from './AppearanceCatalog';
import { DEFAULT_STARTER_CHOICE, STARTER_CLASS_ID, starterAppearance, type StarterChoice } from './StarterCharacters';

/**
 * Appearance selections. These are IDs only; how they are drawn is decided by the
 * sprite asset resolved from them (one complete pre-rendered sheet per combination).
 */
export interface CharacterAppearance {
  gender: Gender;
  hairstyleId: string;
  hairColorId: string;
  outfitId: string;
}

export interface CharacterData {
  id: string;
  name: string;
  appearance: CharacterAppearance;
  /** Class ID. Every new character starts as a Drifter. */
  classId: string;
  createdAt: number;
  /** Level, main stats and stat points. Loaded/saved by CharacterStatusService. */
  status: CharacterStatus;
  /** Passive tree ranks and passive points (separate from stat points). Loaded with the status. */
  passives?: PassiveProgress;
  /** Quest progress. Loaded with the status (QuestService). */
  quests?: QuestLog;
  /** Bag and worn equipment. Loaded with the status; changed only by InventoryService. */
  inventory?: InventoryState;
  /** Hotbar slots 1-8 (references to consumables / skills). Changed only by HotbarService. */
  hotbar?: HotbarState;
  /** Skills learned from skill scrolls. Changed only by SkillService. */
  skills?: SkillsState;
  /** One-time tutorial hints already finished (never shown again). Changed only by HintService. */
  hints?: readonly string[];
  /** Features the tutorial has unlocked (Navigate, Auto Combat). Changed only by FeatureService. */
  unlocks?: readonly string[];
  /** Portal states by portal id (absent = LOCKED). Changed only by PortalService. */
  portals?: Readonly<Partial<Record<string, string>>>;
  /** Gold (earned on kills; nothing spends it yet). Changed only by GoldService. */
  gold?: number;
  /** The Q (HP potion) / W (SP potion) slots beside the hotbar. Changed only by HotbarService. */
  potionSlots?: PotionSlots;
  /** Auto Play settings (changed only by AutoPlayService); whether it runs is never stored. */
  autoPlay?: AutoPlaySettings;
}

export const NAME_MIN_LENGTH = 3;
export const NAME_MAX_LENGTH = 16;

/** Letters (any script, incl. Thai combining marks) and digits, single spaces between words. */
const NAME_PATTERN = /^[\p{L}\p{M}\p{N}]+(?: [\p{L}\p{M}\p{N}]+)*$/u;

/** A localizable message: translation key + values for its {placeholders}. */
export interface LocalizedMessage {
  key: string;
  params?: Record<string, string | number>;
}

export type NameValidationResult = { valid: true; name: string } | { valid: false; error: LocalizedMessage };

export function validateCharacterName(raw: string): NameValidationResult {
  const name = raw.trim();
  const length = [...name].length;

  if (length === 0) {
    return { valid: false, error: { key: 'validation.nameEmpty' } };
  }
  if (length < NAME_MIN_LENGTH) {
    return { valid: false, error: { key: 'validation.nameTooShort', params: { min: NAME_MIN_LENGTH } } };
  }
  if (length > NAME_MAX_LENGTH) {
    return { valid: false, error: { key: 'validation.nameTooLong', params: { max: NAME_MAX_LENGTH } } };
  }
  if (!NAME_PATTERN.test(name)) {
    return { valid: false, error: { key: 'validation.nameInvalid' } };
  }
  return { valid: true, name };
}

/** Default look for a brand-new player (male, mohawk, blonde, Drifter outfit). */
export function createDefaultAppearance(): CharacterAppearance {
  return starterAppearance(DEFAULT_STARTER_CHOICE);
}

/**
 * Creates a NEW character. Gender, hairstyle and (where the hairstyle offers several) hair colour come from
 * the player; outfit and class are fixed by the starter rules (StarterCharacters.ts) - whatever else the
 * caller passes is ignored, and an unavailable gender / hairstyle / colour is replaced by a supported one.
 */
export function createCharacterData(name: string, choice: StarterChoice): CharacterData {
  return {
    id: newCharacterId(),
    name,
    appearance: starterAppearance({ gender: choice.gender, hairstyleId: choice.hairstyleId, hairColorId: choice.hairColorId }),
    classId: STARTER_CLASS_ID,
    createdAt: Date.now(),
    status: createInitialStatus(),
  };
}

/**
 * Rebuilds an EXISTING character from its saved profile, unchanged (appearance, class, creation
 * time). Starter rules are not applied, so later appearances / classes keep working.
 */
export function restoreCharacterData(saved: { name: string; appearance: CharacterAppearance; classId: string; createdAt: number }): CharacterData {
  return {
    id: newCharacterId(),
    name: saved.name,
    appearance: { ...saved.appearance },
    classId: saved.classId,
    createdAt: saved.createdAt,
    status: createInitialStatus(),
  };
}

function newCharacterId(): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `char_${Date.now().toString(36)}_${random}`;
}
