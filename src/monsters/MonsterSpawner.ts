import type Phaser from 'phaser';
import type { Point } from '../core/types';
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
 * Validates spawn points against the map and creates monsters. Kept separate from player logic:
 * the scene passes the player-related constraints in. Invalid points are reported, never placed.
 */
export class MonsterSpawner {
  private readonly monsters: MonsterEntity[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: IsometricMap,
  ) {}

  spawn(points: readonly MonsterSpawnPoint[], constraints: SpawnConstraints): SpawnReport {
    const report: SpawnReport = { spawned: [], rejected: [] };
    for (const point of points) {
      const reason = this.validate(point, constraints);
      if (reason) {
        report.rejected.push({ point, reason });
        continue;
      }
      const monster = new MonsterEntity(this.scene, this.map, MONSTER_DEFINITIONS[point.monster], {
        x: point.col + 0.5,
        y: point.row + 0.5,
      });
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

  getMonsters(): readonly MonsterEntity[] {
    return this.monsters;
  }

  /** Returns why a point is invalid, or null when it may be used. */
  private validate(point: MonsterSpawnPoint, constraints: SpawnConstraints): string | null {
    const definition = MONSTER_DEFINITIONS[point.monster];
    if (!definition) return `unknown monster "${point.monster}"`;
    const { col, row } = point;
    if (!this.map.isInside(col, row)) return 'outside the map';
    if (this.map.isTileBlocked(col, row)) return 'blocked tile (obstacle)';
    if (this.map.structures.footprints().some((f) => col >= f.minX && col < f.maxX && row >= f.minY && row < f.maxY)) {
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
