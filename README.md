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
| Menu icon (three bars) | Last slot of the HUD menu bar: Settings (language) |
| Settings button | Character creation, top right: Settings (language) before entering the game |

W moves straight up on screen, D straight right; key combinations (e.g. W+D) move along the isometric tile axes.

### Character Status window

Click the **Status** icon (first slot of the HUD menu bar, top right; hover shows its name). The window shows level, available stat points, the six main stats
(STR, DEX, INT, VIT, AGI, LUK) with **+** buttons, and every derived stat. Allocation is staged: **+** only selects
a point; **RESET** clears the selection, **CONFIRM** applies and saves, **CANCEL** / **X** / **Esc** discard and close.
The derived list previews the result ("PREVIEW") and scrolls one row with the mouse wheel or by dragging. (S stays "move down", so there is no
keyboard shortcut.)

Status is saved in `localStorage`, one entry per character name (case-insensitive), and loaded when a character
with that name is created again.

**Test points (development only):** in `npm run dev` - or a production build opened with `?debug` - the window
shows a **DEV +10** button that grants free stat points (**Shift + click**: +100). Normal players never see it.

The window is drawn with the Moonsteel status kit (`art-source/ui/status_moonsteel/`, a 480x270 canvas at the
game's pixel density, used 1:1). After replacing its layer PNGs, re-crop them:

```
powershell -ExecutionPolicy Bypass -File tools/import-status-kit.ps1
```

Text positions on the kit live in `src/ui/status/StatusKitLayout.ts`.

## Languages and font

The game is bilingual: **Thai (default)** and English. New players always start in Thai (the browser /
OS language is ignored). Change the language in **Settings** - the button at the top right of character
creation, or the menu icon (three bars) at the end of the in-game HUD menu bar. The switch applies
immediately (no restart) and is saved in `localStorage` (`xenoblight.settings.v1`); an invalid or
missing value falls back to Thai.

- Translations: `src/i18n/th.ts` (primary, defines the keys) and `src/i18n/en.ts` (same keys, enforced
  by TypeScript and the tests). Use `t('key', { value })` for text and `localize(scene, fn)` so a
  component re-renders on language change. Data with stable IDs (appearance options, directions, maps,
  stats) is named through `src/i18n/labels.ts`. Player names are never translated.
- Font: **Kanit** (Cadson Demak, SIL Open Font License 1.1, `public/assets/fonts/kanit/OFL.txt`) for Thai and
  English - a sturdy loopless Thai with a matching Latin that stays readable at the game's 960x480 resolution.
  Fontsource 5.3.0 woff2 subsets (Thai + Latin, weights 400 / 500 / 600, ~100 KB) are registered with
  unicode-range in `src/ui/text/Typography.ts`, loaded before the game starts. Text uses named roles
  (`typo('heading' | 'section' | 'body' | 'button' | 'label' | 'number' | 'tooltip' | 'small' | 'display')`
  in `src/ui/UITheme.ts`) - components never pick a family or a free size. No letter spacing (it splits Thai
  combining marks); line height is measured with Thai stacked marks, so nothing is clipped. Sprites stay
  nearest-neighbour; text is drawn smoothly by the browser. Fallback: Noto Sans Thai / Leelawadee UI / Tahoma
  (`?nofont` in dev to preview).
- Tests: `npm test` (Node's test runner + esbuild from Vite, no extra dependencies) - default
  language, switching, persistence, invalid values, key parity, placeholders, interpolation, data-ID
  coverage, and the unchanged level-1 stat values.

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
  world/                       Iso projection, map data types, MapLayout (pure ground/collision model), IsometricMap (rendering), obstacle catalog, atmosphere FX
    maps/                      Map definitions (AshenCrossroads: the original map + the ruined city expansion, five zones)
    objects/                   MapObjectCatalog (prop footprints, blocking vs decorative), HandmadeArt (file-based prop sprites)
    structures/                Walk-in buildings: blueprints (data), StructureGeometry (wall boxes), StructureLayer (walls, depth, fade)
  monsters/                    MonsterDefinition (data), MonsterEntity, MonsterSpawner, MonsterSpawns (per-map table), WanderBehavior
  status/                      Character status: stat types/rules, derived-stat formulas, staged allocation, save store, service
  i18n/                        Localization: th.ts (default), en.ts, t()/setLanguage(), labels for data IDs, Phaser localize()
  settings/                    Player settings store (language), localStorage
  ui/                          Button, OptionSelector, ColorSwatchPicker, TextInputField, Panel, ScrollArea, name plate, StatusWindow
    hud/                       Dungeon HUD: HudLayout (pack layout -> screen), DungeonHud, Minimap, hudPack.generated.json
    status/                    Status window kit layout (StatusKitLayout) + statusKit.generated.json
    text/                      Typography (Kanit loading + text roles), grapheme-safe fitText
  SettingsWindow.ts            Settings (language) modal, used in character creation and in game
  scenes/                      BootScene, CharacterCreationScene, GameScene, GameUIScene (screen-space UI overlay)
```

## Monster sprites (delivered packs)

`art-source/monsters/<id>/` holds the monster packs as delivered (per-direction sheets, README, manifest).
`node tools/import-monster-packs.mjs` copies the pixels unchanged into one sheet per action
(`public/assets/monsters/<id>/<action>.png`, rows SE, SW, NE, NW) and writes
`src/monsters/art/<id>.generated.json` (frame sizes, ground anchors and the attack VFX placement measured from
the art). Timing, hit frame (global rule: frame 4, `src/combat/AttackTiming.ts`) and hit-flash frames are in `src/monsters/art/MonsterArt.ts`. Preview every
animation in all four facings with `?monsters` in the URL (dev builds, or `?debug`).

## Zone 5 city wall art (PixelLab kit)

The city wall, towers, gatehouse and bell tower at the far end of the first map are hand-made sprites built
from a PixelLab isometric building kit plus a PixelLab-painted wooden gate (sources and generation log in
`art-source/pixellab/README.md`). Rebuild them with:

```
node tools/compose-city-wall.mjs
```

It writes `public/assets/environment/city_wall/*.png` (loaded with the map) and
`src/world/objects/handmadeArt.generated.json` (sizes + footprint anchors used by `HandmadeArt`).

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
canvas (832x470). The chat box layer (`04_chat`) is not drawn (`HIDDEN_LAYERS` in `DungeonHud.ts`). Positions the JSON
does not list (menu slots, minimap, hotbar slots) are measured
from the art in `REF_ELEMENTS` (`src/ui/hud/HudLayout.ts`).

## Replacing mockup art

**Characters.** Each appearance has one complete pre-rendered sheet
(`char_<gender>_<hairstyle>_<color>_<outfit>`, e.g. `char_female_ponytail_red_adventurer`).
Sheet format (see `src/characters/CharacterSheetLayout.ts`):

- 64x64 frames, 4 columns x 2 rows (256x128), 8 static directional frames
- row 0: S, SE, E, NE  /  row 1: N, NW, W, SW
- approved Sprite Forge art uses ONE fixed canvas root for every frame, static and walk:
  `CHARACTER_CANVAS_ROOT` (32, 57) - the line under the feet (`approvedPlacement` in `CharacterAnimator`).
  The walk cycle's own foot lift stays visible and the switch standing <-> walking never hops. Unknown /
  mockup sheets may sit anywhere in the frame: the game measures each frame's feet and height from the
  pixels (`SpriteMetrics`) and anchors them on their feet. Size comes from the BODY, not the full
  figure (`src/characters/CharacterBodyMetrics.ts`): every approved sprite is built on a body master (male /
  female, 49 px from feet to the top of the bare head), and all variants of a master - any hairstyle, any
  outfit, static and walk - share one scale (x0.982, the size the haired male had before), so hair never
  makes a character bigger or smaller and legs / feet line up exactly. Sheets without a master fall back to
  sizing the full figure to 54 px

**Pixel-stable rendering.** Movement and camera positions are never rounded; only the DRAWN position is.
`CharacterView` keeps the exact world position and draws at whole pixels. The camera is followed by
`StableCameraFollow` (`src/render/`): the camera keeps an exact scroll and is drawn at its floor, and the
followed player is drawn at `floor(scroll) + round(world - scroll)` - one rounding of its real distance to the
camera, so it can never shake back and forth by a pixel (Phaser's own follow floors the player and the lerped
scroll separately). The name label is placed under the character's drawn root (`getRenderRoot()`), 3 px below
the feet - the shared world label rule of `src/ui/world/WorldNameLabel.ts` (player, NPCs and monsters) -
never from the animated frame, and its text is only set once. Tests: `tests/renderStability.test.ts`.

Walk sheet: 6 columns x 8 rows (384x512), one direction per row in the order S, SE, E, NE, N, NW, W, SW,
125 ms per frame (8 FPS), looping while moving. Register both files in `CHARACTER_SPRITE_MANIFEST`
(`standing` and `walk`).

**Approved art only (Sprite Forge).** `public/assets/characters/` holds the approved exports from Xenoblight
Sprite Forge, registered in `src/assets/SpriteForgeCharacters.ts` (generated by the forge's export script - re-export,
do not edit): for each of male bald, male mohawk (forge "spike") blonde, female bald, female straight bangs
blonde, a Drifter sheet pair (static + walk) and a base (no outfit) pair, plus `<key>.json` / walk metadata.
The earlier imported sheets were removed, so the manifest lists only these files. A missing or unreadable
approved sheet is reported in the console with its exact path and shown as Phaser's missing texture - never
replaced by a mockup. The procedural mockup generator remains only for appearances that have no art at all.

**Character creation (starters).** The player picks name, gender and hairstyle only
(`src/data/StarterCharacters.ts`): male Bald / Mohawk, female Bald / Straight Bangs. Hair colour is fixed
(blonde, or `none` for bald), and every new character is a **Drifter** wearing the Drifter outfit - the outfit
row is a preview. These rules are applied in `createCharacterData`, not just the UI. Characters are saved per
name in `localStorage` (`xenoblight.character.v1.<name>`: appearance + class; stats stay in the status save);
the last played one pre-fills character creation after a reload, and a saved name continues that character
unchanged.

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
