import type { ObjectTextureId } from '../../assets/TextureKeys';
import type { AssetRequest } from '../../systems/AssetLoadingManager';
import registry from './handmadeArt.generated.json';
import { DAWNKEEP_ART, DAWNKEEP_ART_BASE } from './DawnkeepArt';

/**
 * Hand-made (non-procedural) sprites for map props, loaded as files with the map instead of being painted
 * at boot. The city wall set is assembled from a PixelLab building kit by tools/compose-city-wall.mjs,
 * which also writes handmadeArt.generated.json (sizes and footprint-centre anchors, world px).
 * Procedural mockups stay registered under the TextureKeys keys as a fallback.
 */
export interface HandmadeArt {
  key: string;
  url: string;
  width: number;
  height: number;
  /** Footprint centre (ground contact) in the image, world px. */
  anchorX: number;
  anchorY: number;
  /** Drawn mirrored (the same file for the other wall direction; anchorX is already mirrored). */
  flipX?: boolean;
}

const BASE = 'assets/environment/city_wall/';

type RegistryEntry = { file: string; width: number; height: number; anchorX: number; anchorY: number };
const WALLS = registry as Record<string, RegistryEntry>;

const art = (id: string, base: string, a: RegistryEntry): HandmadeArt => ({ key: `art_${id}`, url: base + a.file, width: a.width, height: a.height, anchorX: a.anchorX, anchorY: a.anchorY });
/** The x-wall pieces drawn mirrored run along y: same file and texture, anchor mirrored. */
const mirrored = (id: string): HandmadeArt => ({ ...art(id, BASE, WALLS[id]), anchorX: WALLS[id].width - WALLS[id].anchorX, flipX: true });

export const HANDMADE_OBJECT_ART: Readonly<Partial<Record<ObjectTextureId, HandmadeArt>>> = {
  ...Object.fromEntries(Object.entries(WALLS).map(([id, a]) => [id, art(id, BASE, a)])),
  city_wall_y: mirrored('city_wall'),
  city_wall_broken_y: mirrored('city_wall_broken'),
  ...Object.fromEntries(Object.entries(DAWNKEEP_ART).map(([id, a]) => [id, art(id, DAWNKEEP_ART_BASE, a)])),
};

/**
 * Loader requests for hand-made prop sprites (listed in a map manifest): `ids` = only these props (default: the
 * city wall set). A texture shared by several ids (mirrored walls) is requested once.
 */
export function handmadeArtAssets(ids: readonly ObjectTextureId[] = Object.keys(WALLS) as ObjectTextureId[]): AssetRequest[] {
  const byKey = new Map<string, AssetRequest>();
  for (const id of ids) {
    const a = HANDMADE_OBJECT_ART[id];
    if (a && !byKey.has(a.key)) byKey.set(a.key, { key: a.key, type: 'image' as const, url: a.url });
  }
  return [...byKey.values()];
}
