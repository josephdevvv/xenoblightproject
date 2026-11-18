# Project Status

**Current milestone:** 01 — Playable prototype (character creation + first isometric map)
**Status:** Complete. Type check, production build and in-browser tests pass.
**Last updated:** 2026-11-18

## Completed systems

| System | Notes |
| --- | --- |
| Project setup | Phaser 3.90, TypeScript (strict), Vite 5. `Phaser.AUTO` (WebGL, Canvas fallback). 960x480, FIT scaling, centered, pixel art / nearest filtering / no antialiasing. |
| Boot | Preloads production assets from the manifest (empty now), generates mockup textures. |
| Character data | `CharacterAppearance` (gender, hairstyle, hair colour, outfit IDs), `CharacterData`, name validation, in-memory `CharacterStore`. |
| Appearance catalog | 2 genders, 6 hairstyles per gender (from the design doc), 5 hair colours, 2 outfits (Basic Wraps = "unclothed", Adventurer). |
| Character asset IDs | One sprite ID + expected file path per combination (120 total). |
| Production character art | `char_male_long_middle_part_blonde_adventurer` (male, long middle part, blonde, adventurer): 8 static directions, default appearance in creation and in game. |
| Mockup character sheets | Generated on demand only for appearances without production art; same 4x2 static layout. |
| Character rendering | `CharacterView` = one sprite per character; appearance change swaps the whole sheet. |
| Character animator | `CharacterAnimator`: while moving plays the 8-direction walk cycle (6 frames, 8 FPS, looping; keeps stride phase when turning); when movement stops it switches immediately to the static standing frame of the last facing. No idle animation. Each sheet has its own feet origin (standing 58, walk 62). Only appearances with a walk sheet animate. |
| Character creation screen | Gender, hairstyle, hair colour, outfit, name, live preview (rotate 8 directions, shows sprite ID). |
| Name validation | Trimmed, 3-16 characters, letters (any script incl. Thai) / digits / single spaces. Inline error message. |
| Isometric map | 30x30 diamond tiles (64x32), correct iso <-> tile conversion, ground/path/vent tiles, 7 prop types, depth sorting by screen Y. |
| Collision + bounds | Blocked tiles from props; thin wall boxes from structures; map edges are walls; axis-separated sliding, flush contact. |
| Walk-in structures | `ruined_house`: burnt medieval half-timbered house, 3x3 footprint (192x96 px) centred on tile (22,7). Built from thin edge walls + corner posts + chimney (smoking), plank floor, rubble decals. Doorway (SW) and collapsed gap (SE). Characters' depth is corrected per frame against nearby wall pieces; walls that hide the player fade out. |
| Player movement | WASD, 8 directions, ground-space normalised speed (3.6 tiles/s), facing, idle/walk state. |
| Camera | Smooth follow, clamped to world bounds, round pixels. |
| Atmosphere | Dithered fog (low + high layers), drifting cloud shadows, smoke from vents and braziers, subtle purple glow on shrine/braziers, vignette. |
| Game logo | Real logo art (`public/assets/ui/xenoblight_logo.jpg`) shown in the creation-screen header; smoothly pre-scaled and edge-faded at runtime. |
| HUD | Name plate, info panel (tile, facing, state), controls hint. Esc returns to character creation. |

## Verified in browser (dev server)

- Character creation screen loads, no console errors
- Gender / hairstyle / hair colour / outfit selection update the preview and sprite ID
- Name validation: empty, too short and invalid-character names are rejected with a message
- Create Character transitions to the map; selected appearance spawns on the spawn tile
- All 8 WASD directions: correct facing + walk animation; equal distance travelled per direction; idle on release
- Collision: player stops at the shrine and shows idle while pushing against it
- Boundaries: player stops at the south and west map edges
- Esc -> creation (previous selections and name restored) -> create again works (scene restart)
- Ruined house: enter through the doorway, stop flush at back/front/side walls, exit through the SE gap;
  drawn in front of back walls when inside, behind them (walls fade) when standing behind the house

## Pending systems (future milestones)

Not in scope for Milestone 01, intentionally not implemented:
multiplayer / networking, login / accounts, database persistence, combat, skills, inventory,
equipment, monsters, quests, audio, deployment, monetisation.

Prepared for (not implemented): combat-idle / attack / cast / pick-up / death animations using only
NE / SE / SW / NW (`ACTION_DIRECTIONS`), production character sheets via `CHARACTER_SPRITE_MANIFEST`.

Design-doc content waiting for later milestones: Drifter beginner class (max level 10), six level-50 classes
(Vanguard, Blightbreaker, Outrider, Voidweaver, Zealot, Stalker), passive skill tree, skill-book unlocks,
level 50+ mutation subclasses.

## Technical decisions

1. **Full pre-rendered sprites, no layering.** An appearance resolves to one sprite ID and one texture.
   The mockup generator paints hair/outfit into a single flat sheet at generation time only, as a stand-in
   for the real art; runtime never stacks layers. Only viewed combinations are generated.
2. **Sheet contract:** 64x64 frames, 4x2 grid of static directions: row 0 = S, SE, E, NE; row 1 = N, NW, W, SW.
   Feet at (32, 58). The order was verified on the first production sheet (frame 7 = SW is only a slight turn).
   Mockup W / SW / NW frames are mirrors of E / SE / NE; production art has unique frames.
3. **Coordinates.** Logic runs in continuous tile (ground) space; `IsoProjection` converts to world pixels
   (`x = ox + (tx - ty) * 32`, `y = oy + (tx + ty) * 16`). The map is never treated as a square screen grid.
4. **Movement mapping.** W/A/S/D are screen directions (up/left/down/right). Diagonal key combos follow the
   tile axes, which suits grid paths and walls. Speed is normalised in ground space, so on-screen vertical
   motion is half as fast as horizontal (correct isometric foreshortening).
5. **Separation of concerns.** `KeyboardMovementInput` (keys) -> `PlayerMovement` (pure, Phaser-free movement +
   collision) -> `PlayerController` (orchestration) -> `AnimationController` (clip selection) / `CharacterView` (sprite).
6. **Collision.** Square footprint (radius 0.22 tiles) tested against blocked tiles at its four corners,
   x and y resolved separately for wall sliding; steps are capped at 1/30 s to prevent tunnelling.
7. **Depth sorting.** Ground tiles in a back-to-front layer; props and characters use their screen Y as depth.
8. **Art pipeline.** Mockups are painted at half resolution and upscaled x2 (nearest), giving one consistent
   pixel density. Everything is registered under stable keys so real assets replace mockups without code changes.
9. **Name input** uses a native HTML `<input>` through Phaser's DOM layer (supports Thai IME, clipboard).
10. **Map size** 30x30 tiles = 1920x960 px of world, two viewports across at 960x480. Spawn tile (14, 28) at the
    south end of the south road.
11. **Walk-in structures** (`src/world/structures/`). A building is data (`StructureBlueprints.ts`): wall pieces on
    tile edges, corner posts, decals. Back walls are tall, front walls ruined low (classic iso cut-away). Each piece
    is its own sprite + collision box. Screen-Y sorting alone cannot order a character against thin walls, so
    `StructureLayer.resolveDepth` classifies each overlapping piece as behind/in front with a separating-axis test in
    tile space and clamps the character's depth between them. This works per character, so it scales to many actors.

## Known issues

- The dev-only Vite 5 / esbuild dev server has an npm audit advisory (moderate). Production dependencies report
  0 vulnerabilities. The fix needs Vite 7, which requires Node 20.19+ (current machine: 20.11).
- Phaser's Canvas fallback is configured (`Phaser.AUTO`) but was not separately exercised; testing ran on WebGL.
  In Canvas mode, additive glow blending may look slightly different.
- The logo file is a non-transparent JPG; its dark background is faded at the edges but still shows faintly
  as a slightly lighter rectangle. Replace with a transparent PNG later.
- Mockup characters are deliberately crude; NE/NW (and SE/SW) differ only by mirroring.
- First production sheet: body pixels have alpha 252-253 (not 255) and ~1,300 very faint (alpha 1-30) dark
  edge/speck pixels, typical of a resampled export. Not visible on the dark map; clean in the source art if needed.
  Its SW frame (7) is turned only slightly and reads close to the S frame.
- The walk sheet's figure is drawn ~6 px taller (59 px vs 54 px) than the standing sheet's, so the head shifts up
  slightly when walking starts. Feet stay aligned. Fixing it needs matching art (no non-integer rescaling).
- UI text is rendered by Phaser and is scaled with the canvas, so it looks soft/blocky at large window sizes.

## Next development steps

1. Commission / produce the first production character sheets and register them in the manifest.
2. Replace mockup tiles and props; consider authoring maps in Tiled and loading the JSON into `MapDefinition`.
3. Add a pixel bitmap font for crisp UI text.
4. Introduce the action-animation sheet contract (NE/SE/SW/NW) ahead of combat.
5. Define the server-authoritative data model before networking (character store -> API client).
