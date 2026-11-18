import type Phaser from 'phaser';

/**
 * Shared texture ownership with reference counting.
 *
 * Rules (see PERFORMANCE_GUIDELINES.md):
 *  - Core textures (generated environment art, UI) are never tracked here and are never evicted.
 *  - Lazily loaded / generated textures are `track()`ed. Users `retain()` them with an owner id and
 *    `release()` them when done. A tracked texture is evicted only by `collectGarbage()`, only when it
 *    has no owners, and only after it has been unused for a grace period (avoids reload thrash).
 *  - `pin()` makes a tracked texture permanent.
 */

interface CacheEntry {
  owners: Set<string>;
  /** Created/loaded lazily and therefore allowed to be evicted. */
  evictable: boolean;
  pinned: boolean;
  /** Time (ms) when the last owner released it; 0 while in use or never used. */
  releasedAt: number;
  onEvict?: () => void;
}

export interface CacheStats {
  /** All textures currently in Phaser's texture manager (excluding Phaser internals). */
  textures: number;
  /** Textures tracked as lazily loaded. */
  tracked: number;
  /** Tracked textures currently retained by at least one owner. */
  inUse: number;
}

export const DEFAULT_GC_GRACE_MS = 30_000;

const UUID_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ResourceCacheManager {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(
    private readonly textures: Phaser.Textures.TextureManager,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** Register a lazily loaded/generated texture so it can be evicted once unused. */
  track(key: string, onEvict?: () => void): void {
    const entry = this.entry(key);
    entry.evictable = true;
    if (onEvict) entry.onEvict = onEvict;
    if (entry.owners.size === 0 && entry.releasedAt === 0) entry.releasedAt = this.now();
  }

  /** Never evict this texture. */
  pin(key: string): void {
    this.entry(key).pinned = true;
  }

  retain(key: string, owner: string): void {
    const entry = this.entry(key);
    entry.owners.add(owner);
    entry.releasedAt = 0;
  }

  release(key: string, owner: string): void {
    const entry = this.entries.get(key);
    if (!entry || !entry.owners.delete(owner)) return;
    if (entry.owners.size === 0) entry.releasedAt = this.now();
  }

  /** Releases everything held by one owner (e.g. a destroyed character view or a left map). */
  releaseOwner(owner: string): void {
    for (const key of this.entries.keys()) this.release(key, owner);
  }

  isInUse(key: string): boolean {
    return (this.entries.get(key)?.owners.size ?? 0) > 0;
  }

  /**
   * Evicts tracked, unpinned textures that have had no owners for at least `graceMs`.
   * Never touches textures that are in use. Returns the evicted keys.
   */
  collectGarbage(graceMs: number = DEFAULT_GC_GRACE_MS): string[] {
    const now = this.now();
    const evicted: string[] = [];
    for (const [key, entry] of this.entries) {
      if (!entry.evictable || entry.pinned || entry.owners.size > 0) continue;
      if (now - entry.releasedAt < graceMs) continue;
      entry.onEvict?.();
      if (this.textures.exists(key)) this.textures.remove(key);
      this.entries.delete(key);
      evicted.push(key);
    }
    return evicted;
  }

  stats(): CacheStats {
    let tracked = 0;
    let inUse = 0;
    for (const entry of this.entries.values()) {
      if (!entry.evictable) continue;
      tracked++;
      if (entry.owners.size > 0) inUse++;
    }
    // Phaser registers each Text object's canvas under a random UUID; those are not assets.
    const assets = this.textures.getTextureKeys().filter((key) => !UUID_KEY.test(key)).length;
    return { textures: assets, tracked, inUse };
  }

  private entry(key: string): CacheEntry {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { owners: new Set(), evictable: false, pinned: false, releasedAt: 0 };
      this.entries.set(key, entry);
    }
    return entry;
  }
}
