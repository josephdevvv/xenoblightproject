import Phaser from 'phaser';
import { PALETTE, toColorInt } from '../config/palette';
import { UI_COLORS } from './UITheme';

export interface ColorSwatchPickerOptions {
  colors: string[];
  index: number;
  size?: number;
  gap?: number;
  onChange: (index: number) => void;
}

/** Row of clickable colour squares; the selected one gets a bright frame. */
export class ColorSwatchPicker extends Phaser.GameObjects.Container {
  private readonly frames: Phaser.GameObjects.Rectangle[] = [];
  private index: number;

  constructor(scene: Phaser.Scene, x: number, y: number, private readonly config: ColorSwatchPickerOptions) {
    super(scene, x, y);
    this.index = config.index;
    const size = config.size ?? 24;
    const gap = config.gap ?? 10;

    config.colors.forEach((hex, i) => {
      const cx = i * (size + gap) + size / 2;
      const frame = scene.add.rectangle(cx, 0, size + 6, size + 6, 0x000000, 0).setStrokeStyle(1, UI_COLORS.buttonBorder);
      const swatch = scene.add.rectangle(cx, 0, size, size, toColorInt(hex)).setStrokeStyle(1, toColorInt(PALETTE.black));
      swatch.setInteractive({ useHandCursor: true });
      swatch.on('pointerover', () => {
        if (i !== this.index) frame.setStrokeStyle(1, UI_COLORS.buttonBorderHover);
      });
      swatch.on('pointerout', () => this.refresh());
      swatch.on('pointerup', () => {
        this.index = i;
        this.refresh();
        this.config.onChange(i);
      });
      this.frames.push(frame);
      this.add([frame, swatch]);
    });

    scene.add.existing(this);
    this.refresh();
  }

  getIndex(): number {
    return this.index;
  }

  private refresh(): void {
    this.frames.forEach((frame, i) => {
      const selected = i === this.index;
      frame.setStrokeStyle(selected ? 2 : 1, selected ? UI_COLORS.buttonBorderSelected : UI_COLORS.buttonBorder);
    });
  }
}
