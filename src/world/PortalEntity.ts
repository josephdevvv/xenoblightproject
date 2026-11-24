import Phaser from 'phaser';
import type { Point } from '../core/types';
import { QuestMarker } from '../ui/world/QuestMarker';
import type { IsometricMap } from './IsometricMap';
import { portalArrowShown, portalVisible, portalVisualCentre, tileCentre, type PortalDefinition, type PortalState } from './Portals';

/** The art's foot (the middle of the stone ring) as a share of its height: it stands on the tile centre. */
const FOOT_Y = 0.82;

/**
 * A portal on the map: its 64 x 64 looping animation (1x, crisp) standing on its tile (drawn 28 px to the right - Portals), sorted with the scenery like an NPC,
 * hidden while locked. While it waits to be gone through, the quest marker arrow floats above it (the same
 * arrow NPCs show). Not blocking: walking onto its tile warps (GameScene); a click on it walks onto it.
 */
export class PortalEntity {
  readonly image: Phaser.GameObjects.Sprite;
  private readonly arrow: QuestMarker;
  private shownState: PortalState | null = null;

  constructor(
    scene: Phaser.Scene,
    map: IsometricMap,
    readonly definition: PortalDefinition,
  ) {
    // drawn at its visual centre (28 px right of the tile centre, the same screen height): sprite, arrow, depth
    const c = portalVisualCentre(definition.tile);
    const world = map.tileToWorld(c.x, c.y);
    const x = Math.round(world.x);
    const y = Math.round(world.y);
    const { key, frames, frameRate } = definition.art;
    const anim = `${key}.loop`;
    if (!scene.anims.exists(anim) && scene.textures.exists(key)) {
      scene.anims.create({ key: anim, frames: scene.anims.generateFrameNumbers(key, { start: 0, end: frames - 1 }), frameRate, repeat: -1 });
    }
    this.image = scene.add.sprite(x, y, key, 0).setOrigin(0.5, FOOT_Y).setVisible(false);
    if (scene.anims.exists(anim)) this.image.play(anim);
    const r = 0.45;
    const box = { minX: c.x - r, minY: c.y - r, maxX: c.x + r, maxY: c.y + r };
    this.image.setDepth(map.resolveDepth(box, world.y, this.image.getBounds()));
    this.arrow = new QuestMarker(scene, { x, y: Math.round(y - definition.art.size * FOOT_Y) + 4 });
  }

  /** Its tile centre (tile space): where a click or Navigate walks to - inside the step-on trigger. */
  get position(): Point {
    return tileCentre(this.definition.tile);
  }

  /** Shown now (for checks). */
  get visible(): boolean {
    return this.image.visible;
  }

  get arrowShown(): boolean {
    return this.arrow.type !== null;
  }

  /** Follows the saved state: hidden while locked, the arrow until it was gone through. */
  sync(state: PortalState): void {
    if (state === this.shownState) return;
    this.shownState = state;
    this.image.setVisible(portalVisible(state));
    this.arrow.set(portalArrowShown(state) ? 'inProgress' : null);
  }

  /** Is a world point on the portal (its picture, plus a little slack)? Never while hidden. */
  contains(x: number, y: number, slack = 2): boolean {
    if (!this.image.visible) return false;
    const b = this.image.getBounds();
    return x >= b.left - slack && x <= b.right + slack && y >= b.top - slack && y <= b.bottom + slack;
  }

  update(deltaMs: number): void {
    this.arrow.update(deltaMs);
  }

  destroy(): void {
    this.image.destroy();
    this.arrow.destroy();
  }
}
