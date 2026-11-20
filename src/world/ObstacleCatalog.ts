import { OBJECT_ART } from '../assets/mockup/MockupEnvironmentFactory';
import { TextureKeys, type ObjectTextureId } from '../assets/TextureKeys';
import { HANDMADE_OBJECT_ART } from './objects/HandmadeArt';
import { MAP_OBJECTS, type MapObjectSpec } from './objects/MapObjectCatalog';

export type ObstacleType = ObjectTextureId;

/** Art + gameplay data of one prop type (gameplay half comes from MapObjectCatalog). */
export interface ObstacleDefinition {
  textureKey: string;
  /** Sprite origin so that the prop's ground contact point sits on its footprint centre. */
  originX: number;
  originY: number;
  blocksMovement: boolean;
  spec: MapObjectSpec;
  /** Emits smoke particles from this offset (px, relative to the footprint centre). */
  smokeOffsetY?: number;
  /** Faint accent glow behind the prop. */
  glow?: { offsetY: number; scale: number; alpha: number };
}

const EXTRAS: Partial<Record<ObjectTextureId, Pick<ObstacleDefinition, 'smokeOffsetY' | 'glow'>>> = {
  brazier: { smokeOffsetY: -22, glow: { offsetY: -20, scale: 0.9, alpha: 0.35 } },
  shrine: { glow: { offsetY: -36, scale: 2.2, alpha: 0.22 } },
  monument: { glow: { offsetY: -64, scale: 2.4, alpha: 0.14 } },
  altar: { glow: { offsetY: -18, scale: 1.4, alpha: 0.2 } },
};

export const OBSTACLES: Readonly<Record<ObstacleType, ObstacleDefinition>> = Object.fromEntries(
  (Object.keys(TextureKeys.objects) as ObjectTextureId[]).map((id) => {
    // Hand-made art (loaded with the map) wins over the procedural mockup painted at boot.
    const handmade = HANDMADE_OBJECT_ART[id];
    const art = handmade ?? OBJECT_ART[id];
    const spec = MAP_OBJECTS[id];
    return [
      id,
      {
        textureKey: handmade ? handmade.key : TextureKeys.objects[id],
        originX: art.anchorX / art.width,
        originY: art.anchorY / art.height,
        blocksMovement: spec.category === 'blocking',
        spec,
        ...EXTRAS[id],
      },
    ];
  }),
) as Record<ObstacleType, ObstacleDefinition>;
