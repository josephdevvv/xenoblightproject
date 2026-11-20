# Project Status

**Current milestone:** 01 — Playable prototype (character creation + first isometric map),
plus the loading & performance architecture groundwork and the Character Status foundation
**Status:** Complete. Type check, production build and in-browser tests pass.
**Last updated:** 2026-11-19

## Completed systems

| System | Notes |
| --- | --- |
| Project setup | Phaser 3.90, TypeScript (strict), Vite 5. `Phaser.AUTO` (WebGL, Canvas fallback). 960x480, FIT scaling, centered, pixel art / nearest filtering / no antialiasing. |
| Boot | Loads only essential assets (logo) and generates the core environment textures. |
| Loading & performance architecture | Persistent `SystemScene` hosting `GameServices`: `AssetLoadingManager` (on-demand, deduplicated, failure-safe), `ResourceCacheManager` (ref-counted texture ownership, grace-period GC), `MapLoadingManager` (PRELOAD -> PREPARE -> time-sliced BUILD -> TRANSITION -> CLEANUP), `PerformanceManager` (frame stats, budgets, distance priorities), `VisibilityCuller` (off-screen static objects hidden, off-screen smoke paused), `LoadingScreen`, optional debug overlay (F3 in dev, `?debug` in production). See PERFORMANCE_GUIDELINES.md. |
| Lazy character loading | Character sheets load when a scene needs them (creation: standing only; game: standing + walk); views hold cache references; failed art falls back to a mockup. |
| Multiplayer preparation | Interfaces only (`src/multiplayer/contracts.ts`): character snapshots, appearance loader, remote renderer, interest manager, nearby query; `CharacterRegistry` tracks live views. No networking. |
| Character data | `CharacterAppearance` (gender, hairstyle, hair colour, outfit IDs), `CharacterData` (+ `classId`), name validation, in-memory `CharacterStore`. New characters come only from `createCharacterData` + `StarterCharacters` (gender + hairstyle chosen; hair colour blonde / `none` for bald, outfit and class `drifter` enforced). `CharacterProfileStore`: per-name profile in localStorage (appearance + class), last-played pointer; an existing name is restored unchanged (`restoreCharacterData`). |
| Appearance catalog | Data model: 2 genders, hairstyles per gender (design doc + Sprite Forge `bald`), 5 hair colours, outfits (basic, adventurer, drifter). Only the starter subset is selectable (`StarterCharacters`). |
| Character asset IDs | One sprite ID + expected file path per combination (120 total). |
| Production character art | Approved Xenoblight Sprite Forge exports only (`src/assets/SpriteForgeCharacters.ts`, files in `public/assets/characters/`): male bald, male mohawk (forge spike) blonde, female bald, female straight bangs blonde - each as Drifter and base (no outfit); static 4x2 (256x128) + walk 6x8 (384x512, 125 ms). Loaded on demand; one fixed canvas root (32, 57) for every static and walk frame (`CHARACTER_CANVAS_ROOT`; mockups keep the measured feet anchor from `SpriteMetrics`); size from the body master (`CharacterBodyMetrics`: one scale x0.982 per master for every hairstyle / outfit, static and walk - bald no longer renders ~12 % larger than haired, legs and feet match pixel for pixel). The earlier imported sheets were removed (see the note in CHARACTER_SPRITE_INVENTORY.md). |
| Mockup character sheets | Procedural generator kept only for appearances with no art at all (not reachable from character creation). Approved art is never replaced by a mockup: a missing approved sheet is logged with its exact path and shown as the missing texture. |
| Character rendering | `CharacterView` = one sprite per character; appearance change swaps the whole sheet. |
| Character animator | `CharacterAnimator`: while moving plays the 8-direction walk cycle (6 frames, 8 FPS, looping; keeps stride phase when turning); when movement stops it switches immediately to the static standing frame of the last facing. No idle animation. Approved art: one origin for both sheets (canvas root 32, 57), so standing <-> walking never hops; mockups: each sheet has its own measured feet origin. Only appearances with a walk sheet animate. |
| Character creation screen | Gender (Male / Female), hairstyle (Bald + Mohawk for male, Bald + Straight Bangs for female, two buttons), Drifter outfit preview (not selectable), name, live preview (rotate 8 directions, shows sprite ID). No hair-colour or outfit selector. Pre-filled with the last played character. |
| Name validation | Trimmed, 3-16 characters, letters (any script incl. Thai) / digits / single spaces. Inline error message. |
| Isometric map | 30x30 diamond tiles (64x32), correct iso <-> tile conversion, ground/path/vent tiles, 7 prop types, depth sorting by screen Y. |
| Collision + bounds | Blocked tiles from props; thin wall boxes from structures; map edges are walls; axis-separated sliding, flush contact. |
| Walk-in structures | `ruined_house`: burnt medieval half-timbered house, 3x3 footprint (192x96 px) centred on tile (22,7). Built from thin edge walls + corner posts + chimney (smoking), plank floor, rubble decals. Doorway (SW) and collapsed gap (SE). Characters' depth is corrected per frame against nearby wall pieces; walls that hide the player fade out. |
| Player movement | WASD, 8 directions, ground-space normalised speed (3.6 tiles/s), facing, idle/walk state. |
| Camera | `StableCameraFollow`: smooth frame-rate independent follow (lerp 0.12 per 60 fps frame, view 24 px above the feet), clamped to world bounds; exact scroll kept, camera drawn at whole pixels, the player drawn at a camera-stable whole pixel - no 1 px back-and-forth while walking. Zoom 1. |
| Atmosphere | Dithered fog (low + high layers), drifting cloud shadows, smoke from vents and braziers, subtle purple glow on shrine/braziers, vignette. |
| Game logo & app icons | Transparent logo (`public/icons/XENOBLIGHT_512x512.png`) in the creation-screen header, smoothly pre-scaled at runtime. Browser favicon `XENOBLIGHT_App.ico` (16-256 px), `apple-touch-icon` (256 px PNG) and `manifest.webmanifest` (128/256/512 px). |
| Monster system | `src/monsters/`: `MonsterDefinition` (data: id, name, sprite frame/anchor/optional URL, future animation clips, footprint), `MonsterEntity` (one static full-sprite image, feet-anchored, depth-sorted once), `MonsterSpawner` (validates bounds, blocked tiles, buildings, walls, distance from player spawn in world px, overlaps; reports and skips invalid points), `MonsterSpawns` (deterministic per-map spawn table). First monster: **Voidmite**, 64x32 procedural mockup (`MockupMonsterFactory`), 10 spawned on Ashen Crossroads. Idle **wandering** (`WanderBehavior`): walks to random reachable points within 3 tiles of its spawn at 0.9 tiles/s, pauses 0.9-2.8 s, uses the same tile collision as the player, never enters buildings or overlaps other monsters, gives up on destinations it stops approaching (0.6 s), skipped when in the "dormant" distance band. No AI decisions, chasing, combat, HP, or collision with the player. |
| HUD | Dungeon HUD layer pack (`art-source/ui/dungeon_hud`), converted by `tools/import-hud-pack.ps1` to half-resolution cropped layers (2-px lines -> crisp 1-px, no blur) and drawn by `DungeonHud` in `GameUIScene` in the pack's render order, each layer pinned to its screen edge. Game-rendered: name (truncated to fit), level, HP / SP values with code-driven fill bars (`#D74A51` / `#5699E2`, current = max until combat exists), EXP bar (`#AB71D5`, 0 % - no EXP system), tile coordinates (centred in their box), map name, minimap (terrain baked per map + live player / monster dots), Status icon in the menu bar (hover tooltip). The pack's chat box (`04_chat`) is not shown (removed by request; listed in `HIDDEN_LAYERS`). Placeholders with no system behind them: quest tracker, AUTO, hotbar, the other 4 menu slots and the menu button. World-space name plate above the player: attached to the drawn feet root at a fixed height per appearance (never follows the animated frame; text set once). Esc returns to character creation. |
| Character Status (foundation) | `src/status/`. `CharacterData.status` = level (1-99), BASE stats (STR/DEX/INT/VIT/AGI/LUK, start 1, max 99 from points), BONUS stats (future equipment/passives, 0 for now, not saved), TOTAL = base + bonus (may exceed 99), unspent stat points. 3 points per level from 2 to 99 (294 total), 1 point = +1 base. `DerivedStats.ts` holds every TEMPORARY formula in one table (Melee/Ranged ATK, MATK, Max HP/SP, DEF, MDEF, HIT, FLEE, Attack Speed bonus, Crit Rate/Damage, Material Find as a relative bonus), computed from TOTAL stats, shown with at most 2 decimals. `StatAllocationDraft` stages points and re-validates on confirm. `StatusSaveStore`: localStorage, one key per character name (`xenoblight.status.v1.<name>`), saves level/base/points only and recalculates derived stats; invalid fields are clamped individually, unreadable records are backed up (`.invalid-backup`) and replaced with a fresh status; missing level points are granted retroactively, extra points are never removed. `CharacterStatusService` is the single entry point (load, confirm, `setLevel` hook, dev grant, change events). UI: `GameUIScene` overlay, opened from the HUD menu's Status icon, with a modal `StatusWindow` drawn with the Moonsteel status kit (`art-source/ui/status_moonsteel`, 480x270 at 1:1, cropped by `tools/import-status-kit.ps1`): header with name / level, stat points, 6 stat rows with baked + buttons (dimmed when unavailable), derived list with live PREVIEW (scrolls by one baked row), RESET / CANCEL / CONFIRM, DEV +10 (Shift: +100) in dev builds only - the unused kit button is covered in production. Not applied to gameplay yet: no combat, EXP or leveling. |

| Localization (TH / EN) | `src/i18n`: Thai default for new players (browser language ignored), English selectable; typed keys (`Messages` from `th.ts`, `en.ts` must match), `{placeholder}` interpolation, missing key -> Thai text -> key (reported in dev), runtime switch with `onLanguageChange` / `localize()` (no restart), `<html lang>` kept in sync. Persisted in `localStorage` (`xenoblight.settings.v1`, `src/settings/SettingsStore.ts`); invalid values fall back to Thai. All player-facing text migrated: boot / loading, character creation (labels, options, hints, validation errors, directions), HUD, Status window (labels, descriptions, derived stats, messages, errors), Settings. Validation / allocation errors are message keys, translated at display time. Dev-only debug overlay stays English. |
| Settings window | `SettingsWindow`: language selector (ไทย / English, current one highlighted), reachable from character creation (top-right button) and in game (HUD menu icon); Esc closes it first. |
| UI font | Kanit (Cadson Demak, SIL OFL 1.1) for Thai and English: Fontsource 5.3.0 woff2 subsets (Thai + Latin, 400/500/600, ~100 KB, unicode-range) loaded before the game (`src/ui/text/Typography.ts`). Typography roles (display 28/600, heading 16/600, section 13/600, body 12/400, button 12/500, label 12/500, number 12/500, tooltip 11/400, small 10/400) via `typo()` in `UITheme`; line height measured with Thai stacked marks; no letter spacing; smooth text (sprites stay nearest-neighbour); name input uses the same font. Replaced ZF #2ndPixelus (2026-11-20; original kept in art-source only). Fallback: Noto Sans Thai / Leelawadee UI / Tahoma. |

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
- Character Status: level-1 derived values match the spec (ATK 7/7/7, HP 120, SP 23, DEF 1, MDEF 0.5, HIT 104,
  FLEE 103, ASPD 0.2%, Crit 5.1% / 150%, Material Find 0.05%); + stages points, CANCEL / X / Esc discard,
  CONFIRM applies and saves; base capped at 99, no overspending (also re-checked at confirm); status survives a
  page reload (same name, any letter case); corrupted / out-of-range saves are repaired or backed up; UI clicks
  never move the player and Esc closes the window before leaving the map; DEV buttons absent in a production
  build without `?debug`

- Localization: new player starts in Thai (`lang="th"`); Settings -> English switches every visible text at once
  (creation screen, Settings, input placeholder) and saves it; reload restores English; switching back to Thai in
  game updates HUD and an open Status window (incl. pending `+N`, preview caption, summary); Settings opens from the
  HUD menu icon (tooltip), Esc closes it before leaving the map; Thai text checked at 2-4x magnification (marks
  stacked correctly, no clipping); fallback system font checked (`?nofont`); `npm test` 12/12
- Kanit typography: creation screen, Settings (Thai / English), HUD, name plate and Status window checked at 2x
  in both languages - Thai vowels / tone marks correct, button captions centred, no clipping or overlap after
  moving stat descriptions clear of the wider labels and the panel-title underline below descenders

- Jitter fix (character + name plate): all 4 Drifters (male bald / mohawk, female bald / straight bangs) and a
  Thai name, walking in 8 directions, measured frame by frame - screen position moves only forward while walking
  (0 back-and-forth steps within a walk; was up to 41 in 2 s), name plate offset from the feet constant in every
  frame, static and walk frames share one top-left and scale x0.982, all drawn positions whole pixels; moving
  monsters and the creation preview unaffected; `npm test` 45/45

## Pending systems (future milestones)

Not in scope for Milestone 01, intentionally not implemented:
multiplayer / networking, login / accounts, database persistence, combat, EXP / leveling gameplay, skills,
inventory, equipment, monster AI / chasing / combat / HP / loot / respawn, quests, audio, monetisation.
(Monsters exist as wandering visual entities only - see "Monster system".)

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
   Feet on the canvas root line (32, 57) - approved Sprite Forge art; mockups are measured. The order was verified on the first production sheet (frame 7 = SW is only a slight turn).
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

- Dungeon HUD: layers, text and bars line up with the frames (checked with 3x / 4x pixel snapshots, no blur);
  the Status icon opens the window with a real click without moving the player; HP / SP update live after a
  confirmed VIT / INT allocation; coordinates and minimap follow the player; 10 monster dots tracked; leaving and
  re-entering the map rebuilds the HUD with the same object and texture counts (no leaks)

- Starter characters (Sprite Forge): all four Drifter looks (male bald / mohawk, female bald / straight bangs) load
  their approved static sheets (only those four requests, all 200) and show the right art in all 8 directions in the
  preview; in game the walk sheet plays 6 frames per direction at 125 ms on the matching row in all 8 directions and
  returns to the static frame of the last facing on release; new characters save as Drifter (profile in localStorage),
  a reload pre-fills creation, an existing name is restored unchanged; Esc -> creation -> re-enter works

## Known issues

- The dev-only Vite 5 / esbuild dev server has an npm audit advisory (moderate). Production dependencies report
  0 vulnerabilities. The fix needs Vite 7, which requires Node 20.19+ (current machine: 20.11).
- Phaser's Canvas fallback is configured (`Phaser.AUTO`) but was not separately exercised; testing ran on WebGL.
  In Canvas mode, additive glow blending may look slightly different.
- Mockup characters are deliberately crude; NE/NW (and SE/SW) differ only by mirroring.
- First production sheet: body pixels have alpha 252-253 (not 255) and ~1,300 very faint (alpha 1-30) dark
  edge/speck pixels, typical of a resampled export. Not visible on the dark map; clean in the source art if needed.
  Its SW frame (7) is turned only slightly and reads close to the S frame.
- Character size uses a non-integer nearest-neighbour scale (x0.982 for the Sprite Forge masters; the old
  per-figure 54 px rule only for sheets without a body master), so an occasional pixel row / column is dropped.
  A new body master (e.g. another body type) needs one entry in `BODY_MASTERS` (the scale test lists it).
- UI text is rendered by Phaser and is scaled with the canvas, so it looks soft/blocky at large window sizes.
- The HUD pack targets 1664x940; the game is 960x480, so the art is shown at half size (pinned per screen edge).
  1-px bevel details that fall between sampled pixels are kept only on dark panel areas.
- The Moonsteel status kit is 480x270, so the Status window is about half the screen width; stat descriptions were
  shortened ("Ranged ATK, HIT") to fit the kit's 126-px label zone and give way to the pending "+N" marker.
- UI text is rendered into the 960x480 canvas and scaled with it, so it looks soft at large window sizes
  (the trade-off for readable, non-pixel text).
- The map name "Ashen Crossroads" is kept in English in the Thai UI until an official Thai name exists.
- In the Status window's derived list (11-px rows from the kit art), Thai words with stacked tone marks can
  touch the baked row line above them.
- The DOM name input uses the font through CSS (smooth browser rendering, not pixel-snapped).
- Status saves are keyed by character name in the browser's localStorage (prototype): two characters with the
  same name share one status, and clearing site data resets it. A server-side character ID replaces this later.

## Next development steps

1. Commission / produce the first production character sheets and register them in the manifest.
2. Replace mockup tiles and props; consider authoring maps in Tiled and loading the JSON into `MapDefinition`.
3. Add a pixel bitmap font for crisp UI text.
4. Introduce the action-animation sheet contract (NE/SE/SW/NW) ahead of combat.
5. Define the server-authoritative data model before networking (character store -> API client).
6. When a second map exists: register it in `MapRegistry`, call `maps.prepare()` near entrances and
   `maps.enter()` on transition (see PERFORMANCE_GUIDELINES.md).
7. Hook future systems into the status foundation: leveling calls `CharacterStatusService.setLevel()`; combat reads
   `CharacterStatusService.derived()`; equipment / passives fill `status.bonus`; the server replaces `StatusSaveStore`
   and re-validates allocations with the same rules (`StatAllocationDraft.commit`).
8. Implement `RemoteCharacterRenderer` / `InterestManager` from `src/multiplayer/contracts.ts` once networking starts.
