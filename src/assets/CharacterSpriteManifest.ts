/**
 * Registry of production character sprite sheets, keyed by sprite ID (see getCharacterSpriteId).
 *
 * Appearances listed here use the real art; every other appearance falls back to a generated
 * mockup sheet. Nothing here is loaded at startup: AssetManager loads an entry on demand when a
 * scene shows that appearance. URLs are relative to /public.
 *
 *   standing:      4 x 2 static directional frames (CharacterSheetLayout). Full pre-rendered sprite.
 *   standingFeetY: pixel row (0-63) where the feet touch the ground in this standing sheet, measured
 *                  from the art (lowest solid row). Default 58. Keeps every sheet standing on the ground.
 *   walk:          optional 6 x 8 walk cycle (CHARACTER_WALK_LAYOUT). Without it, the character shows its
 *                  static directional frame while moving.
 *
 * Entries below were imported from charactersprite001version.zip and are listed in
 * CHARACTER_SPRITE_INVENTORY.md (missing combinations are marked "missing").
 */
export interface CharacterSpriteEntry {
  standing: string;
  standingFeetY?: number;
  walk?: string;
}

export const DEFAULT_STANDING_FEET_Y = 58;

export const CHARACTER_SPRITE_MANIFEST: Readonly<Record<string, CharacterSpriteEntry>> = {
  // ---- male / basic ----
  char_male_mohawk_blonde_basic: { standing: 'assets/characters/male/mohawk/blonde_basic.png', standingFeetY: 57 },
  char_male_mohawk_black_basic: { standing: 'assets/characters/male/mohawk/black_basic.png', standingFeetY: 55 },
  char_male_mohawk_silver_basic: { standing: 'assets/characters/male/mohawk/silver_basic.png', standingFeetY: 57 },
  char_male_mohawk_brown_basic: { standing: 'assets/characters/male/mohawk/brown_basic.png', standingFeetY: 56 },
  char_male_mohawk_red_basic: { standing: 'assets/characters/male/mohawk/red_basic.png', standingFeetY: 55 },
  char_male_side_swept_blonde_basic: { standing: 'assets/characters/male/side_swept/blonde_basic.png', standingFeetY: 57 },
  char_male_side_swept_black_basic: { standing: 'assets/characters/male/side_swept/black_basic.png', standingFeetY: 57 },
  char_male_side_swept_silver_basic: { standing: 'assets/characters/male/side_swept/silver_basic.png', standingFeetY: 57 },
  char_male_side_swept_brown_basic: { standing: 'assets/characters/male/side_swept/brown_basic.png', standingFeetY: 55 },
  char_male_side_swept_red_basic: { standing: 'assets/characters/male/side_swept/red_basic.png', standingFeetY: 56 },
  char_male_middle_part_blonde_basic: { standing: 'assets/characters/male/middle_part/blonde_basic.png', standingFeetY: 57 },
  char_male_middle_part_black_basic: { standing: 'assets/characters/male/middle_part/black_basic.png', standingFeetY: 57 },
  char_male_middle_part_silver_basic: { standing: 'assets/characters/male/middle_part/silver_basic.png', standingFeetY: 57 },
  char_male_middle_part_brown_basic: { standing: 'assets/characters/male/middle_part/brown_basic.png', standingFeetY: 55 },
  char_male_middle_part_red_basic: { standing: 'assets/characters/male/middle_part/red_basic.png', standingFeetY: 56 },
  char_male_slicked_back_blonde_basic: { standing: 'assets/characters/male/slicked_back/blonde_basic.png', standingFeetY: 57 },
  char_male_slicked_back_black_basic: { standing: 'assets/characters/male/slicked_back/black_basic.png', standingFeetY: 57 },
  char_male_slicked_back_silver_basic: { standing: 'assets/characters/male/slicked_back/silver_basic.png', standingFeetY: 57 },
  char_male_slicked_back_brown_basic: { standing: 'assets/characters/male/slicked_back/brown_basic.png', standingFeetY: 56 },
  char_male_slicked_back_red_basic: { standing: 'assets/characters/male/slicked_back/red_basic.png', standingFeetY: 55 },
  char_male_long_middle_part_blonde_basic: { standing: 'assets/characters/male/long_middle_part/blonde_basic.png', standingFeetY: 57 },
  char_male_long_middle_part_black_basic: { standing: 'assets/characters/male/long_middle_part/black_basic.png', standingFeetY: 57 },
  char_male_long_middle_part_silver_basic: { standing: 'assets/characters/male/long_middle_part/silver_basic.png', standingFeetY: 57 },
  char_male_long_middle_part_brown_basic: { standing: 'assets/characters/male/long_middle_part/brown_basic.png', standingFeetY: 56 },
  char_male_long_middle_part_red_basic: { standing: 'assets/characters/male/long_middle_part/red_basic.png', standingFeetY: 56 },
  char_male_buzz_cut_blonde_basic: { standing: 'assets/characters/male/buzz_cut/blonde_basic.png', standingFeetY: 57 },
  char_male_buzz_cut_black_basic: { standing: 'assets/characters/male/buzz_cut/black_basic.png', standingFeetY: 57 },
  char_male_buzz_cut_silver_basic: { standing: 'assets/characters/male/buzz_cut/silver_basic.png', standingFeetY: 57 },
  char_male_buzz_cut_brown_basic: { standing: 'assets/characters/male/buzz_cut/brown_basic.png', standingFeetY: 58 },
  char_male_buzz_cut_red_basic: { standing: 'assets/characters/male/buzz_cut/red_basic.png', standingFeetY: 55 },
  // ---- male / adventurer ----
  char_male_mohawk_blonde_adventurer: { standing: 'assets/characters/male/mohawk/blonde_adventurer.png', standingFeetY: 60 },
  char_male_mohawk_black_adventurer: { standing: 'assets/characters/male/mohawk/black_adventurer.png', standingFeetY: 60 },
  char_male_mohawk_silver_adventurer: { standing: 'assets/characters/male/mohawk/silver_adventurer.png', standingFeetY: 58 },
  char_male_mohawk_brown_adventurer: { standing: 'assets/characters/male/mohawk/brown_adventurer.png', standingFeetY: 60 },
  char_male_mohawk_red_adventurer: { standing: 'assets/characters/male/mohawk/red_adventurer.png', standingFeetY: 59 },
  char_male_side_swept_blonde_adventurer: { standing: 'assets/characters/male/side_swept/blonde_adventurer.png', standingFeetY: 55 },
  char_male_side_swept_black_adventurer: { standing: 'assets/characters/male/side_swept/black_adventurer.png', standingFeetY: 57 },
  char_male_side_swept_silver_adventurer: { standing: 'assets/characters/male/side_swept/silver_adventurer.png', standingFeetY: 56 },
  char_male_side_swept_brown_adventurer: { standing: 'assets/characters/male/side_swept/brown_adventurer.png', standingFeetY: 59 },
  char_male_side_swept_red_adventurer: { standing: 'assets/characters/male/side_swept/red_adventurer.png', standingFeetY: 54 },
  char_male_middle_part_blonde_adventurer: { standing: 'assets/characters/male/middle_part/blonde_adventurer.png', standingFeetY: 58 },
  char_male_middle_part_black_adventurer: { standing: 'assets/characters/male/middle_part/black_adventurer.png', standingFeetY: 59 },
  char_male_middle_part_silver_adventurer: { standing: 'assets/characters/male/middle_part/silver_adventurer.png', standingFeetY: 58 },
  char_male_middle_part_brown_adventurer: { standing: 'assets/characters/male/middle_part/brown_adventurer.png', standingFeetY: 57 },
  char_male_middle_part_red_adventurer: { standing: 'assets/characters/male/middle_part/red_adventurer.png', standingFeetY: 58 },
  char_male_slicked_back_blonde_adventurer: { standing: 'assets/characters/male/slicked_back/blonde_adventurer.png', standingFeetY: 55 },
  char_male_slicked_back_black_adventurer: { standing: 'assets/characters/male/slicked_back/black_adventurer.png', standingFeetY: 56 },
  char_male_slicked_back_silver_adventurer: { standing: 'assets/characters/male/slicked_back/silver_adventurer.png', standingFeetY: 54 },
  char_male_slicked_back_brown_adventurer: { standing: 'assets/characters/male/slicked_back/brown_adventurer.png', standingFeetY: 55 },
  char_male_slicked_back_red_adventurer: { standing: 'assets/characters/male/slicked_back/red_adventurer.png', standingFeetY: 56 },
  char_male_long_middle_part_blonde_adventurer: { standing: 'assets/characters/male/long_middle_part/blonde_adventurer.png', standingFeetY: 58, walk: 'assets/characters/male/long_middle_part/blonde_adventurer_walk.png' },
  char_male_long_middle_part_black_adventurer: { standing: 'assets/characters/male/long_middle_part/black_adventurer.png', standingFeetY: 58 },
  char_male_long_middle_part_silver_adventurer: { standing: 'assets/characters/male/long_middle_part/silver_adventurer.png', standingFeetY: 58 },
  char_male_long_middle_part_brown_adventurer: { standing: 'assets/characters/male/long_middle_part/brown_adventurer.png', standingFeetY: 58 },
  char_male_long_middle_part_red_adventurer: { standing: 'assets/characters/male/long_middle_part/red_adventurer.png', standingFeetY: 57 },
  char_male_buzz_cut_blonde_adventurer: { standing: 'assets/characters/male/buzz_cut/blonde_adventurer.png', standingFeetY: 58 },
  char_male_buzz_cut_black_adventurer: { standing: 'assets/characters/male/buzz_cut/black_adventurer.png', standingFeetY: 58 },
  char_male_buzz_cut_silver_adventurer: { standing: 'assets/characters/male/buzz_cut/silver_adventurer.png', standingFeetY: 57 },
  char_male_buzz_cut_brown_adventurer: { standing: 'assets/characters/male/buzz_cut/brown_adventurer.png', standingFeetY: 56 },
  char_male_buzz_cut_red_adventurer: { standing: 'assets/characters/male/buzz_cut/red_adventurer.png', standingFeetY: 55 },
  // ---- female / basic ----
  char_female_straight_bangs_blonde_basic: { standing: 'assets/characters/female/straight_bangs/blonde_basic.png', standingFeetY: 54 },
  char_female_straight_bangs_black_basic: { standing: 'assets/characters/female/straight_bangs/black_basic.png', standingFeetY: 53 },
  char_female_straight_bangs_silver_basic: { standing: 'assets/characters/female/straight_bangs/silver_basic.png', standingFeetY: 52 },
  char_female_straight_bangs_brown_basic: { standing: 'assets/characters/female/straight_bangs/brown_basic.png', standingFeetY: 52 },
  char_female_straight_bangs_red_basic: { standing: 'assets/characters/female/straight_bangs/red_basic.png', standingFeetY: 53 },
  char_female_twin_buns_blonde_basic: { standing: 'assets/characters/female/twin_buns/blonde_basic.png', standingFeetY: 53 },
  char_female_twin_buns_black_basic: { standing: 'assets/characters/female/twin_buns/black_basic.png', standingFeetY: 51 },
  char_female_twin_buns_silver_basic: { standing: 'assets/characters/female/twin_buns/silver_basic.png', standingFeetY: 51 },
  char_female_twin_buns_brown_basic: { standing: 'assets/characters/female/twin_buns/brown_basic.png', standingFeetY: 50 },
  char_female_twin_buns_red_basic: { standing: 'assets/characters/female/twin_buns/red_basic.png', standingFeetY: 49 },
  char_female_bob_blonde_basic: { standing: 'assets/characters/female/bob/blonde_basic.png', standingFeetY: 52 },
  char_female_bob_black_basic: { standing: 'assets/characters/female/bob/black_basic.png', standingFeetY: 51 },
  char_female_bob_silver_basic: { standing: 'assets/characters/female/bob/silver_basic.png', standingFeetY: 52 },
  char_female_bob_brown_basic: { standing: 'assets/characters/female/bob/brown_basic.png', standingFeetY: 52 },
  char_female_bob_red_basic: { standing: 'assets/characters/female/bob/red_basic.png', standingFeetY: 51 },
  char_female_ponytail_blonde_basic: { standing: 'assets/characters/female/ponytail/blonde_basic.png', standingFeetY: 55 },
  char_female_ponytail_black_basic: { standing: 'assets/characters/female/ponytail/black_basic.png', standingFeetY: 55 },
  char_female_ponytail_silver_basic: { standing: 'assets/characters/female/ponytail/silver_basic.png', standingFeetY: 55 },
  char_female_ponytail_brown_basic: { standing: 'assets/characters/female/ponytail/brown_basic.png', standingFeetY: 56 },
  char_female_ponytail_red_basic: { standing: 'assets/characters/female/ponytail/red_basic.png', standingFeetY: 56 },
  char_female_fluffy_curls_blonde_basic: { standing: 'assets/characters/female/fluffy_curls/blonde_basic.png', standingFeetY: 54 },
  char_female_fluffy_curls_black_basic: { standing: 'assets/characters/female/fluffy_curls/black_basic.png', standingFeetY: 54 },
  char_female_fluffy_curls_silver_basic: { standing: 'assets/characters/female/fluffy_curls/silver_basic.png', standingFeetY: 54 },
  char_female_fluffy_curls_brown_basic: { standing: 'assets/characters/female/fluffy_curls/brown_basic.png', standingFeetY: 54 },
  char_female_fluffy_curls_red_basic: { standing: 'assets/characters/female/fluffy_curls/red_basic.png', standingFeetY: 53 },
  char_female_long_side_part_blonde_basic: { standing: 'assets/characters/female/long_side_part/blonde_basic.png', standingFeetY: 54 },
  char_female_long_side_part_black_basic: { standing: 'assets/characters/female/long_side_part/black_basic.png', standingFeetY: 54 },
  char_female_long_side_part_silver_basic: { standing: 'assets/characters/female/long_side_part/silver_basic.png', standingFeetY: 54 },
  char_female_long_side_part_brown_basic: { standing: 'assets/characters/female/long_side_part/brown_basic.png', standingFeetY: 54 },
  char_female_long_side_part_red_basic: { standing: 'assets/characters/female/long_side_part/red_basic.png', standingFeetY: 55 },
  // ---- female / adventurer ----
  char_female_straight_bangs_blonde_adventurer: { standing: 'assets/characters/female/straight_bangs/blonde_adventurer.png', standingFeetY: 55 },
  char_female_straight_bangs_black_adventurer: { standing: 'assets/characters/female/straight_bangs/black_adventurer.png', standingFeetY: 55 },
  char_female_straight_bangs_silver_adventurer: { standing: 'assets/characters/female/straight_bangs/silver_adventurer.png', standingFeetY: 55 },
  char_female_straight_bangs_brown_adventurer: { standing: 'assets/characters/female/straight_bangs/brown_adventurer.png', standingFeetY: 55 },
  // missing: char_female_straight_bangs_red_adventurer
  char_female_twin_buns_blonde_adventurer: { standing: 'assets/characters/female/twin_buns/blonde_adventurer.png', standingFeetY: 54 },
  char_female_twin_buns_black_adventurer: { standing: 'assets/characters/female/twin_buns/black_adventurer.png', standingFeetY: 55 },
  char_female_twin_buns_silver_adventurer: { standing: 'assets/characters/female/twin_buns/silver_adventurer.png', standingFeetY: 54 },
  char_female_twin_buns_brown_adventurer: { standing: 'assets/characters/female/twin_buns/brown_adventurer.png', standingFeetY: 55 },
  char_female_twin_buns_red_adventurer: { standing: 'assets/characters/female/twin_buns/red_adventurer.png', standingFeetY: 54 },
  char_female_bob_blonde_adventurer: { standing: 'assets/characters/female/bob/blonde_adventurer.png', standingFeetY: 53 },
  char_female_bob_black_adventurer: { standing: 'assets/characters/female/bob/black_adventurer.png', standingFeetY: 54 },
  char_female_bob_silver_adventurer: { standing: 'assets/characters/female/bob/silver_adventurer.png', standingFeetY: 54 },
  char_female_bob_brown_adventurer: { standing: 'assets/characters/female/bob/brown_adventurer.png', standingFeetY: 53 },
  char_female_bob_red_adventurer: { standing: 'assets/characters/female/bob/red_adventurer.png', standingFeetY: 54 },
  char_female_ponytail_blonde_adventurer: { standing: 'assets/characters/female/ponytail/blonde_adventurer.png', standingFeetY: 53 },
  char_female_ponytail_black_adventurer: { standing: 'assets/characters/female/ponytail/black_adventurer.png', standingFeetY: 55 },
  char_female_ponytail_silver_adventurer: { standing: 'assets/characters/female/ponytail/silver_adventurer.png', standingFeetY: 54 },
  char_female_ponytail_brown_adventurer: { standing: 'assets/characters/female/ponytail/brown_adventurer.png', standingFeetY: 54 },
  char_female_ponytail_red_adventurer: { standing: 'assets/characters/female/ponytail/red_adventurer.png', standingFeetY: 55 },
  char_female_fluffy_curls_blonde_adventurer: { standing: 'assets/characters/female/fluffy_curls/blonde_adventurer.png', standingFeetY: 54 },
  char_female_fluffy_curls_black_adventurer: { standing: 'assets/characters/female/fluffy_curls/black_adventurer.png', standingFeetY: 55 },
  char_female_fluffy_curls_silver_adventurer: { standing: 'assets/characters/female/fluffy_curls/silver_adventurer.png', standingFeetY: 54 },
  char_female_fluffy_curls_brown_adventurer: { standing: 'assets/characters/female/fluffy_curls/brown_adventurer.png', standingFeetY: 55 },
  char_female_fluffy_curls_red_adventurer: { standing: 'assets/characters/female/fluffy_curls/red_adventurer.png', standingFeetY: 54 },
  // missing: char_female_long_side_part_blonde_adventurer
  // missing: char_female_long_side_part_black_adventurer
  // missing: char_female_long_side_part_silver_adventurer
  // missing: char_female_long_side_part_brown_adventurer
  // missing: char_female_long_side_part_red_adventurer
};