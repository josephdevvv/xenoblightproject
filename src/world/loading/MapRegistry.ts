import type { AssetRequest } from '../../systems/AssetLoadingManager';
import type { MapDefinition } from '../MapData';
import { ASHEN_CROSSROADS } from '../maps/AshenCrossroads';
import { handmadeArtAssets } from '../objects/HandmadeArt';

/**
 * Everything needed to load a map. `definition` may later become an async fetch of map JSON;
 * `assets` lists map-specific files (the rest of the current map's art is generated at boot).
 */
export interface MapManifest {
  id: string;
  name: string;
  definition: () => MapDefinition | Promise<MapDefinition>;
  assets: AssetRequest[];
}

export const MAP_REGISTRY: Readonly<Record<string, MapManifest>> = {
  [ASHEN_CROSSROADS.id]: {
    id: ASHEN_CROSSROADS.id,
    name: ASHEN_CROSSROADS.name,
    definition: () => ASHEN_CROSSROADS,
    // hand-made Zone 5 city wall / gate sprites
    assets: handmadeArtAssets(),
  },
};

export const DEFAULT_MAP_ID = ASHEN_CROSSROADS.id;
