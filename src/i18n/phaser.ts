import Phaser from 'phaser';
import { onLanguageChange } from './index';

/**
 * Runs `apply` now and again after every language change, until `scene` shuts down.
 * UI components put all their translated text in one `apply` function, so switching language
 * updates the screen immediately without restarting the scene.
 */
export function localize(scene: Phaser.Scene, apply: () => void): void {
  apply();
  const off = onLanguageChange(() => apply());
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
}
