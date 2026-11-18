/**
 * Catalog of every selectable appearance option.
 *
 * IDs are stable and are used to build sprite asset identifiers, so they must never be renamed
 * once real art exists. Labels are display-only. To add an option, append an entry here and
 * supply its sprite sheet (see CharacterAssetIds / CharacterSpriteManifest).
 */

export type Gender = 'male' | 'female';

export interface AppearanceOption {
  id: string;
  label: string;
  /** Thai name from the design document. */
  labelTh: string;
}

export interface HairColorOption extends AppearanceOption {
  /** Swatch colour used by the UI and by the mockup sprite generator. */
  hex: string;
}

export const GENDERS: ReadonlyArray<AppearanceOption & { id: Gender }> = [
  { id: 'male', label: 'Male', labelTh: 'ชาย' },
  { id: 'female', label: 'Female', labelTh: 'หญิง' },
];

export const HAIRSTYLES: Readonly<Record<Gender, ReadonlyArray<AppearanceOption>>> = {
  male: [
    { id: 'mohawk', label: 'Mohawk', labelTh: 'หัวไก่' },
    { id: 'side_swept', label: 'Side Swept', labelTh: 'แสกปัด' },
    { id: 'middle_part', label: 'Middle Part', labelTh: 'แสกกลาง' },
    { id: 'slicked_back', label: 'Slicked Back', labelTh: 'ปัดหลัง' },
    { id: 'long_middle_part', label: 'Long Middle Part', labelTh: 'ผมยาวแสกกลาง' },
    { id: 'buzz_cut', label: 'Buzz Cut', labelTh: 'หัวเกรียน' },
  ],
  female: [
    { id: 'straight_bangs', label: 'Straight Bangs', labelTh: 'หน้าม้าตรง' },
    { id: 'twin_buns', label: 'Twin Buns', labelTh: 'สองมวย' },
    { id: 'bob', label: 'Bob', labelTh: 'บ็อบ' },
    { id: 'ponytail', label: 'Ponytail', labelTh: 'หางม้า' },
    { id: 'fluffy_curls', label: 'Fluffy Curls', labelTh: 'ลอนฟู' },
    { id: 'long_side_part', label: 'Long Side Part', labelTh: 'ยาวตรงแสกข้าง' },
  ],
};

/** Hair colours are intentionally desaturated to fit the dark palette. */
export const HAIR_COLORS: ReadonlyArray<HairColorOption> = [
  { id: 'blonde', label: 'Blonde', labelTh: 'บรอนด์', hex: '#b09c74' },
  { id: 'black', label: 'Black', labelTh: 'ดำ', hex: '#26252b' },
  { id: 'silver', label: 'Silver', labelTh: 'เงิน/ขาว', hex: '#c3c3c9' },
  { id: 'brown', label: 'Brown', labelTh: 'น้ำตาล', hex: '#5c4637' },
  { id: 'red', label: 'Red', labelTh: 'แดง', hex: '#7a3c35' },
];

/**
 * Outfits. "basic" is the starting/unclothed look from the design doc (แก้ผ้า);
 * it is rendered with simple cloth wraps.
 */
export const OUTFITS: ReadonlyArray<AppearanceOption> = [
  { id: 'basic', label: 'Basic Wraps', labelTh: 'แก้ผ้า' },
  { id: 'adventurer', label: 'Adventurer', labelTh: 'ผจญภัย' },
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
