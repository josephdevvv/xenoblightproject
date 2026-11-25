import Phaser from 'phaser';
import { DEPTH } from '../config/constants';
import { PALETTE, toColorInt } from '../config/palette';
import { t } from '../i18n';
import { typo } from './UITheme';

const BAR_WIDTH = 220;

/**
 * Lightweight loading feedback drawn inside the scene that is loading (screen-space, top-most).
 * A handful of game objects, no textures - safe to show before anything else is loaded. It covers and centres on
 * the live view (the mobile game size can differ from 960 x 480 and change).
 */
export class LoadingScreen {
  private readonly root: Phaser.GameObjects.Container;
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;
  private readonly track: Phaser.GameObjects.Rectangle;
  private readonly bar: Phaser.GameObjects.Rectangle;
  private readonly detail: Phaser.GameObjects.Text;

  constructor(private readonly scene: Phaser.Scene) {
    this.background = scene.add.rectangle(0, 0, 1, 1, toColorInt(PALETTE.void)).setOrigin(0, 0);
    this.label = scene.add.text(0, 0, '', typo('label', PALETTE.gray)).setOrigin(0.5);
    this.track = scene.add.rectangle(0, 0, BAR_WIDTH, 2, toColorInt(PALETTE.charcoal)).setOrigin(0, 0.5);
    this.bar = scene.add.rectangle(0, 0, 1, 2, toColorInt(PALETTE.accent)).setOrigin(0, 0.5);
    this.detail = scene.add.text(0, 0, '', typo('small', PALETTE.slate)).setOrigin(0.5);
    this.root = scene.add
      .container(0, 0, [this.background, this.label, this.track, this.bar, this.detail])
      .setScrollFactor(0)
      .setDepth(DEPTH.Hud + 1000)
      .setVisible(false);
    this.place();
    const onResize = (): void => this.place();
    scene.scale.on(Phaser.Scale.Events.RESIZE, onResize);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off(Phaser.Scale.Events.RESIZE, onResize));
  }

  /** Full view, centred text and bar (whole pixels). */
  private place(): void {
    const { width, height } = this.scene.scale;
    const cx = Math.floor(width / 2);
    const cy = Math.floor(height / 2);
    this.background.setSize(width, height);
    this.label.setPosition(cx, cy - 14);
    this.track.setPosition(cx - BAR_WIDTH / 2, cy + 6);
    this.bar.setPosition(cx - BAR_WIDTH / 2, cy + 6);
    this.detail.setPosition(cx, cy + 24);
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
