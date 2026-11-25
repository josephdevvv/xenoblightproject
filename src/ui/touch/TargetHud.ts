import Phaser from 'phaser';
import { PALETTE } from '../../config/palette';
import { typo } from '../UITheme';
import { hpFillWidth, TARGET_HUD, targetHudLayout, type TargetHudLayout, type TargetInfo } from './TargetHudLayout';
import { uiView } from '../layout/UiLayers';

export type { TargetInfo } from './TargetHudLayout';

/**
 * Mobile target HUD (touch mode only): the selected monster's name over a metal bar with pointed ends and a GREEN HP
 * bar - no numbers (TargetHudLayout). Shown only while a valid monster is selected (TouchTargeting).
 */
const HUD_GREEN = { fill: 0x4fbf4f, light: 0x86e086, dark: 0x2c7a2c } as const;

export class TargetHud {
  private readonly layout: TargetHudLayout;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly fill: Phaser.GameObjects.Graphics;
  private readonly name: Phaser.GameObjects.Text;
  /** What is drawn now ('' = hidden; starts as neither, so the first set() always draws). */
  private shown: string | null = null;

  constructor(
    scene: Phaser.Scene,
    depth: number,
  ) {
    this.layout = targetHudLayout(uiView(scene, 'hud').width);
    const L = this.layout;
    const T = TARGET_HUD;
    this.frame = scene.add.graphics().setDepth(depth);
    const f = L.frame;
    const midY = f.y + f.height / 2;
    // dark plate, silver frame, pointed ends (the reference boss bar's shape, in the HUD's metals)
    this.frame.fillStyle(0x0c0c10, 0.88).fillRect(f.x, f.y, f.width, f.height);
    this.frame.fillStyle(0x8a8a94, 1).fillTriangle(f.x, f.y, f.x, f.y + f.height, f.x - T.point, midY);
    this.frame.fillTriangle(f.x + f.width, f.y, f.x + f.width, f.y + f.height, f.x + f.width + T.point, midY);
    this.frame.lineStyle(1, 0xc9c9d1, 1).strokeRect(f.x + 0.5, f.y + 0.5, f.width - 1, f.height - 1);
    this.frame.fillStyle(0x1a1a1f, 1).fillRect(L.bar.x, L.bar.y, L.bar.width, L.bar.height);
    this.fill = scene.add.graphics().setDepth(depth + 1);
    this.name = scene.add.text(L.centerX, L.nameTop, '', typo('label', PALETTE.white)).setOrigin(0.5, 0).setStroke(PALETTE.black, 3).setDepth(depth + 1);
    this.set(null);
  }

  /** The selected monster, or null (hidden). Redrawn only when something visible changes. */
  set(target: TargetInfo | null): void {
    const L = this.layout;
    const width = target ? hpFillWidth(target.hp, target.maxHp, L.bar.width) : 0;
    const key = target ? `${target.name}:${width}` : '';
    if (key === this.shown) return;
    this.shown = key;
    const visible = target !== null;
    this.frame.setVisible(visible);
    this.fill.setVisible(visible);
    this.name.setVisible(visible);
    if (!target) return;
    this.name.setText(target.name);
    const b = L.bar;
    const g = this.fill.clear();
    if (width <= 0) return;
    g.fillStyle(HUD_GREEN.fill, 1).fillRect(b.x, b.y, width, b.height);
    g.fillStyle(HUD_GREEN.light, 1).fillRect(b.x, b.y, width, 1);
    g.fillStyle(HUD_GREEN.dark, 1).fillRect(b.x, b.y + b.height - 1, width, 1);
  }

  get isShown(): boolean {
    return this.shown !== null && this.shown !== '';
  }
}
