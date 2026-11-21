import type Phaser from 'phaser';
import { DEPTH } from '../../config/constants';
import { PALETTE } from '../../config/palette';
import type { TypographyRole } from '../text/Typography';
import { typo } from '../UITheme';

/**
 * World-space name labels shared by every named thing on the map (player, NPCs, monsters): one style
 * and one placement rule. The label sits BELOW the feet - centred on the ground root, its top
 * NAME_LABEL_GAP px under it - so it never depends on the animated frame (no bobbing while walking or
 * animating). Callers pass the whole-pixel root they draw the sprite at; only the position changes per
 * frame, the text texture is never redrawn. Crisp: whole-pixel position + the game's roundPixels.
 */

/** Gap between the ground root (feet) and the top of the name label (px). */
export const NAME_LABEL_GAP = 3;
/** Typography role of world name labels (10 px - the old player / NPC plates used 'label', 12 px). */
export const NAME_LABEL_ROLE: TypographyRole = 'small';

export const NAME_LABEL_COLORS = {
  player: PALETTE.white,
  npc: '#e8dcb8',
  monster: '#d9c4c4',
} as const;

export function createNameLabel(scene: Phaser.Scene, text: string, color: string): Phaser.GameObjects.Text {
  return scene.add
    .text(0, 0, text, typo(NAME_LABEL_ROLE, color, { stroke: PALETTE.black, strokeThickness: 3 }))
    .setOrigin(0.5, 0)
    .setDepth(DEPTH.NamePlate);
}

/** Screen Y of the label's top edge for a ground root at `rootY`. */
export function nameLabelTop(rootY: number): number {
  return Math.round(rootY) + NAME_LABEL_GAP;
}

/** Puts the label under the ground root (x, y) at whole pixels. */
export function placeNameLabel(label: Phaser.GameObjects.Text, x: number, y: number): void {
  label.setPosition(Math.round(x), nameLabelTop(y));
}
