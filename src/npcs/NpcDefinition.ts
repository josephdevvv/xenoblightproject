import type { TileCoord } from '../core/types';
import cityGuard from './art/city_guard_01.generated.json';
import cityGuardJack from './art/city_guard_jack.generated.json';
import cityGuardSonny from './art/city_guard_sonny.generated.json';

/**
 * Non-player characters. Data only: a stable id (used later by quests / dialogue), a display name, where it
 * stands, its art and its idle routine. Quests and dialogue refer to the id (src/quests, src/dialogue);
 * nothing about them is stored here.
 */

export type NpcId = 'city_guard_01' | 'city_guard_jack' | 'city_guard_sonny';

export interface NpcSheetMeta {
  id: string;
  file: string;
  frameWidth: number;
  frameHeight: number;
  /** Grid columns (frames are numbered row-major from 0). */
  columns: number;
  /** Sheet frame of the standing pose. */
  standFrame: number;
  /** Sheet frames of the idle animation, played once in order. */
  playFrames: number[];
  facing: string;
  /** Ground point (feet) shared by every frame; `top` = first opaque row of the standing frame. */
  anchor: { x: number; y: number; top: number };
}

export interface NpcDefinition {
  id: NpcId;
  name: string;
  /** Map it stands on and its tile (block) there; it never moves. */
  mapId: string;
  tile: TileCoord;
  facing: 'SW' | 'SE' | 'NW' | 'NE';
  art: { meta: NpcSheetMeta; url: string };
  /** Top of the head in the standing frame (frame px: middle of the head, its first row) - not weapons held above it. */
  head: { x: number; top: number };
  idle: {
    /** Standing still on frame 1 before (and after) each play of the idle animation. */
    stillMs: number;
    frameMs: number;
  };
}

export const NPC_DEFINITIONS: Readonly<Record<NpcId, NpcDefinition>> = {
  city_guard_01: {
    id: 'city_guard_01',
    name: 'Mateus',
    mapId: 'ashen_crossroads',
    tile: { col: 14, row: 105 },
    facing: 'SW',
    // the city guard "Mateus": standing frame 1; frames 2-13 played once at 150 ms, then 15 s standing again
    art: { meta: cityGuard as NpcSheetMeta, url: 'assets/npcs/city_guard_01/MateusIdleAnimation.png' },
    head: { x: 34, top: 6 },
    idle: { stillMs: 15000, frameMs: 150 },
  },
  // The two gate guards in front of the closed city gate (Zone 5), same idle routine as Mateus.
  city_guard_jack: {
    id: 'city_guard_jack',
    name: 'Jack',
    mapId: 'ashen_crossroads',
    tile: { col: 13, row: 3 },
    facing: 'SW',
    art: { meta: cityGuardJack as NpcSheetMeta, url: 'assets/npcs/city_guard_jack/DoorGuard01IdleAnimation.png' },
    head: { x: 31, top: 8 },
    idle: { stillMs: 15000, frameMs: 150 },
  },
  city_guard_sonny: {
    id: 'city_guard_sonny',
    name: 'Sonny',
    mapId: 'ashen_crossroads',
    tile: { col: 16, row: 3 },
    facing: 'SW',
    art: { meta: cityGuardSonny as NpcSheetMeta, url: 'assets/npcs/city_guard_sonny/DoorGuard02IdleAnimation.png' },
    head: { x: 31, top: 8 },
    idle: { stillMs: 15000, frameMs: 150 },
  },
};

export const npcSheetKey = (def: NpcDefinition): string => `npc.${def.art.meta.id}`;

export function npcsOnMap(mapId: string): NpcDefinition[] {
  return Object.values(NPC_DEFINITIONS).filter((n) => n.mapId === mapId);
}
