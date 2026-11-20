import Phaser from 'phaser';
import { PALETTE } from '../config/palette';
import { textStyle, UI_COLORS } from './UITheme';

export interface ButtonOptions {
  width: number;
  height: number;
  label: string;
  fontSize?: number;
  /** 'primary' gets the muted-purple border (used once per screen). */
  variant?: 'default' | 'primary';
  onClick: () => void;
}

export class Button extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly labelText: Phaser.GameObjects.Text;
  private hovered = false;
  private pressed = false;
  private selected = false;
  private enabled = true;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly options: ButtonOptions,
  ) {
    super(scene, x, y);
    this.bg = scene.add.rectangle(0, 0, options.width, options.height, UI_COLORS.buttonFill);
    this.labelText = scene.add
      .text(0, 0, options.label, textStyle(options.fontSize ?? 13, PALETTE.pale))
      .setOrigin(0.5);
    this.add([this.bg, this.labelText]);

    this.bg.setInteractive({ useHandCursor: true });
    this.bg.on('pointerover', () => {
      this.hovered = true;
      this.redraw();
    });
    this.bg.on('pointerout', () => {
      this.hovered = false;
      this.pressed = false;
      this.redraw();
    });
    this.bg.on('pointerdown', () => {
      this.pressed = true;
      this.redraw();
    });
    this.bg.on('pointerup', () => {
      const wasPressed = this.pressed;
      this.pressed = false;
      this.redraw();
      if (wasPressed && this.enabled) this.options.onClick();
    });

    scene.add.existing(this);
    this.redraw();
  }

  setSelected(selected: boolean): this {
    this.selected = selected;
    this.redraw();
    return this;
  }

  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    this.redraw();
    return this;
  }

  setLabel(label: string): this {
    this.labelText.setText(label);
    return this;
  }

  private redraw(): void {
    const primary = this.options.variant === 'primary';
    let fill: number = UI_COLORS.buttonFill;
    let border: number = primary ? UI_COLORS.accent : UI_COLORS.buttonBorder;
    let text: string = PALETTE.silver;

    if (this.selected) {
      fill = UI_COLORS.buttonFillSelected;
      border = UI_COLORS.buttonBorderSelected;
      text = PALETTE.white;
    }
    if (this.hovered && this.enabled) {
      fill = UI_COLORS.buttonFillHover;
      border = primary ? UI_COLORS.accentLight : this.selected ? UI_COLORS.buttonBorderSelected : UI_COLORS.buttonBorderHover;
      text = PALETTE.white;
    }

    this.bg.setFillStyle(fill, 1);
    this.bg.setStrokeStyle(1, border, 1);
    this.labelText.setColor(text);
    this.labelText.setY(this.pressed ? 1 : 0);
    this.setAlpha(this.enabled ? 1 : 0.45);
  }
}
