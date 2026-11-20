import Phaser from 'phaser';
import { PALETTE } from '../config/palette';
import { Button } from './Button';
import { typo, UI_COLORS } from './UITheme';

export interface OptionSelectorOptions {
  width: number;
  options: string[];
  index: number;
  onChange: (index: number) => void;
}

/** "‹  Value  ›" cycler with a small position counter. */
export class OptionSelector extends Phaser.GameObjects.Container {
  private options: string[];
  private index: number;
  private readonly valueText: Phaser.GameObjects.Text;
  private readonly counterText: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly config: OptionSelectorOptions,
  ) {
    super(scene, x, y);
    this.options = config.options;
    this.index = config.index;

    const h = 28;
    const half = config.width / 2;
    const frame = scene.add.rectangle(0, 0, config.width - 64, h, UI_COLORS.buttonFill).setStrokeStyle(1, UI_COLORS.buttonBorder);
    const prev = new Button(scene, -half + 14, 0, { width: 28, height: h, label: '<', onClick: () => this.step(-1) });
    const next = new Button(scene, half - 14, 0, { width: 28, height: h, label: '>', onClick: () => this.step(1) });
    this.valueText = scene.add.text(0, -1, '', typo('body', PALETTE.white)).setOrigin(0.5);
    this.counterText = scene.add.text(half - 36, 0, '', typo('small', PALETTE.gray)).setOrigin(1, 0.5);
    this.add([frame, prev, next, this.valueText, this.counterText]);

    scene.add.existing(this);
    this.refresh();
  }

  setOptions(options: string[], index: number): void {
    this.options = options;
    this.index = Phaser.Math.Clamp(index, 0, options.length - 1);
    this.refresh();
  }

  getIndex(): number {
    return this.index;
  }

  private step(delta: number): void {
    const n = this.options.length;
    this.index = (this.index + delta + n) % n;
    this.refresh();
    this.config.onChange(this.index);
  }

  private refresh(): void {
    this.valueText.setText(this.options[this.index] ?? '');
    this.counterText.setText(`${this.index + 1}/${this.options.length}`);
  }
}
