import type { AssetRequest } from '../../systems/AssetLoadingManager';
import type { MapDefinition } from '../MapData';
import { ASHEN_CROSSROADS } from '../maps/AshenCrossroads';
import { DAWNKEEP } from '../maps/Dawnkeep';
import { DAWNKEEP_ART, type DawnkeepObjectId } from '../objects/DawnkeepArt';
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
  [DAWNKEEP.id]: {
    id: DAWNKEEP.id,
    name: DAWNKEEP.name,
    definition: () => DAWNKEEP,
    // the city wall set (mirrored walls share its files) + the Dawnkeep sprites
    assets: handmadeArtAssets(['city_wall', 'city_wall_broken', 'city_tower', ...(Object.keys(DAWNKEEP_ART) as DawnkeepObjectId[])]),
  },
};

export const DEFAULT_MAP_ID = ASHEN_CROSSROADS.id;

/** The map a start of the game scene enters: a portal's map, a loaded save's map, or the first map (unknown ids ignored). */
export function startMapId(data: { mapId?: string; savedLocation?: { mapId: string } | null }): string {
  if (data.mapId && MAP_REGISTRY[data.mapId]) return data.mapId;
  const saved = data.savedLocation?.mapId;
  return saved && MAP_REGISTRY[saved] ? saved : DEFAULT_MAP_ID;
}
