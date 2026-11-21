import Phaser from 'phaser';
import { createNameLabel, NAME_LABEL_COLORS, placeNameLabel } from '../ui/world/WorldNameLabel';
import type { IsometricMap } from '../world/IsometricMap';
import { IdleCycle } from './IdleCycle';
import { npcSheetKey, type NpcDefinition } from './NpcDefinition';

/**
 * A stationary NPC on its tile: the idle routine (IdleCycle) picks the frame; all frames share the sheet's
 * measured ground anchor, so the feet stay on the tile. Depth: screen Y of the feet, corrected against walls (same rule as characters).
 * Name label under the feet (shared world label: same style and placement as the player and monsters),
 * fixed to the ground anchor - never following the animation.
 */
export class NpcEntity {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly label: Phaser.GameObjects.Text;
  readonly cycle: IdleCycle;
  private shown = -1;

  constructor(
    scene: Phaser.Scene,
    map: IsometricMap,
    readonly definition: NpcDefinition,
  ) {
    const meta = definition.art.meta;
    this.cycle = new IdleCycle(definition.idle.stillMs, definition.idle.frameMs, meta.standFrame, meta.playFrames);
    const { col, row } = definition.tile;
    const world = map.tileToWorld(col + 0.5, row + 0.5);
    const x = Math.round(world.x);
    const y = Math.round(world.y);
    // one ground anchor for every frame (the sheet is registered to one feet row): no hop while animating
    this.sprite = scene.add.sprite(x, y, npcSheetKey(definition), meta.standFrame).setOrigin(meta.anchor.x / meta.frameWidth, meta.anchor.y / meta.frameHeight);
    const r = 0.3;
    const box = { minX: col + 0.5 - r, minY: row + 0.5 - r, maxX: col + 0.5 + r, maxY: row + 0.5 + r };
    this.showFrame(meta.standFrame);
    this.sprite.setDepth(map.resolveDepth(box, world.y, this.sprite.getBounds()));
    this.label = createNameLabel(scene, definition.name, NAME_LABEL_COLORS.npc);
    placeNameLabel(this.label, x, y);
  }

  update(deltaMs: number): void {
    this.showFrame(this.cycle.update(deltaMs));
  }

  destroy(): void {
    this.sprite.destroy();
    this.label.destroy();
  }

  private showFrame(frame: number): void {
    if (frame === this.shown) return;
    this.shown = frame;
    this.sprite.setFrame(frame);
  }
}
