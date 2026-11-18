import { PALETTE } from '../../config/palette';
import type { MonsterId } from '../../monsters/MonsterDefinition';
import { PixelCanvas } from './PixelCanvas';

/**
 * TEMPORARY procedural monster art. Each function paints one complete static frame at 1:1 pixels
 * (no upscaling) so it can be swapped for a real sheet of the same frame size.
 */
export function createMonsterMockup(id: MonsterId, width: number, height: number): HTMLCanvasElement {
  switch (id) {
    case 'voidmite':
      return drawVoidmite(width, height);
  }
}

const C = {
  outline: '#0a0a0d',
  legDark: '#17171b',
  leg: '#28282e',
  legLight: '#3a3a42',
  shellDark: '#1c1c21',
  shell: '#2b2b32',
  shellMid: '#37373f',
  shellLight: '#4b4b54',
  seam: '#141417',
  spike: '#5a5a63',
  head: '#222227',
  headLight: '#303037',
  fang: '#6a6a72',
  eyeRim: PALETTE.accentDim,
  eye: '#8a73b8',
  eyeCore: '#d3c5f2',
  vein: '#3d3254',
} as const;

/**
 * Voidmite: a small, low, spider-like mite - wide segmented carapace with dorsal spikes, two glowing
 * purple eyes and six spindly legs spread wide. Fills a 64x32 frame; feet rest on row `height - 3`.
 */
function drawVoidmite(width: number, height: number): HTMLCanvasElement {
  const pc = new PixelCanvas(width, height);
  const cx = width / 2; // 32
  const ground = height - 3; // 29

  // Legs (behind the body): three per side, knees raised, feet spread wide on the ground.
  // [hipX, hipY, kneeX, kneeY, footX, footY] for the left side; the right side is mirrored.
  const legs: [number, number, number, number, number, number][] = [
    [cx - 9, ground - 9, cx - 19, ground - 15, cx - 27, ground - 1],
    [cx - 8, ground - 7, cx - 16, ground - 11, cx - 22, ground],
    [cx - 6, ground - 5, cx - 12, ground - 8, cx - 15, ground],
  ];
  for (const [hx, hy, kx, ky, fx, fy] of legs) {
    for (const side of [-1, 1]) {
      const m = (x: number): number => (side < 0 ? x : width - 1 - x);
      pc.line(m(hx), hy, m(kx), ky, C.leg);
      pc.line(m(kx), ky, m(fx), fy, C.legDark);
      pc.pixel(m(kx), ky, C.legLight);
      pc.pixel(m(kx), ky - 1, C.legLight);
      pc.pixel(m(fx), fy, C.legLight);
    }
  }

  // Carapace (abdomen): wide, low ellipse lit from the top-left, with curved segment seams.
  const bodyCy = ground - 13;
  const rx = 14;
  const ry = 8;
  for (let y = Math.floor(bodyCy - ry); y <= Math.ceil(bodyCy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - bodyCy) / ry;
      if (nx * nx + ny * ny > 1) continue;
      const light = -nx * 0.45 - ny * 0.9;
      let color: string = light > 0.55 ? C.shellLight : light > 0.15 ? C.shellMid : light > -0.35 ? C.shell : C.shellDark;
      for (const seam of [-0.5, 0, 0.5]) {
        if (Math.abs(nx - seam - 0.22 * ny * ny) < 0.05) color = C.seam;
      }
      pc.pixel(x, y, color);
    }
  }
  // faint purple veins along the seams (subtle accent)
  pc.pixel(cx - 7, bodyCy + 2, C.vein);
  pc.pixel(cx - 7, bodyCy + 3, C.vein);
  pc.pixel(cx + 7, bodyCy + 1, C.vein);
  pc.pixel(cx, bodyCy - 3, C.vein);

  // Dorsal spikes along the top of the shell
  for (const [sx, h] of [[-10, 2], [-5, 3], [0, 4], [5, 3], [10, 2]] as const) {
    const x = Math.round(cx + sx);
    const topY = Math.round(bodyCy - ry * Math.sqrt(Math.max(0, 1 - (sx / rx) ** 2)));
    for (let i = 1; i <= h; i++) pc.pixel(x, topY - i + 1, i === h ? C.spike : C.shellMid);
  }

  // Head: low and in front of the carapace (facing the viewer)
  const headCy = ground - 5;
  pc.fillEllipse(cx, headCy, 8, 4.4, C.head);
  pc.rect(cx - 5, headCy - 4, 10, 1, C.headLight);

  // Eyes: two glowing purple orbs (the accent)
  for (const ex of [cx - 4, cx + 3]) {
    pc.rect(ex - 1, headCy - 2, 3, 3, C.eyeRim);
    pc.rect(ex, headCy - 1, 2, 2, C.eye);
    pc.pixel(ex, headCy - 1, C.eyeCore);
  }

  // Fangs / mandibles
  for (const fx of [cx - 3, cx + 2]) {
    pc.pixel(fx, headCy + 3, C.fang);
    pc.pixel(fx, headCy + 4, C.fang);
  }

  pc.outline(C.outline);

  // Soft contact shadow underneath everything
  pc.ctx.save();
  pc.ctx.globalCompositeOperation = 'destination-over';
  pc.fillEllipse(cx, ground + 0.5, 22, 2.4, 'rgba(0, 0, 0, 0.45)');
  pc.ctx.restore();

  return pc.canvas;
}
