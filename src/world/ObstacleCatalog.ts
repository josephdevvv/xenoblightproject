import { OBJECT_ART } from '../assets/mockup/MockupEnvironmentFactory';
import { TextureKeys, type ObjectTextureId } from '../assets/TextureKeys';

export type ObstacleType = ObjectTextureId;

export interface ObstacleDefinition {
  textureKey: string;
  /** Sprite origin so that the prop's ground contact point sits on the tile centre. */
  originX: number;
  originY: number;
  blocksMovement: boolean;
  /** Emits smoke particles from this offset (px, relative to the tile centre). */
  smokeOffsetY?: number;
  /** Faint accent glow behind the prop. */
  glow?: { offsetY: number; scale: number; alpha: number };
}

function origin(id: ObjectTextureId): { originX: number; originY: number } {
  const art = OBJECT_ART[id];
  return { originX: art.anchorX / art.width, originY: art.anchorY / art.height };
}

export const OBSTACLES: Readonly<Record<ObstacleType, ObstacleDefinition>> = {
  rock: { textureKey: TextureKeys.objects.rock, ...origin('rock'), blocksMovement: true },
  rock_small: { textureKey: TextureKeys.objects.rock_small, ...origin('rock_small'), blocksMovement: true },
  dead_tree: { textureKey: TextureKeys.objects.dead_tree, ...origin('dead_tree'), blocksMovement: true },
  pillar: { textureKey: TextureKeys.objects.pillar, ...origin('pillar'), blocksMovement: true },
  pillar_broken: { textureKey: TextureKeys.objects.pillar_broken, ...origin('pillar_broken'), blocksMovement: true },
  brazier: {
    textureKey: TextureKeys.objects.brazier,
    ...origin('brazier'),
    blocksMovement: true,
    smokeOffsetY: -22,
    glow: { offsetY: -20, scale: 0.9, alpha: 0.35 },
  },
  shrine: {
    textureKey: TextureKeys.objects.shrine,
    ...origin('shrine'),
    blocksMovement: true,
    glow: { offsetY: -36, scale: 2.2, alpha: 0.22 },
  },
};
