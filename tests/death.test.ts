import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { SPRITE_FORGE_CHARACTER_VARIANTS } from '../src/assets/SpriteForgeCharacters';
import { dissolveNoise, dissolvePixels, ghostPixels, ghostRowKeep, GHOST_OPTIONS, opaqueRows } from '../src/player/death/GhostPixels';
import { DEAD_ALLOWED_ACTIONS, PlayerLife, type PlayerAction } from '../src/player/death/PlayerLifeState';
import { readPng } from './helpers/png';

const ALL_ACTIONS: PlayerAction[] = ['move', 'attack', 'cast', 'interact', 'loot', 'useItem', 'openWindow', 'chat'];

// ------------------------------------------------------------------------------------------ life state

test('life: alive -> dying -> dead -> respawning -> alive; HP 0 twice starts death only once', () => {
  const life = new PlayerLife();
  const seen: string[] = [];
  life.onChange((s) => seen.push(s));
  assert.equal(life.state, 'alive');
  assert.equal(life.die(), true);
  assert.equal(life.die(), false, 'a second HP-0 while dying is ignored');
  assert.equal(life.requestRespawn(), false, 'no respawn before the transition ends');
  assert.equal(life.finishDying(), true);
  assert.equal(life.die(), false, 'dead: cannot die again');
  assert.equal(life.finishDying(), false);
  assert.equal(life.requestRespawn(), true);
  assert.equal(life.requestRespawn(), false, 'duplicate respawn click ignored');
  assert.equal(life.finishRespawn(), true);
  assert.equal(life.finishRespawn(), false);
  assert.deepEqual(seen, ['dying', 'dead', 'respawning', 'alive']);
  assert.equal(life.deaths, 1);
  assert.equal(life.respawns, 1);
});

test('life: only chat is allowed while not alive; everything while alive; repeated cycles stay clean', () => {
  assert.deepEqual([...DEAD_ALLOWED_ACTIONS], ['chat']);
  const life = new PlayerLife();
  for (const a of ALL_ACTIONS) assert.equal(life.canPerform(a), true, `alive: ${a}`);
  for (let cycle = 1; cycle <= 5; cycle++) {
    life.die();
    for (const s of ['dying', 'dead', 'respawning'] as const) {
      assert.equal(life.state, s);
      for (const a of ALL_ACTIONS) assert.equal(life.canPerform(a), a === 'chat', `${s}: ${a}`);
      if (s === 'dying') life.finishDying();
      else if (s === 'dead') life.requestRespawn();
      else life.finishRespawn();
    }
    assert.equal(life.state, 'alive');
    assert.equal(life.deaths, cycle);
    assert.equal(life.respawns, cycle);
  }
});

// ---------------------------------------------------------------------------------------------- ghost

function frameOf(img: { width: number; data: Uint8Array }, col: number, row: number, size = 64): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const s = ((row * size + y) * img.width + col * size + x) * 4;
    out.set(img.data.subarray(s, s + 4), (y * size + x) * 4);
  }
  return out;
}

test('ghost row profile: solid upper body, legs fade more than the torso, feet gone', () => {
  const top = 6;
  const bottom = 56;
  let prev = 1;
  for (let y = top; y <= bottom; y++) {
    const k = ghostRowKeep(y, top, bottom);
    assert.ok(k <= prev + 1e-9, 'never increases downward');
    prev = k;
  }
  assert.equal(ghostRowKeep(top + 10, top, bottom), 1, 'head / chest solid');
  assert.ok(ghostRowKeep(top + 30, top, bottom) < 1 && ghostRowKeep(top + 30, top, bottom) > 0, 'waist / thighs fading');
  assert.equal(ghostRowKeep(bottom, top, bottom), 0, 'feet invisible');
  assert.equal(ghostRowKeep(bottom - 6, top, bottom), 0, 'ankles invisible');
});

test('ghost from every approved character (all hairstyles / outfits): same upper silhouette, pale, crisp, no feet', () => {
  for (const v of SPRITE_FORGE_CHARACTER_VARIANTS) {
    const sheet = readPng(path.join(process.cwd(), 'public', v.standing));
    for (const [col, row] of [[0, 0], [1, 0], [3, 1]]) {
      const src = frameOf(sheet, col, row);
      const ghost = ghostPixels(src, 64, 64);
      const rows = opaqueRows(src, 64, 64)!;
      const h = rows.bottom - rows.top;
      const count = (data: Uint8ClampedArray, y0: number, y1: number) => {
        let n = 0;
        for (let y = y0; y <= y1; y++) for (let x = 0; x < 64; x++) if (data[(y * 64 + x) * 4 + 3] >= 128) n++;
        return n;
      };
      const solidEnd = rows.top + Math.floor(h * GHOST_OPTIONS.solidUntil);
      assert.equal(count(ghost, rows.top, solidEnd), count(src, rows.top, solidEnd), `${v.key}: upper body kept pixel for pixel (same silhouette)`);
      const torso = count(ghost, solidEnd + 1, rows.top + Math.floor(h * 0.6)) / Math.max(1, count(src, solidEnd + 1, rows.top + Math.floor(h * 0.6)));
      const legs = count(ghost, rows.top + Math.floor(h * 0.6) + 1, rows.top + Math.floor(h * 0.8)) / Math.max(1, count(src, rows.top + Math.floor(h * 0.6) + 1, rows.top + Math.floor(h * 0.8)));
      assert.ok(torso > legs, `${v.key}: legs fade more than the lower torso (${torso.toFixed(2)} > ${legs.toFixed(2)})`);
      assert.equal(count(ghost, rows.top + Math.ceil(h * GHOST_OPTIONS.goneAt), 63), 0, `${v.key}: feet fully invisible`);
      for (let i = 0; i < ghost.length; i += 4) {
        if (ghost[i + 3] === 0) continue;
        assert.equal(ghost[i + 3], 255, 'hard alpha (crisp pixel art)');
        assert.ok(Math.max(ghost[i], ghost[i + 1], ghost[i + 2]) - Math.min(ghost[i], ghost[i + 1], ghost[i + 2]) <= 12, 'desaturated');
        assert.ok(ghost[i + 1] >= 90, 'pale (no dark pixels)');
        assert.ok(src[i + 3] >= 128, 'only where the character has pixels');
      }
    }
  }
});

test('dissolve: whole at 0, gone at 1, never brings pixels back, pale edge band', () => {
  const sheet = readPng(path.join(process.cwd(), 'public', SPRITE_FORGE_CHARACTER_VARIANTS[0].standing));
  const src = frameOf(sheet, 0, 0);
  const noise = dissolveNoise(64, 64, 7);
  const visible = (d: Uint8ClampedArray) => {
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
  };
  const total = visible(src);
  assert.equal(visible(dissolvePixels(src, noise, 0, 0)), total);
  assert.equal(visible(dissolvePixels(src, noise, 1)), 0);
  let prev = total;
  for (let k = 1; k <= 16; k++) {
    const n = visible(dissolvePixels(src, noise, k / 16));
    assert.ok(n <= prev, 'monotonic');
    prev = n;
  }
  const mid = dissolvePixels(src, noise, 0.5);
  let pale = 0;
  for (let i = 0; i < mid.length; i += 4) if (mid[i + 3] && mid[i] === 214 && mid[i + 1] === 218) pale++;
  assert.ok(pale > 0, 'edge band turns pale');
  assert.deepEqual(dissolveNoise(8, 8, 3), dissolveNoise(8, 8, 3), 'deterministic noise');
});
