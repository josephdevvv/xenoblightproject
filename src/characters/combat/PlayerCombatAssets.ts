import type Phaser from 'phaser';
import { GameServices } from '../../systems/GameServices';
import { registerPlayerCombatAnimations } from './PlayerCombatAnimator';
import { combatSetFor, PLAYER_COMBAT_ACTIONS, PLAYER_IMPACT_VFX, playerCombatSheetKey, type PlayerCombatSet } from './PlayerCombatArt';

/**
 * Loads (once) what player combat needs on a map: the shared on-hit impact VFX and, when the character's
 * appearance has exported combat art, its four combat sheets; then registers their animations from the
 * metadata (impact: per-frame durations, one-shot). Failures are reported and leave combat working with
 * the static visuals. Returns the combat set that is ready, or null.
 */
export async function loadPlayerCombatAssets(scene: Phaser.Scene, spriteId: string): Promise<PlayerCombatSet | null> {
  const services = await GameServices.ready();
  const set = combatSetFor(spriteId);
  const requests: { key: string; type: 'spritesheet'; url: string; frameWidth: number; frameHeight: number }[] = [
    { key: PLAYER_IMPACT_VFX.key, type: 'spritesheet', url: PLAYER_IMPACT_VFX.url, frameWidth: PLAYER_IMPACT_VFX.frameWidth, frameHeight: PLAYER_IMPACT_VFX.frameHeight },
  ];
  if (set) {
    for (const action of PLAYER_COMBAT_ACTIONS) {
      const s = set.actions[action];
      requests.push({ key: playerCombatSheetKey(set, action), type: 'spritesheet', url: set.basePath + s.file, frameWidth: s.frameWidth, frameHeight: s.frameHeight });
    }
  }
  const missing = requests.filter((r) => !scene.textures.exists(r.key));
  if (missing.length) {
    const result = await services.assets.loadAll(missing);
    if (result.failed.length) console.warn(`[combat] art failed: ${result.failed.map((f) => f.key).join(', ')}`);
  }
  for (const r of requests) if (scene.textures.exists(r.key)) services.cache.track(r.key);

  if (scene.textures.exists(PLAYER_IMPACT_VFX.key) && !scene.anims.exists(PLAYER_IMPACT_VFX.animKey)) {
    // Phaser shows a frame for (1000 / frameRate) + frame.duration: base = the shortest frame, each frame
    // adds its extra -> exactly the approved 60 / 60 / 70 / 80 ms.
    const base = Math.min(...PLAYER_IMPACT_VFX.frameDurationsMs);
    scene.anims.create({
      key: PLAYER_IMPACT_VFX.animKey,
      frames: PLAYER_IMPACT_VFX.frameDurationsMs.map((ms, frame) => ({ key: PLAYER_IMPACT_VFX.key, frame, duration: ms - base })),
      frameRate: 1000 / base,
      repeat: PLAYER_IMPACT_VFX.loop ? -1 : 0,
    });
  }
  if (!set || !PLAYER_COMBAT_ACTIONS.every((a) => scene.textures.exists(playerCombatSheetKey(set, a)))) return null;
  registerPlayerCombatAnimations(scene.anims, set);
  return set;
}
