import { HAIRSTYLES, type AppearanceOption, type Gender } from './AppearanceCatalog';
import type { CharacterAppearance } from './CharacterData';

/**
 * Rules for NEW characters (authoritative - character creation and any future server use these,
 * not the UI). The player chooses name, gender, hairstyle and - where the hairstyle has more than one
 * approved colour - the hair colour; outfit and class are fixed:
 *
 *   gender  hairstyle        hair colour                          outfit   class
 *   male    bald             none                                 drifter  drifter
 *   male    mohawk           blonde | black | silver | brown | red drifter  drifter
 *   male    side_swept       blonde | black | silver | brown | red drifter  drifter
 *   male    middle_part      blonde | black | silver | brown | red drifter  drifter
 *   male    slicked_back     blonde | black | silver | brown | red drifter  drifter
 *   male    long_middle_part blonde | black | silver | brown | red drifter  drifter
 *   female  bald             none                                 drifter  drifter
 *   female  straight_bangs   blonde | black | silver | brown | red drifter  drifter
 *   female  bob              blonde | black | silver | brown | red drifter  drifter
 *   female  ponytail         blonde | black | silver | brown | red drifter  drifter
 *   female  twin_buns        blonde | black | silver | brown | red drifter  drifter
 *   female  fluffy_curls     blonde | black | silver | brown | red drifter  drifter
 *   female  long_side_part   blonde | black | silver | brown | red drifter  drifter
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
  male: [BALD_HAIRSTYLE_ID, 'mohawk', 'side_swept', 'middle_part', 'slicked_back', 'long_middle_part'],
  female: [BALD_HAIRSTYLE_ID, 'straight_bangs', 'bob', 'ponytail', 'twin_buns', 'fluffy_curls', 'long_side_part'],
};

/**
 * Selectable hair colours per starter hairstyle, in display order (first = default). Only colours with approved
 * Drifter art are listed; a hairstyle with a single entry shows no colour choice.
 */
export const STARTER_HAIR_COLOR_IDS: Readonly<Record<string, readonly string[]>> = {
  [BALD_HAIRSTYLE_ID]: [NO_HAIR_COLOR_ID],
  mohawk: ['blonde', 'black', 'silver', 'brown', 'red'],
  straight_bangs: ['blonde', 'black', 'silver', 'brown', 'red'],
  side_swept: ['blonde', 'black', 'silver', 'brown', 'red'],
  middle_part: ['blonde', 'black', 'silver', 'brown', 'red'],
  slicked_back: ['blonde', 'black', 'silver', 'brown', 'red'],
  long_middle_part: ['blonde', 'black', 'silver', 'brown', 'red'],
  bob: ['blonde', 'black', 'silver', 'brown', 'red'],
  ponytail: ['blonde', 'black', 'silver', 'brown', 'red'],
  twin_buns: ['blonde', 'black', 'silver', 'brown', 'red'],
  fluffy_curls: ['blonde', 'black', 'silver', 'brown', 'red'],
  long_side_part: ['blonde', 'black', 'silver', 'brown', 'red'],
};

export const STARTER_GENDERS: readonly Gender[] = ['male', 'female'];

/**
 * Outfits the creation screen can put on the preview ("Trial Outfit"), in display order: the starter outfit first,
 * then the plain base look. A preview only - a new character always starts in STARTER_OUTFIT_ID (starterAppearance).
 * Every starter hairstyle / colour has approved art for both.
 */
export const TRIAL_OUTFIT_IDS: readonly string[] = [STARTER_OUTFIT_ID, 'basic'];

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
 * an unknown gender becomes the default gender, an unavailable hairstyle the default for that gender (the
 * default hairstyle when that gender has it, else its first hairstyle with hair).
 */
export function starterAppearance(choice: Partial<StarterChoice>): CharacterAppearance {
  const gender: Gender = STARTER_GENDERS.includes(choice.gender as Gender) ? (choice.gender as Gender) : DEFAULT_STARTER_CHOICE.gender;
  const allowed = STARTER_HAIRSTYLE_IDS[gender];
  const fallback = allowed.includes(DEFAULT_STARTER_CHOICE.hairstyleId) ? DEFAULT_STARTER_CHOICE.hairstyleId : (allowed.find((id) => id !== BALD_HAIRSTYLE_ID) ?? allowed[0]);
  const hairstyleId = choice.hairstyleId && allowed.includes(choice.hairstyleId) ? choice.hairstyleId : fallback;
  return { gender, hairstyleId, hairColorId: hairColorFor(hairstyleId, choice.hairColorId), outfitId: STARTER_OUTFIT_ID };
}

/** The look the creation preview shows: a starter appearance wearing a trial outfit (an unknown outfit = the starter one). */
export function trialAppearance(appearance: CharacterAppearance, outfitId: string): CharacterAppearance {
  return { ...appearance, outfitId: TRIAL_OUTFIT_IDS.includes(outfitId) ? outfitId : STARTER_OUTFIT_ID };
}

/** Every look the creation preview can show: all starter appearances in every trial outfit (for prefetching and tests). */
export function allTrialAppearances(): CharacterAppearance[] {
  return allStarterAppearances().flatMap((appearance) => TRIAL_OUTFIT_IDS.map((outfitId) => trialAppearance(appearance, outfitId)));
}

/** All starter appearances (for prefetching and tests). */
export function allStarterAppearances(): CharacterAppearance[] {
  return STARTER_GENDERS.flatMap((gender) =>
    STARTER_HAIRSTYLE_IDS[gender].flatMap((hairstyleId) => starterHairColors(hairstyleId).map((hairColorId) => starterAppearance({ gender, hairstyleId, hairColorId }))),
  );
}
