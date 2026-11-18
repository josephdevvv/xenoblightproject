import Phaser from 'phaser';
import { SCENES } from '../config/constants';
import { CharacterRegistry } from '../characters/CharacterRegistry';
import { AssetLoadingManager } from '../systems/AssetLoadingManager';
import { GameServices, type Services } from '../systems/GameServices';
import { ResourceCacheManager } from '../systems/ResourceCacheManager';
import { collectDebugSnapshot, DEBUG_AVAILABLE, DEBUG_SHOW_ON_START } from '../systems/performance/DebugSnapshot';
import { PerformanceManager } from '../systems/performance/PerformanceManager';
import { MapLoadingManager } from '../world/loading/MapLoadingManager';
import { MAP_REGISTRY } from '../world/loading/MapRegistry';

const BUDGET_CHECK_INTERVAL_MS = 1000;

/**
 * Invisible scene that starts with the game and never stops. It owns the long-lived Phaser loader
 * used for on-demand loading (scene loaders are reset whenever their scene restarts), creates the
 * game-wide services, samples frame times and toggles the debug overlay.
 */
export class SystemScene extends Phaser.Scene {
  private services!: Services;
  private sinceBudgetCheck = 0;

  constructor() {
    super({ key: SCENES.System, active: true, visible: false });
  }

  create(): void {
    // Phaser marks scenes visible when they start; this one never renders anything.
    this.scene.setVisible(false);
    const cache = new ResourceCacheManager(this.textures);
    const assets = new AssetLoadingManager(this.load, this.textures);
    this.services = {
      assets,
      cache,
      maps: new MapLoadingManager(assets, cache, MAP_REGISTRY),
      performance: new PerformanceManager(),
      characters: new CharacterRegistry(),
      debugSources: new Map(),
    };
    GameServices.install(this.services);

    if (DEBUG_AVAILABLE) {
      this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.F3).on('down', () => this.toggleDebugOverlay());
      if (DEBUG_SHOW_ON_START) this.scene.launch(SCENES.DebugOverlay);
    }
  }

  update(time: number, delta: number): void {
    this.services.performance.sample(delta);
    this.sinceBudgetCheck += delta;
    if (this.sinceBudgetCheck >= BUDGET_CHECK_INTERVAL_MS) {
      this.sinceBudgetCheck = 0;
      const snapshot = collectDebugSnapshot(this.game, this.services);
      this.services.performance.checkBudgets(snapshot, time);
    }
  }

  private toggleDebugOverlay(): void {
    if (this.scene.isActive(SCENES.DebugOverlay)) {
      this.scene.stop(SCENES.DebugOverlay);
    } else {
      this.scene.launch(SCENES.DebugOverlay);
      this.scene.bringToTop(SCENES.DebugOverlay);
    }
  }
}
