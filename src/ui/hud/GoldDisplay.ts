import Phaser from 'phaser';
import { typo } from '../UITheme';
import { formatGold, GOLD_DISPLAY, goldDisplayLayout } from './GoldIcon';

/**
 * Coin + Gold amount, right-aligned at `right` with the coin's top at `iconTop` (GOLD_DISPLAY / goldDisplayLayout).
 * Shared by the HUD's player panel and the Inventory header so both look the same; the owner feeds it the balance
 * (GoldService) and it re-lays itself out at whole pixels, the coin at 1x.
 */
export class GoldDisplay {
  readonly icon: Phaser.GameObjects.Image;
  readonly text: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    private readonly right: number,
    private readonly iconTop: number,
    depth: number,
    container?: Phaser.GameObjects.Container,
  ) {
    const { icon } = GOLD_DISPLAY;
    this.icon = scene.add.image(0, 0, icon.key).setOrigin(0, 0).setDepth(depth);
    this.icon.setVisible(scene.textures.exists(icon.key));
    this.text = scene.add.text(0, 0, '', typo(GOLD_DISPLAY.textRole, GOLD_DISPLAY.textColor)).setOrigin(1, 0).setDepth(depth + 1);
    container?.add([this.icon, this.text]);
  }

  set(gold: number): void {
    this.text.setText(formatGold(gold));
    const L = goldDisplayLayout(this.right, this.iconTop, this.text.width);
    this.text.setPosition(L.textRight, L.textY);
    this.icon.setPosition(L.iconX, L.iconY);
  }
}
