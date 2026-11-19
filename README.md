# Xenoblight

A dark, atmospheric 2D isometric pixel-art RPG built with **Phaser 3 + TypeScript + Vite**.
This repository is at **Milestone 01**: a playable prototype with character creation and a first isometric map.
All art is temporary procedural mockups.

## Requirements

- Node.js 20+ (tested with 20.11)
- npm 10+

## Run locally

**Easiest (Windows):** double-click `Start.bat` in the project root. It checks Node.js, runs `npm install`
only if dependencies are missing, starts the dev server and opens the game in your default browser.
Keep its window open while playing; press Ctrl+C there to stop.

Manual alternative:

```powershell
npm install
```

```powershell
npm run dev
```

Open http://localhost:5173.

| Script              | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Vite dev server with hot reload                |
| `npm run typecheck` | TypeScript type check (`tsc --noEmit`)         |
| `npm run build`     | Type check + production build into `dist/`     |
| `npm run preview`   | Serve the production build locally             |

## Controls

| Input         | Action                               |
| ------------- | ------------------------------------ |
| Mouse         | Character creation UI                |
| Enter         | Submit the name field                |
| W / A / S / D | Move (8 directions with combinations) |
| Esc           | Close an open window; otherwise return to character creation (in game) |
| Status icon   | First slot of the HUD menu bar (top right): open / close the character Status window |

W moves straight up on screen, D straight right; key combinations (e.g. W+D) move along the isometric tile axes.

### Character Status window

Click the **Status** icon (first slot of the HUD menu bar, top right; hover shows its name). The window shows level, available stat points, the six main stats
(STR, DEX, INT, VIT, AGI, LUK) with **+** buttons, and every derived stat. Allocation is staged: **+** only selects
a point; **CONFIRM** applies and saves, **CANCEL** / **X** / **Esc** discards. (S stays "move down", so there is no
keyboard shortcut.)

Status is saved in `localStorage`, one entry per character name (case-insensitive), and loaded when a character
with that name is created again.

**Test points (development only):** in `npm run dev` - or a production build opened with `?debug` - the window
shows **DEV +10** / **DEV +100** buttons that grant free stat points. Normal players never see them.

## Project structure

```
src/
  main.ts                      Entry point
  config/                      Game config (renderer, scaling), constants, palette
  core/                        Direction (8-dir) helpers, shared types
  data/                        Appearance catalog, character data + validation, in-memory store
  assets/
    AssetManager.ts            Texture resolution: real sheet if listed, else generated mockup
    CharacterSpriteManifest.ts Registry for future production character sheets
    TextureKeys.ts             Keys for tiles / props / FX
    mockup/                    TEMPORARY procedural art generators (delete when real art lands)
  characters/                  Sheet layout contract, asset IDs, CharacterView, AnimationController
  player/                      Keyboard input, pure movement/collision, PlayerController
  world/                       Iso projection, map data, obstacle catalog, IsometricMap, atmosphere FX
    structures/                Walk-in buildings: blueprints (data) + StructureLayer (walls, collision, depth, fade)
  monsters/                    MonsterDefinition (data), MonsterEntity, MonsterSpawner, MonsterSpawns (per-map table), WanderBehavior
  status/                      Character status: stat types/rules, derived-stat formulas, staged allocation, save store, service
  ui/                          Button, OptionSelector, ColorSwatchPicker, TextInputField, Panel, ScrollArea, name plate, StatusWindow
    hud/                       Dungeon HUD: HudLayout (pack layout -> screen), DungeonHud, Minimap, hudPack.generated.json
  scenes/                      BootScene, CharacterCreationScene, GameScene, GameUIScene (screen-space UI overlay)
```

## In-game HUD (dungeon HUD layer pack)

The HUD art lives in `art-source/ui/dungeon_hud/` exactly as delivered (`README.md` = how to draw it,
`hud_layout.json` = positions on the 1664x940 reference canvas). The pack is drawn at twice the game's pixel
density, so it is converted once into game-ready textures:

```
powershell -ExecutionPolicy Bypass -File tools/import-hud-pack.ps1
```

This writes cropped, half-resolution layers to `public/assets/ui/hud/` (every 2-px line becomes a crisp 1-px
line, no blur) and `src/ui/hud/hudPack.generated.json` (crop offsets + a copy of `hud_layout.json`). After
editing `hud_layout.json` or replacing the layer PNGs, run the script again. Each layer is pinned to its screen
edge (left / right / centre, top / bottom), because the game view (960x480) is wider than the halved reference
canvas (832x470). Positions the JSON does not list (menu slots, minimap, hotbar slots, chat tabs) are measured
from the art in `REF_ELEMENTS` (`src/ui/hud/HudLayout.ts`).

## Replacing mockup art

**Characters.** Each appearance has one complete pre-rendered sheet
(`char_<gender>_<hairstyle>_<color>_<outfit>`, e.g. `char_female_ponytail_red_adventurer`).
Sheet format (see `src/characters/CharacterSheetLayout.ts`):

- 64x64 frames, 4 columns x 2 rows (256x128), 8 static directional frames (no animation yet)
- row 0: S, SE, E, NE  /  row 1: N, NW, W, SW
- the figure may sit anywhere in the frame and be any height: the game measures each frame's feet and
  height from the pixels (`SpriteMetrics`), anchors it on its feet and scales it to a 54 px figure

Optional walk sheet (`<color>_<outfit>_walk.png`): 6 columns x 8 rows (384x512), one direction per row in
the order S, SE, E, NE, N, NW, W, SW, played at 8 FPS while moving; feet at y = 62. Register both files in
`CHARACTER_SPRITE_MANIFEST` (`standing` and `walk`). Appearances without a walk sheet stay static while moving.

Production art: 114 static sheets (all male appearances, 54 female) plus one walk sheet
(male / long_middle_part / blonde / adventurer, also the default appearance). See
`CHARACTER_SPRITE_INVENTORY.md` for the full list, missing combinations and known art issues.

Put the PNG under `public/assets/characters/<gender>/<hairstyle>/<color>_<outfit>.png` and add it to
`CHARACTER_SPRITE_MANIFEST`. The mockup generator is skipped automatically for that ID.

**App icons and logo.** `public/icons/` holds the app icon set: `XENOBLIGHT_App.ico` (multi-size 16-256 px,
browser tab favicon) and PNGs from 16 to 512 px. `index.html` links the ICO as favicon, the 256 px PNG as
`apple-touch-icon`, and `public/manifest.webmanifest` (128/256/512 px icons). The creation-screen header logo
is the transparent `XENOBLIGHT_512x512.png`: `src/assets/LogoTexture.ts` crops it to the artwork and
downscales it smoothly to its on-screen size. (The older `public/assets/ui/xenoblight_logo.jpg` is no longer loaded.)

**Tiles, props and FX.** Load an image under the matching key in `TextureKeys.ts` (BootScene preload);
the generator skips any key that already exists. Tiles are 64x40 PNGs (64x32 diamond + 8 px side).

See `PROJECT_STATUS.md` for milestone status and technical decisions, and `PERFORMANCE_GUIDELINES.md` for
asset loading, map loading, texture ownership and performance rules. Debug overlay: F3 in `npm run dev`,
or add `?debug` to the URL of a production build.
