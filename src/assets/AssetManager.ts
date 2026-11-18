import Phaser from 'phaser';
import type { CharacterAppearance } from '../data/CharacterData';
import { getCharacterSpriteId, walkSpriteIdOf } from '../characters/CharacterAssetIds';
import { removeWalkAnimations, type CharacterSheets } from '../characters/CharacterAnimator';
import {
  CHARACTER_FRAME_HEIGHT,
  CHARACTER_FRAME_WIDTH,
  CHARACTER_SHEET_COLUMNS,
  CHARACTER_SHEET_ROWS,
} from '../characters/CharacterSheetLayout';
import { GameServices } from '../systems/GameServices';
import { CHARACTER_SPRITE_MANIFEST } from './CharacterSpriteManifest';
import { LOGO_URL } from './LogoTexture';
import { TextureKeys } from './TextureKeys';
import { createMockupCharacterSheet } from './mockup/MockupCharacterFactory';
import { createEnvironmentTextures } from './mockup/MockupEnvironmentFactory';

export interface CharacterSheetOptions {
  /** Also load the walk-cycle sheet (gameplay). The creation preview only needs the standing sheet. */
  walk: boolean;
}

/** Suffix for the mockup shown when an appearance's real art is still loading or failed to load. */
const FALLBACK_SUFFIX = '__fallback';

/**
 * Single entry point for obtaining textures.
 *
 *  - Startup (BootScene): only essential assets (logo) + generated environment art. Both are core:
 *    never tracked, never evicted.
 *  - Characters: on demand. Real sheets from CHARACTER_SPRITE_MANIFEST are loaded through the shared
 *    AssetLoadingManager (deduplicated) and tracked in the ResourceCacheManager; appearances without
 *    art get a generated mockup sheet (also tracked). Callers hold references via the cache.
 */
export const AssetManager = {
  /** Essential startup assets (called from BootScene.preload). */
  preload(loader: Phaser.Loader.LoaderPlugin): void {
    loader.image(TextureKeys.ui.logoSource, LOGO_URL);
  },

  /** Generate placeholder tiles, props and FX for any key not provided by real art. */
  createMockupTextures(scene: Phaser.Scene): void {
    createEnvironmentTextures(scene.textures);
  },

  /**
   * Sheets usable right now, or null when the appearance has real art that is not loaded yet.
   * Never starts a network request.
   */
  peekCharacterSheets(scene: Phaser.Scene, appearance: CharacterAppearance, options: CharacterSheetOptions): CharacterSheets | null {
    const id = getCharacterSpriteId(appearance);
    const entry = CHARACTER_SPRITE_MANIFEST[id];
    if (!entry) return { standing: ensureMockupSheet(scene, id, appearance), walk: null };

    const failures = GameServices.get().assets.getFailures();
    const textures = scene.textures;
    let standing: string;
    if (textures.exists(id)) standing = id;
    else if (failures.has(id)) standing = ensureMockupSheet(scene, id + FALLBACK_SUFFIX, appearance);
    else return null;

    if (!options.walk || !entry.walk) return { standing, walk: null };
    const walkId = walkSpriteIdOf(id);
    if (textures.exists(walkId)) return { standing, walk: walkId };
    if (failures.has(walkId)) return { standing, walk: null };
    return null;
  },

  /**
   * Loads (deduplicated) or generates the sheets for an appearance. Never rejects: if real art
   * fails to load, a mockup standing sheet is used and the walk animation is skipped.
   */
  async ensureCharacterSheets(scene: Phaser.Scene, appearance: CharacterAppearance, options: CharacterSheetOptions): Promise<CharacterSheets> {
    const ready = AssetManager.peekCharacterSheets(scene, appearance, options);
    if (ready) return ready;

    const services = GameServices.get();
    const id = getCharacterSpriteId(appearance);
    const entry = CHARACTER_SPRITE_MANIFEST[id];
    const frame = { frameWidth: CHARACTER_FRAME_WIDTH, frameHeight: CHARACTER_FRAME_HEIGHT };
    const jobs: Promise<unknown>[] = [
      services.assets.load({ key: id, type: 'spritesheet', url: entry.standing, ...frame }).then(
        () => services.cache.track(id),
        (e: Error) => console.warn(`[assets] ${e.message} - using mockup for ${id}`),
      ),
    ];
    if (options.walk && entry.walk) {
      const walkId = walkSpriteIdOf(id);
      jobs.push(
        services.assets.load({ key: walkId, type: 'spritesheet', url: entry.walk, ...frame }).then(
          () => services.cache.track(walkId, () => removeWalkAnimations(scene.game.anims, walkId)),
          (e: Error) => console.warn(`[assets] ${e.message} - ${id} will not animate while walking`),
        ),
      );
    }
    await Promise.all(jobs);
    return AssetManager.peekCharacterSheets(scene, appearance, options) ?? AssetManager.placeholderSheets(scene, appearance);
  },

  /** Temporary mockup sheets shown while an appearance's real art is loading. */
  placeholderSheets(scene: Phaser.Scene, appearance: CharacterAppearance): CharacterSheets {
    const id = getCharacterSpriteId(appearance);
    const key = CHARACTER_SPRITE_MANIFEST[id] ? id + FALLBACK_SUFFIX : id;
    return { standing: ensureMockupSheet(scene, key, appearance), walk: null };
  },
};

/** Generates (once) a mockup standing sheet under `key` and tracks it as an evictable texture. */
function ensureMockupSheet(scene: Phaser.Scene, key: string, appearance: CharacterAppearance): string {
  if (scene.textures.exists(key)) return key;
  const texture = scene.textures.addCanvas(key, createMockupCharacterSheet(appearance));
  if (!texture) throw new Error(`Failed to create mockup texture "${key}".`);
  for (let row = 0; row < CHARACTER_SHEET_ROWS; row++) {
    for (let col = 0; col < CHARACTER_SHEET_COLUMNS; col++) {
      texture.add(
        row * CHARACTER_SHEET_COLUMNS + col,
        0,
        col * CHARACTER_FRAME_WIDTH,
        row * CHARACTER_FRAME_HEIGHT,
        CHARACTER_FRAME_WIDTH,
        CHARACTER_FRAME_HEIGHT,
      );
    }
  }
  GameServices.get().cache.track(key);
  return key;
}
