# Project Status

**Current milestone:** 01 — Playable prototype (character creation + first isometric map),
plus the loading & performance architecture groundwork
**Status:** Complete. Type check, production build and in-browser tests pass.
**Last updated:** 2026-11-18

## Completed systems

| System | Notes |
| --- | --- |
| Project setup | Phaser 3.90, TypeScript (strict), Vite 5. `Phaser.AUTO` (WebGL, Canvas fallback). 960x480, FIT scaling, centered, pixel art / nearest filtering / no antialiasing. |
| Boot | Loads only essential assets (logo) and generates the core environment textures. |
| Loading & performance architecture | Persistent `SystemScene` hosting `GameServices`: `AssetLoadingManager` (on-demand, deduplicated, failure-safe), `ResourceCacheManager` (ref-counted texture ownership, grace-period GC), `MapLoadingManager` (PRELOAD -> PREPARE -> time-sliced BUILD -> TRANSITION -> CLEANUP), `PerformanceManager` (frame stats, budgets, distance priorities), `VisibilityCuller` (off-screen static objects hidden, off-screen smoke paused), `LoadingScreen`, optional debug overlay (F3 in dev, `?debug` in production). See PERFORMANCE_GUIDELINES.md. |
| Lazy character loading | Character sheets load when a scene needs them (creation: standing only; game: standing + walk); views hold cache references; failed art falls back to a mockup. |
| Multiplayer preparation | Interfaces only (`src/multiplayer/contracts.ts`): character snapshots, appearance loader, remote renderer, interest manager, nearby query; `CharacterRegistry` tracks live views. No networking. |
| Character data | `CharacterAppearance` (gender, hairstyle, hair colour, outfit IDs), `CharacterData`, name validation, in-memory `CharacterStore`. |
| Appearance catalog | 2 genders, 6 hairstyles per gender (from the design doc), 5 hair colours, 2 outfits (Basic Wraps = "unclothed", Adventurer). |
| Character asset IDs | One sprite ID + expected file path per combination (120 total). |
| Production character art | 114 of 120 appearances have full pre-rendered static 8-direction sheets (male 60/60, female 54/60), loaded on demand (character creation prefetches likely choices in the background). Every sheet is measured at runtime (`SpriteMetrics`): anchored on its feet and normalised to a 54 px figure height, so all appearances are the same size and do not jump when options change. Walk animation for male / long_middle_part / blonde / adventurer (also the default appearance); others use their static directional frame while moving. Inventory: CHARACTER_SPRITE_INVENTORY.md. |
| Mockup character sheets | Generated on demand only for the 6 appearances without production art (female adventurer long_side_part x5, straight_bangs red); same 4x2 static layout. |
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
| Game logo & app icons | Transparent logo (`public/icons/XENOBLIGHT_512x512.png`) in the creation-screen header, smoothly pre-scaled at runtime. Browser favicon `XENOBLIGHT_App.ico` (16-256 px), `apple-touch-icon` (256 px PNG) and `manifest.webmanifest` (128/256/512 px). |
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
- Loading architecture: only the logo + standing sheet are fetched before creation; the walk sheet on entering
  the map; duplicate requests share one fetch; a missing file fails cleanly; 3 game/creation cycles keep
  texture count, display-list size and registered characters constant; culling hides nothing on screen and
  never affects collision; production build has no overlay unless `?debug`
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
- Mockup characters are deliberately crude; NE/NW (and SE/SW) differ only by mirroring.
- First production sheet: body pixels have alpha 252-253 (not 255) and ~1,300 very faint (alpha 1-30) dark
  edge/speck pixels, typical of a resampled export. Not visible on the dark map; clean in the source art if needed.
  Its SW frame (7) is turned only slightly and reads close to the S frame.
- Character size normalisation uses non-integer nearest-neighbour scaling for sheets whose figure is not 54 px
  tall (by user decision): sprites stay sharp, but some pixels render slightly wider than others.
  (This also resolved the walk sheet being drawn ~6 px taller than the standing sheet.)
- UI text is rendered by Phaser and is scaled with the canvas, so it looks soft/blocky at large window sizes.

## Next development steps

1. Commission / produce the first production character sheets and register them in the manifest.
2. Replace mockup tiles and props; consider authoring maps in Tiled and loading the JSON into `MapDefinition`.
3. Add a pixel bitmap font for crisp UI text.
4. Introduce the action-animation sheet contract (NE/SE/SW/NW) ahead of combat.
5. Define the server-authoritative data model before networking (character store -> API client).
6. When a second map exists: register it in `MapRegistry`, call `maps.prepare()` near entrances and
   `maps.enter()` on transition (see PERFORMANCE_GUIDELINES.md).
7. Implement `RemoteCharacterRenderer` / `InterestManager` from `src/multiplayer/contracts.ts` once networking starts.
