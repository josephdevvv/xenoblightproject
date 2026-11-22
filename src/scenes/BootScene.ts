import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SCENES } from '../config/constants';
import { PALETTE } from '../config/palette';
import { AssetManager } from '../assets/AssetManager';
import { t } from '../i18n';
import { typo } from '../ui/UITheme';
import { DEBUG_AVAILABLE } from '../systems/performance/DebugSnapshot';

/** Loads production assets (none yet) and generates the mockup textures. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENES.Boot);
  }

  preload(): void {
    const label = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, t('common.loading'), typo('label', PALETTE.gray))
      .setOrigin(0.5);
    this.load.on(Phaser.Loader.Events.PROGRESS, (p: number) => label.setText(t('common.loadingProgress', { percent: Math.round(p * 100) })));
    AssetManager.preload(this.load);
  }

  create(): void {
    AssetManager.createMockupTextures(this);
    // Developer monster animation preview: ?monsters (dev builds, or production with ?debug).
    const preview = DEBUG_AVAILABLE && new URLSearchParams(location.search).has('monsters');
    this.scene.start(preview ? SCENES.MonsterPreview : SCENES.MainMenu);
  }
}
