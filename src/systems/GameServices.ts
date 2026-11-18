import type { CharacterRegistry } from '../characters/CharacterRegistry';
import type { MapLoadingManager } from '../world/loading/MapLoadingManager';
import type { AssetLoadingManager } from './AssetLoadingManager';
import type { ResourceCacheManager } from './ResourceCacheManager';
import type { PerformanceManager } from './performance/PerformanceManager';

/** Long-lived game-wide services, created once by SystemScene. */
export interface Services {
  assets: AssetLoadingManager;
  cache: ResourceCacheManager;
  maps: MapLoadingManager;
  performance: PerformanceManager;
  characters: CharacterRegistry;
  /** Extra debug lines contributed by scenes (e.g. culling stats); keyed by source name. */
  debugSources: Map<string, () => string>;
}

let installed: Services | null = null;
const waiters: Array<(services: Services) => void> = [];

export const GameServices = {
  install(services: Services): void {
    installed = services;
    for (const resolve of waiters.splice(0)) resolve(services);
  },

  /** Throws if called before SystemScene has started. */
  get(): Services {
    if (!installed) throw new Error('GameServices are not installed yet.');
    return installed;
  },

  tryGet(): Services | null {
    return installed;
  },

  ready(): Promise<Services> {
    return installed ? Promise.resolve(installed) : new Promise((resolve) => waiters.push(resolve));
  },
};
