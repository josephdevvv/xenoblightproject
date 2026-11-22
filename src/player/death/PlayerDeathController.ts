import Phaser from 'phaser';
import type { Point } from '../../core/types';
import type { CombatSystem } from '../../combat/CombatSystem';
import type { StableCameraFollow } from '../../render/StableCameraFollow';
import { captureSpriteFrame, type DeathOverlay } from '../../ui/death/DeathOverlay';
import type { PlayerController } from '../PlayerController';
import { PlayerLife } from './PlayerLifeState';

export interface DeathUi {
  readonly death: DeathOverlay | null;
  /** Closes every open window (Status, Passive Tree, Settings). */
  closeAllWindows(): void;
}

export interface PlayerDeathDeps {
  scene: Phaser.Scene;
  combat: CombatSystem;
  player: PlayerController;
  camera: Phaser.Cameras.Scene2D.Camera;
  cameraFollow: StableCameraFollow;
  /** Where the player respawns (the spawn point - see world/SpawnPoints). */
  respawnAt: () => Point;
  ui: () => DeathUi | null;
}

const FADE_IN_MS = 420;

/**
 * Death -> ghost -> respawn (GameScene side). HP 0 (CombatSystem.onPlayerDefeated) starts it once:
 * every action stops, the windows close, the player's CURRENT frame is captured and handed to the
 * DeathOverlay (dissolve + ghost + dark overlay + respawn button), and the real sprite is hidden. The
 * camera holds still while not alive so the ghost stays on the death spot. The respawn click (accepted
 * once) fades the overlay out, then moves the player to the spawn point with full
 * HP, clears the combat state, restores controls and fades the view back in.
 * Gameplay code asks `life.canPerform(action)` - only chat is allowed while not alive.
 */
export class PlayerDeathController {
  readonly life = new PlayerLife();
  private fadeTween: Phaser.Tweens.Tween | null = null;

  constructor(private readonly deps: PlayerDeathDeps) {
    deps.combat.onPlayerDefeated = () => this.die();
  }

  die(): void {
    if (!this.life.die()) return;
    const { player, camera } = this.deps;
    player.halt(); // standing frame of the current facing - the ghost is built from it
    const ui = this.deps.ui();
    ui?.closeAllWindows();
    const sprite = player.view.sprite;
    const overlay = ui?.death ?? null;
    if (!overlay) {
      // no UI scene (should not happen): skip the presentation, never get stuck dead
      this.life.finishDying();
      this.respawn();
      return;
    }
    const frame = captureSpriteFrame(sprite);
    this.fadeTween?.stop();
    overlay.play(
      {
        ...frame,
        screenX: Math.round(sprite.x - camera.scrollX),
        screenY: Math.round(sprite.y - camera.scrollY),
        originX: sprite.originX,
        originY: sprite.originY,
        scaleX: sprite.scaleX,
        scaleY: sprite.scaleY,
        flipX: sprite.flipX,
      },
      () => this.life.finishDying(),
      () => this.respawn(),
    );
    sprite.setVisible(false);
  }

  /** The respawn button. Duplicate requests are ignored. */
  respawn(): void {
    if (!this.life.requestRespawn()) return;
    const finish = (): void => {
      const { combat, player, cameraFollow, camera, scene } = this.deps;
      combat.respawnAt(this.deps.respawnAt());
      cameraFollow.snap();
      const sprite = player.view.sprite;
      sprite.setVisible(true).setAlpha(0);
      this.fadeTween = scene.tweens.add({ targets: sprite, alpha: 1, duration: FADE_IN_MS, onComplete: () => (this.fadeTween = null) });
      camera.fadeIn(FADE_IN_MS, 0, 0, 0);
      this.life.finishRespawn();
    };
    const overlay = this.deps.ui()?.death ?? null;
    if (overlay?.isActive) overlay.leave(finish);
    else finish();
  }
}
