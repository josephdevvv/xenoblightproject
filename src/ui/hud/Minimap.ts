import Phaser from 'phaser';
import { PALETTE, toColorInt } from '../../config/palette';
import type { Point } from '../../core/types';
import type { IsometricMap } from '../../world/IsometricMap';
import type { GroundType } from '../../world/MapLayout';
import { boxesOverlap } from '../../world/structures/StructureGeometry';
import type { ScreenRect } from './HudLayout';

/**
 * Horizontal minimap pixels per half tile (one unit of x - y). 2.5 => a tile is 5 x 2.5 px and the
 * frame shows roughly 19 tiles across: about 1.3 screens of the world around the player - close enough
 * to read the streets and buildings nearby, wide enough to see where the next road leads.
 */
export const MINIMAP_ZOOM = 2.5;

const GROUND_COLORS: Record<GroundType, string> = {
  ground: '#26262b',
  path: '#45454d',
  cobble_broken: '#3c3c43',
  plaza: '#4a4a52',
  vent: '#18181b',
  floor: '#3b3430',
  stone_floor: '#3a3a42',
  rubble_floor: '#2d2b2b',
};

const WALL_TOP = '#9a9aa4';
const WALL_SIDE = '#5d5d66';
const PROP_TOP = '#6e6e77';
const PROP_SIDE = '#45454d';
const GATE = PALETTE.accentLight;
const MONSTER = '#d74a51';

/**
 * Player-centred isometric minimap inside the HUD minimap frame. The whole map is baked once (per map)
 * into a canvas texture at MINIMAP_ZOOM with a little height: walls and tall props are extruded upwards
 * with a lit top, so streets, buildings and the city wall read as shapes. Every frame only a frame-sized
 * crop around the player is shown (clamped at the map ends), with live player / monster markers.
 */
export class Minimap {
  private readonly image: Phaser.GameObjects.Image;
  private readonly player: Phaser.GameObjects.Rectangle;
  private readonly playerOutline: Phaser.GameObjects.Rectangle;
  private readonly monsterDots: Phaser.GameObjects.Rectangle[] = [];
  private readonly sx = MINIMAP_ZOOM;
  private readonly sy = MINIMAP_ZOOM / 2;
  private readonly texW: number;
  private readonly texH: number;
  /** Crop origin of the current view (texture px). */
  private viewX = 0;
  private viewY = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: IsometricMap,
    private readonly area: ScreenRect,
    private readonly depth: number,
  ) {
    const span = map.cols + map.rows;
    // Extra room above the map for extruded walls at the far edge.
    this.texW = Math.ceil(span * this.sx) + 2;
    this.texH = Math.ceil(span * this.sy) + 8;

    const key = `hud.minimap.${map.definition.id}.z${MINIMAP_ZOOM}`;
    if (!scene.textures.exists(key)) this.bake(key);
    this.image = scene.add.image(area.x, area.y, key).setOrigin(0, 0).setDepth(depth);
    // Player: white 2x2 dot on a dark 4x4 backing, always at the view centre (except near the map ends).
    this.playerOutline = scene.add.rectangle(0, 0, 4, 4, toColorInt(PALETTE.black)).setOrigin(0.5).setDepth(depth + 2);
    this.player = scene.add.rectangle(0, 0, 2, 2, toColorInt(PALETTE.white)).setOrigin(0.5).setDepth(depth + 3);
  }

  /** Call every frame with tile-space positions. */
  update(player: Point, monsters: readonly Point[]): void {
    const p = this.project(player.x, player.y);
    const w = Math.min(this.area.width, this.texW);
    const h = Math.min(this.area.height, this.texH);
    this.viewX = Phaser.Math.Clamp(Math.round(p.x - w / 2), 0, this.texW - w);
    this.viewY = Phaser.Math.Clamp(Math.round(p.y - h / 2), 0, this.texH - h);
    this.image.setCrop(this.viewX, this.viewY, w, h);
    this.image.setPosition(this.area.x - this.viewX, this.area.y - this.viewY);

    const sp = this.toScreen(p);
    this.playerOutline.setPosition(sp.x, sp.y);
    this.player.setPosition(sp.x, sp.y);

    while (this.monsterDots.length < monsters.length) {
      this.monsterDots.push(this.scene.add.rectangle(0, 0, 2, 2, toColorInt(MONSTER)).setOrigin(0.5).setDepth(this.depth + 1));
    }
    this.monsterDots.forEach((dot, i) => {
      const m = monsters[i];
      const q = m ? this.toScreen(this.project(m.x, m.y)) : null;
      const inside =
        q !== null && q.x >= this.area.x + 1 && q.x < this.area.x + this.area.width - 1 && q.y >= this.area.y + 1 && q.y < this.area.y + this.area.height - 1;
      dot.setVisible(inside);
      if (inside && q) dot.setPosition(q.x, q.y);
    });
  }

  /** Tile space -> baked texture pixels. */
  private project(tx: number, ty: number): Point {
    return { x: (tx - ty + this.map.rows) * this.sx, y: (tx + ty) * this.sy + 6 };
  }

  /** Baked texture pixels -> screen position inside the frame (whole pixels). */
  private toScreen(p: Point): Point {
    return { x: Math.round(this.area.x + p.x - this.viewX), y: Math.round(this.area.y + p.y - this.viewY) };
  }

  private bake(key: string): void {
    const texture = this.scene.textures.createCanvas(key, this.texW, this.texH);
    if (!texture) return;
    const ctx = texture.getContext();
    const layout = this.map.layout;
    const image = ctx.createImageData(this.texW, this.texH);
    const put = (x: number, y: number, hex: string): void => {
      const i = (y * this.texW + x) * 4;
      const v = parseInt(hex.slice(1), 16);
      image.data[i] = (v >> 16) & 255;
      image.data[i + 1] = (v >> 8) & 255;
      image.data[i + 2] = v & 255;
      image.data[i + 3] = 255;
    };
    // Inverse of project(): screen pixel centre -> continuous tile coordinates.
    const toTile = (x: number, y: number): Point => {
      const u = (x + 0.5) / this.sx - this.map.rows;
      const v = (y + 0.5 - 6) / this.sy;
      return { x: (u + v) / 2, y: (v - u) / 2 };
    };
    const tiny = (p: Point) => ({ minX: p.x - 0.02, minY: p.y - 0.02, maxX: p.x + 0.02, maxY: p.y + 0.02 });
    const gateBoxes = layout.objects.filter((o) => o.type === 'city_gate').map((o) => o.box);
    const tallTiles = new Set<number>();
    for (const o of layout.objects) {
      if (!o.spec.tall && o.spec.w * o.spec.h < 4) continue;
      for (let r = o.row; r < o.row + o.spec.h; r++) for (let c = o.col; c < o.col + o.spec.w; c++) tallTiles.add(r * layout.cols + c);
    }

    /** What stands on the ground at a screen pixel: 0 nothing, 1 prop, 2 wall / tall prop. */
    const solidAt = (x: number, y: number): number => {
      const t = toTile(x, y);
      const c = Math.floor(t.x);
      const r = Math.floor(t.y);
      if (!layout.isInside(c, r)) return 0;
      if (layout.collidesWithPiece(tiny(t))) return 2;
      if (layout.isTileBlocked(c, r)) return tallTiles.has(r * layout.cols + c) ? 2 : 1;
      return 0;
    };
    const isGate = (x: number, y: number): boolean => {
      const t = toTile(x, y);
      return gateBoxes.some((b) => boxesOverlap(tiny(t), b));
    };

    for (let y = 0; y < this.texH; y++) {
      for (let x = 0; x < this.texW; x++) {
        // Extruded things: a wall pixel `k` px below this one means this pixel shows the wall's face.
        let drawn = false;
        for (let k = 3; k >= 1; k--) {
          const s = solidAt(x, y + k);
          const height = s === 2 ? 3 : s === 1 ? 1 : 0;
          if (height >= k) {
            const top = k === height;
            const gate = isGate(x, y + k);
            put(x, y, gate ? (top ? GATE : PALETTE.accent) : s === 2 ? (top ? WALL_TOP : WALL_SIDE) : top ? PROP_TOP : PROP_SIDE);
            drawn = true;
            break;
          }
        }
        if (drawn) continue;
        const t = toTile(x, y);
        const c = Math.floor(t.x);
        const r = Math.floor(t.y);
        if (!layout.isInside(c, r)) continue;
        const s = solidAt(x, y);
        if (s) {
          put(x, y, isGate(x, y) ? PALETTE.accentDim : s === 2 ? WALL_SIDE : PROP_SIDE);
          continue;
        }
        let color = GROUND_COLORS[layout.ground[r][c]];
        // faint lit far edges give the ground a tiled, dimensional feel
        const fu = t.x - c;
        const fv = t.y - r;
        if (fu < 0.14 || fv < 0.14) color = mix(color, '#ffffff', 0.05);
        put(x, y, color);
      }
    }
    ctx.putImageData(image, 0, 0);
    texture.refresh();
  }
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) + ((((pb >> s) & 255) - ((pa >> s) & 255)) * t));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}
