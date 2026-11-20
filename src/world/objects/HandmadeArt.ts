import type { ObjectTextureId } from '../../assets/TextureKeys';
import type { AssetRequest } from '../../systems/AssetLoadingManager';
import registry from './handmadeArt.generated.json';

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
}

const BASE = 'assets/environment/city_wall/';

export const HANDMADE_OBJECT_ART: Readonly<Partial<Record<ObjectTextureId, HandmadeArt>>> = Object.fromEntries(
  Object.entries(registry as Record<string, { file: string; width: number; height: number; anchorX: number; anchorY: number }>).map(
    ([id, a]) => [id, { key: `art_${id}`, url: BASE + a.file, width: a.width, height: a.height, anchorX: a.anchorX, anchorY: a.anchorY }],
  ),
);

/** Loader requests for every hand-made prop sprite (listed in the map manifest). */
export function handmadeArtAssets(): AssetRequest[] {
  return Object.values(HANDMADE_OBJECT_ART).map((a) => ({ key: a!.key, type: 'image' as const, url: a!.url }));
}
