import Phaser from 'phaser';
import { PALETTE } from '../config/palette';
import { PIXEL_FONT_SIZE } from './text/PixelFont';
import { UI_FONT } from './UITheme';

export interface TextInputOptions {
  width: number;
  placeholder?: string;
  maxLength?: number;
  value?: string;
}

/**
 * Native HTML <input> placed in the game via Phaser's DOM layer, so text entry, IME
 * (Thai input), selection and clipboard all work. Scales with the canvas automatically.
 */
export class TextInputField {
  readonly element: Phaser.GameObjects.DOMElement;
  readonly input: HTMLInputElement;

  constructor(scene: Phaser.Scene, x: number, y: number, options: TextInputOptions) {
    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.maxLength = options.maxLength ?? 32;
    input.placeholder = options.placeholder ?? '';
    input.value = options.value ?? '';
    Object.assign(input.style, {
      width: `${options.width}px`,
      height: '28px',
      boxSizing: 'border-box',
      padding: '0 10px',
      background: PALETTE.charcoal,
      color: PALETTE.white,
      border: `1px solid ${PALETTE.stone}`,
      borderRadius: '0',
      outline: 'none',
      fontFamily: UI_FONT,
      fontSize: `${PIXEL_FONT_SIZE}px`,
      pointerEvents: 'auto',
    } satisfies Partial<CSSStyleDeclaration>);
    input.addEventListener('focus', () => this.setInvalid(false, true));
    input.addEventListener('blur', () => this.setInvalid(false));

    this.input = input;
    this.element = scene.add.dom(x, y, input);
  }

  get value(): string {
    return this.input.value;
  }

  set value(v: string) {
    this.input.value = v;
  }

  setPlaceholder(text: string): void {
    this.input.placeholder = text;
  }

  setVisible(visible: boolean): void {
    this.element.setVisible(visible);
  }

  onSubmit(callback: () => void): void {
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        callback();
      }
    });
  }

  onInput(callback: (value: string) => void): void {
    this.input.addEventListener('input', () => callback(this.input.value));
  }

  setInvalid(invalid: boolean, focused = document.activeElement === this.input): void {
    this.input.style.borderColor = invalid ? PALETTE.error : focused ? PALETTE.accent : PALETTE.stone;
  }

  blur(): void {
    this.input.blur();
  }
}
