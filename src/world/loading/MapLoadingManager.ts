import type Phaser from 'phaser';
import type { AssetLoadingManager } from '../../systems/AssetLoadingManager';
import type { ResourceCacheManager } from '../../systems/ResourceCacheManager';
import { runTimeSliced } from '../../systems/TimeSlicedTask';
import { PERFORMANCE_CONFIG } from '../../systems/performance/PerformanceConfig';
import { IsometricMap } from '../IsometricMap';
import type { MapManifest } from './MapRegistry';

export type MapLoadStage = 'idle' | 'preload' | 'prepare' | 'build' | 'transition' | 'cleanup' | 'ready' | 'failed';

/** A map whose assets are loaded and whose data (tiles, collision, spawn) is validated, not yet rendered. */
export interface PreparedMap {
  manifest: MapManifest;
  map: IsometricMap;
}

export interface MapEnterOptions {
  onStage?: (stage: MapLoadStage) => void;
  /** Overall progress 0..1 (asset preload counts as the first 30%). */
  onProgress?: (progress: number) => void;
}

const ownerOf = (mapId: string): string => `map:${mapId}`;

/**
 * Map lifecycle: PRELOAD -> PREPARE -> (BUILD) -> TRANSITION -> CLEANUP.
 *
 *  - PRELOAD / PREPARE never touch the active map, so they can run in the background (e.g. when the
 *    player nears an entrance, via `prepare()`), and a failure leaves the current map untouched.
 *  - BUILD creates the destination's game objects in time slices (no single-frame spike).
 *  - TRANSITION marks the destination active; CLEANUP releases the previous map's resources and
 *    garbage-collects textures nobody uses any more.
 */
export class MapLoadingManager {
  stage: MapLoadStage = 'idle';
  activeMapId: string | null = null;
  lastError: string | null = null;
  private readonly prepared = new Map<string, Promise<PreparedMap>>();

  constructor(
    private readonly assets: AssetLoadingManager,
    private readonly cache: ResourceCacheManager,
    private readonly registry: Readonly<Record<string, MapManifest>>,
  ) {}

  /** PRELOAD + PREPARE (deduplicated). Safe to call while another map is active. */
  prepare(mapId: string, options: MapEnterOptions = {}): Promise<PreparedMap> {
    const existing = this.prepared.get(mapId);
    if (existing) return existing;
    const task = this.runPrepare(mapId, options);
    this.prepared.set(mapId, task);
    task.catch(() => this.prepared.delete(mapId)); // allow a retry after failure
    return task;
  }

  /** Full pipeline into `scene`. Rejects (leaving the active map as it was) on any failure. */
  async enter(scene: Phaser.Scene, mapId: string, options: MapEnterOptions = {}): Promise<PreparedMap> {
    const previous = this.activeMapId;
    try {
      const prepared = await this.prepare(mapId, options);
      this.prepared.delete(mapId); // a prepared map instance is consumed by one build

      this.setStage('build', options);
      await runTimeSliced(scene, prepared.map.buildSteps(scene), PERFORMANCE_CONFIG.budgets.mapBuildSliceMs, (p) =>
        options.onProgress?.(0.3 + p * 0.7),
      );

      this.setStage('transition', options);
      for (const asset of prepared.manifest.assets) this.cache.retain(asset.key, ownerOf(mapId));
      this.activeMapId = mapId;

      this.setStage('cleanup', options);
      if (previous && previous !== mapId) this.cache.releaseOwner(ownerOf(previous));
      this.cache.collectGarbage();

      this.setStage('ready', options);
      return prepared;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.setStage('failed', options);
      throw error;
    }
  }

  /** Called when the scene showing `mapId` shuts down. Its resources become collectable. */
  exit(mapId: string): void {
    this.cache.releaseOwner(ownerOf(mapId));
    if (this.activeMapId === mapId) this.activeMapId = null;
    this.stage = 'idle';
  }

  private async runPrepare(mapId: string, options: MapEnterOptions): Promise<PreparedMap> {
    const manifest = this.registry[mapId];
    if (!manifest) throw new Error(`Unknown map "${mapId}".`);

    this.setStage('preload', options);
    const result = await this.assets.loadAll(manifest.assets, (p) => options.onProgress?.(p * 0.25));
    if (result.failed.length > 0) {
      throw new Error(`Map "${mapId}" assets failed: ${result.failed.map((f) => f.key).join(', ')}`);
    }
    for (const asset of manifest.assets) this.cache.track(asset.key);

    this.setStage('prepare', options);
    const definition = await manifest.definition();
    const map = new IsometricMap(definition); // validates tiles, collision and spawn; throws on bad data
    options.onProgress?.(0.3);
    return { manifest, map };
  }

  private setStage(stage: MapLoadStage, options: MapEnterOptions): void {
    this.stage = stage;
    if (stage !== 'failed') this.lastError = null;
    options.onStage?.(stage);
  }
}
