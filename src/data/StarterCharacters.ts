import { HAIRSTYLES, type AppearanceOption, type Gender } from './AppearanceCatalog';
import type { CharacterAppearance } from './CharacterData';

/**
 * Rules for NEW characters (authoritative - character creation and any future server use these,
 * not the UI). The player chooses name, gender, hairstyle and - where the hairstyle has more than one
 * approved colour - the hair colour; outfit and class are fixed:
 *
 *   gender  hairstyle        hair colour                          outfit   class
 *   male    bald             none                                 drifter  drifter
 *   male    mohawk           blonde                               drifter  drifter
 *   male    side_swept       blonde | black | silver | brown | red drifter  drifter
 *   female  bald             none                                 drifter  drifter
 *   female  straight_bangs   blonde                               drifter  drifter
 *
 * These are exactly the appearances with approved Sprite Forge Drifter art (SpriteForgeCharacters.ts).
 * The wider catalog (HAIRSTYLES, HAIR_COLORS, OUTFITS) stays as the data model for later content.
 */
export const STARTER_CLASS_ID = 'drifter';
export const STARTER_OUTFIT_ID = 'drifter';
/** Default hair colour of every non-bald starter. */
export const STARTER_HAIR_COLOR_ID = 'blonde';
export const BALD_HAIRSTYLE_ID = 'bald';
/** Hair colour identifier for hairstyles without hair. */
export const NO_HAIR_COLOR_ID = 'none';

/** Selectable hairstyles per gender, in display order. */
export const STARTER_HAIRSTYLE_IDS: Readonly<Record<Gender, readonly string[]>> = {
  male: [BALD_HAIRSTYLE_ID, 'mohawk', 'side_swept'],
  female: [BALD_HAIRSTYLE_ID, 'straight_bangs'],
};

/**
 * Selectable hair colours per starter hairstyle, in display order (first = default). Only colours with approved
 * Drifter art are listed; a hairstyle with a single entry shows no colour choice.
 */
export const STARTER_HAIR_COLOR_IDS: Readonly<Record<string, readonly string[]>> = {
  [BALD_HAIRSTYLE_ID]: [NO_HAIR_COLOR_ID],
  mohawk: [STARTER_HAIR_COLOR_ID],
  straight_bangs: [STARTER_HAIR_COLOR_ID],
  side_swept: ['blonde', 'black', 'silver', 'brown', 'red'],
};

export const STARTER_GENDERS: readonly Gender[] = ['male', 'female'];

/** What the player picks in character creation. */
export interface StarterChoice {
  gender: Gender;
  hairstyleId: string;
  /** Optional; an unavailable colour becomes the hairstyle's default. */
  hairColorId?: string;
}

/** First visit default: male with hair (shows the most of the art). */
export const DEFAULT_STARTER_CHOICE: Readonly<StarterChoice> = { gender: 'male', hairstyleId: 'mohawk' };

export function starterHairstyles(gender: Gender): ReadonlyArray<AppearanceOption> {
  const ids = STARTER_HAIRSTYLE_IDS[gender];
  return HAIRSTYLES[gender].filter((h) => ids.includes(h.id)).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
}

/** Hair colours selectable for a starter hairstyle (first = default). */
export function starterHairColors(hairstyleId: string): readonly string[] {
  return STARTER_HAIR_COLOR_IDS[hairstyleId] ?? (hairstyleId === BALD_HAIRSTYLE_ID ? [NO_HAIR_COLOR_ID] : [STARTER_HAIR_COLOR_ID]);
}

/** The hair colour a starter gets: the requested one when it is available for that hairstyle, else its default. */
export function hairColorFor(hairstyleId: string, requested?: string): string {
  const colors = starterHairColors(hairstyleId);
  return requested && colors.includes(requested) ? requested : colors[0]!;
}

/**
 * The full appearance for a starter choice. Invalid input never produces an unsupported look:
 * an unknown gender becomes the default gender, an unavailable hairstyle the default for that gender.
 */
export function starterAppearance(choice: Partial<StarterChoice>): CharacterAppearance {
  const gender: Gender = STARTER_GENDERS.includes(choice.gender as Gender) ? (choice.gender as Gender) : DEFAULT_STARTER_CHOICE.gender;
  const allowed = STARTER_HAIRSTYLE_IDS[gender];
  const fallback = allowed.includes(DEFAULT_STARTER_CHOICE.hairstyleId) ? DEFAULT_STARTER_CHOICE.hairstyleId : allowed[allowed.length - 1];
  const hairstyleId = choice.hairstyleId && allowed.includes(choice.hairstyleId) ? choice.hairstyleId : fallback;
  return { gender, hairstyleId, hairColorId: hairColorFor(hairstyleId, choice.hairColorId), outfitId: STARTER_OUTFIT_ID };
}

/** All starter appearances (for prefetching and tests). */
export function allStarterAppearances(): CharacterAppearance[] {
  return STARTER_GENDERS.flatMap((gender) =>
    STARTER_HAIRSTYLE_IDS[gender].flatMap((hairstyleId) => starterHairColors(hairstyleId).map((hairColorId) => starterAppearance({ gender, hairstyleId, hairColorId }))),
  );
}
