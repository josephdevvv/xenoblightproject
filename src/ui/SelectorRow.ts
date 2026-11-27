import Phaser from 'phaser';
import { PALETTE, toColorInt } from '../config/palette';
import { canCycle, selectorRowLayout, type SelectorRowLayout } from './selector/SelectorCycle';
import { typo, UI_COLORS } from './UITheme';

export interface SelectorRowOptions {
  width: number;
  height: number;
  /** An arrow was used: -1 = left, +1 = right. The owner picks the next option and calls setValue. */
  onCycle: (delta: -1 | 1) => void;
}

/** A pixel chevron, 6 x 9 (one 2 px step per row): drawn from whole pixels so it stays crisp at every zoom. */
const CHEVRON = { height: 9, thickness: 2 };
const CHEVRON_REACH = Math.floor(CHEVRON.height / 2);
const CHEVRON_WIDTH = CHEVRON_REACH + CHEVRON.thickness;

/**
 * One selector row: a compact dark bar with a left arrow, the current value centred, and a right arrow
 * ("<   Value   >"). The arrows step through the options (the owner decides which - see SelectorCycle); with a
 * single option they are dimmed and do nothing. An optional colour swatch sits in front of the value (hair colour).
 */
export class SelectorRow extends Phaser.GameObjects.Container {
  private readonly layout: SelectorRowLayout;
  private readonly bar: Phaser.GameObjects.Rectangle;
  private readonly valueText: Phaser.GameObjects.Text;
  private readonly swatch: Phaser.GameObjects.Rectangle;
  private readonly arrows: { delta: -1 | 1; zone: Phaser.GameObjects.Rectangle; glyph: Phaser.GameObjects.Graphics; hovered: boolean; pressed: boolean }[];
  private cyclable = true;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly options: SelectorRowOptions,
  ) {
    super(scene, x, y);
    this.layout = selectorRowLayout(options.width, options.height);
    this.bar = scene.add.rectangle(0, 0, options.width, options.height, UI_COLORS.buttonFill).setStrokeStyle(1, UI_COLORS.buttonBorder, 1);
    this.valueText = scene.add.text(0, 0, '', typo('button', PALETTE.white)).setOrigin(0.5);
    this.swatch = scene.add.rectangle(0, 0, 10, 10, 0xffffff).setStrokeStyle(1, UI_COLORS.buttonBorderHover, 1).setVisible(false);
    this.add([this.bar]);

    this.arrows = ([-1, 1] as const).map((delta) => {
      const zone = scene.add
        .rectangle(delta < 0 ? this.layout.leftArrowX : this.layout.rightArrowX, 0, this.layout.arrowWidth, options.height - 2, UI_COLORS.buttonFillHover, 0)
        .setInteractive({ useHandCursor: true });
      const glyph = scene.add.graphics();
      const arrow = { delta, zone, glyph, hovered: false, pressed: false };
      zone.on('pointerover', () => {
        arrow.hovered = true;
        this.redraw();
      });
      zone.on('pointerout', () => {
        arrow.hovered = false;
        arrow.pressed = false;
        this.redraw();
      });
      zone.on('pointerdown', () => {
        arrow.pressed = true;
        this.redraw();
      });
      zone.on('pointerup', () => {
        const wasPressed = arrow.pressed;
        arrow.pressed = false;
        this.redraw();
        if (wasPressed && this.cyclable) this.options.onCycle(delta);
      });
      this.add([zone, glyph]);
      return arrow;
    });
    this.add([this.swatch, this.valueText]);

    scene.add.existing(this);
    this.redraw();
  }

  /**
   * Shows the current option. `count` = how many options there are (one: the arrows are dimmed and inert);
   * `swatch` = a colour shown in front of the value, null for none.
   */
  setValue(text: string, count: number, swatch: string | null = null): this {
    this.valueText.setText(text);
    this.cyclable = canCycle(count);
    this.swatch.setVisible(swatch !== null);
    if (swatch !== null) {
      this.swatch.setFillStyle(toColorInt(swatch), 1);
      // swatch + gap + text, centred together between the arrows
      const gap = 8;
      const total = this.swatch.width + gap + this.valueText.width;
      this.swatch.setX(Math.round(-total / 2 + this.swatch.width / 2));
      this.valueText.setX(Math.round(-total / 2 + this.swatch.width + gap + this.valueText.width / 2));
    } else {
      this.valueText.setX(0);
    }
    this.redraw();
    return this;
  }

  private redraw(): void {
    for (const arrow of this.arrows) {
      const live = this.cyclable;
      const lit = live && arrow.hovered;
      arrow.zone.setFillStyle(UI_COLORS.buttonFillHover, lit ? 1 : 0);
      if (arrow.zone.input) arrow.zone.input.cursor = live ? 'pointer' : 'default';
      const color = toColorInt(lit ? PALETTE.white : PALETTE.silver);
      const cx = arrow.zone.x + (live && arrow.pressed ? arrow.delta : 0);
      const left = Math.round(cx - CHEVRON_WIDTH / 2);
      const top = -CHEVRON_REACH;
      arrow.glyph.clear();
      arrow.glyph.fillStyle(color, live ? 1 : 0.28);
      for (let row = 0; row < CHEVRON.height; row++) {
        const inset = Math.abs(CHEVRON_REACH - row);
        // "<" points left: its tip (the middle row) is the leftmost pixel; ">" is the mirror
        const offset = arrow.delta < 0 ? inset : CHEVRON_REACH - inset;
        arrow.glyph.fillRect(left + offset, top + row, CHEVRON.thickness, 1);
      }
    }
  }
}
