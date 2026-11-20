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
import { forgetSheetMetrics } from '../characters/SpriteMetrics';
import { CHARACTER_SPRITE_MANIFEST, isApprovedCharacterSprite } from './CharacterSpriteManifest';
import { LOGO_URL } from './LogoTexture';
import { TextureKeys } from './TextureKeys';
import type { MonsterDefinition } from '../monsters/MonsterDefinition';
import { createMockupCharacterSheet } from './mockup/MockupCharacterFactory';
import { createMonsterMockup } from './mockup/MockupMonsterFactory';
import { createEnvironmentTextures } from './mockup/MockupEnvironmentFactory';

export interface CharacterSheetOptions {
  /** Also load the walk-cycle sheet (gameplay). The creation preview only needs the standing sheet. */
  walk: boolean;
}

/** Suffix for the mockup shown when an appearance's real art is still loading or failed to load. */
const FALLBACK_SUFFIX = '__fallback';
/** Transparent sheet shown while APPROVED art loads (approved art is never replaced by a mockup). */
const BLANK_SHEET_KEY = 'char__blank_sheet';
/** Phaser's built-in "missing texture" image: makes a missing approved sheet visible instead of hiding it. */
const MISSING_SHEETS: CharacterSheets = { standing: '__MISSING', walk: null };
const reportedMissing = new Set<string>();

/** Approved art that fails to load is an error (exact path reported once), not a silent mockup. */
function reportMissingApproved(id: string, url: string): void {
  if (reportedMissing.has(id)) return;
  reportedMissing.add(id);
  console.error(`[assets] approved character sheet missing or unreadable: public/${url} (sprite ${id})`);
}

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
   * Makes a monster's sprite available (on demand, once): loads its production sheet when the
   * definition has a URL, otherwise generates the procedural mockup. Falls back to the mockup if
   * loading fails. Tracked as a lazy texture; callers retain it while monsters are on screen.
   */
  async ensureMonsterTexture(scene: Phaser.Scene, definition: MonsterDefinition): Promise<string> {
    const s = definition.sprite;
    if (scene.textures.exists(s.textureKey)) return s.textureKey;
    const services = GameServices.get();
    if (s.url) {
      try {
        await services.assets.load({ key: s.textureKey, type: 'spritesheet', url: s.url, frameWidth: s.frameWidth, frameHeight: s.frameHeight });
      } catch (e) {
        console.warn(`[assets] ${(e as Error).message} - using mockup for ${definition.id}`);
      }
    }
    if (!scene.textures.exists(s.textureKey)) {
      scene.textures.addCanvas(s.textureKey, createMonsterMockup(definition.id, s.frameWidth, s.frameHeight));
    }
    services.cache.track(s.textureKey);
    return s.textureKey;
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
    if (!textures.exists(id)) {
      if (failures.has(id)) {
        if (isApprovedCharacterSprite(id)) {
          reportMissingApproved(id, entry.standing);
          return MISSING_SHEETS;
        }
        return { standing: ensureMockupSheet(scene, id + FALLBACK_SUFFIX, appearance), walk: null };
      }
      return null;
    }
    const standing = id;

    if (!options.walk || !entry.walk) return { standing, walk: null };
    const walkId = walkSpriteIdOf(id);
    if (textures.exists(walkId)) return { standing, walk: walkId };
    if (failures.has(walkId)) {
      if (isApprovedCharacterSprite(id)) reportMissingApproved(walkId, entry.walk);
      return { standing, walk: null };
    }
    return null;
  },

  /**
   * Background-loads standing sheets for appearances the player is likely to pick next (character
   * creation), so switching options shows the new sprite immediately. Skips loaded / failed /
   * art-less appearances; never rejects. Order of `appearances` = priority.
   */
  async prefetchStandingSheets(scene: Phaser.Scene, appearances: CharacterAppearance[]): Promise<void> {
    const services = GameServices.get();
    const failures = services.assets.getFailures();
    const ids = [...new Set(appearances.map(getCharacterSpriteId))].filter(
      (id) => CHARACTER_SPRITE_MANIFEST[id] && !scene.textures.exists(id) && !failures.has(id),
    );
    await Promise.all(ids.map((id) => loadStandingSheet(id).catch(() => undefined)));
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
    const jobs: Promise<unknown>[] = [
      loadStandingSheet(id).catch((e: Error) => {
        if (isApprovedCharacterSprite(id)) reportMissingApproved(id, entry.standing);
        else console.warn(`[assets] ${e.message} - using mockup for ${id}`);
      }),
    ];
    if (options.walk && entry.walk) {
      const walkId = walkSpriteIdOf(id);
      jobs.push(
        services.assets.load({ key: walkId, type: 'spritesheet', url: entry.walk, ...SHEET_FRAME }).then(
          () =>
            services.cache.track(walkId, () => {
              removeWalkAnimations(scene.game.anims, walkId);
              forgetSheetMetrics(walkId);
            }),
          (e: Error) => {
            if (isApprovedCharacterSprite(id)) reportMissingApproved(walkId, entry.walk ?? walkId);
            else console.warn(`[assets] ${e.message} - ${id} will not animate while walking`);
          },
        ),
      );
    }
    await Promise.all(jobs);
    return AssetManager.peekCharacterSheets(scene, appearance, options) ?? AssetManager.placeholderSheets(scene, appearance);
  },

  /**
   * Temporary sheets shown while an appearance's real art is loading: transparent for approved art,
   * a mockup for appearances that have no art.
   */
  placeholderSheets(scene: Phaser.Scene, appearance: CharacterAppearance): CharacterSheets {
    const id = getCharacterSpriteId(appearance);
    if (isApprovedCharacterSprite(id)) return { standing: ensureBlankSheet(scene), walk: null };
    const key = CHARACTER_SPRITE_MANIFEST[id] ? id + FALLBACK_SUFFIX : id;
    return { standing: ensureMockupSheet(scene, key, appearance), walk: null };
  },
};

const SHEET_FRAME = { frameWidth: CHARACTER_FRAME_WIDTH, frameHeight: CHARACTER_FRAME_HEIGHT };

/** Loads (deduplicated) one real standing sheet and tracks it as an evictable texture. */
function loadStandingSheet(id: string): Promise<void> {
  const services = GameServices.get();
  const entry = CHARACTER_SPRITE_MANIFEST[id];
  return services.assets
    .load({ key: id, type: 'spritesheet', url: entry.standing, ...SHEET_FRAME })
    .then(() => services.cache.track(id, () => forgetSheetMetrics(id)));
}

/** A transparent 4 x 2 sheet (same frames as a standing sheet), created once and kept. */
function ensureBlankSheet(scene: Phaser.Scene): string {
  if (scene.textures.exists(BLANK_SHEET_KEY)) return BLANK_SHEET_KEY;
  const canvas = document.createElement('canvas');
  canvas.width = CHARACTER_SHEET_COLUMNS * CHARACTER_FRAME_WIDTH;
  canvas.height = CHARACTER_SHEET_ROWS * CHARACTER_FRAME_HEIGHT;
  const texture = scene.textures.addCanvas(BLANK_SHEET_KEY, canvas);
  if (!texture) throw new Error('Failed to create the blank character sheet.');
  addSheetFrames(texture);
  return BLANK_SHEET_KEY;
}

function addSheetFrames(texture: Phaser.Textures.CanvasTexture): void {
  for (let row = 0; row < CHARACTER_SHEET_ROWS; row++) {
    for (let col = 0; col < CHARACTER_SHEET_COLUMNS; col++) {
      texture.add(row * CHARACTER_SHEET_COLUMNS + col, 0, col * CHARACTER_FRAME_WIDTH, row * CHARACTER_FRAME_HEIGHT, CHARACTER_FRAME_WIDTH, CHARACTER_FRAME_HEIGHT);
    }
  }
}

/** Generates (once) a mockup standing sheet under `key` and tracks it as an evictable texture. */
function ensureMockupSheet(scene: Phaser.Scene, key: string, appearance: CharacterAppearance): string {
  if (scene.textures.exists(key)) return key;
  const texture = scene.textures.addCanvas(key, createMockupCharacterSheet(appearance));
  if (!texture) throw new Error(`Failed to create mockup texture "${key}".`);
  addSheetFrames(texture);
  GameServices.get().cache.track(key, () => forgetSheetMetrics(key));
  return key;
}
