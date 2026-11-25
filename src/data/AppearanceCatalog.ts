/**
 * Catalog of every selectable appearance option.
 *
 * IDs are stable and are used to build sprite asset identifiers, so they must never be renamed
 * once real art exists. Display names live in the translation files (src/i18n: appearance.*),
 * keyed by these IDs. To add an option, append an entry here, add its name to every locale and
 * supply its sprite sheet (see CharacterAssetIds / CharacterSpriteManifest).
 */

export type Gender = 'male' | 'female';

export interface AppearanceOption {
  id: string;
}

export interface HairColorOption extends AppearanceOption {
  /** Swatch colour used by the UI and by the mockup sprite generator. */
  hex: string;
}

export const GENDERS: ReadonlyArray<AppearanceOption & { id: Gender }> = [
  { id: 'male' },
  { id: 'female' },
];

export const HAIRSTYLES: Readonly<Record<Gender, ReadonlyArray<AppearanceOption>>> = {
  male: [
    { id: 'mohawk' },
    { id: 'side_swept' },
    { id: 'middle_part' },
    { id: 'slicked_back' },
    { id: 'long_middle_part' },
    { id: 'buzz_cut' },
    // Sprite Forge base character (no hair). Has no hair colour: every colour shows the same art.
    { id: 'bald' },
  ],
  female: [
    { id: 'straight_bangs' },
    { id: 'twin_buns' },
    { id: 'bob' },
    { id: 'ponytail' },
    { id: 'fluffy_curls' },
    { id: 'long_side_part' },
    // Sprite Forge base character (no hair). Has no hair colour: every colour shows the same art.
    { id: 'bald' },
  ],
};

/** Hair colours are intentionally desaturated to fit the dark palette. */
export const HAIR_COLORS: ReadonlyArray<HairColorOption> = [
  { id: 'blonde', hex: '#b09c74' },
  { id: 'black', hex: '#26252b' },
  { id: 'silver', hex: '#c3c3c9' },
  { id: 'brown', hex: '#5c4637' },
  { id: 'red', hex: '#7a3c35' },
];

/**
 * Outfits. "basic" is the starting/unclothed look from the design doc (แก้ผ้า);
 * it is rendered with simple cloth wraps.
 */
export const OUTFITS: ReadonlyArray<AppearanceOption> = [
  { id: 'basic' },
  { id: 'adventurer' },
  // Drifter class outfit (Sprite Forge). Real art for bald / mohawk / side swept (male) and bald / straight bangs (female), every hair colour.
  { id: 'drifter' },
];

export function getHairstyles(gender: Gender): ReadonlyArray<AppearanceOption> {
  return HAIRSTYLES[gender];
}

export function findHairColor(id: string): HairColorOption {
  return HAIR_COLORS.find((c) => c.id === id) ?? HAIR_COLORS[0];
}

export function indexOfOption(options: ReadonlyArray<AppearanceOption>, id: string): number {
  return Math.max(0, options.findIndex((o) => o.id === id));
}
