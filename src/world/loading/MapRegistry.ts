import type { AssetRequest } from '../../systems/AssetLoadingManager';
import { TEST_MAP, type MapDefinition } from '../MapData';

/**
 * Everything needed to load a map. `definition` may later become an async fetch of map JSON;
 * `assets` lists map-specific files (none yet: the current map's art is generated at boot).
 */
export interface MapManifest {
  id: string;
  name: string;
  definition: () => MapDefinition | Promise<MapDefinition>;
  assets: AssetRequest[];
}

export const MAP_REGISTRY: Readonly<Record<string, MapManifest>> = {
  [TEST_MAP.id]: {
    id: TEST_MAP.id,
    name: TEST_MAP.name,
    definition: () => TEST_MAP,
    assets: [],
  },
};

export const DEFAULT_MAP_ID = TEST_MAP.id;
