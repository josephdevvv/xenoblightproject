import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { MONSTER_ACTIONS, MONSTER_ART, MONSTER_FACINGS, facingForDirection, type MonsterArtId } from '../src/monsters/art/MonsterArt';
import { MONSTER_DEFINITIONS } from '../src/monsters/MonsterDefinition';
import { readPng, type Rgba } from './helpers/png';

const PUBLIC = path.join(process.cwd(), 'public');
const SOURCE: Record<MonsterArtId, { dir: string; folders: Record<string, string>; vfx: string }> = {
  void_mite: {
    dir: 'art-source/monsters/void_mite',
    folders: { idle: 'Idle', walk: 'Walk', attack: 'Attack_Stomp', hit: 'Hit_Reaction', death: 'Death_Fall' },
    vfx: 'VFX_Stomp_Impact',
  },
  mutant_wolf: {
    dir: 'art-source/monsters/mutant_wolf',
    folders: { idle: 'Idle', walk: 'Walk_Light_Run', attack: 'Attack_Pounce_Bite', hit: 'Hit_Reaction', death: 'Death_Prone' },
    vfx: 'VFX_Bite_Impact',
  },
};
/** Actions the import tool rescales to the idle body size (delivered at the wrong scale). */
const RESCALED: Partial<Record<MonsterArtId, string[]>> = { void_mite: ['death'] };
const PACK_DIRS = { SE: 'south_east', SW: 'south_west', NE: 'north_east', NW: 'north_west' } as const;

function packSheet(id: MonsterArtId, folder: string, facing: keyof typeof PACK_DIRS): Rgba {
  const dir = path.join(process.cwd(), SOURCE[id].dir, folder, PACK_DIRS[facing], 'sheet');
  return readPng(path.join(dir, fs.readdirSync(dir).find((f) => f.endsWith('.png'))!));
}

const alpha = (img: Rgba, x: number, y: number) => img.data[(y * img.width + x) * 4 + 3];

function lowestRow(img: Rgba, x0: number, y0: number, w: number, h: number): number {
  for (let y = h - 1; y >= 0; y--) for (let x = 0; x < w; x++) if (alpha(img, x0 + x, y0 + y) >= 128) return y;
  return -1;
}

for (const id of Object.keys(MONSTER_ART) as MonsterArtId[]) {
  const art = MONSTER_ART[id];

  test(`${id}: every action has 4 facings, sheet sizes match the metadata, pixels are the delivered ones`, () => {
    const rescaled = RESCALED[id] ?? [];
    assert.deepEqual(art.meta.rows, ['SE', 'SW', 'NE', 'NW']);
    for (const action of MONSTER_ACTIONS) {
      const m = art.meta.actions[action];
      const sheet = readPng(path.join(PUBLIC, art.basePath, m.file));
      assert.equal(sheet.width, m.frameWidth * m.frames, `${action} width`);
      assert.equal(sheet.height, m.frameHeight * 4, `${action} height (4 facings)`);
      if (rescaled.includes(action)) continue; // checked by the scale test below
      MONSTER_FACINGS.forEach((facing, row) => {
        const src = packSheet(id, SOURCE[id].folders[action], facing);
        assert.equal(src.width, sheet.width, `${action} ${facing} source width`);
        // byte-identical copy: no scaling, recolouring or alpha change
        const rowBytes = sheet.width * 4;
        const imported = Buffer.from(sheet.data.buffer, sheet.data.byteOffset + row * m.frameHeight * rowBytes, m.frameHeight * rowBytes);
        assert.ok(imported.equals(Buffer.from(src.data.buffer, src.data.byteOffset, src.data.length)), `${action} ${facing}: pixels differ from the pack`);
      });
    }
  });

  test(`${id}: feet stay on the ground root in every frame of every facing (no hop between actions)`, () => {
    for (const action of MONSTER_ACTIONS) {
      const m = art.meta.actions[action];
      const sheet = readPng(path.join(PUBLIC, art.basePath, m.file));
      MONSTER_FACINGS.forEach((facing, row) => {
        const anchor = m.anchors[facing];
        for (let f = 0; f < m.frames; f++) {
          const bottom = lowestRow(sheet, f * m.frameWidth, row * m.frameHeight, m.frameWidth, m.frameHeight);
          // lowest pixel row ends on the root line (never below it), at most a few px above it
          const gap = anchor.y - (bottom + 1);
          // leaps / flips in the art (pounce, recoil, the mite flipping over as it dies) may leave the ground
          const limit = action === 'death' ? 10 : action === 'attack' || action === 'hit' ? 6 : 3;
          assert.ok(gap >= 0 && gap <= limit, `${action} ${facing} frame ${f + 1}: feet ${gap}px off the ground`);
        }
      });
    }
  });

  test(`${id}: transparency preserved (empty frame corners, nothing fully opaque behind the sprite)`, () => {
    for (const action of MONSTER_ACTIONS) {
      const m = art.meta.actions[action];
      const sheet = readPng(path.join(PUBLIC, art.basePath, m.file));
      for (let row = 0; row < 4; row++) {
        for (let f = 0; f < m.frames; f++) {
          const x0 = f * m.frameWidth;
          const y0 = row * m.frameHeight;
          assert.equal(alpha(sheet, x0, y0), 0, `${action} row ${row} frame ${f + 1}: top-left corner not transparent`);
          assert.equal(alpha(sheet, x0 + m.frameWidth - 1, y0), 0, `${action} row ${row} frame ${f + 1}: top-right corner not transparent`);
        }
      }
    }
  });

  test(`${id}: separate attack VFX layer, contact frame and red hit frames are in range`, () => {
    const v = art.meta.vfx;
    const sheet = readPng(path.join(PUBLIC, art.basePath, v.file));
    assert.equal(sheet.width, v.frameWidth * v.frames);
    assert.equal(sheet.height, v.frameHeight * 4);
    for (const facing of MONSTER_FACINGS) {
      assert.ok(v.origins[facing] && v.offsets[facing], `${facing} VFX placement`);
      MONSTER_FACINGS.forEach((_, row) => {
        const src = packSheet(id, SOURCE[id].vfx, MONSTER_FACINGS[row]);
        assert.equal(src.width, sheet.width);
      });
    }
    assert.ok(art.impactFrame >= 1 && art.impactFrame <= art.meta.actions.attack.frames);
    for (const f of art.hitTintFrames) assert.ok(f >= 1 && f <= art.meta.actions.hit.frames);
    assert.equal(art.timing.death.repeat, 0, 'death plays once (and holds its last frame)');
    assert.equal(art.timing.walk.repeat, -1, 'walk loops');
  });
}

test('both monsters are defined with their art; Void Mite gameplay data unchanged', () => {
  assert.equal(MONSTER_DEFINITIONS.voidmite.art, 'void_mite');
  assert.equal(MONSTER_DEFINITIONS.voidmite.displayName, 'Void Mite');
  assert.equal(MONSTER_DEFINITIONS.voidmite.footprintRadius, 0.3);
  assert.deepEqual(MONSTER_DEFINITIONS.voidmite.behavior, { type: 'wander', radiusTiles: 3, speed: 0.9, pauseMs: [900, 2800] });
  assert.equal(MONSTER_DEFINITIONS.mutant_wolf.art, 'mutant_wolf');
  assert.equal(MONSTER_DEFINITIONS.mutant_wolf.displayName, 'Mutant Wolf');
});

test('facing follows movement on screen (4 isometric facings)', () => {
  // tile +x = screen down-right, tile +y = screen down-left
  assert.equal(facingForDirection(1, 0, 'NW'), 'SE');
  assert.equal(facingForDirection(0, 1, 'NE'), 'SW');
  assert.equal(facingForDirection(-1, 0, 'SE'), 'NW');
  assert.equal(facingForDirection(0, -1, 'SW'), 'NE');
  // straight down the screen keeps the current east / west side
  assert.equal(facingForDirection(1, 1, 'NE'), 'SE');
  assert.equal(facingForDirection(1, 1, 'NW'), 'SW');
  assert.equal(facingForDirection(0, 0, 'NW'), 'NW');
});

test('void_mite: death frames are back at the idle body scale (were drawn ~1.43x larger)', () => {
  const art = MONSTER_ART.void_mite;
  const idle = readPng(path.join(PUBLIC, art.basePath, art.meta.actions.idle.file));
  const death = readPng(path.join(PUBLIC, art.basePath, art.meta.actions.death.file));
  const box = (img: Rgba, x0: number, y0: number, w: number, h: number) => {
    let top = h, bottom = -1, left = w, right = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (alpha(img, x0 + x, y0 + y) >= 128) { top = Math.min(top, y); bottom = Math.max(bottom, y); left = Math.min(left, x); right = Math.max(right, x); }
    return { h: bottom - top + 1, w: right - left + 1 };
  };
  const di = art.meta.actions.idle, dd = art.meta.actions.death;
  MONSTER_FACINGS.forEach((facing, row) => {
    const a = box(idle, 0, row * di.frameHeight, di.frameWidth, di.frameHeight);
    const b = box(death, 0, row * dd.frameHeight, dd.frameWidth, dd.frameHeight);
    assert.ok(Math.abs(b.h - a.h) <= 3, `${facing}: death frame 1 is ${b.h}px tall, idle ${a.h}px`);
    assert.ok(Math.abs(b.w - a.w) <= 6, `${facing}: death frame 1 is ${b.w}px wide, idle ${a.w}px`);
  });
});
