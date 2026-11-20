import Phaser from 'phaser';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH } from '../config/constants';
import { PALETTE, toColorInt } from '../config/palette';
import { t } from '../i18n';
import { typo } from './UITheme';

const BAR_WIDTH = 220;

/**
 * Lightweight loading feedback drawn inside the scene that is loading (screen-space, top-most).
 * A handful of game objects, no textures - safe to show before anything else is loaded.
 */
export class LoadingScreen {
  private readonly root: Phaser.GameObjects.Container;
  private readonly label: Phaser.GameObjects.Text;
  private readonly bar: Phaser.GameObjects.Rectangle;
  private readonly detail: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const background = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, toColorInt(PALETTE.void)).setOrigin(0, 0);
    this.label = scene.add.text(cx, cy - 14, '', typo('label', PALETTE.gray)).setOrigin(0.5);
    const track = scene.add.rectangle(cx - BAR_WIDTH / 2, cy + 6, BAR_WIDTH, 2, toColorInt(PALETTE.charcoal)).setOrigin(0, 0.5);
    this.bar = scene.add.rectangle(cx - BAR_WIDTH / 2, cy + 6, 1, 2, toColorInt(PALETTE.accent)).setOrigin(0, 0.5);
    this.detail = scene.add.text(cx, cy + 24, '', typo('small', PALETTE.slate)).setOrigin(0.5);
    this.root = scene.add
      .container(0, 0, [background, this.label, track, this.bar, this.detail])
      .setScrollFactor(0)
      .setDepth(DEPTH.Hud + 1000)
      .setVisible(false);
  }

  /** `label` defaults to the translated "Loading". */
  show(label = t('common.loading')): this {
    this.label.setText(label).setColor(PALETTE.gray);
    this.detail.setText('');
    this.setProgress(0);
    this.root.setVisible(true).setAlpha(1);
    return this;
  }

  setProgress(progress: number): this {
    this.bar.width = Math.max(1, Math.round(BAR_WIDTH * Phaser.Math.Clamp(progress, 0, 1)));
    return this;
  }

  setDetail(text: string): this {
    this.detail.setText(text);
    return this;
  }

  showError(message: string, hint = ''): this {
    this.root.setVisible(true).setAlpha(1);
    this.label.setText(message).setColor(PALETTE.error);
    this.detail.setText(hint);
    return this;
  }

  hide(): void {
    this.root.setVisible(false);
  }

  get visible(): boolean {
    return this.root.visible;
  }

  destroy(): void {
    this.root.destroy();
  }
}
