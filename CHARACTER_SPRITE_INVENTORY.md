# Character Sprite Inventory

> **Superseded (2026-11-20).** The sheets audited below were removed from `public/assets/characters/` and from
> the manifest. The game now uses only the approved Xenoblight Sprite Forge exports listed in
> `src/assets/SpriteForgeCharacters.ts` (male bald, male mohawk/spike blonde, female bald, female straight bangs
> blonde - each as Drifter and base, static 256x128 + walk 384x512, 125 ms). This file is kept as history.

Audit date: 2026-11-18. All figures come from the actual files (pixel data, dimensions, hashes), cross-checked
with project metadata and the pack's own metadata. Nothing was generated or guessed from file names alone.

- Project assets: `public/assets/characters/` (registered in `src/assets/CharacterSpriteManifest.ts`)
- Source pack: `C:\MMORPGProject\charactersprite001version.zip` (folder names encoded in Windows code page 874 / Thai)

## A. Asset summary

### In the project (after this import)

| Item | Count |
| --- | --- |
| Character-related image files | **115** |
| Static 8-direction SpriteSheets (256x128, 4x2 frames of 64x64) | **114** |
| Walk Animation SpriteSheets (384x512, 6x8 frames of 64x64) | **1** |
| Other animation SpriteSheets | **0** |
| Identified character appearances with production art | **114 of 120** |
| Appearances without art (procedural mockup shown instead) | 6 |

Before this import the project had 2 character files: the male / long middle part / blonde / adventurer standing
sheet and its walk sheet.

### In the source pack (1,424 files)

| Category | Files |
| --- | --- |
| Static SpriteSheets `sprite_sheet_256x128.png` (deliverables) | 114 |
| Static single-direction frames `frames/01_south.png ... 08_south_west.png` | 912 (114 x 8) |
| Metadata JSON (`metadata.json`, `verification.json`, `validation.json`, ...) | 95 + 3 QA |
| README.txt | 28 |
| QA preview images (`qa/preview_x4.png`, marked-fix images) | 74 |
| Generation source / reference images (`source/`) | 63 |
| Walk animation files (male / adventurer / long center part / blond only) | 96 frames, 10 sheets/strips, 16 source, 9 QA, 1 metadata |
| Dagger combat-idle work files (male / basic / long center part / black) | 3 (no finished sheet) |

Only the 114 static SpriteSheets were imported. Frames, QA, source and work files were not copied.

### Identification and mapping used

| Pack | Game ID | How it was verified |
| --- | --- | --- |
| `Male...` / `Female...` top folder | `male` / `female` | folder name, visual check |
| `...ชุดแก้ผ้า` | outfit `basic` | folder name (Thai), visual: bare torso / top + navy shorts, barefoot |
| `...ชุดผจญภัย` | outfit `adventurer` | folder name (Thai), pack metadata `"outfit": "adventurer"`, visual |
| 01_spiky, 02_side_swept, 03_center_part, 04_swept_back, 05_long_center_part, 06_buzz_cut | mohawk, side_swept, middle_part, slicked_back, long_middle_part, buzz_cut | pack `label_th` = game `labelTh` exactly (หัวไก่, แสกปัด, แสกกลาง, ปัดหลัง, ผมยาวแสกกลาง, หัวเกรียน) |
| 01_long_bangs, 02_space_buns, 03_blunt_bob, 04_high_ponytail, 05_curly, 06_side_part_long | straight_bangs, twin_buns, bob, ponytail, fluffy_curls, long_side_part | same order as the game catalog / design doc + visual check (pack has **no** Thai labels for female) |
| black, blond, brown, red, silver | black, blonde, brown, red, silver | folder name + visual check (see issues for classifier notes) |

Direction layout (every sheet): row 0 = S, SE, E, NE; row 1 = N, NW, W, SW. Verified per sheet by matching the
sheet cells against the pack's own named frame files (109 of 114 sheets match 8/8), by face-position measurement
(E/SE face right and W/SW face left in all 114) and by visual contact sheets.

## B. Male characters

| | Basic | Adventurer |
| --- | --- | --- |
| Hairstyles | 6 / 6 | 6 / 6 |
| Hair colors | 5 / 5 for every hairstyle | 5 / 5 for every hairstyle |
| Static SpriteSheets | 30 / 30 | 30 / 30 |
| Walk Animations | none | 1: long_middle_part / blonde |

Male total: **60 static sheets, 1 walk sheet, 60 / 60 appearances complete.**

## C. Female characters

| | Basic | Adventurer |
| --- | --- | --- |
| Hairstyles | 6 / 6 | 5 / 6 (no long_side_part) |
| Hair colors | 5 / 5 for every hairstyle | 5 / 5, except straight_bangs (4 / 5, no red) |
| Static SpriteSheets | 30 / 30 | 24 / 30 |
| Walk Animations | none | none |

Female total: **54 static sheets, 0 walk sheets, 54 / 60 appearances complete.**

## D. Missing assets

Missing static SpriteSheets (the game shows a procedural mockup for these; no art was generated):

| Sprite ID | Gender | Hairstyle | Color | Outfit |
| --- | --- | --- | --- | --- |
| char_female_straight_bangs_red_adventurer | female | straight_bangs | red | adventurer |
| char_female_long_side_part_blonde_adventurer | female | long_side_part | blonde | adventurer |
| char_female_long_side_part_black_adventurer | female | long_side_part | black | adventurer |
| char_female_long_side_part_silver_adventurer | female | long_side_part | silver | adventurer |
| char_female_long_side_part_brown_adventurer | female | long_side_part | brown | adventurer |
| char_female_long_side_part_red_adventurer | female | long_side_part | red | adventurer |

Missing Walk Animations: **119 of 120** appearances (only male / long_middle_part / blonde / adventurer has one).
Those characters show their static directional frame while moving (temporary fallback).

## E. Asset issues

No invalid dimensions (all 114 sheets are 256x128, 32-bit ARGB), no empty frames (8 / 8 filled in every sheet),
no duplicate sheets inside the pack, no unidentified SpriteSheets, and no confirmed wrong direction mappings.

| # | Issue | Affected | Impact / action |
| --- | --- | --- | --- |
| 1 | **Foot row differs per sheet** (lowest solid row 49-60; the existing contract assumed 58) | all; extremes: female twin_buns red basic 49, twin_buns brown basic 50, bob black/red basic and twin_buns black/silver basic 51; male mohawk adventurer black/blonde/brown 60 | Handled without touching the art: feet are measured from the pixels at runtime (`SpriteMetrics`) and every frame is anchored on its own feet, so all characters stand on the same ground point. |
| 2 | **Figure size differs per sheet** (S-frame height 38-56 px) | smallest: female bob silver/red basic 38, twin_buns red basic 38, bob black basic 39, bob brown basic 41, twin_buns silver/brown basic and bob blonde basic 42 | Handled at display time (user decision): every sheet is scaled so its S-frame figure is 54 px tall (162 px in the creation preview), nearest-neighbour, in creation and in game. Source files are unchanged; the reference character stays exactly 1:1. |
| 3 | **Adventurer outfit design not uniform** | male / adventurer / mohawk and side_swept (all colors): bare torso with leather straps; other male adventurer hairstyles wear a shirt and vest | Imported as adventurer (folder + clearly not the basic outfit). Confirm this is intended. |
| 4 | Sheet differs from its own `frames/` files | female adventurer straight_bangs black (1/8 match), brown (0/8), silver (0/8); female basic ponytail black (0/8); female basic long_side_part silver (0/8) | The sheet was used (it is the deliverable named by the pack manifest). The frame files appear to be another version. |
| 5 | Pack README / manifest out of date | `Maleชุดแก้ผ้า/README.txt` and `manifest.json` list colors blond, **blue**, black, silver, **green** | Actual folders contain black, blond, brown, red, silver. Files were trusted over this metadata. |
| 6 | Naming differs from the game | hairstyle folders (e.g. 01_spiky vs mohawk), `blond` vs `blonde`, Thai outfit names in a non-UTF-8 zip encoding | Imported under the project convention `characters/<gender>/<hairstyle>/<color>_<outfit>.png`. |
| 7 | Misnamed walk work files | `animations/walk_<east/north/north_east/north_west/south_west/west>_6frames/walk_south_east_6frames_384x64.png` and their `frames/south_east_0N.png` | Only one walk sheet is used (already in the project); these strips were not imported. |
| 8 | Alternate walk sheet | `animations/walk_8dir_6frames/walk_8dir_6frames_384x512.png` differs from the in-use `walk_8dir_6frames_native64_384x512.png` | Not imported; existing walk animation kept unchanged. |
| 9 | Incomplete animation | male / basic / long_center_part / black / `animations/dagger_combat_idle_4diag` has only a raw 1247x1261 generation image | Not usable; not imported (combat is out of scope). |
| 10 | Duplicate of an existing asset | pack male / adventurer / 05_long_center_part / blond sheet is byte-identical to the existing project sheet | Existing file kept; no replacement needed. |
| 11 | Low-alpha stray pixels | e.g. male adventurer middle_part red: corner pixel alpha 1; faint pixels on frame borders in several sheets | Invisible on the dark map; transparency kept exactly as supplied. |
| 12 | Direction-mapping notes | the automated mirror test (W vs mirrored E) is inconclusive for many sheets because the art is not symmetric | Not a defect: face-position measurement and visual review confirm all 8 directions in all 114 sheets. The four checked closest by eye (female adventurer ponytail red, female basic ponytail brown, male basic middle_part black, female adventurer fluffy_curls blonde) are correct. |
| 13 | Hair-color classifier notes | 13 sheets measured outside their folder's color band (mostly dark reddish "brown") | Visual review: colors match their folders; no sheet is mislabeled. |

## Per-asset inventory (project)

Feet Y = lowest solid pixel row of the sheet (ground contact, used as the sprite's foot anchor).
Figure h = character height in the S frame (px).

| # | File | Path (public/) | Type | Image | Frame | Frames | Gender | Hairstyle | Color | Outfit | Animation | Feet Y | Figure h | Source in pack |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | blonde_basic.png | assets/characters/male/mohawk/blonde_basic.png | PNG | 256x128 | 64x64 | 8 | male | mohawk | blonde | basic | static 8-dir | 57 | 53 | male/basic/01_spiky/blond |
| 2 | black_basic.png | assets/characters/male/mohawk/black_basic.png | PNG | 256x128 | 64x64 | 8 | male | mohawk | black | basic | static 8-dir | 55 | 49 | male/basic/01_spiky/black |
| 3 | silver_basic.png | assets/characters/male/mohawk/silver_basic.png | PNG | 256x128 | 64x64 | 8 | male | mohawk | silver | basic | static 8-dir | 57 | 53 | male/basic/01_spiky/silver |
| 4 | brown_basic.png | assets/characters/male/mohawk/brown_basic.png | PNG | 256x128 | 64x64 | 8 | male | mohawk | brown | basic | static 8-dir | 56 | 49 | male/basic/01_spiky/brown |
| 5 | red_basic.png | assets/characters/male/mohawk/red_basic.png | PNG | 256x128 | 64x64 | 8 | male | mohawk | red | basic | static 8-dir | 55 | 51 | male/basic/01_spiky/red |
| 6 | blonde_basic.png | assets/characters/male/side_swept/blonde_basic.png | PNG | 256x128 | 64x64 | 8 | male | side_swept | blonde | basic | static 8-dir | 57 | 52 | male/basic/02_side_swept/blond |
| 7 | black_basic.png | assets/characters/male/side_swept/black_basic.png | PNG | 256x128 | 64x64 | 8 | male | side_swept | black | basic | static 8-dir | 57 | 51 | male/basic/02_side_swept/black |
| 8 | silver_basic.png | assets/characters/male/side_swept/silver_basic.png | PNG | 256x128 | 64x64 | 8 | male | side_swept | silver | basic | static 8-dir | 57 | 52 | male/basic/02_side_swept/silver |
| 9 | brown_basic.png | assets/characters/male/side_swept/brown_basic.png | PNG | 256x128 | 64x64 | 8 | male | side_swept | brown | basic | static 8-dir | 55 | 48 | male/basic/02_side_swept/brown |
| 10 | red_basic.png | assets/characters/male/side_swept/red_basic.png | PNG | 256x128 | 64x64 | 8 | male | side_swept | red | basic | static 8-dir | 56 | 50 | male/basic/02_side_swept/red |
| 11 | blonde_basic.png | assets/characters/male/middle_part/blonde_basic.png | PNG | 256x128 | 64x64 | 8 | male | middle_part | blonde | basic | static 8-dir | 57 | 53 | male/basic/03_center_part/blond |
| 12 | black_basic.png | assets/characters/male/middle_part/black_basic.png | PNG | 256x128 | 64x64 | 8 | male | middle_part | black | basic | static 8-dir | 57 | 53 | male/basic/03_center_part/black |
| 13 | silver_basic.png | assets/characters/male/middle_part/silver_basic.png | PNG | 256x128 | 64x64 | 8 | male | middle_part | silver | basic | static 8-dir | 57 | 53 | male/basic/03_center_part/silver |
| 14 | brown_basic.png | assets/characters/male/middle_part/brown_basic.png | PNG | 256x128 | 64x64 | 8 | male | middle_part | brown | basic | static 8-dir | 55 | 50 | male/basic/03_center_part/brown |
| 15 | red_basic.png | assets/characters/male/middle_part/red_basic.png | PNG | 256x128 | 64x64 | 8 | male | middle_part | red | basic | static 8-dir | 56 | 49 | male/basic/03_center_part/red |
| 16 | blonde_basic.png | assets/characters/male/slicked_back/blonde_basic.png | PNG | 256x128 | 64x64 | 8 | male | slicked_back | blonde | basic | static 8-dir | 57 | 52 | male/basic/04_swept_back/blond |
| 17 | black_basic.png | assets/characters/male/slicked_back/black_basic.png | PNG | 256x128 | 64x64 | 8 | male | slicked_back | black | basic | static 8-dir | 57 | 53 | male/basic/04_swept_back/black |
| 18 | silver_basic.png | assets/characters/male/slicked_back/silver_basic.png | PNG | 256x128 | 64x64 | 8 | male | slicked_back | silver | basic | static 8-dir | 57 | 53 | male/basic/04_swept_back/silver |
| 19 | brown_basic.png | assets/characters/male/slicked_back/brown_basic.png | PNG | 256x128 | 64x64 | 8 | male | slicked_back | brown | basic | static 8-dir | 56 | 49 | male/basic/04_swept_back/brown |
| 20 | red_basic.png | assets/characters/male/slicked_back/red_basic.png | PNG | 256x128 | 64x64 | 8 | male | slicked_back | red | basic | static 8-dir | 55 | 49 | male/basic/04_swept_back/red |
| 21 | blonde_basic.png | assets/characters/male/long_middle_part/blonde_basic.png | PNG | 256x128 | 64x64 | 8 | male | long_middle_part | blonde | basic | static 8-dir | 57 | 53 | male/basic/05_long_center_part/blond |
| 22 | black_basic.png | assets/characters/male/long_middle_part/black_basic.png | PNG | 256x128 | 64x64 | 8 | male | long_middle_part | black | basic | static 8-dir | 57 | 53 | male/basic/05_long_center_part/black |
| 23 | silver_basic.png | assets/characters/male/long_middle_part/silver_basic.png | PNG | 256x128 | 64x64 | 8 | male | long_middle_part | silver | basic | static 8-dir | 57 | 53 | male/basic/05_long_center_part/silver |
| 24 | brown_basic.png | assets/characters/male/long_middle_part/brown_basic.png | PNG | 256x128 | 64x64 | 8 | male | long_middle_part | brown | basic | static 8-dir | 56 | 49 | male/basic/05_long_center_part/brown |
| 25 | red_basic.png | assets/characters/male/long_middle_part/red_basic.png | PNG | 256x128 | 64x64 | 8 | male | long_middle_part | red | basic | static 8-dir | 56 | 49 | male/basic/05_long_center_part/red |
| 26 | blonde_basic.png | assets/characters/male/buzz_cut/blonde_basic.png | PNG | 256x128 | 64x64 | 8 | male | buzz_cut | blonde | basic | static 8-dir | 57 | 51 | male/basic/06_buzz_cut/blond |
| 27 | black_basic.png | assets/characters/male/buzz_cut/black_basic.png | PNG | 256x128 | 64x64 | 8 | male | buzz_cut | black | basic | static 8-dir | 57 | 51 | male/basic/06_buzz_cut/black |
| 28 | silver_basic.png | assets/characters/male/buzz_cut/silver_basic.png | PNG | 256x128 | 64x64 | 8 | male | buzz_cut | silver | basic | static 8-dir | 57 | 52 | male/basic/06_buzz_cut/silver |
| 29 | brown_basic.png | assets/characters/male/buzz_cut/brown_basic.png | PNG | 256x128 | 64x64 | 8 | male | buzz_cut | brown | basic | static 8-dir | 58 | 49 | male/basic/06_buzz_cut/brown |
| 30 | red_basic.png | assets/characters/male/buzz_cut/red_basic.png | PNG | 256x128 | 64x64 | 8 | male | buzz_cut | red | basic | static 8-dir | 55 | 47 | male/basic/06_buzz_cut/red |
| 31 | blonde_adventurer.png | assets/characters/male/mohawk/blonde_adventurer.png | PNG | 256x128 | 64x64 | 8 | male | mohawk | blonde | adventurer | static 8-dir | 60 | 54 | male/adventurer/01_spiky/blond |
| 32 | black_adventurer.png | assets/characters/male/mohawk/black_adventurer.png | PNG | 256x128 | 64x64 | 8 | male | mohawk | black | adventurer | static 8-dir | 60 | 55 | male/adventurer/01_spiky/black |
| 33 | silver_adventurer.png | assets/characters/male/mohawk/silver_adventurer.png | PNG | 256x128 | 64x64 | 8 | male | mohawk | silver | adventurer | static 8-dir | 58 | 53 | male/adventurer/01_spiky/silver |
| 34 | brown_adventurer.png | assets/characters/male/mohawk/brown_adventurer.png | PNG | 256x128 | 64x64 | 8 | male | mohawk | brown | adventurer | static 8-dir | 60 | 55 | male/adventurer/01_spiky/brown |
| 35 | red_adventurer.png | assets/characters/male/mohawk/red_adventurer.png | PNG | 256x128 | 64x64 | 8 | male | mohawk | red | adventurer | static 8-dir | 59 | 54 | male/adventurer/01_spiky/red |
| 36 | blonde_adventurer.png | assets/characters/male/side_swept/blonde_adventurer.png | PNG | 256x128 | 64x64 | 8 | male | side_swept | blonde | adventurer | static 8-dir | 55 | 51 | male/adventurer/02_side_swept/blond |
| 37 | black_adventurer.png | assets/characters/male/side_swept/black_adventurer.png | PNG | 256x128 | 64x64 | 8 | male | side_swept | black | adventurer | static 8-dir | 57 | 53 | male/adventurer/02_side_swept/black |
| 38 | silver_adventurer.png | assets/characters/male/side_swept/silver_adventurer.png | PNG | 256x128 | 64x64 | 8 | male | side_swept | silver | adventurer | static 8-dir | 56 | 53 | male/adventurer/02_side_swept/silver |
| 39 | brown_adventurer.png | assets/characters/male/side_swept/brown_adventurer.png | PNG | 256x128 | 64x64 | 8 | male | side_swept | brown | adventurer | static 8-dir | 59 | 53 | male/adventurer/02_side_swept/brown |
| 40 | red_adventurer.png | assets/characters/male/side_swept/red_adventurer.png | PNG | 256x128 | 64x64 | 8 | male | side_swept | red | adventurer | static 8-dir | 54 | 51 | male/adventurer/02_side_swept/red |
| 41 | blonde_adventurer.png | assets/characters/male/middle_part/blonde_adventurer.png | PNG | 256x128 | 64x64 | 8 | male | middle_part | blonde | adventurer | static 8-dir | 58 | 55 | male/adventurer/03_center_part/blond |
| 42 | black_adventurer.png | assets/characters/male/middle_part/black_adventurer.png | PNG | 256x128 | 64x64 | 8 | male | middle_part | black | adventurer | static 8-dir | 59 | 56 | male/adventurer/03_center_part/black |
| 43 | silver_adventurer.png | assets/characters/male/middle_part/silver_adventurer.png | PNG | 256x128 | 64x64 | 8 | male | middle_part | silver | adventurer | static 8-dir | 58 | 55 | male/adventurer/03_center_part/silver |
| 44 | brown_adventurer.png | assets/characters/male/middle_part/brown_adventurer.png | PNG | 256x128 | 64x64 | 8 | male | middle_part | brown | adventurer | static 8-dir | 57 | 53 | male/adventurer/03_center_part/brown |
| 45 | red_adventurer.png | assets/characters/male/middle_part/red_adventurer.png | PNG | 256x128 | 64x64 | 8 | male | middle_part | red | adventurer | static 8-dir | 58 | 55 | male/adventurer/03_center_part/red |
| 46 | blonde_adventurer.png | assets/characters/male/slicked_back/blonde_adventurer.png | PNG | 256x128 | 64x64 | 8 | male | slicked_back | blonde | adventurer | static 8-dir | 55 | 51 | male/adventurer/04_swept_back/blond |
| 47 | black_adventurer.png | assets/characters/male/slicked_back/black_adventurer.png | PNG | 256x128 | 64x64 | 8 | male | slicked_back | black | adventurer | static 8-dir | 56 | 55 | male/adventurer/04_swept_back/black |
| 48 | silver_adventurer.png | assets/characters/male/slicked_back/silver_adventurer.png | PNG | 256x128 | 64x64 | 8 | male | slicked_back | silver | adventurer | static 8-dir | 54 | 52 | male/adventurer/04_swept_back/silver |
| 49 | brown_adventurer.png | assets/characters/male/slicked_back/brown_adventurer.png | PNG | 256x128 | 64x64 | 8 | male | slicked_back | brown | adventurer | static 8-dir | 55 | 52 | male/adventurer/04_swept_back/brown |
| 50 | red_adventurer.png | assets/characters/male/slicked_back/red_adventurer.png | PNG | 256x128 | 64x64 | 8 | male | slicked_back | red | adventurer | static 8-dir | 56 | 55 | male/adventurer/04_swept_back/red |
| 51 | blonde_adventurer.png | assets/characters/male/long_middle_part/blonde_adventurer.png | PNG | 256x128 | 64x64 | 8 | male | long_middle_part | blonde | adventurer | static 8-dir | 58 | 54 | male/adventurer/05_long_center_part/blond |
| 52 | blonde_adventurer_walk.png | assets/characters/male/long_middle_part/blonde_adventurer_walk.png | PNG | 384x512 | 64x64 | 48 (6 x 8) | male | long_middle_part | blonde | adventurer | walk 8-dir, 6 frames | 62 (contract) | - | (pre-existing; identical to male/adventurer/05_long_center_part/blond/animations/walk_8dir_6frames_native64_384x512.png) |
| 53 | black_adventurer.png | assets/characters/male/long_middle_part/black_adventurer.png | PNG | 256x128 | 64x64 | 8 | male | long_middle_part | black | adventurer | static 8-dir | 58 | 56 | male/adventurer/05_long_center_part/black |
| 54 | silver_adventurer.png | assets/characters/male/long_middle_part/silver_adventurer.png | PNG | 256x128 | 64x64 | 8 | male | long_middle_part | silver | adventurer | static 8-dir | 58 | 55 | male/adventurer/05_long_center_part/silver |
| 55 | brown_adventurer.png | assets/characters/male/long_middle_part/brown_adventurer.png | PNG | 256x128 | 64x64 | 8 | male | long_middle_part | brown | adventurer | static 8-dir | 58 | 55 | male/adventurer/05_long_center_part/brown |
| 56 | red_adventurer.png | assets/characters/male/long_middle_part/red_adventurer.png | PNG | 256x128 | 64x64 | 8 | male | long_middle_part | red | adventurer | static 8-dir | 57 | 55 | male/adventurer/05_long_center_part/red |
| 57 | blonde_adventurer.png | assets/characters/male/buzz_cut/blonde_adventurer.png | PNG | 256x128 | 64x64 | 8 | male | buzz_cut | blonde | adventurer | static 8-dir | 58 | 54 | male/adventurer/06_buzz_cut/blond |
| 58 | black_adventurer.png | assets/characters/male/buzz_cut/black_adventurer.png | PNG | 256x128 | 64x64 | 8 | male | buzz_cut | black | adventurer | static 8-dir | 58 | 53 | male/adventurer/06_buzz_cut/black |
| 59 | silver_adventurer.png | assets/characters/male/buzz_cut/silver_adventurer.png | PNG | 256x128 | 64x64 | 8 | male | buzz_cut | silver | adventurer | static 8-dir | 57 | 50 | male/adventurer/06_buzz_cut/silver |
| 60 | brown_adventurer.png | assets/characters/male/buzz_cut/brown_adventurer.png | PNG | 256x128 | 64x64 | 8 | male | buzz_cut | brown | adventurer | static 8-dir | 56 | 50 | male/adventurer/06_buzz_cut/brown |
| 61 | red_adventurer.png | assets/characters/male/buzz_cut/red_adventurer.png | PNG | 256x128 | 64x64 | 8 | male | buzz_cut | red | adventurer | static 8-dir | 55 | 50 | male/adventurer/06_buzz_cut/red |
| 62 | blonde_basic.png | assets/characters/female/straight_bangs/blonde_basic.png | PNG | 256x128 | 64x64 | 8 | female | straight_bangs | blonde | basic | static 8-dir | 54 | 48 | female/basic/01_long_bangs/blond |
| 63 | black_basic.png | assets/characters/female/straight_bangs/black_basic.png | PNG | 256x128 | 64x64 | 8 | female | straight_bangs | black | basic | static 8-dir | 53 | 45 | female/basic/01_long_bangs/black |
| 64 | silver_basic.png | assets/characters/female/straight_bangs/silver_basic.png | PNG | 256x128 | 64x64 | 8 | female | straight_bangs | silver | basic | static 8-dir | 52 | 44 | female/basic/01_long_bangs/silver |
| 65 | brown_basic.png | assets/characters/female/straight_bangs/brown_basic.png | PNG | 256x128 | 64x64 | 8 | female | straight_bangs | brown | basic | static 8-dir | 52 | 43 | female/basic/01_long_bangs/brown |
| 66 | red_basic.png | assets/characters/female/straight_bangs/red_basic.png | PNG | 256x128 | 64x64 | 8 | female | straight_bangs | red | basic | static 8-dir | 53 | 45 | female/basic/01_long_bangs/red |
| 67 | blonde_basic.png | assets/characters/female/twin_buns/blonde_basic.png | PNG | 256x128 | 64x64 | 8 | female | twin_buns | blonde | basic | static 8-dir | 53 | 45 | female/basic/02_space_buns/blond |
| 68 | black_basic.png | assets/characters/female/twin_buns/black_basic.png | PNG | 256x128 | 64x64 | 8 | female | twin_buns | black | basic | static 8-dir | 51 | 43 | female/basic/02_space_buns/black |
| 69 | silver_basic.png | assets/characters/female/twin_buns/silver_basic.png | PNG | 256x128 | 64x64 | 8 | female | twin_buns | silver | basic | static 8-dir | 51 | 42 | female/basic/02_space_buns/silver |
| 70 | brown_basic.png | assets/characters/female/twin_buns/brown_basic.png | PNG | 256x128 | 64x64 | 8 | female | twin_buns | brown | basic | static 8-dir | 50 | 42 | female/basic/02_space_buns/brown |
| 71 | red_basic.png | assets/characters/female/twin_buns/red_basic.png | PNG | 256x128 | 64x64 | 8 | female | twin_buns | red | basic | static 8-dir | 49 | 38 | female/basic/02_space_buns/red |
| 72 | blonde_basic.png | assets/characters/female/bob/blonde_basic.png | PNG | 256x128 | 64x64 | 8 | female | bob | blonde | basic | static 8-dir | 52 | 42 | female/basic/03_blunt_bob/blond |
| 73 | black_basic.png | assets/characters/female/bob/black_basic.png | PNG | 256x128 | 64x64 | 8 | female | bob | black | basic | static 8-dir | 51 | 39 | female/basic/03_blunt_bob/black |
| 74 | silver_basic.png | assets/characters/female/bob/silver_basic.png | PNG | 256x128 | 64x64 | 8 | female | bob | silver | basic | static 8-dir | 52 | 38 | female/basic/03_blunt_bob/silver |
| 75 | brown_basic.png | assets/characters/female/bob/brown_basic.png | PNG | 256x128 | 64x64 | 8 | female | bob | brown | basic | static 8-dir | 52 | 41 | female/basic/03_blunt_bob/brown |
| 76 | red_basic.png | assets/characters/female/bob/red_basic.png | PNG | 256x128 | 64x64 | 8 | female | bob | red | basic | static 8-dir | 51 | 38 | female/basic/03_blunt_bob/red |
| 77 | blonde_basic.png | assets/characters/female/ponytail/blonde_basic.png | PNG | 256x128 | 64x64 | 8 | female | ponytail | blonde | basic | static 8-dir | 55 | 52 | female/basic/04_high_ponytail/blond |
| 78 | black_basic.png | assets/characters/female/ponytail/black_basic.png | PNG | 256x128 | 64x64 | 8 | female | ponytail | black | basic | static 8-dir | 55 | 52 | female/basic/04_high_ponytail/black |
| 79 | silver_basic.png | assets/characters/female/ponytail/silver_basic.png | PNG | 256x128 | 64x64 | 8 | female | ponytail | silver | basic | static 8-dir | 55 | 52 | female/basic/04_high_ponytail/silver |
| 80 | brown_basic.png | assets/characters/female/ponytail/brown_basic.png | PNG | 256x128 | 64x64 | 8 | female | ponytail | brown | basic | static 8-dir | 56 | 54 | female/basic/04_high_ponytail/brown |
| 81 | red_basic.png | assets/characters/female/ponytail/red_basic.png | PNG | 256x128 | 64x64 | 8 | female | ponytail | red | basic | static 8-dir | 56 | 52 | female/basic/04_high_ponytail/red |
| 82 | blonde_basic.png | assets/characters/female/fluffy_curls/blonde_basic.png | PNG | 256x128 | 64x64 | 8 | female | fluffy_curls | blonde | basic | static 8-dir | 54 | 49 | female/basic/05_curly/blond |
| 83 | black_basic.png | assets/characters/female/fluffy_curls/black_basic.png | PNG | 256x128 | 64x64 | 8 | female | fluffy_curls | black | basic | static 8-dir | 54 | 50 | female/basic/05_curly/black |
| 84 | silver_basic.png | assets/characters/female/fluffy_curls/silver_basic.png | PNG | 256x128 | 64x64 | 8 | female | fluffy_curls | silver | basic | static 8-dir | 54 | 49 | female/basic/05_curly/silver |
| 85 | brown_basic.png | assets/characters/female/fluffy_curls/brown_basic.png | PNG | 256x128 | 64x64 | 8 | female | fluffy_curls | brown | basic | static 8-dir | 54 | 49 | female/basic/05_curly/brown |
| 86 | red_basic.png | assets/characters/female/fluffy_curls/red_basic.png | PNG | 256x128 | 64x64 | 8 | female | fluffy_curls | red | basic | static 8-dir | 53 | 49 | female/basic/05_curly/red |
| 87 | blonde_basic.png | assets/characters/female/long_side_part/blonde_basic.png | PNG | 256x128 | 64x64 | 8 | female | long_side_part | blonde | basic | static 8-dir | 54 | 48 | female/basic/06_side_part_long/blond |
| 88 | black_basic.png | assets/characters/female/long_side_part/black_basic.png | PNG | 256x128 | 64x64 | 8 | female | long_side_part | black | basic | static 8-dir | 54 | 48 | female/basic/06_side_part_long/black |
| 89 | silver_basic.png | assets/characters/female/long_side_part/silver_basic.png | PNG | 256x128 | 64x64 | 8 | female | long_side_part | silver | basic | static 8-dir | 54 | 47 | female/basic/06_side_part_long/silver |
| 90 | brown_basic.png | assets/characters/female/long_side_part/brown_basic.png | PNG | 256x128 | 64x64 | 8 | female | long_side_part | brown | basic | static 8-dir | 54 | 48 | female/basic/06_side_part_long/brown |
| 91 | red_basic.png | assets/characters/female/long_side_part/red_basic.png | PNG | 256x128 | 64x64 | 8 | female | long_side_part | red | basic | static 8-dir | 55 | 48 | female/basic/06_side_part_long/red |
| 92 | blonde_adventurer.png | assets/characters/female/straight_bangs/blonde_adventurer.png | PNG | 256x128 | 64x64 | 8 | female | straight_bangs | blonde | adventurer | static 8-dir | 55 | 49 | female/adventurer/01_long_bangs/blond |
| 93 | black_adventurer.png | assets/characters/female/straight_bangs/black_adventurer.png | PNG | 256x128 | 64x64 | 8 | female | straight_bangs | black | adventurer | static 8-dir | 55 | 49 | female/adventurer/01_long_bangs/black |
| 94 | silver_adventurer.png | assets/characters/female/straight_bangs/silver_adventurer.png | PNG | 256x128 | 64x64 | 8 | female | straight_bangs | silver | adventurer | static 8-dir | 55 | 49 | female/adventurer/01_long_bangs/silver |
| 95 | brown_adventurer.png | assets/characters/female/straight_bangs/brown_adventurer.png | PNG | 256x128 | 64x64 | 8 | female | straight_bangs | brown | adventurer | static 8-dir | 55 | 49 | female/adventurer/01_long_bangs/brown |
| 96 | blonde_adventurer.png | assets/characters/female/twin_buns/blonde_adventurer.png | PNG | 256x128 | 64x64 | 8 | female | twin_buns | blonde | adventurer | static 8-dir | 54 | 47 | female/adventurer/02_space_buns/blond |
| 97 | black_adventurer.png | assets/characters/female/twin_buns/black_adventurer.png | PNG | 256x128 | 64x64 | 8 | female | twin_buns | black | adventurer | static 8-dir | 55 | 51 | female/adventurer/02_space_buns/black |
| 98 | silver_adventurer.png | assets/characters/female/twin_buns/silver_adventurer.png | PNG | 256x128 | 64x64 | 8 | female | twin_buns | silver | adventurer | static 8-dir | 54 | 48 | female/adventurer/02_space_buns/silver |
| 99 | brown_adventurer.png | assets/characters/female/twin_buns/brown_adventurer.png | PNG | 256x128 | 64x64 | 8 | female | twin_buns | brown | adventurer | static 8-dir | 55 | 51 | female/adventurer/02_space_buns/brown |
| 100 | red_adventurer.png | assets/characters/female/twin_buns/red_adventurer.png | PNG | 256x128 | 64x64 | 8 | female | twin_buns | red | adventurer | static 8-dir | 54 | 50 | female/adventurer/02_space_buns/red |
| 101 | blonde_adventurer.png | assets/characters/female/bob/blonde_adventurer.png | PNG | 256x128 | 64x64 | 8 | female | bob | blonde | adventurer | static 8-dir | 53 | 44 | female/adventurer/03_blunt_bob/blond |
| 102 | black_adventurer.png | assets/characters/female/bob/black_adventurer.png | PNG | 256x128 | 64x64 | 8 | female | bob | black | adventurer | static 8-dir | 54 | 45 | female/adventurer/03_blunt_bob/black |
| 103 | silver_adventurer.png | assets/characters/female/bob/silver_adventurer.png | PNG | 256x128 | 64x64 | 8 | female | bob | silver | adventurer | static 8-dir | 54 | 46 | female/adventurer/03_blunt_bob/silver |
| 104 | brown_adventurer.png | assets/characters/female/bob/brown_adventurer.png | PNG | 256x128 | 64x64 | 8 | female | bob | brown | adventurer | static 8-dir | 53 | 45 | female/adventurer/03_blunt_bob/brown |
| 105 | red_adventurer.png | assets/characters/female/bob/red_adventurer.png | PNG | 256x128 | 64x64 | 8 | female | bob | red | adventurer | static 8-dir | 54 | 46 | female/adventurer/03_blunt_bob/red |
| 106 | blonde_adventurer.png | assets/characters/female/ponytail/blonde_adventurer.png | PNG | 256x128 | 64x64 | 8 | female | ponytail | blonde | adventurer | static 8-dir | 53 | 48 | female/adventurer/04_high_ponytail/blond |
| 107 | black_adventurer.png | assets/characters/female/ponytail/black_adventurer.png | PNG | 256x128 | 64x64 | 8 | female | ponytail | black | adventurer | static 8-dir | 55 | 48 | female/adventurer/04_high_ponytail/black |
| 108 | silver_adventurer.png | assets/characters/female/ponytail/silver_adventurer.png | PNG | 256x128 | 64x64 | 8 | female | ponytail | silver | adventurer | static 8-dir | 54 | 48 | female/adventurer/04_high_ponytail/silver |
| 109 | brown_adventurer.png | assets/characters/female/ponytail/brown_adventurer.png | PNG | 256x128 | 64x64 | 8 | female | ponytail | brown | adventurer | static 8-dir | 54 | 48 | female/adventurer/04_high_ponytail/brown |
| 110 | red_adventurer.png | assets/characters/female/ponytail/red_adventurer.png | PNG | 256x128 | 64x64 | 8 | female | ponytail | red | adventurer | static 8-dir | 55 | 48 | female/adventurer/04_high_ponytail/red |
| 111 | blonde_adventurer.png | assets/characters/female/fluffy_curls/blonde_adventurer.png | PNG | 256x128 | 64x64 | 8 | female | fluffy_curls | blonde | adventurer | static 8-dir | 54 | 49 | female/adventurer/05_curly/blond |
| 112 | black_adventurer.png | assets/characters/female/fluffy_curls/black_adventurer.png | PNG | 256x128 | 64x64 | 8 | female | fluffy_curls | black | adventurer | static 8-dir | 55 | 50 | female/adventurer/05_curly/black |
| 113 | silver_adventurer.png | assets/characters/female/fluffy_curls/silver_adventurer.png | PNG | 256x128 | 64x64 | 8 | female | fluffy_curls | silver | adventurer | static 8-dir | 54 | 50 | female/adventurer/05_curly/silver |
| 114 | brown_adventurer.png | assets/characters/female/fluffy_curls/brown_adventurer.png | PNG | 256x128 | 64x64 | 8 | female | fluffy_curls | brown | adventurer | static 8-dir | 55 | 51 | female/adventurer/05_curly/brown |
| 115 | red_adventurer.png | assets/characters/female/fluffy_curls/red_adventurer.png | PNG | 256x128 | 64x64 | 8 | female | fluffy_curls | red | adventurer | static 8-dir | 54 | 49 | female/adventurer/05_curly/red |

Unidentified assets: none. Uncertain identifications: female hairstyle mapping relies on catalog order + visual check (no explicit labels in the pack metadata).
