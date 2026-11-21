import Phaser from 'phaser';
import { DEPTH } from '../config/constants';
import { PALETTE } from '../config/palette';
import { typo } from '../ui/UITheme';

export type FloatingTextKind = 'damage' | 'crit' | 'playerDamage' | 'miss' | 'exp' | 'info';

const STYLE: Record<FloatingTextKind, { color: string; size: 'label' | 'heading' | 'small' }> = {
  damage: { color: '#f2ece0', size: 'label' },
  crit: { color: '#ffd27a', size: 'heading' },
  playerDamage: { color: '#ff6b6b', size: 'label' },
  miss: { color: '#9a9aa3', size: 'small' },
  exp: { color: '#c9a6ff', size: 'small' },
  info: { color: '#e8e8ec', size: 'label' },
};

const RISE_PX = 22;
const LIFE_MS = 800;

/**
 * Floating combat text (damage, MISS, +EXP, level up). Pooled Text objects; each rises and fades out.
 * Drawn above the world (name plate band) at whole-pixel positions.
 */
export class DamageNumbers {
  private readonly pool: Phaser.GameObjects.Text[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  show(x: number, y: number, text: string, kind: FloatingTextKind): void {
    const s = STYLE[kind];
    const t = this.pool.pop() ?? this.scene.add.text(0, 0, '');
    t.setStyle(typo(s.size, s.color, { stroke: PALETTE.black, strokeThickness: 3 }));
    t.setText(text).setOrigin(0.5, 1).setDepth(DEPTH.NamePlate + 1).setAlpha(1).setVisible(true);
    // small sideways jitter so several numbers in a row do not stack exactly
    t.setPosition(Math.round(x + Phaser.Math.Between(-6, 6)), Math.round(y));
    this.scene.tweens.add({
      targets: t,
      y: Math.round(y - RISE_PX),
      alpha: 0,
      duration: LIFE_MS,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        t.setVisible(false);
        this.pool.push(t);
      },
    });
  }
}
