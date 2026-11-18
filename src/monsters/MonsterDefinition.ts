/**
 * Data describing a monster type. Visual-only for now: no AI, stats, combat or loot fields yet -
 * those get added here (as optional fields) when the systems that use them exist.
 */

export type MonsterId = 'voidmite';

/** Future animation clip (frame indices into the monster's sheet). Not used yet. */
export interface MonsterAnimationClip {
  frames: number[];
  frameRate: number;
  repeat: number;
}

export interface MonsterSpriteDefinition {
  /** Texture key; also the key a future production sheet must be loaded under. */
  textureKey: string;
  frameWidth: number;
  frameHeight: number;
  /** Ground-contact point inside the frame in px (bottom-centre of the feet). */
  anchor: { x: number; y: number };
  /**
   * Production sprite sheet (relative to /public). When absent, a procedural mockup is generated.
   * Replacing the mockup = drop in the PNG and set this URL; anchor/frame size describe the new art.
   */
  url?: string;
  /** Future: named clips (idle, walk, ...) for when animated sheets arrive. */
  animations?: Readonly<Record<string, MonsterAnimationClip>>;
}

/** Idle wandering around the spawn point. Purely positional: no AI decisions, targets or combat. */
export interface MonsterWanderBehavior {
  type: 'wander';
  /** Maximum distance from the spawn point, in tiles. */
  radiusTiles: number;
  /** Walking speed in tiles per second. */
  speed: number;
  /** Random pause between walks, in ms [min, max]. */
  pauseMs: [number, number];
}

export interface MonsterDefinition {
  id: MonsterId;
  displayName: string;
  category: 'monster';
  sprite: MonsterSpriteDefinition;
  /** Half-size of the square ground footprint in tiles (spawn validation and movement collision). */
  footprintRadius: number;
  /** Omit for a monster that stays where it spawned. */
  behavior?: MonsterWanderBehavior;
}

export const MONSTER_DEFINITIONS: Readonly<Record<MonsterId, MonsterDefinition>> = {
  voidmite: {
    id: 'voidmite',
    displayName: 'Voidmite',
    category: 'monster',
    sprite: {
      textureKey: 'monster_voidmite',
      // 64 wide x 32 tall: a small, low-profile creature that hugs the ground.
      frameWidth: 64,
      frameHeight: 32,
      anchor: { x: 32, y: 30 },
    },
    footprintRadius: 0.3,
    // Slow, creepy shuffling inside a 3-tile circle around its spawn point.
    behavior: { type: 'wander', radiusTiles: 3, speed: 0.9, pauseMs: [900, 2800] },
  },
};
