import Phaser from 'phaser';
import type { CharacterAppearance } from '../data/CharacterData';
import { getCharacterSpriteId, getCharacterWalkSpriteId, walkSpriteIdOf } from '../characters/CharacterAssetIds';
import {
  CHARACTER_FRAME_HEIGHT,
  CHARACTER_FRAME_WIDTH,
  CHARACTER_SHEET_COLUMNS,
  CHARACTER_SHEET_ROWS,
} from '../characters/CharacterSheetLayout';
import { CHARACTER_SPRITE_MANIFEST } from './CharacterSpriteManifest';
import { LOGO_URL } from './LogoTexture';
import { TextureKeys } from './TextureKeys';
import { createMockupCharacterSheet } from './mockup/MockupCharacterFactory';
import { createEnvironmentTextures } from './mockup/MockupEnvironmentFactory';

/**
 * Single entry point for obtaining textures.
 *
 * Resolution order for a character appearance:
 *   1. a production sprite sheet listed in CHARACTER_SPRITE_MANIFEST (preloaded in BootScene)
 *   2. otherwise a mockup sheet generated on demand and cached under the same sprite ID
 *
 * Scenes never need to know which of the two they got.
 */
export const AssetManager = {
  /** Queue production assets for loading (called from BootScene.preload). */
  preload(loader: Phaser.Loader.LoaderPlugin): void {
    loader.image(TextureKeys.ui.logoSource, LOGO_URL);
    const frameConfig = { frameWidth: CHARACTER_FRAME_WIDTH, frameHeight: CHARACTER_FRAME_HEIGHT };
    for (const [spriteId, entry] of Object.entries(CHARACTER_SPRITE_MANIFEST)) {
      loader.spritesheet(spriteId, entry.standing, frameConfig);
      if (entry.walk) loader.spritesheet(walkSpriteIdOf(spriteId), entry.walk, frameConfig);
    }
  },

  /** Texture key of the appearance's walk-cycle sheet, or null if it has none (static only). */
  getWalkTexture(scene: Phaser.Scene, appearance: CharacterAppearance): string | null {
    const key = getCharacterWalkSpriteId(appearance);
    return scene.textures.exists(key) ? key : null;
  },

  /** Generate placeholder tiles, props and FX for any key not provided by real art. */
  createMockupTextures(scene: Phaser.Scene): void {
    createEnvironmentTextures(scene.textures);
  },

  /** Returns the texture key for an appearance, generating a mockup sheet if needed. */
  ensureCharacterTexture(scene: Phaser.Scene, appearance: CharacterAppearance): string {
    const key = getCharacterSpriteId(appearance);
    if (scene.textures.exists(key)) return key;

    const canvas = createMockupCharacterSheet(appearance);
    const texture = scene.textures.addCanvas(key, canvas);
    if (!texture) {
      throw new Error(`Failed to create mockup texture "${key}".`);
    }
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
    return key;
  },
};
