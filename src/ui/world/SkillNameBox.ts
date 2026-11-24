import Phaser from 'phaser';
import { CHARACTER_DISPLAY_HEIGHT } from '../../characters/CharacterSheetLayout';
import { DEPTH } from '../../config/constants';
import { PALETTE } from '../../config/palette';
import { typo } from '../UITheme';

/**
 * The skill name over a caster's head (the player for now; any entity with a feet point can reuse it): a small black
 * box with a thin light frame, centred above the head, shown for a moment when a skill goes off, then fading out.
 * Above the character, so the name / HP / SP stack under the feet is untouched. Layout is pure (unit-tested).
 */
export const SKILL_NAME_BOX = {
  height: 18,
  padX: 6,
  /** Between the top of the head and the box. */
  gap: 6,
  showMs: 1200,
  fadeMs: 300,
} as const;

export interface SkillNameBoxLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Centre of the text. */
  textX: number;
  textY: number;
}

/** The box for a caster whose feet (drawn root) are at (rootX, rootY). Whole pixels. */
export function skillNameBoxLayout(rootX: number, rootY: number, textWidth: number): SkillNameBoxLayout {
  const width = Math.ceil(textWidth) + SKILL_NAME_BOX.padX * 2;
  const height = SKILL_NAME_BOX.height;
  const x = Math.round(rootX - width / 2);
  const y = Math.round(rootY - CHARACTER_DISPLAY_HEIGHT - SKILL_NAME_BOX.gap - height);
  return { x, y, width, height, textX: x + Math.floor(width / 2), textY: y + Math.floor(height / 2) };
}

/** Opacity at `elapsed` ms after showing: 1 while shown, then a linear fade; 0 = gone. */
export function skillNameBoxAlpha(elapsed: number): number {
  if (elapsed < SKILL_NAME_BOX.showMs) return 1;
  return Math.max(0, 1 - (elapsed - SKILL_NAME_BOX.showMs) / SKILL_NAME_BOX.fadeMs);
}

export class SkillNameBox {
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.Text;
  private shownAt = -Infinity;
  private width = 0;

  constructor(private readonly scene: Phaser.Scene) {
    this.frame = scene.add.graphics().setDepth(DEPTH.NamePlate + 2).setVisible(false);
    this.text = scene.add.text(0, 0, '', typo('small', PALETTE.white)).setOrigin(0.5).setDepth(DEPTH.NamePlate + 3).setVisible(false);
  }

  /** The text shown now (for checks); '' when hidden. */
  get shownText(): string {
    return this.frame.visible ? this.text.text : '';
  }

  /** A skill went off: its (translated) name, from now. */
  show(name: string): void {
    this.text.setText(name);
    this.shownAt = this.scene.time.now;
    this.width = -1; // redraw at the next update
  }

  /** Every frame: follows the caster's feet (whole pixels); fades out after its time. */
  update(rootX: number, rootY: number): void {
    const alpha = skillNameBoxAlpha(this.scene.time.now - this.shownAt);
    const on = alpha > 0;
    this.frame.setVisible(on);
    this.text.setVisible(on);
    if (!on) return;
    const L = skillNameBoxLayout(rootX, rootY, this.text.width);
    if (L.width !== this.width) {
      this.width = L.width;
      this.frame
        .clear()
        .fillStyle(0x0b0b0e, 0.92)
        .fillRect(0, 0, L.width, L.height)
        .fillStyle(0x9a9aa3, 1)
        .fillRect(0, 0, L.width, 1)
        .fillRect(0, L.height - 1, L.width, 1)
        .fillRect(0, 0, 1, L.height)
        .fillRect(L.width - 1, 0, 1, L.height);
    }
    this.frame.setPosition(L.x, L.y).setAlpha(alpha);
    this.text.setPosition(L.textX, L.textY).setAlpha(alpha);
  }
}
