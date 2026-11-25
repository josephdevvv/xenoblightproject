import type Phaser from 'phaser';
import { GameServices } from '../../systems/GameServices';
import {
  combatSetFor,
  PLAYER_COMBAT_ACTIONS,
  PLAYER_IMPACT_VFX,
  PLAYER_OPTIONAL_COMBAT_ACTIONS,
  playerCombatAnimKey,
  playerCombatSheetKey,
  type PlayerCombatAction,
  type PlayerCombatSet,
  type PlayerCombatSheet,
  type PlayerOptionalCombatAction,
} from './PlayerCombatArt';

/**
 * Player combat textures and animations: the shared on-hit impact VFX and, when the appearance has exported
 * combat art, its four combat sheets (plus optional ones such as unarmed_punch when exported).
 *
 * Lifecycle (ResourceCacheManager rules):
 *  - the scene OWNS the textures from before loading starts until it shuts down (`owner`, released with
 *    cache.releaseOwner). Retaining first matters: map entry runs the cache cleanup while this is loading,
 *    and a texture left over from an earlier visit must not be evicted after it was found "already loaded";
 *  - nobody owns them afterwards, so the cache may evict them after its grace period;
 *  - evicting a texture removes its animations (they are global and would keep pointing at destroyed frames);
 *  - an animation whose frames are not the ones of the texture loaded now is rebuilt, never reused.
 *
 * Failures are reported and leave combat working with the static visuals.
 */

interface Sheet {
  key: string;
  url: string;
  frameWidth: number;
  frameHeight: number;
  /** Animations made from this texture. */
  animations: { key: string; build: (anims: Phaser.Animations.AnimationManager) => Phaser.Types.Animations.Animation }[];
}

function impactSheet(): Sheet {
  const v = PLAYER_IMPACT_VFX;
  // Phaser shows a frame for (1000 / frameRate) + frame.duration: base = the shortest frame, each frame
  // adds its extra -> exactly the approved 60 / 60 / 70 / 80 ms.
  const base = Math.min(...v.frameDurationsMs);
  return {
    key: v.key,
    url: v.url,
    frameWidth: v.frameWidth,
    frameHeight: v.frameHeight,
    animations: [
      {
        key: v.animKey,
        build: () => ({
          key: v.animKey,
          frames: v.frameDurationsMs.map((ms, frame) => ({ key: v.key, frame, duration: ms - base })),
          frameRate: 1000 / base,
          repeat: v.loop ? -1 : 0,
        }),
      },
    ],
  };
}

/** The sheets of a combat set (4 required + the optional ones it has) with their per-facing animations (rows / frames / timing / loop from its metadata). */
function combatSheets(set: PlayerCombatSet): Sheet[] {
  const entries: [PlayerCombatAction | PlayerOptionalCombatAction, PlayerCombatSheet][] = [
    ...PLAYER_COMBAT_ACTIONS.map((a) => [a, set.actions[a]] as [PlayerCombatAction, PlayerCombatSheet]),
    ...PLAYER_OPTIONAL_COMBAT_ACTIONS.filter((a) => set.optional[a]).map((a) => [a, set.optional[a]!] as [PlayerOptionalCombatAction, PlayerCombatSheet]),
  ];
  return entries.map(([action, sheet]) => {
    const key = playerCombatSheetKey(set, action);
    return {
      key,
      url: set.basePath + sheet.file,
      frameWidth: sheet.frameWidth,
      frameHeight: sheet.frameHeight,
      animations: sheet.rows.map((facing, row) => ({
        key: playerCombatAnimKey(set, action, facing),
        build: (anims) => ({
          key: playerCombatAnimKey(set, action, facing),
          frames: anims.generateFrameNumbers(key, { start: row * sheet.frames, end: row * sheet.frames + sheet.frames - 1 }),
          frameRate: 1000 / sheet.frameMs,
          repeat: sheet.repeat,
        }),
      })),
    };
  });
}

/** Creates an animation, or replaces one whose frames belong to a texture that is gone. Never duplicates. */
function ensureAnimation(scene: Phaser.Scene, sheet: Sheet, animation: Sheet['animations'][number]): void {
  const existing = scene.anims.exists(animation.key) ? scene.anims.get(animation.key) : null;
  if (existing) {
    const current = existing.frames.length > 0 && existing.frames.every((f) => f.frame === scene.textures.getFrame(sheet.key, f.textureFrame));
    if (current) return;
    scene.anims.remove(animation.key);
  }
  scene.anims.create(animation.build(scene.anims));
}

/**
 * Loads what player combat needs on a map and holds it for `owner` (see above). Returns the combat set that
 * is ready, or null when the appearance has no combat art (or it failed to load).
 */
export async function loadPlayerCombatAssets(scene: Phaser.Scene, spriteId: string, owner: string): Promise<PlayerCombatSet | null> {
  const services = await GameServices.ready();
  const set = combatSetFor(spriteId);
  const sheets = [impactSheet(), ...(set ? combatSheets(set) : [])];
  const anims = scene.anims;
  for (const s of sheets) services.cache.retain(s.key, owner);

  const missing = sheets.filter((s) => !scene.textures.exists(s.key));
  if (missing.length) {
    const result = await services.assets.loadAll(missing.map((s) => ({ key: s.key, type: 'spritesheet' as const, url: s.url, frameWidth: s.frameWidth, frameHeight: s.frameHeight })));
    if (result.failed.length) console.warn(`[combat] art failed: ${result.failed.map((f) => f.key).join(', ')}`);
  }
  for (const s of sheets) {
    if (!scene.textures.exists(s.key)) {
      services.cache.release(s.key, owner); // failed: nothing to hold
      continue;
    }
    services.cache.track(s.key, () => {
      for (const a of s.animations) anims.remove(a.key);
    });
    for (const a of s.animations) ensureAnimation(scene, s, a);
  }
  return set && PLAYER_COMBAT_ACTIONS.every((a) => scene.textures.exists(playerCombatSheetKey(set, a))) ? set : null;
}
