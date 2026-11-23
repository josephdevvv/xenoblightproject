import Phaser from 'phaser';
import type { Point } from '../core/types';
import { frameOpaqueBounds } from '../combat/vfx/HitAnchor';
import { QuestMarker } from '../ui/world/QuestMarker';
import { createNameLabel, NAME_LABEL_COLORS, placeNameLabel } from '../ui/world/WorldNameLabel';
import type { IsometricMap } from '../world/IsometricMap';
import { IdleCycle } from './IdleCycle';
import { NPC_DISPLAY_SCALE, npcSheetKey, type NpcDefinition } from './NpcDefinition';

/**
 * A stationary NPC on its tile: the idle routine (IdleCycle) picks the frame; all frames share the sheet's
 * measured ground anchor, so the feet stay on the tile. Depth: screen Y of the feet, corrected against walls (same rule as characters).
 * Name label under the feet (shared world label: same style and placement as the player and monsters),
 * fixed to the ground anchor - never following the animation. Quest marker above the head (GameScene says which).
 */
export class NpcEntity {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly label: Phaser.GameObjects.Text;
  readonly cycle: IdleCycle;
  readonly questMarker: QuestMarker;
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
    this.sprite = scene.add
      .sprite(x, y, npcSheetKey(definition), meta.standFrame)
      .setOrigin(meta.anchor.x / meta.frameWidth, meta.anchor.y / meta.frameHeight)
      .setScale(NPC_DISPLAY_SCALE);
    const r = 0.3;
    const box = { minX: col + 0.5 - r, minY: row + 0.5 - r, maxX: col + 0.5 + r, maxY: row + 0.5 + r };
    this.showFrame(meta.standFrame);
    this.sprite.setDepth(map.resolveDepth(box, world.y, this.sprite.getBounds()));
    this.label = createNameLabel(scene, definition.name, NAME_LABEL_COLORS.npc);
    placeNameLabel(this.label, x, y);
    this.questMarker = new QuestMarker(scene, npcHeadTop(definition, x, y));
  }

  /** Where it stands (tile space, tile centre). */
  get position(): Point {
    const { col, row } = this.definition.tile;
    return { x: col + 0.5, y: row + 0.5 };
  }

  /** Is a world point on the visible figure (plus a few px of slack)? */
  contains(x: number, y: number, slack = 4): boolean {
    const b = frameOpaqueBounds(this.sprite);
    if (!b) return false;
    const s = this.sprite.scaleX;
    const left = this.sprite.x - this.sprite.displayOriginX * s;
    const top = this.sprite.y - this.sprite.displayOriginY * s;
    return x >= left + b.left * s - slack && x <= left + (b.right + 1) * s + slack && y >= top + b.top * s - slack && y <= top + (b.bottom + 1) * s + slack;
  }

  update(deltaMs: number): void {
    this.showFrame(this.cycle.update(deltaMs));
    this.questMarker.update(deltaMs);
  }

  destroy(): void {
    this.sprite.destroy();
    this.label.destroy();
    this.questMarker.destroy();
  }

  private showFrame(frame: number): void {
    if (frame === this.shown) return;
    this.shown = frame;
    this.sprite.setFrame(frame);
  }
}

/** World point (whole pixels) at the middle of the top of the head, for an NPC whose feet are at (x, y). */
export function npcHeadTop(definition: NpcDefinition, x: number, y: number): { x: number; y: number } {
  const { anchor } = definition.art.meta;
  return {
    x: Math.round(x + (definition.head.x - anchor.x) * NPC_DISPLAY_SCALE),
    y: Math.round(y - (anchor.y - definition.head.top) * NPC_DISPLAY_SCALE),
  };
}
