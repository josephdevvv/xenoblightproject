import Phaser from 'phaser';
import type { CharacterData } from '../data/CharacterData';
import type { CharacterView } from '../characters/CharacterView';
import { createNameLabel, NAME_LABEL_COLORS } from './world/WorldNameLabel';
import { NameplateBars } from './world/NameplateBars';

/** The player's HP / SP now (null = no bars: not alive). */
export interface PlayerVitals {
  hp: number;
  maxHp: number;
  sp: number;
  maxSp: number;
}

/**
 * World-space HUD: under the player's feet a green HP bar, a blue SP bar, then the name label. The screen-space HUD (status panel, minimap, hotbar, ...) is
 * `DungeonHud`, drawn by GameUIScene.
 */
export class GameHud {
  private readonly namePlate: Phaser.GameObjects.Text;
  private readonly bars: NameplateBars;

  constructor(scene: Phaser.Scene, character: CharacterData) {
    this.namePlate = createNameLabel(scene, character.name, NAME_LABEL_COLORS.player);
    this.bars = new NameplateBars(scene, ['hp', 'sp']);
  }

  /**
   * Keeps the name label under the character's drawn root (whole pixels, shared with the sprite; same
   * rule as monsters and NPCs): it moves with the character but never follows the animated frame, so it
   * does not bob with the walk cycle. Only the position changes: the text texture is not redrawn.
   */
  update(view: CharacterView, vitals: PlayerVitals | null = null): void {
    const root = view.getRenderRoot();
    // the name keeps its place under the bars even while they are hidden (no jump when the player dies)
    this.namePlate.setPosition(Math.round(root.x), this.bars.place(root.x, root.y));
    this.bars.setVisible(vitals !== null);
    if (!vitals) return;
    this.bars.set('hp', vitals.hp, vitals.maxHp);
    this.bars.set('sp', vitals.sp, vitals.maxSp);
  }
}
