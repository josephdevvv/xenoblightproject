import type Phaser from 'phaser';
import { PALETTE } from '../config/palette';
import { drawOutline, drawPanelFrame, INV_COLORS as C } from './inventory/inventoryTheme';
import { FrameButton } from './passiveTree/PassiveTreeWindow';
import type { Rect } from './passiveTree/PassiveTreeLayout';
import { wrapText } from './text/wrapText';
import { typo } from './UITheme';
import { uiView } from './layout/UiLayers';

export interface DialogChoice {
  label: string;
  /** 'danger' = red (something is replaced). */
  tone?: 'normal' | 'danger' | 'quiet';
  onChoose: () => void;
}

export interface DialogContent {
  title: string;
  lines: readonly string[];
  choices: readonly DialogChoice[];
}

const WIDTH = 420;
const PAD = 20;
const LINE = 18;
const BUTTON = { height: 28, gap: 8 } as const;

/**
 * A question with explicit answers, in the style of the game's windows. Modal: nothing behind it reacts. It
 * closes only through one of its choices (or close()).
 */
export class ChoiceDialog {
  private objects: (Phaser.GameObjects.Container | Phaser.GameObjects.Rectangle)[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth: number,
    private readonly options: { onOpen?: () => void; onClose?: () => void } = {},
  ) {}

  get isOpen(): boolean {
    return this.objects.length > 0;
  }

  show({ title, lines, choices }: DialogContent): void {
    this.close();
    const { scene } = this;
    const { width: sw, height: sh } = uiView(scene, 'windows');
    const blocker = scene.add.rectangle(0, 0, sw, sh, 0x000000, 0.65).setOrigin(0, 0).setScrollFactor(0).setDepth(this.depth).setInteractive();

    const text = scene.add.text(PAD, 48, '', typo('body', PALETTE.pale)).setLineSpacing(2);
    const { canvas, context, style } = text;
    style.syncFont(canvas, context);
    const wrapped = lines.flatMap((line) => wrapText(line, WIDTH - PAD * 2, (s) => context.measureText(s).width));
    text.setText(wrapped);

    const buttonsY = 58 + wrapped.length * LINE + 8;
    const height = buttonsY + choices.length * (BUTTON.height + BUTTON.gap) - BUTTON.gap + PAD;
    const root = scene.add.container(Math.round((sw - WIDTH) / 2), Math.round((sh - height) / 2)).setScrollFactor(0).setDepth(this.depth + 1);
    const g = scene.add.graphics();
    drawPanelFrame(g, [0, 0, WIDTH, height]);
    g.fillStyle(C.red, 1).fillRect(PAD - 9, 18, 4, 4);
    g.fillStyle(C.dim, 1).fillRect(PAD, 38, WIDTH - PAD * 2, 1);
    root.add([scene.add.zone(0, 0, WIDTH, height).setOrigin(0, 0).setInteractive(), g, scene.add.text(PAD, 10, title, typo('section', C.lineText)), text]);
    choices.forEach((choice, i) => {
      const rect: Rect = [PAD, buttonsY + i * (BUTTON.height + BUTTON.gap), WIDTH - PAD * 2, BUTTON.height];
      const tone = choice.tone ?? 'normal';
      drawOutline(g, rect, 0, tone === 'danger' ? C.red : tone === 'quiet' ? C.dim : C.line);
      const button = new FrameButton(scene, root, rect, tone === 'danger' ? C.redText : tone === 'quiet' ? PALETTE.silver : C.lineText, () => {
        this.close();
        choice.onChoose();
      });
      button.label.setText(choice.label);
    });
    this.objects = [blocker, root];
    this.options.onOpen?.();
  }

  close(): void {
    if (!this.isOpen) return;
    for (const o of this.objects) o.destroy();
    this.objects = [];
    this.options.onClose?.();
  }

  /** The scene is gone (its objects are already destroyed). */
  forget(): void {
    this.objects = [];
  }
}
