import type { CharacterData } from '../data/CharacterData';
import type { Point } from '../core/types';

/**
 * Portals - data + pure rules + the one place that changes their state, unit-tested. A portal is hidden until
 * something opens it, then stands on its map with an arrow above it; the first time the player goes through it the
 * arrow goes away (going through again still works). The state is kept in the save file ("portals", optional when
 * reading), so a reload after unlocking shows it again - and nothing can open it twice.
 *
 * Replaceable: when the first city map exists, only `destination` (and a map id there) changes.
 */
export const PORTAL_STATES = ['LOCKED', 'UNLOCKED', 'ENTERED'] as const;
export type PortalState = (typeof PORTAL_STATES)[number];

export interface PortalDefinition {
  id: string;
  /** The map it stands on. */
  mapId: string;
  /** The tile it stands on (its foot is the tile centre). Not blocking: the player walks up to it. */
  tile: { col: number; row: number };
  /** A looping animation: `frames` square cells of `size` px side by side in one sheet. */
  art: { key: string; url: string; size: number; frames: number; frameRate: number };
  /** Where it leads: a tile, on `mapId` (another map) or on its own map when absent. */
  destination: { mapId?: string; col: number; row: number };
  /** Always open (a plain way between maps): shown without an arrow, nothing to unlock, nothing saved. */
  alwaysOpen?: boolean;
}

/**
 * The portal art (PixelLab): a 12-frame seamless loop of the 64 x 64 portal - the blue light pillar swirling in its
 * gray stone ring - as one 768 x 64 sheet. Both portals use it.
 */
export const PORTAL_ART = {
  key: 'world.portal.loop',
  url: 'assets/world/portal/portal_loop_64x12.png',
  size: 64,
  frames: 12,
  frameRate: 10,
} as const;

export const PORTALS = {
  /** Dawnkeep's gate: opened by Sonny ("Roland sent me"); leads just inside Dawnkeep's main gate. */
  dawnkeep_gate: {
    id: 'dawnkeep_gate',
    mapId: 'ashen_crossroads',
    tile: { col: 14, row: 3 },
    art: PORTAL_ART,
    destination: { mapId: 'dawnkeep', col: 47, row: 86 },
  },
  /** The way back: right outside Dawnkeep's gate, to the road just below the Ashen gate portal. */
  dawnkeep_exit: {
    id: 'dawnkeep_exit',
    mapId: 'dawnkeep',
    tile: { col: 47, row: 91 },
    art: PORTAL_ART,
    destination: { mapId: 'ashen_crossroads', col: 14, row: 5 },
    alwaysOpen: true,
  },
} as const satisfies Record<string, PortalDefinition>;

const ALWAYS_OPEN = new Set<string>(Object.values(PORTALS as Record<string, PortalDefinition>).filter((p) => p.alwaysOpen).map((p) => p.id));

export type PortalId = keyof typeof PORTALS;

/** Tile centre of a tile (where things stand). */
/**
 * No warp right after arriving through one (no loops): portals stay shut for WARP_GUARD.ms after an arrival, and
 * - if the player arrived inside a portal's reach - until they have stepped out of it once.
 */
export const WARP_GUARD = { ms: 1000, reach: 1.5 } as const;

export interface WarpGuard {
  /** Scene time from which warping is allowed again. */
  until: number;
  /** Still standing within a portal's reach since the arrival. */
  mustLeave: boolean;
}

/** The guard right after an arrival at `now`, `distance` tiles from this map's portal (Infinity = none). */
export function arrivalGuard(now: number, distance: number): WarpGuard {
  return { until: now + WARP_GUARD.ms, mustLeave: distance <= WARP_GUARD.reach };
}

/** Per frame: once out of the portal's reach, that part of the guard is over. */
export function updateWarpGuard(g: WarpGuard, distance: number): WarpGuard {
  return g.mustLeave && distance > WARP_GUARD.reach ? { ...g, mustLeave: false } : g;
}

export function warpAllowed(g: WarpGuard | null, now: number): boolean {
  return !g || (now >= g.until && !g.mustLeave);
}

/** Where a warp puts the player: its destination tile, 15 px to the right on screen (+x = +col and -row). */
export const ARRIVAL_OFFSET_PX = 15;
const ARRIVAL_OFFSET_TILES = ARRIVAL_OFFSET_PX / 64;

export function arrivalPoint(t: { col: number; row: number }): Point {
  return { x: t.col + 0.5 + ARRIVAL_OFFSET_TILES, y: t.row + 0.5 - ARRIVAL_OFFSET_TILES };
}

/** Standing on a portal's tile (the player's centre, tile space). */
export function onPortalTile(p: Point, tile: { col: number; row: number }): boolean {
  return Math.floor(p.x) === tile.col && Math.floor(p.y) === tile.row;
}

/**
 * Walking onto a portal's tile warps at once - only when the player steps ON it (was off it the frame before), it
 * is open, Auto Play / Auto Combat is off and the arrival guard allows it. Standing on it after Auto Play stops does
 * not warp: one has to step off and on again.
 */
export function stepWarps(s: { wasOn: boolean; isOn: boolean; autoPlay: boolean; state: PortalState; allowed: boolean }): boolean {
  return s.isOn && !s.wasOn && !s.autoPlay && s.state !== 'LOCKED' && s.allowed;
}

export function tileCentre(t: { col: number; row: number }): Point {
  return { x: t.col + 0.5, y: t.row + 0.5 };
}

export function isPortalState(v: unknown): v is PortalState {
  return typeof v === 'string' && (PORTAL_STATES as readonly string[]).includes(v);
}

/** Stored data -> the states of the portals this build knows (LOCKED is not stored; bad entries dropped). */
export function sanitizePortals(raw: unknown): { state: Partial<Record<PortalId, PortalState>>; dropped: string[] } {
  if (raw === undefined || raw === null) return { state: {}, dropped: [] };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { state: {}, dropped: ['portals'] };
  const state: Partial<Record<PortalId, PortalState>> = {};
  const dropped: string[] = [];
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!(id in PORTALS) || ALWAYS_OPEN.has(id) || !isPortalState(v)) {
      dropped.push(`portals: ${id}`);
      continue;
    }
    if (v !== 'LOCKED') state[id as PortalId] = v;
  }
  return { state, dropped };
}

/** Shown on its map (and clickable) once opened. */
export function portalVisible(state: PortalState): boolean {
  return state !== 'LOCKED';
}

/** The arrow above it: opened but not gone through yet. */
export function portalArrowShown(state: PortalState): boolean {
  return state === 'UNLOCKED';
}

type Listener = (character: CharacterData) => void;
const listeners = new Set<Listener>();

export const PortalService = {
  state(character: CharacterData, id: PortalId): PortalState {
    if (ALWAYS_OPEN.has(id)) return 'ENTERED';
    const v = character.portals?.[id];
    return isPortalState(v) ? v : 'LOCKED';
  },

  /** Opens a locked portal (once). True when it was opened now - never a second time. */
  unlock(character: CharacterData, id: PortalId): boolean {
    if (this.state(character, id) !== 'LOCKED') return false;
    character.portals = { ...(character.portals ?? {}), [id]: 'UNLOCKED' };
    for (const l of listeners) l(character);
    return true;
  },

  /** Going through an open portal: the first time it becomes ENTERED (no arrow any more). False while locked. */
  enter(character: CharacterData, id: PortalId): boolean {
    const s = this.state(character, id);
    if (s === 'LOCKED') return false;
    if (s === 'UNLOCKED') {
      character.portals = { ...(character.portals ?? {}), [id]: 'ENTERED' };
      for (const l of listeners) l(character);
    }
    return true;
  },

  /** A portal was opened or gone through for the first time (the quest tracker follows). */
  onChange(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
