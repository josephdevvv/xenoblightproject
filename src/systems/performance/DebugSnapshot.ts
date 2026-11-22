import Phaser from 'phaser';
import { SCENES } from '../../config/constants';
import type { Services } from '../GameServices';

export { DEBUG_AVAILABLE } from './DebugAvailable';

/** Show the overlay at startup only when explicitly requested with ?debug. */
export const DEBUG_SHOW_ON_START: boolean =
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');

export interface DebugSnapshot {
  gameObjects: number;
  visibleCharacters: number;
  characters: number;
  textures: number;
  trackedTextures: number;
  texturesInUse: number;
  activeScenes: string[];
}

const SERVICE_SCENES: ReadonlySet<string> = new Set([SCENES.System, SCENES.DebugOverlay]);

/** Counts display objects in gameplay scenes, including children of layers and containers. */
export function countGameObjects(game: Phaser.Game): number {
  let total = 0;
  const visit = (list: Phaser.GameObjects.GameObject[]): void => {
    for (const obj of list) {
      total++;
      if (obj instanceof Phaser.GameObjects.Layer || obj instanceof Phaser.GameObjects.Container) {
        visit(obj.list as Phaser.GameObjects.GameObject[]);
      }
    }
  };
  for (const scene of game.scene.getScenes(true)) {
    if (!SERVICE_SCENES.has(scene.scene.key)) visit(scene.children.list);
  }
  return total;
}

export function collectDebugSnapshot(game: Phaser.Game, services: Services): DebugSnapshot {
  const cache = services.cache.stats();
  return {
    gameObjects: countGameObjects(game),
    visibleCharacters: services.characters.countVisible(),
    characters: services.characters.size,
    textures: cache.textures,
    trackedTextures: cache.tracked,
    texturesInUse: cache.inUse,
    activeScenes: game.scene
      .getScenes(true)
      .map((s) => s.scene.key)
      .filter((k) => !SERVICE_SCENES.has(k)),
  };
}
