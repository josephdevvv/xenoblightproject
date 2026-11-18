# Xenoblight - Performance Guidelines

Rules for loading assets, switching maps, owning textures and keeping frames smooth.
They apply to every new feature (outfits, maps, animations, multiplayer).

## Architecture at a glance

| Module | File | Responsibility |
| --- | --- | --- |
| SystemScene | `src/scenes/SystemScene.ts` | Invisible, always-running scene. Owns the long-lived Phaser loader, creates the services, samples frame times, toggles the debug overlay. |
| GameServices | `src/systems/GameServices.ts` | Access point: `GameServices.get()` / `await GameServices.ready()`. |
| AssetLoadingManager | `src/systems/AssetLoadingManager.ts` | On-demand loading, deduplication, batching, error handling. |
| ResourceCacheManager | `src/systems/ResourceCacheManager.ts` | Texture ownership (reference counting) and safe garbage collection. |
| AssetManager | `src/assets/AssetManager.ts` | Facade: startup assets, character sheets (real art or mockup), placeholders. |
| MapLoadingManager | `src/world/loading/MapLoadingManager.ts` | Map lifecycle PRELOAD -> PREPARE -> BUILD -> TRANSITION -> CLEANUP. |
| MapRegistry | `src/world/loading/MapRegistry.ts` | Map manifests (definition + map-specific assets). |
| PerformanceManager | `src/systems/performance/PerformanceManager.ts` | FPS / frame-time stats, budgets, distance priorities. |
| PerformanceConfig | `src/systems/performance/PerformanceConfig.ts` | All tunable budgets and thresholds. |
| VisibilityCuller | `src/systems/performance/VisibilityCuller.ts` | Hides off-screen static objects; pauses off-screen particle emitters. |
| LoadingScreen | `src/ui/LoadingScreen.ts` | Lightweight loading / error feedback. |
| DebugOverlayScene | `src/scenes/DebugOverlayScene.ts` | Optional stats overlay. |
| Multiplayer contracts | `src/multiplayer/contracts.ts` | Interfaces only (no networking yet). |

## 1. Asset loading rules

- **Startup loads only essentials**: the logo (`AssetManager.preload`) and the generated environment
  textures (`createMockupTextures`). Nothing else blocks boot.
- **Character sprites load on demand** via `AssetManager.ensureCharacterSheets(scene, appearance, { walk })`:
  - the creation preview requests `{ walk: false }` (standing sheet only),
  - gameplay requests `{ walk: true }` (standing + walk cycle).
- **Await before showing.** Scenes await `ensureCharacterSheets` before creating a `CharacterView`, so the first
  frame is already the real art. If a view is created anyway, it shows a mockup placeholder and swaps to
  the real sheet when it arrives (no flash between appearances).
- **Deduplication**: concurrent requests for the same key share one promise; loaded keys resolve immediately.
  Never call `scene.load` for game assets after boot - always go through `AssetLoadingManager`.
- **Failures never crash**: a failed sheet falls back to a mockup (`<id>__fallback`); a failed walk sheet just
  disables walking animation for that appearance. Failures are listed in the debug overlay.
- **Full sprites only**: one complete pre-rendered 64x64 sheet per appearance (standing 4x2, optional walk 6x8).
  No layered body/hair/outfit rendering. **No idle animations** - standing is a static frame.
- **Pixel-perfect**: never resample, smooth or re-encode character art; keep supplied transparency as is.
- **Character creation prefetch**: once its UI is ready, the creation screen background-loads standing sheets
  the player can reach in one click, then the rest of the selected gender (`AssetManager.prefetchStandingSheets`),
  so option changes are instant. Prefetched sheets are tracked like any lazy texture and garbage-collected
  when unused.
- **Future content** (outfits, maps, animations) is added to a manifest and loaded lazily the same way.

## 2. Map loading lifecycle

```
PRELOAD    load the manifest's map-specific assets         (active map untouched)
PREPARE    build IsometricMap data: tiles, collision, spawn (active map untouched; throws on bad data)
BUILD      create game objects in time slices              (<= mapBuildSliceMs per frame)
TRANSITION mark the destination active, retain its assets
CLEANUP    release the previous map's owner, run texture GC
```

- `maps.prepare(mapId)` runs PRELOAD + PREPARE only. Call it near an entrance to preload; it is deduplicated
  and safe while another map is active.
- `maps.enter(scene, mapId)` runs the full pipeline. If anything fails, it rejects and the active map is not
  changed. GameScene then shows an error on the LoadingScreen (ESC returns to character creation).
- `maps.exit(mapId)` is called when the scene showing the map shuts down.
- `IsometricMap.buildSteps()` is a generator; `IsometricMap.build()` still exists and drains it in one go.
- Map tiles are 64x32 diamonds; all map logic stays in tile space (see `IsoProjection`).
- Only one map exists today. Do not add transitions until real maps exist.

## 3. Texture cache ownership

| Kind | Examples | Tracked? | Evictable? |
| --- | --- | --- | --- |
| Core | environment tiles/props/FX, structure parts, logo | no | never |
| Lazy | character standing/walk sheets, mockup character sheets, map manifest assets | `cache.track()` | yes, when unused |

- Whoever displays a lazy texture **retains** it with an owner id and **releases** it when done:
  - `CharacterView` owner `character-view:<n>`: retains its current sheets, releases on swap and on destroy,
  - `MapLoadingManager` owner `map:<id>`: retains manifest assets while the map is active.
- `textures.remove()` is only ever called by `ResourceCacheManager.collectGarbage()`.
- Evicting a walk sheet also removes its 8 walk animations.

## 4. Memory cleanup policy

- GC runs at map CLEANUP (and can be called manually). It evicts only textures that are **tracked, unpinned,
  unreferenced, and unused for at least 30 s** (`DEFAULT_GC_GRACE_MS`). The grace period prevents reload
  thrash (e.g. leaving the map and coming straight back, or browsing appearances in character creation).
- Scene shutdown destroys its game objects; destroy listeners release their references automatically.
- Never keep a texture key in a long-lived variable without retaining it.

## 5. Rendering optimization rules

- Phaser's renderer still decides what to draw; `VisibilityCuller` additionally hides **static** objects
  (ground tiles, props) outside the camera view plus a 192 px margin, and pauses (not resets) off-screen smoke
  emitters, so they look unchanged when they come back.
- Culling is purely visual: **collision and gameplay never read `visible`**.
- Do not register moving objects, characters, fog drifters, or structure walls (they fade dynamically).
- The culler derives its view from the camera scroll (not `worldView`, which updates later in the frame).
- Create large numbers of objects through a time-sliced task (`runTimeSliced`), not in one frame.
- Never recreate textures that already exist: generators check `textures.exists()` first.
- pixelArt / nearest filtering / roundPixels stay on. Characters are scaled only by the size normalisation
  (`CharacterAnimator`, target `CHARACTER_DISPLAY_HEIGHT`) and integer display scales such as the preview's x3.
- Sprite measurements (`SpriteMetrics`) are computed once per texture and dropped when the texture is evicted.
- Avoid premature optimization: add culling/priorities only where profiling shows a need.

Budgets (`PerformanceConfig.ts`): frame time 20.8 ms (60 FPS + 25%), 4000 game objects,
64 visible characters, 6 ms per map-build slice. Exceeding them logs a throttled warning in dev builds and
is flagged in the overlay; budgets never change gameplay.

## 6. Future multiplayer integration

Interfaces in `src/multiplayer/contracts.ts` (no networking implemented):

- `CharacterSnapshot`: server state of one character (map, tile position, facing, motion, appearance).
- `AppearanceLoader`: already satisfied by `AssetManager.ensureCharacterSheets`.
- `RemoteCharacterRenderer`: spawn/update/despawn remote players as `CharacterView`s (full sprites),
  driven by `CharacterAnimator`, depth via `IsometricMap.resolveDepth`.
- `InterestManager` + `InterestArea`: map-based interest (same map, within radius) decides which players to
  receive and render.
- `NearbyPlayerQuery`: nearby lookups for visibility decisions.
- `PerformanceManager.priorityForDistance()` gives update tiers (high / medium / low / dormant) for remote actors.
- `CharacterRegistry` (in services) already tracks every live `CharacterView` (visible count in the overlay).

## 7. Performance testing checklist

Debug overlay: **F3** in `npm run dev`; in production only with `?debug` in the URL
(e.g. `https://josephdevvv.github.io/xenoblightproject/?debug`).

- [ ] `npm run typecheck` and `npm run build` pass.
- [ ] Startup network requests: only the logo before character creation; the walk sheet only when entering the map.
- [ ] Overlay: FPS ~60, frame time below budget while walking across the map.
- [ ] Overlay "Culling": drawn count changes as the camera moves; nothing visible is missing on screen.
- [ ] Game -> ESC -> creation -> game, several times: texture count and display-list size stay constant;
      characters = 1; map stage `ready` in game, `idle` in creation.
- [ ] Walk in all 8 directions; stop shows the static frame; collision at the shrine and the ruined house.
- [ ] Collision still blocks behind off-screen (culled) obstacles.
- [ ] Production build: no overlay without `?debug`; no `__XENOBLIGHT__` dev hook.
