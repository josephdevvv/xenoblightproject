import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { MONSTER_ACTIONS, MONSTER_ART, MONSTER_FACINGS, facingForDirection, type MonsterArtId } from '../src/monsters/art/MonsterArt';
import { MONSTER_DEFINITIONS } from '../src/monsters/MonsterDefinition';
import { readPng, type Rgba } from './helpers/png';

const PUBLIC = path.join(process.cwd(), 'public');
const SOURCE: Record<MonsterArtId, { dir: string; folders: Record<string, string>; vfx: string; frames?: true; directionFirst?: true }> = {
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
  dark_avian: {
    dir: 'art-source/monsters/dark_avian',
    folders: { idle: '01_idle_4dir', walk: '02_flight_4dir', attack: '04_attack_mouth_vfx_4dir', hit: '05_hit_4dir', death: '06_death_4dir' },
    vfx: '07_stomp_impact_vfx_4dir',
    frames: true,
  },
  mutant_boar: {
    dir: 'art-source/monsters/mutant_boar',
    folders: { idle: 'idle', walk: 'walk', attack: 'stomp', hit: 'hit', death: 'death' },
    vfx: 'shared/vfx_ground_spikes',
    directionFirst: true,
  },
};
/** Actions the import tool rescales to the idle body size (delivered at the wrong scale). */
const RESCALED: Partial<Record<MonsterArtId, string[]>> = { void_mite: ['death'] };
const PACK_DIRS = { SE: 'south_east', SW: 'south_west', NE: 'north_east', NW: 'north_west' } as const;

function packSheet(id: MonsterArtId, folder: string, facing: keyof typeof PACK_DIRS): Rgba {
  if (SOURCE[id].directionFirst) {
    // <direction>/<action>/sprite_sheet.png, or one shared sheet for every facing
    const own = path.join(process.cwd(), SOURCE[id].dir, PACK_DIRS[facing], folder, 'sprite_sheet.png');
    return readPng(fs.existsSync(own) ? own : path.join(process.cwd(), SOURCE[id].dir, folder, 'sprite_sheet.png'));
  }
  if (SOURCE[id].frames) {
    // one PNG per frame: the delivered frames side by side, in their order
    const dir = path.join(process.cwd(), SOURCE[id].dir, folder, 'frames', PACK_DIRS[facing]);
    const imgs = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort().map((f) => readPng(path.join(dir, f)));
    const w = imgs[0].width, h = imgs[0].height;
    const data = new Uint8Array(w * imgs.length * h * 4);
    imgs.forEach((img, i) => { for (let y = 0; y < h; y++) data.set(img.data.subarray(y * w * 4, (y + 1) * w * 4), (y * w * imgs.length + i * w) * 4); });
    return { width: w * imgs.length, height: h, data };
  }
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
    const flying = MONSTER_DEFINITIONS[Object.values(MONSTER_DEFINITIONS).find((d) => d.art === id)!.id].flight;
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
          if (flying) {
            // a flyer's root is its body line in the air: the death clip falls towards the ground (at most the
            // flying height), wing beats and dives may dip a few px below the line
            const below = action === 'death' ? flying.heightPx : 4;
            assert.ok(gap >= -below && gap <= limit + 4, `${action} ${facing} frame ${f + 1}: ${gap}px from the body line`);
            continue;
          }
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

test('Dark Avian: Zone 3 flyer - 32 px up, HP / ATK 1.7x the Mutant Wolf, 5 s respawn, art as delivered', () => {
  const v = MONSTER_DEFINITIONS.dark_avian;
  const w = MONSTER_DEFINITIONS.mutant_wolf;
  assert.deepEqual([v.id, v.displayName, v.art], ['dark_avian', 'Dark Avian', 'dark_avian']);
  assert.deepEqual(v.flight, { heightPx: 32, bobPx: 2, bobPeriodMs: 1600 });
  assert.equal(w.flight, undefined, 'the other monsters walk');
  assert.equal(v.combat.maxHp, Math.round(w.combat.maxHp * 1.7));
  assert.equal(v.combat.atk, Math.round(w.combat.atk * 1.7));
  assert.equal(v.combat.respawnMs, 5000);
  assert.deepEqual([w.combat.maxHp, w.combat.atk, w.combat.def, w.combat.hit, w.combat.flee, w.combat.attackIntervalMs], [45, 23, 2, 200, 85, 1900], 'the wolf is unchanged');
  const art = MONSTER_ART.dark_avian;
  assert.equal(art.meta.name, 'Dark Avian');
  assert.deepEqual(MONSTER_ACTIONS.map((a) => [a, art.meta.actions[a].frames, art.meta.actions[a].frameWidth, art.meta.actions[a].frameHeight]), [
    ['idle', 1, 32, 64],
    ['walk', 4, 32, 64],
    ['attack', 6, 64, 64],
    ['hit', 4, 32, 64],
    ['death', 6, 32, 64],
  ]);
  assert.deepEqual([art.meta.vfx.frames, art.meta.vfx.frameWidth, art.meta.vfx.frameHeight], [3, 32, 32]);
  assert.equal(art.impactFrame, 4, 'the hit lands on frame 4 (the mouth effect starts there)');
  // the delivered frames already leave the lower half of the 64 px cell empty: the root is the body line, so the
  // runtime lift of 32 px puts the empty half on the ground - never a second, doubled offset
  for (const facing of MONSTER_FACINGS) assert.equal(art.meta.actions.idle.anchors[facing].y, 31);
  assert.ok(64 - art.meta.actions.idle.anchors.SE.y >= v.flight!.heightPx);
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

test('Mutant Boar: Zone 4 ground monster - specified stats, the Mutant Wolf\'s movement / collision / AI rules, stomp hits on frame 6', () => {
  const b = MONSTER_DEFINITIONS.mutant_boar;
  const w = MONSTER_DEFINITIONS.mutant_wolf;
  assert.deepEqual([b.id, b.displayName, b.art, b.category], ['mutant_boar', 'Mutant Boar', 'mutant_boar', 'monster']);
  assert.deepEqual([b.combat.level, b.combat.maxHp, b.combat.atk, b.combat.hit, b.combat.respawnMs], [7, 100, 42, 150, 5000]);
  assert.equal(b.flight, undefined, 'ground');
  assert.equal(b.footprintRadius, w.footprintRadius, 'same collision');
  assert.deepEqual(b.behavior, w.behavior, 'same wandering');
  const { level: _l1, maxHp: _h1, atk: _a1, hit: _x1, ...rest } = b.combat;
  const { level: _l2, maxHp: _h2, atk: _a2, hit: _x2, ...wolfRest } = w.combat;
  assert.deepEqual(rest, wolfRest, 'DEF, FLEE, attack speed, reach, chase, leash, respawn: the wolf\'s');
  assert.deepEqual([w.combat.level, w.combat.maxHp, w.combat.atk, w.combat.hit], [3, 45, 23, 200], 'Mutant Wolf unchanged');
  const art = MONSTER_ART.mutant_boar;
  assert.deepEqual(MONSTER_ACTIONS.map((a) => art.meta.actions[a].frames), [1, 6, 8, 4, 6]);
  assert.equal(art.impactFrame, 6, 'damage on the Stomp\'s 6th frame (1-based)');
  assert.deepEqual(art.timing, MONSTER_ART.mutant_wolf.timing, 'the wolf\'s playback rules');
  assert.deepEqual(art.hitTintFrames, MONSTER_ART.mutant_wolf.hitTintFrames);
  // the pack's own ground lines: walk frames stand 3 px lower in their cell than idle
  const pack = (dir: string, action: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'art-source/monsters/mutant_boar', dir, action, 'animation.json'), 'utf8'));
  for (const [facing, dir] of Object.entries(PACK_DIRS)) {
    for (const [action, folder] of Object.entries(SOURCE.mutant_boar.folders)) {
      assert.equal(art.meta.actions[action as keyof typeof art.meta.actions].anchors[facing as keyof typeof PACK_DIRS].y, pack(dir, folder).ground_y + 1, `${action} ${facing}: on the pack's ground line`);
    }
    assert.equal(pack(dir, 'stomp').impact_frame, art.impactFrame, 'the pack names the same contact frame');
  }
  // the shared 4-frame ground-spike VFX, copied unchanged into every facing's row
  const vfx = readPng(path.join(PUBLIC, art.basePath, art.meta.vfx.file));
  const src = readPng(path.join(process.cwd(), 'art-source/monsters/mutant_boar/shared/vfx_ground_spikes/sprite_sheet.png'));
  for (let row = 0; row < 4; row++) {
    const bytes = src.width * src.height * 4;
    assert.ok(Buffer.from(vfx.data.buffer, vfx.data.byteOffset + row * bytes, bytes).equals(Buffer.from(src.data)), `VFX row ${row}`);
  }
});
