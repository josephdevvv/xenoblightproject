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
| Isometric map | **Ashen Crossroads, expanded into a ruined medieval city**: 30 x 120 diamond tiles (64x32), world 5120 x 2728 px (was 30 x 30 / 2240 x 1288). The original map is kept tile for tile as Zone 1 (rows 90-119, spawn 14,118); 90 new rows (3x its length) extend it towards the screen's upper-right (the -row axis): Zone 2 broken medieval street behind a destroyed city gate (rows 62-89), Zone 3 central ruin plaza with a toppled monument (42-61), Zone 4 collapsed housing district + pilgrim avenue (21-41), Zone 5 (0-20): the outer **city wall** across the far edge (rows 0-1: towers, curtain walls with breaches, a gatehouse with a CLOSED wooden gate at cols 12-17, rows 0-2) reached by a straight approach road with statues and braziers; the ruined chapel and its bell tower west of the road, the collapsed sacristy and the graveyard east of it. Data: `src/world/maps/AshenCrossroads.ts`; pure model `MapLayout` (ground, blocked tiles, props, wall boxes - shared by the game and the navigation tests). Ground: earth, cobbles, broken cobbles, plaza flagstones, stone / wood / rubble floors, vents; flat ground details (moss, weeds, pebbles, debris, roof-tile shards, cracks, chapel steps) placed by hand or seeded scatter. 26 prop types (`MapObjectCatalog`: blocking vs decorative, multi-tile footprints up to 3x3). |
| Collision + bounds | Blocked tiles from props (every footprint tile); thin wall boxes from structures and free-standing wall runs (open arches never block); map edges are walls; axis-separated sliding, flush contact. Wall boxes are bucketed (4x4-tile grid) so collision stays cheap on the larger map. |
| Walk-in structures | Built from thin edge walls + corner posts (+ smoking chimneys), floors, rubble decals and interior props. **Type A (enterable)**: `ruined_house` (original, 3x3), `stone_house` / `stone_house_b` (4x3, doorway towards the road), `stone_hall` (5x4, two rooms, fireplace, broken stair), `timber_house` (4x4), `courtyard` (5x5 walled yard), `chapel` (7x12: Gothic walls with lancet windows, open arched doorway + side door, columns, altar; collapsed corner blocked). **Type B (non-enterable)**: `collapsed_house` (3x3 stone), `collapsed_hall` (4x3 timber) - closed walls, interior completely filled with rubble props. Free-standing wall runs (city wall, plaza walls, cloister arcade, graveyard wall). Characters' depth is corrected per frame against nearby wall pieces and large props (monument, bell tower, carts); tall pieces that hide the player fade out. 18 buildings on the map. |
| Player movement | WASD, 8 directions, ground-space normalised speed (3.6 tiles/s), facing, idle/walk state. |
| Camera | `StableCameraFollow`: smooth frame-rate independent follow (lerp 0.12 per 60 fps frame, view 24 px above the feet), clamped to world bounds; exact scroll kept, camera drawn at whole pixels, the player drawn at a camera-stable whole pixel - no 1 px back-and-forth while walking. Zoom 1. |
| Atmosphere | Dithered fog (low + high layers), drifting cloud shadows, smoke from vents and braziers, subtle purple glow on shrine/braziers, vignette. |
| Game logo & app icons | Transparent logo (`public/icons/XENOBLIGHT_512x512.png`) in the creation-screen header, smoothly pre-scaled at runtime. Browser favicon `XENOBLIGHT_App.ico` (16-256 px), `apple-touch-icon` (256 px PNG) and `manifest.webmanifest` (128/256/512 px). |
| Monster system | `src/monsters/`: `MonsterDefinition` (data: id, display name, art id, footprint, wander), `MonsterEntity` (animated sprite on its ground root + name label 3 px under the root), `MonsterAnimator` (idle / walk loops by facing from movement; one-shot attack whose hit frame (4) is reported to combat, hit reaction with a red multiply tint on frames 1-2, death played once and held - API ready for the future combat system), `art/MonsterArt` (sheets, measured anchors, timing), `MonsterSpawner` (validates bounds, blocked tiles, buildings, walls, distance from player spawn in world px, overlaps; reports and skips invalid points), `MonsterSpawns` (deterministic per-map spawn table). Monsters (delivered art, `art-source/monsters/`, imported by `tools/import-monster-packs.mjs`, 4 facings SE / SW / NE / NW, native 1:1 pixels): **Void Mite** (48x32 frames: idle 1, walk 6 @8 fps, stomp 6 @10 fps + stomp impact VFX, hit 4, death 6 in 64x48 cells) - 10 in the starting area, gameplay data unchanged; **Mutant Wolf** (60x42: idle 1, light-run walk 6 @10 fps, pounce bite 6 @12 fps + 32x32 bite VFX, hit 4, death 5) - 4 in the ruined city. Developer preview of every animation in all facings: `?monsters` (dev, or production with `?debug`). Idle **wandering** (`WanderBehavior`): walks to random reachable points within 3 tiles of its spawn at 0.9 tiles/s, pauses 0.9-2.8 s, uses the same tile collision as the player, never enters buildings or overlaps other monsters, gives up on destinations it stops approaching (0.6 s), skipped when in the "dormant" distance band. No AI decisions, chasing, combat, HP, or collision with the player. |
| NPCs (placement only) | `src/npcs/`: `NpcDefinition` (data: stable id for future quests / dialogue, name, map, tile, facing, sheet, idle timing), `NpcEntity` (sprite on the tile centre with one fixed ground anchor for every frame, depth like characters, shared name label under the feet), `IdleCycle` (pure, update-driven - no timers). City guard **Mateus** `city_guard_01` at block (14, 105) on Ashen Crossroads, facing SW: sheet `MateusIdleAnimation.png` (delivered art, byte-for-byte copy; 256x256, 4x4 of 64x64, frames 1-13 used, 14-16 empty), imported by `tools/import-npc-sheets.mjs` (measures the ground anchor 36, 55 and refuses frames on a different feet row). Idle: frame 1 for 15 s, frames 2-13 once at 150 ms, back to frame 1, repeat (16.8 s cycle). Gate guards **Jack** `city_guard_jack` at block (13, 3) (`DoorGuard01IdleAnimation.png`, anchor 31, 57) and **Sonny** `city_guard_sonny` at block (16, 3) (`DoorGuard02IdleAnimation.png`, anchor 32, 57), either side of the closed city gate, facing SW: same 4x4 / 64x64 layout (frames 1-13), same idle routine and name label as Mateus, native 1:1 scale. NPCs do not block movement (characters never collide); their tiles are kept free of monster spawns. Talking to Mateus: see "Tutorial Quest 01"; the other NPCs have no interaction, quests, rewards or combat. |
| Hand-made Zone 5 art | City wall segments, towers, gatehouse and bell tower are sprites assembled by `tools/compose-city-wall.mjs` from a PixelLab isometric building kit (palette-locked, same 32 px logical tile); the wooden gate doors were painted by PixelLab into the gatehouse (style-matched inpainting); the gate's stone arch and the belfry openings / bell are drawn by the tool. Sources and the generation log: `art-source/pixellab/README.md`. Loaded as map assets (`HandmadeArt`), procedural mockups remain as fallbacks. The closed gate and the wall block their whole footprint; a test checks every sprite's edges line up with its footprint. |
| Combat (early game) | `src/combat/`: `CombatRules` (pure, all numbers in one place: player stats from the existing derived stats - melee ATK, DEF, HIT, FLEE, crit; damage = ATK - DEF (min 1), hit % = 75 + HIT - FLEE clamped 5-95, crits never miss (x critDamage %), attack interval 1.2 s / (1 + Attack Speed %); EXP: see "EXP progression"), `CombatSystem` (target + auto-attack loop, damage for both sides, EXP / level up, player HP with out-of-combat regeneration, defeat hands over to the death flow below), `DamageNumbers`. **Mouse**: left click on ground = walk there (`world/navigation/Pathfinder`: A* on the tile grid with the real footprint collision, string-pulled; a blocked goal ends at the nearest reachable tile); left click on a monster = target, approach (re-planned as it moves) and attack at the attack interval until it dies; clicking elsewhere or WASD cancels; clicks on the HUD / windows never reach the world. **Monsters** retaliate when attacked (chase within a leash, attack on the clip's hit frame 4 - damage and VFX land together -, walk home and heal when the player is gone or out of the leash), die (death clip, fade), respawn at their spawn point. Balance (`MonsterDefinition.combat`): **Void Mite** Lv1, HP 24, ATK 15, HIT 120, DEF 1, 2.6 s attacks, 20 EXP - a level-1 Drifter needs exactly 4 normal hits; it bites for 14 at 92 %; **Mutant Wolf** Lv3, HP 45, ATK 23, HIT 200, DEF 2, 1.9 s attacks, faster chase, 32 EXP - 9 normal hits; bites for 22 at the 95 % cap. Attack VFX: see "Combat animations & attack VFX". Player combat clips: see "Combat animations & attack VFX". |
| Combat animations & attack VFX | **Player combat sheets** from the Sprite Forge export (`public/assets/characters/male/spike_blonde/drifter/combat/`, metadata JSON read as-is by `characters/combat/PlayerCombatArt`): combat_idle (6 @150 ms, loop), dagger_thrust (8 @100 ms, once), self_heal_cast (8 @100 ms, registered - no heal skill yet), hit_reaction (6 @100 ms); rows SE / SW / NE / NW; same canvas root (32, 57) and body scale as the static / walk art (test: every frame's feet on row 56). Only the Mohawk Blonde Drifter has combat art - other appearances keep the static visuals with the same combat timing. `PlayerCombatAnimator` (the `PlayerController.actions` hook): combat stance while in combat (target, or attack / hit in the last 4 s), thrust on every swing, hit reaction unless mid-attack, walking hands the sprite back (`CharacterAnimator.setHeld`). **Global hit frame 4** (`combat/AttackTiming`, 1-based; index 3) for every player and monster attack: monsters report frame 4 from their clip (was 5); a player swing schedules its hit on the combat clock at the start of frame 4 from the animation timing (300 ms) - playback never decides damage; the existing rules then decide (target dead meanwhile: nothing; out of reach: MISS). Attacks (`combat/PlayerAttacks`): Basic = dagger_thrust x1 ATK, impact 1.0; **Drifter Lv.1 attack skill** (key 1, replaces the next swing on the target; no SP / cooldown defined) = dagger_thrust x2 ATK (200 %), impact 1.5. **Target-based VFX** (`combat/vfx`): only a hit spawns VFX, ON the target's body - centre of the visible pixels of its CURRENT frame (`HitAnchor`, cached per frame; origin, scale, flip, sprite size), following the target while it plays. Player hits: shared grayscale `impact` (public/assets/vfx/player/combat, 4 frames 60/60/70/80 ms, centred); monster hits: that monster's own VFX (its facing row) on the player. Old attacker-relative offsets / nudges / depth offsets removed from runtime (kept as import data). **Attack VFX layer** `AttackVfxLayer` at `DEPTH.AttackVfx` (140000): above every world object and character, below fog, name plates and UI; one-shot, pooled sprites (no leaks). The thrust VFX is still pending (no placeholder). **Texture lifecycle**: GameScene owns the player's art (standing, walk, combat sheets, impact VFX; cache owner `player-art`) from before loading until shutdown, so the cleanup that runs during map entry never takes it; unowned art is still evicted after the grace period, together with its animations, and an animation whose frames are not the loaded texture's is rebuilt (`PlayerCombatAssets`, `tests/combatLifecycle.test.ts`). |
| EXP progression | `src/progression/` (editable data + pure logic, unit-tested). `ExpCurve`: Level 1-9 table 80 / 110 / 140 / 180 / 220 / 260 / 310 / 360 / 420 = 2,080 EXP to Level 10 (the FIRST MAP target, not a cap - max level stays 99); Level 10+ keeps the previous curve 25 x L^1.5 until one is designed. `MonsterExpRewards`: Void Mite 20, Mutant Wolf 32 (initial values; separate from combat stats). `QuestExpBudget`: 900 EXP reserved for future Tutorial Quests - no quests, triggers or rewards exist, allocations are validated against the budget. `LevelProgression`: integer EXP, excess carries, several level-ups per reward, invalid values cleaned; `KillRewardLedger` pays each monster life once. Level-ups keep the existing rewards (3 stat points / level, passive points to Level 10, full heal). Saves unchanged (level + EXP); a save from the old curve that already holds a level's worth of EXP levels up on load. HUD shows Lv and EXP % (`levelProgress`). Reference plan (not verified by play tests): 20 mites + 25 wolves = 1,200 + quests 900 = 2,100 EXP, ~15-20 min to Level 10. |
| Tutorial Quest 01 - Find Mateus | `src/quests/`, `src/dialogue/`, `ui/dialogue/DialogueWindow`, `npcs/NpcInteraction`, `world/navigation/PathTrail` + `ui/world/PathTrailView`. Quest `tutorial_01_find_mateus`, states NOT_STARTED > FIND_MATEUS > TALKING_TO_MATEUS > DIALOGUE_COMPLETED > PASSIVE_TUTORIAL_STARTED (pure rules; each step only from the one before). Starts by itself for NEW characters on entering the map; characters from before the quest are left as they were. HUD tracker (name + objective) and a **dotted path on the ground** to Mateus: small light-grey 2:1 dots every 0.5 tile along a route from the game's pathfinder (walkable ground only, every dot checked), above the ground tiles and below every character, from just ahead of the player to a free spot 0.7 tile beside Mateus. Dots are placed from the END of the route, so they stay put while the player follows it; a new route is planned only when the player strays 0.6 tile, something comes between, or now and then while walking (at most 5 times a second, ~0.4 ms nearby, ~7 ms across the whole map); changed dots slide over free ground or cross-fade. It stays beside Mateus until Dialogue 3 is done. Left click on Mateus: normal click-to-move pathfinding until 1.5 tiles away, then the dialogue (WASD / another click cancels the approach). Dialogue: the author's three Thai lines exactly (no translation supplied, shown in every language), one at a time, broken between Thai words; a blinking arrow (alpha 1-0.35, ~1.3 s) at the bottom right is the only way on. While it is open: no movement, combat, skills, windows or Esc; monsters see no player (as while defeated) and walk home. After line 3: window closes, quest completed (event once, saved first), dotted path and objective gone, and the EXISTING Passive Tree tutorial starts (`PassiveTreeWindow.tutorialEnabled`; its steps are unchanged, the tree itself always opens). Saved per character (`xenoblight.quests.v1.<name>`); a conversation cut off by a reload starts over. No EXP reward is decided: `QuestService.onCompleted` + `claimReward()` (once per character, saved) are ready for `CharacterStatusService.gainExp`; `TUTORIAL_QUEST_EXP_BUDGET.allocations` is untouched. |
| Death, ghost & respawn | `src/player/death/` + `ui/death/DeathOverlay`. Life states ALIVE -> DYING -> DEAD -> RESPAWNING -> ALIVE (`PlayerLife`, pure: each transition only from its own state, so HP 0 starts death once and a respawn click is accepted once). HP 0: combat stops at once (target, path, cooldowns; monsters disengage), open windows close, no fall / corpse animation. ~1 s transition: the player's CURRENT drawn frame is copied and dissolves pixel by pixel (pale edge band) while a ghost built from the same frame appears (`GhostPixels`: desaturated pale grey-white, upper body solid, legs thinned by ordered dithering, feet gone; hard alpha, nearest-neighbour) - no extra art per hairstyle / outfit, approved assets untouched. DEAD: black overlay 70 % over the whole screen (HUD included, world faintly visible), the ghost above it hovering +-2 px on the death spot (camera holds still), "ตาย..." above it and one charcoal button "เกิดใหม่ที่จุดเซฟ" (hover / press states) below its name - no auto-respawn. While not alive `PlayerLife.canPerform()` allows chat only (no chat exists yet): no movement (WASD / click), attack, P / Status / Settings, Esc back to creation; the overlay swallows world clicks, and HUD buttons check the same gate (while the overlay is still transparent Phaser ranks it below them). Respawn: fade out, save point via `world/SavePoints.resolveRespawnPoint` (no save points exist yet -> map spawn), existing rule full HP, combat state cleared, camera snaps, sprite + camera fade in. Repeated cycles reuse one overlay; per-death textures are removed. |
| Game cursor | `ui/cursor/GameCursor` (installed in `main.ts`): the delivered sheet `art-source/ui/cursor/game_cursor.png` (32x17, shipped unchanged) holds 2 frames, cut out with measured rectangles aligned on the dark outline (10x10 each: plain / with a 1-px light glow). Frame 1 = default, hover and after release; frame 2 = left button held. Native CSS cursors at x2 nearest neighbour (crisp, no lag), hotspot = the tip pixel (1, 1) - same point in both frames. Used everywhere: character creation, HUD, windows, death screen, world, and the area around the canvas; buttons created with `useHandCursor` show it instead of the browser hand. Over a monster the target (sword) cursor takes over (`setOverride`) and hands back. The name text field keeps the browser's text cursor. |
| HUD | Dungeon HUD layer pack (`art-source/ui/dungeon_hud`), converted by `tools/import-hud-pack.ps1` to half-resolution cropped layers (2-px lines -> crisp 1-px, no blur) and drawn by `DungeonHud` in `GameUIScene` in the pack's render order, each layer pinned to its screen edge. Game-rendered: name (truncated to fit), level, HP / SP values with code-driven fill bars (`#D74A51` / `#5699E2`, current = max until combat exists), EXP bar (`#AB71D5`, 0 % - no EXP system), tile coordinates (centred in their box), map name, minimap (player-centred close-up: the map is baked once at 2.5 px per half tile with extruded walls / tall props and the gate highlighted, and a frame-sized window around the player is shown, clamped at the map ends; live player / monster dots), Status icon in the menu bar (hover tooltip). The pack's chat box (`04_chat`) is not shown (removed by request; listed in `HIDDEN_LAYERS`). Placeholders with no system behind them: quest tracker, AUTO, hotbar, the other 4 menu slots and the menu button. World-space name label UNDER the player's feet (`ui/world/WorldNameLabel`: the shared rule for the player, NPCs and monsters - centred on the drawn feet root, top 3 px below it, 10 px `small` role (~15 % smaller than the old 12 px plate), white with a black stroke; never follows the animated frame; text set once). Esc returns to character creation. |
| Character Status (foundation) | `src/status/`. `CharacterData.status` = level (1-99), BASE stats (STR/DEX/INT/VIT/AGI/LUK, start 1, max 99 from points), BONUS stats (future equipment/passives, 0 for now, not saved), TOTAL = base + bonus (may exceed 99), unspent stat points. 3 points per level from 2 to 99 (294 total), 1 point = +1 base. `DerivedStats.ts` holds every TEMPORARY formula in one table (Melee/Ranged ATK, MATK, Max HP/SP, DEF, MDEF, HIT, FLEE, Attack Speed bonus, Crit Rate/Damage, Material Find as a relative bonus), computed from TOTAL stats, shown with at most 2 decimals. `StatAllocationDraft` stages points and re-validates on confirm. `StatusSaveStore`: localStorage, one key per character name (`xenoblight.status.v1.<name>`), saves level/base/points only and recalculates derived stats; invalid fields are clamped individually, unreadable records are backed up (`.invalid-backup`) and replaced with a fresh status; missing level points are granted retroactively, extra points are never removed. `CharacterStatusService` is the single entry point (load, confirm, `setLevel` hook, dev grant, change events). UI: `GameUIScene` overlay, opened from the HUD menu's Status icon, with a modal `StatusWindow` drawn with the Moonsteel status kit (`art-source/ui/status_moonsteel`, 480x270 at 1:1, cropped by `tools/import-status-kit.ps1`): header with name / level, stat points, 6 stat rows with baked + buttons (dimmed when unavailable), derived list with live PREVIEW (scrolls by one baked row), RESET / CANCEL / CONFIRM, DEV +10 (Shift: +100) in dev builds only - the unused kit button is covered in production. Not applied to gameplay yet: no combat, EXP or leveling. |
| Drifter Passive Tree | `src/passives/` (pure rules, unit-tested) + `ui/passiveTree/PassiveTreeWindow`. Exactly 10 nodes: mandatory center **Drifter's Resolve** (rank 1: Melee ATK +3, Max HP +5), left Combat Training (Melee ATK +3/rank) > Precision (HIT +5) > Power Strike (single-target skill damage +5 %), right Basic Guard (DEF +3, MDEF +3) > Vitality (Max HP +5 %) > Recovery (Heal +10 % HP restored), down Swiftness (Attack Speed bonus +2 points) > Evasion (FLEE +4) > Opportunity (Crit Rate +1 point); max rank 2 except the center; no upper branch. **Passive points** are separate from stat points: 1 per level 1-10 (10 total), granted once per level (`rewardedLevel`); 1 point per rank; a node needs rank 1 in the node before it (so the first point must go to the center); branches can be mixed; every upgrade re-validated (points, prerequisite, cap). Free reset of the optional nodes (center kept). Bonuses: `status/DerivedBonuses` combines every derived-stat source and applies it once on top of the formulas (Max HP = (formula + flat) x (1 + Vitality %), rounded down) - Status window, HUD and combat all read it. Power Strike / Recovery are stored skill modifiers only (`passiveSkillModifiers`, `modifiedHealPercent`: 30 % -> 36 % at Recovery 2): **not active in gameplay - no skills exist yet** (the window says so). Future Class 1 change prepared (`changeClassTree`: the old tree stops applying, the new tree gets 10 points once) - no class change / second tree exists. Saved per character in localStorage (`xenoblight.passives.v1.<name>`: ranks, earned points, rewarded level, tutorial); older saves get the owed points, corrupt data is repaired. Tutorial at the first point: HUD hint + pulsing menu slot ('open'), then 'select' the center, then 'unlock' (closing resumes at 'open'). UI: minimal layer pack chrome (`art-source/ui/passive_tree_minimal`, halved to 1-px lines by `tools/import-passive-tree.mjs`; its placeholder nodes / connectors are not used), 10 icons re-sampled from the icon sheet to their native pixel grid. HUD menu slot 2 + key P opens it; mouse select / UNLOCK-UPGRADE / RESET / CLOSE; arrows + Enter / Space; Esc closes; a modal blocker keeps clicks from the world. |

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
- Expanded city (2026-11-20): automated walk with real WASD input from the spawn through all five zones and back
  (16 legs, ~109 s of walking, never stuck): city gate, stone house, courtyard, plaza around the monument,
  district lane, stone hall, timber and ruined houses, the arcade, chapel nave and side door, graveyard, cloister;
  pushing into collapsed houses, house walls, the monument, the altar and all map edges stops the player; inside a
  house the player is between back and front walls, behind the bell tower / collapsed hall those fade; minimap
  shows the long map with the player dot; update + render ~2.6-3.2 ms per frame anywhere on the map (about 1,100
  of 3,969 static images drawn after culling). `npm test`: navigation flood fill with the player collision box -
  all 3,311 walkable tiles reachable, every zone reachable, enterable ruins enterable, collapsed ruins sealed
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

- Zone 5 city wall (2026-11-20): walked from the spawn to the gate front and into the moved chapel, out its side
  door, to the graveyard and the district with real input (never stuck); pushing into the gate, the gatehouse
  tower, the breached and intact wall sections and sliding along the wall all stop the player at row 2.2 / 3.2;
  the minimap shows the gate, plaza and spawn surroundings close-up; `npm test` 56/56

- Monster sprites (2026-11-21): preview (`?monsters`) checked frame by frame - attack frame 5 starts the VFX (stomp at the feet, bite at the jaws in all 4 facings), hit frame 1 red with outlines / transparency intact, death holds its last frame and ignores further commands; in game 10 Void Mites + 4 Mutant Wolves spawn (none rejected), walk / idle with facing changes, labels on the root; `npm test` 66/66 (imported sheets byte-identical to the packs, feet on the root in every frame, corners transparent, timing / contact / tint frames in range, facing mapping)

- Combat (2026-11-21): real mouse clicks in the browser - ground click walks along the found path (walk clip,
  facing), clicks on the minimap and the status panel do not move the player, clicking a Void Mite targets it,
  the player walks into range and attacks: 24 > 18 > 12 > 6 > 0 HP in 4 hits of 6, the mite retaliated
  (2 bites of 5), died (death clip at the corrected scale), +5 EXP, target cleared, no console errors.
  Mutant Wolf balance is covered by unit tests only (not played in the browser in that session).
  `npm test` 75/75

## Planned early game (design notes - NOT implemented)

- The first map will hold 5 monster species; only Void Mite and Mutant Wolf exist so far.
- Progression on this map: player level 1 to 10.
- The city gate at the far end of Zone 5 becomes the entrance to the city; class advancement happens after
  entering the city.
- Not started on purpose: the other 3 monsters, the city transition, class advancement, quests and story.

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
10. **Map size** 30 x 120 tiles (5120 x 2728 px world). The original 30 x 30 map is rows 90-119; spawn tile
    (14, 118) at the south end of the south road. Projection: +col = down-right, +row = down-left on screen, so the
    screen's upper-right is the -row axis - the direction the map was extended. Original coordinates are shifted
    with `fromOriginal()` (also used by the monster spawn table).
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
- Passive tree: Power Strike and Recovery are stored for future skills only (no active skills / Heal exist yet).
  Passive saves share the status prototype limits (localStorage, keyed by name). The icon sheet is an AI-painted
  pixel-art image on a slightly drifting ~12 px grid; the import re-samples each icon to that grid (crisp, 21-27 px)
  - a cell straddling two painted pixels can pick the neighbouring colour, so tiny details may differ from the sheet.
  WASD still moves the character while a window is open (same as the Status window).
- Death: no save-point objects exist yet, so every respawn is at the map spawn (`SavePoints` is the hook). No chat exists:
  the dead-state gate already allows only 'chat'. The ghost uses the frame of the facing at death, so a death while
  facing away shows the ghost from behind.
- Combat art: only the Mohawk Blonde Drifter has exported combat sheets; the Sprite Forge export still records
  dagger_thrust `impactFrame: 5` - the game applies the global frame-4 rule (re-export to update the record). The
  thrust (attack trail) VFX is pending. The Lv.1 skill has no SP cost / cooldown yet.
- EXP: the 15-20 minute Level 10 target is a design estimate (needs play tests with the Tutorial Quests). Current combat
  formulas are the early prototypes (damage = ATK - DEF, min 1; crit x critDamage %, never misses; hit % =
  75 + HIT - FLEE clamped 5-95); the DEF-ratio / 1000-based formulas are design notes only, not implemented.

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
