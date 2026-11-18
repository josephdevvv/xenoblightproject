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
| Esc           | Return to character creation (in game) |

W moves straight up on screen, D straight right; key combinations (e.g. W+D) move along the isometric tile axes.

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
  ui/                          Button, OptionSelector, ColorSwatchPicker, TextInputField, Panel, HUD
  scenes/                      BootScene, CharacterCreationScene, GameScene
```

## Replacing mockup art

**Characters.** Each appearance has one complete pre-rendered sheet
(`char_<gender>_<hairstyle>_<color>_<outfit>`, e.g. `char_female_ponytail_red_adventurer`).
Sheet format (see `src/characters/CharacterSheetLayout.ts`):

- 64x64 frames, 4 columns x 2 rows (256x128), 8 static directional frames (no animation yet)
- row 0: S, SE, E, NE  /  row 1: N, NW, W, SW
- feet at pixel row 58 by default; a sheet whose feet sit elsewhere declares its measured row as
  `standingFeetY` in the manifest so it still stands on the ground

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
