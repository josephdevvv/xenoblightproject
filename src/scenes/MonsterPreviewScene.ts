import Phaser from 'phaser';
import { SCENES } from '../config/constants';
import { PALETTE, toColorInt } from '../config/palette';
import { AssetManager } from '../assets/AssetManager';
import { MONSTER_ACTIONS, MONSTER_FACINGS, type MonsterAction } from '../monsters/art/MonsterArt';
import { MonsterAnimator } from '../monsters/MonsterAnimator';
import { MONSTER_DEFINITIONS, type MonsterId } from '../monsters/MonsterDefinition';
import { GameServices } from '../systems/GameServices';
import { typo } from '../ui/UITheme';
import { createNameLabel, NAME_LABEL_COLORS, placeNameLabel } from '../ui/world/WorldNameLabel';

const IDS = Object.keys(MONSTER_DEFINITIONS) as MonsterId[];

/**
 * Developer preview of every monster animation in all four facings (dev builds, or ?debug, with
 * ?monsters in the URL). Rows: idle, walk, attack (+ VFX on the contact frame), hit (red flash), death
 * (held, then replayed). A magenta dot marks each ground root, and the name label sits under it exactly
 * as in the game. Keys: 1 / 2 (or Tab) switch monster. Visual check only - no gameplay.
 */
export class MonsterPreviewScene extends Phaser.Scene {
  private index = 0;
  private readonly items: Phaser.GameObjects.GameObject[] = [];
  private readonly animators: MonsterAnimator[] = [];
  private readonly timers: Phaser.Time.TimerEvent[] = [];

  constructor() {
    super(SCENES.MonsterPreview);
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1d1d21');
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (e.key === '1' || e.key === '2') void this.show(Number(e.key) - 1);
      if (e.key === 'Tab') {
        e.preventDefault();
        void this.show((this.index + 1) % IDS.length);
      }
    });
    void this.show(0);
  }

  /** Current preview (for automated checks). */
  getAnimators(): readonly MonsterAnimator[] {
    return this.animators;
  }

  private async show(index: number): Promise<void> {
    this.index = index;
    const def = MONSTER_DEFINITIONS[IDS[index]];
    await GameServices.ready();
    await AssetManager.ensureMonsterArt(this, def);
    this.clear();

    const cellW = 180;
    const rowH = 78;
    const left = 150;
    const top = 70;
    this.keep(this.add.text(16, 12, `${def.displayName}  (${index + 1}/${IDS.length} - keys 1 / 2)`, typo('heading', PALETTE.pale)));
    MONSTER_FACINGS.forEach((f, c) => this.keep(this.add.text(left + c * cellW, top - 28, f, typo('label', PALETTE.silver)).setOrigin(0.5, 0)));

    MONSTER_ACTIONS.forEach((action, r) => {
      const y = top + 46 + r * rowH;
      this.keep(this.add.text(16, y - 20, action, typo('label', PALETTE.silver)));
      MONSTER_FACINGS.forEach((facing, c) => {
        const x = left + c * cellW;
        const a = new MonsterAnimator(this, def.art, facing);
        a.setRoot(x, y, 10);
        this.animators.push(a);
        this.keep(this.add.rectangle(x, y, 2, 2, toColorInt('#ff3df5')).setDepth(20));
        const label = createNameLabel(this, def.displayName, NAME_LABEL_COLORS.monster).setDepth(30);
        placeNameLabel(label, x, y);
        this.keep(label);
        this.drive(a, action);
      });
    });
  }

  private drive(a: MonsterAnimator, action: MonsterAction): void {
    const every = (ms: number, fn: () => void): void => {
      fn();
      this.timers.push(this.time.addEvent({ delay: ms, loop: true, callback: fn }));
    };
    switch (action) {
      case 'idle':
        a.setMotion(false);
        break;
      case 'walk':
        a.setMotion(true);
        break;
      case 'attack':
        every(1500, () => a.attack());
        break;
      case 'hit':
        every(1100, () => a.hit());
        break;
      case 'death':
        every(2600, () => {
          a.reset();
          a.die();
        });
        break;
    }
  }

  private keep<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.items.push(o);
    return o;
  }

  private clear(): void {
    for (const t of this.timers) t.remove();
    this.timers.length = 0;
    for (const a of this.animators) a.destroy();
    this.animators.length = 0;
    for (const o of this.items) o.destroy();
    this.items.length = 0;
  }
}
