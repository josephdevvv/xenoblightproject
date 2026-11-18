/**
 * Future multiplayer contracts - INTERFACES ONLY.
 *
 * Nothing here talks to a network yet. These types define how remote players will plug into the
 * existing systems so rendering, loading and visibility do not need rewriting later:
 *
 *   server snapshot -> InterestManager (which ids matter on this map/area)
 *                   -> RemoteCharacterRenderer (CharacterView per id, sheets via AppearanceLoader)
 *                   -> PerformanceManager.priorityForDistance (how often to update each one)
 */
import type { CharacterMotion, CharacterSheets } from '../characters/CharacterAnimator';
import type { Direction } from '../core/Direction';
import type { Point } from '../core/types';
import type { CharacterAppearance } from '../data/CharacterData';
import type { UpdatePriority } from '../systems/performance/PerformanceManager';

/** Authoritative state of one character as a server would send it. */
export interface CharacterSnapshot {
  id: string;
  name: string;
  mapId: string;
  appearance: CharacterAppearance;
  /** Continuous tile-space position (same space as PlayerMovement). */
  position: Point;
  facing: Direction;
  motion: CharacterMotion;
}

/**
 * Loads the full pre-rendered sheets for an appearance on demand.
 * Already implemented by AssetManager.ensureCharacterSheets / peekCharacterSheets.
 */
export interface AppearanceLoader {
  ensure(appearance: CharacterAppearance, options: { walk: boolean }): Promise<CharacterSheets>;
}

/**
 * Draws characters controlled by other players. An implementation will own one CharacterView per id
 * (full sprites, no layers), interpolate positions between snapshots, and drive CharacterAnimator
 * with the snapshot's motion/facing. Depth sorting reuses IsometricMap.resolveDepth.
 */
export interface RemoteCharacterRenderer {
  spawn(snapshot: CharacterSnapshot): void;
  update(snapshot: CharacterSnapshot, priority: UpdatePriority): void;
  despawn(id: string): void;
  /** Ids currently rendered. */
  ids(): Iterable<string>;
}

/** An area of interest in tile space (usually centred on the local player). */
export interface InterestArea {
  mapId: string;
  center: Point;
  radiusTiles: number;
}

/**
 * Map-based interest management: decides which remote characters the client should receive and
 * render (same map, within range). Visibility culling stays a rendering concern only.
 */
export interface InterestManager {
  setArea(area: InterestArea): void;
  /** Ids that are on the same map and inside the area. */
  interestedIn(): ReadonlySet<string>;
  /** Called by the networking layer when snapshots arrive. */
  onSnapshot(snapshot: CharacterSnapshot): void;
  onDespawn(id: string): void;
}

/** Answers "who is near?" for visibility decisions (e.g. hide name plates of far players). */
export interface NearbyPlayerQuery {
  nearby(center: Point, radiusTiles: number): CharacterSnapshot[];
}
