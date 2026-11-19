import Phaser from 'phaser';
import { PALETTE, toColorInt } from '../../config/palette';
import type { Point } from '../../core/types';
import type { IsometricMap } from '../../world/IsometricMap';
import type { ScreenRect } from './HudLayout';

const COLORS = {
  ground: PALETTE.stone,
  path: PALETTE.slate,
  blocked: PALETTE.gray,
  structure: PALETTE.accent,
  monster: '#d74a51',
} as const;

/**
 * Small isometric overview of the current map inside the HUD minimap frame: terrain baked once
 * into a canvas texture (per map), plus live dots for the player and monsters.
 */
export class Minimap {
  private readonly player: Phaser.GameObjects.Rectangle;
  private readonly playerOutline: Phaser.GameObjects.Rectangle;
  private readonly monsterDots: Phaser.GameObjects.Rectangle[] = [];
  private readonly sx: number;
  private readonly sy: number;
  private readonly originX: number;
  private readonly originY: number;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: IsometricMap,
    area: ScreenRect,
    private readonly depth: number,
  ) {
    const span = map.cols + map.rows;
    // Iso diamond: horizontal step = 2 x vertical step; fit the whole map inside the frame.
    this.sx = Math.min((area.width - 2) / span, (2 * (area.height - 2)) / span);
    this.sy = this.sx / 2;
    const w = Math.ceil(span * this.sx);
    const h = Math.ceil(span * this.sy);
    this.originX = Math.round(area.x + (area.width - w) / 2);
    this.originY = Math.round(area.y + (area.height - h) / 2);

    const key = `hud.minimap.${map.definition.id}`;
    if (!scene.textures.exists(key)) this.bake(key, w, h);
    scene.add.image(this.originX, this.originY, key).setOrigin(0, 0).setDepth(depth);
    // Player: white 2x2 dot on a dark 4x4 backing so it stands out from terrain and props.
    this.playerOutline = scene.add.rectangle(0, 0, 4, 4, toColorInt(PALETTE.black)).setOrigin(0.5).setDepth(depth + 2);
    this.player = scene.add.rectangle(0, 0, 2, 2, toColorInt(PALETTE.white)).setOrigin(0.5).setDepth(depth + 3);
  }

  /** Call every frame with tile-space positions. */
  update(player: Point, monsters: readonly Point[]): void {
    const p = this.project(player.x, player.y);
    this.playerOutline.setPosition(p.x, p.y);
    this.player.setPosition(p.x, p.y);
    while (this.monsterDots.length < monsters.length) {
      this.monsterDots.push(
        this.scene.add.rectangle(0, 0, 2, 1, toColorInt(COLORS.monster)).setOrigin(0.5, 0).setDepth(this.depth + 1),
      );
    }
    this.monsterDots.forEach((dot, i) => {
      const m = monsters[i];
      dot.setVisible(m !== undefined);
      if (!m) return;
      const q = this.project(m.x, m.y);
      dot.setPosition(q.x, q.y);
    });
  }

  private project(tx: number, ty: number): Point {
    return {
      x: Math.round(this.originX + (tx - ty + this.map.rows) * this.sx),
      y: Math.round(this.originY + (tx + ty) * this.sy),
    };
  }

  private bake(key: string, w: number, h: number): void {
    const texture = this.scene.textures.createCanvas(key, w, h);
    if (!texture) return;
    const ctx = texture.getContext();
    const def = this.map.definition;
    const onPath = (c: number, r: number): boolean =>
      def.paths.some((p) => c >= p.col && c < p.col + p.w && r >= p.row && r < p.row + p.h);
    const inStructure = (c: number, r: number): boolean =>
      this.map.structures.footprints().some((b) => c >= b.minX && c < b.maxX && r >= b.minY && r < b.maxY);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // Inverse of project(): u = tx - ty, v = tx + ty (pixel centres).
        const u = (x + 0.5) / this.sx - this.map.rows;
        const v = (y + 0.5) / this.sy;
        const c = Math.floor((u + v) / 2);
        const r = Math.floor((v - u) / 2);
        if (!this.map.isInside(c, r)) continue;
        let color: string = COLORS.ground;
        if (inStructure(c, r)) color = COLORS.structure;
        else if (this.map.isTileBlocked(c, r)) color = COLORS.blocked;
        else if (onPath(c, r)) color = COLORS.path;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    texture.refresh();
  }
}
