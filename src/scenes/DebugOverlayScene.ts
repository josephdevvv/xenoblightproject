import Phaser from 'phaser';
import { SCENES } from '../config/constants';
import { PALETTE } from '../config/palette';
import { GameServices } from '../systems/GameServices';
import { collectDebugSnapshot } from '../systems/performance/DebugSnapshot';
import { PERFORMANCE_CONFIG } from '../systems/performance/PerformanceConfig';
import { textStyle } from '../ui/UITheme';

const REFRESH_MS = 250;

/** Optional performance overlay drawn above every other scene. Off by default. */
export class DebugOverlayScene extends Phaser.Scene {
  private text!: Phaser.GameObjects.Text;
  private background!: Phaser.GameObjects.Rectangle;
  private elapsed = REFRESH_MS;

  constructor() {
    super(SCENES.DebugOverlay);
  }

  create(): void {
    this.elapsed = REFRESH_MS;
    this.background = this.add.rectangle(this.scale.width - 8, 8, 236, 10, 0x000000, 0.72).setOrigin(1, 0);
    this.text = this.add
      .text(this.scale.width - 236, 14, '', textStyle(9, PALETTE.pale, { lineSpacing: 2 }))
      .setOrigin(0, 0);
  }

  update(_time: number, delta: number): void {
    this.elapsed += delta;
    if (this.elapsed < REFRESH_MS) return;
    this.elapsed = 0;

    const services = GameServices.tryGet();
    if (!services) return;
    const frame = services.performance.getFrameStats();
    const snap = collectDebugSnapshot(this.game, services);
    const assets = services.assets.getStatus();
    const maps = services.maps;
    const budget = PERFORMANCE_CONFIG.budgets;
    const flag = (bad: boolean): string => (bad ? ' !' : '');

    const lines = [
      'DEBUG  (F3)',
      `FPS        ${frame.fps.toFixed(0)}`,
      `Frame      ${frame.avgFrameMs.toFixed(1)} ms  max ${frame.maxFrameMs.toFixed(1)}${flag(frame.maxFrameMs > budget.frameTimeMs * 2)}`,
      `Over budg. ${(frame.overBudget * 100).toFixed(0)}%`,
      `Objects    ${snap.gameObjects}${flag(snap.gameObjects > budget.maxGameObjects)}`,
      `Characters ${snap.visibleCharacters} visible / ${snap.characters}`,
      `Textures   ${snap.textures}  lazy ${snap.trackedTextures} (in use ${snap.texturesInUse})`,
      `Map        ${maps.activeMapId ?? '-'}  [${maps.stage}]`,
      `Loading    ${assets.pending} pending  ${assets.failed} failed`,
      `Scenes     ${snap.activeScenes.join(', ')}`,
    ];
    for (const [name, source] of services.debugSources) lines.push(`${name.padEnd(10)} ${source()}`);
    if (maps.lastError) lines.push(`Error      ${maps.lastError}`);

    this.text.setText(lines);
    this.background.setSize(236, this.text.height + 12);
  }
}
