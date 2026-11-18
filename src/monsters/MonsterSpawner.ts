import type Phaser from 'phaser';
import type { Point } from '../core/types';
import type { CollisionQuery } from '../player/PlayerMovement';
import type { PerformanceManager } from '../systems/performance/PerformanceManager';
import type { IsometricMap } from '../world/IsometricMap';
import type { TileBox } from '../world/structures/StructureLayer';
import { MONSTER_DEFINITIONS } from './MonsterDefinition';
import { MonsterEntity } from './MonsterEntity';
import type { MonsterSpawnPoint } from './MonsterSpawns';

export interface SpawnConstraints {
  /** World-space point monsters must keep away from (e.g. the player spawn), with the minimum distance. */
  avoid: { world: Point; minDistancePx: number };
  /** Tile-space areas monsters must not overlap (e.g. the player's spawn collision box). */
  reserved: TileBox[];
}

export interface SpawnReport {
  spawned: MonsterEntity[];
  rejected: { point: MonsterSpawnPoint; reason: string }[];
}

const overlaps = (a: TileBox, b: TileBox): boolean =>
  a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;

/**
 * Validates spawn points against the map, creates monsters and drives their (idle) movement.
 * Kept separate from player logic: the scene passes player-related constraints in.
 * Invalid spawn points are reported, never placed.
 */
export class MonsterSpawner {
  private readonly monsters: MonsterEntity[] = [];
  private readonly buildings: TileBox[];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: IsometricMap,
  ) {
    this.buildings = map.structures.footprints();
  }

  spawn(points: readonly MonsterSpawnPoint[], constraints: SpawnConstraints): SpawnReport {
    const report: SpawnReport = { spawned: [], rejected: [] };
    for (const point of points) {
      const reason = this.validate(point, constraints);
      if (reason) {
        report.rejected.push({ point, reason });
        continue;
      }
      const definition = MONSTER_DEFINITIONS[point.monster];
      // Placeholder until the entity exists; the query needs the entity to ignore itself.
      let self: MonsterEntity | null = null;
      const collision: CollisionQuery = { isAreaFree: (box) => this.isAreaFreeFor(self, box) };
      const monster = new MonsterEntity(
        this.scene,
        this.map,
        definition,
        { x: point.col + 0.5, y: point.row + 0.5 },
        collision,
        point.col * 1009 + point.row * 31 + 7,
      );
      self = monster;
      this.monsters.push(monster);
      report.spawned.push(monster);
    }
    if (report.rejected.length > 0) {
      console.warn(
        `[monsters] ${report.rejected.length} spawn point(s) rejected:`,
        report.rejected.map((r) => `${r.point.monster}@(${r.point.col},${r.point.row}): ${r.reason}`),
      );
    }
    return report;
  }

  /**
   * Moves wandering monsters. Monsters in the "dormant" distance band (far from the camera) are
   * skipped; nothing else changes, and stationary monsters cost nothing.
   */
  update(deltaMs: number, camera: Phaser.Cameras.Scene2D.Camera, performance: PerformanceManager): void {
    const cx = camera.midPoint.x;
    const cy = camera.midPoint.y;
    for (const monster of this.monsters) {
      if (!monster.moves) continue;
      const w = monster.world;
      if (performance.priorityForDistance(Math.hypot(w.x - cx, w.y - cy)) === 'dormant') continue;
      monster.update(deltaMs, (p) => this.isAreaFreeFor(monster, monster.footprint(p)));
    }
  }

  getMonsters(): readonly MonsterEntity[] {
    return this.monsters;
  }

  /** Map collision + no buildings + no other monster. */
  private isAreaFreeFor(self: MonsterEntity | null, box: TileBox): boolean {
    if (!this.map.isAreaFree(box)) return false;
    if (this.buildings.some((b) => overlaps(box, b))) return false;
    return !this.monsters.some((m) => m !== self && overlaps(box, m.footprint()));
  }

  /** Returns why a point is invalid, or null when it may be used. */
  private validate(point: MonsterSpawnPoint, constraints: SpawnConstraints): string | null {
    const definition = MONSTER_DEFINITIONS[point.monster];
    if (!definition) return `unknown monster "${point.monster}"`;
    const { col, row } = point;
    if (!this.map.isInside(col, row)) return 'outside the map';
    if (this.map.isTileBlocked(col, row)) return 'blocked tile (obstacle)';
    if (this.buildings.some((f) => col >= f.minX && col < f.maxX && row >= f.minY && row < f.maxY)) {
      return 'inside a building';
    }

    const x = col + 0.5;
    const y = row + 0.5;
    const r = definition.footprintRadius;
    const box: TileBox = { minX: x - r, minY: y - r, maxX: x + r, maxY: y + r };
    if (!this.map.isAreaFree(box)) return 'footprint touches a wall, obstacle or the map edge';

    const world = this.map.tileToWorld(x, y);
    const distance = Math.hypot(world.x - constraints.avoid.world.x, world.y - constraints.avoid.world.y);
    if (distance < constraints.avoid.minDistancePx) return `only ${distance.toFixed(1)}px from the player spawn`;
    if (constraints.reserved.some((area) => overlaps(box, area))) return 'overlaps the player spawn area';
    if (this.monsters.some((m) => overlaps(box, m.footprint()))) return 'overlaps another monster';
    return null;
  }
}
