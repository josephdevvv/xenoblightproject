import Phaser from 'phaser';
import { PALETTE } from '../config/palette';
import { typo, UI_COLORS } from './UITheme';

/** Dark translucent frame with corner brackets. Returns the container so callers can add children. */
export function createPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  title?: string,
): Phaser.GameObjects.Container {
  const container = scene.add.container(x, y);
  const g = scene.add.graphics();
  g.fillStyle(UI_COLORS.panelFill, 0.82);
  g.fillRect(0, 0, width, height);
  g.lineStyle(1, UI_COLORS.panelBorder, 1);
  g.strokeRect(0.5, 0.5, width - 1, height - 1);

  // Corner brackets
  const c = 8;
  g.lineStyle(2, UI_COLORS.panelCorner, 1);
  g.beginPath();
  g.moveTo(1, c);
  g.lineTo(1, 1);
  g.lineTo(c, 1);
  g.moveTo(width - c, 1);
  g.lineTo(width - 1, 1);
  g.lineTo(width - 1, c);
  g.moveTo(width - 1, height - c);
  g.lineTo(width - 1, height - 1);
  g.lineTo(width - c, height - 1);
  g.moveTo(c, height - 1);
  g.lineTo(1, height - 1);
  g.lineTo(1, height - c);
  g.strokePath();
  container.add(g);

  if (title) {
    // Title box 19 px (Thai marks + descenders); the underline sits 2 px below the descenders.
    const t = scene.add.text(16, 7, title, typo('section', PALETTE.silver));
    const underline = scene.add.rectangle(16, 29, 24, 1, UI_COLORS.accent).setOrigin(0, 0);
    container.add([t, underline]);
    container.setData('titleText', t);
  }
  return container;
}

/** Changes the title of a panel created with a title (used when the language changes). */
export function setPanelTitle(panel: Phaser.GameObjects.Container, title: string): void {
  const text = panel.getData('titleText') as Phaser.GameObjects.Text | undefined;
  text?.setText(title);
}
