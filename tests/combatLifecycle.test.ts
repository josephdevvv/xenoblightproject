import assert from 'node:assert/strict';
import { test } from 'node:test';
import type Phaser from 'phaser';
import { loadPlayerCombatAssets } from '../src/characters/combat/PlayerCombatAssets';
import { PLAYER_COMBAT_ACTIONS, PLAYER_COMBAT_SETS, PLAYER_IMPACT_VFX, PLAYER_OPTIONAL_COMBAT_ACTIONS, playerCombatAnimKey, playerCombatSheetKey } from '../src/characters/combat/PlayerCombatArt';
import { DRIFTER_RED_STAB, skillVfxAnimKey } from '../src/characters/combat/SkillVfxArt';
import { HEAL_GREEN } from '../src/combat/vfx/HealVfxArt';
import { GameServices, type Services } from '../src/systems/GameServices';
import { DEFAULT_GC_GRACE_MS, ResourceCacheManager } from '../src/systems/ResourceCacheManager';

const MOHAWK = 'char_male_mohawk_blonde_drifter';
const BALD = 'char_male_bald_none_drifter';
const OWNER = 'player-combat';
const SET = PLAYER_COMBAT_SETS[MOHAWK];
// the 4 required sheets + the optional ones this export has (Mohawk Blonde r2: unarmed_punch)
const COMBAT_ACTIONS = [...PLAYER_COMBAT_ACTIONS, ...PLAYER_OPTIONAL_COMBAT_ACTIONS.filter((a) => SET.optional[a])];
const COMBAT_KEYS = COMBAT_ACTIONS.map((a) => playerCombatSheetKey(SET, a));
const HEAL_LAYERS = [HEAL_GREEN.layers.behind, HEAL_GREEN.layers.front];
const ALL_KEYS = [PLAYER_IMPACT_VFX.key, DRIFTER_RED_STAB.key, ...HEAL_LAYERS.map((l) => l.key), ...COMBAT_KEYS];
/** The shared player VFX animations (every character): the impact, the Drifter red stab's four facings and the heal's two layers. */
const SHARED_ANIMS = [PLAYER_IMPACT_VFX.animKey, ...DRIFTER_RED_STAB.rows.map((f) => skillVfxAnimKey(DRIFTER_RED_STAB, f)), ...HEAL_LAYERS.map((l) => l.animKey)];

interface FakeFrame {
  name: number;
  /** Phaser nulls a frame's data when its texture is destroyed: playing it crashes. */
  data: object | null;
}

/** The parts of Phaser involved, with its behaviour: removing a texture destroys its frames, animations keep them. */
class World {
  now = 0;
  loads: string[] = [];
  failing = new Set<string>();
  /** Runs while the loader is busy (map entry cleans the cache at the same time). */
  duringLoad: (() => void) | null = null;
  private readonly tex = new Map<string, FakeFrame[]>();
  private readonly anim = new Map<string, { key: string; frames: { textureKey: string; textureFrame: number; frame: FakeFrame; duration: number }[] }>();
  readonly cache: ResourceCacheManager;
  readonly scene: Phaser.Scene;

  constructor() {
    const textures = {
      exists: (k: string) => this.tex.has(k),
      getFrame: (k: string, f: number) => this.tex.get(k)?.[f] ?? null,
      getTextureKeys: () => [...this.tex.keys()],
      remove: (k: string) => {
        for (const f of this.tex.get(k) ?? []) f.data = null;
        this.tex.delete(k);
      },
    };
    const anims = {
      exists: (k: string) => this.anim.has(k),
      get: (k: string) => this.anim.get(k),
      remove: (k: string) => void this.anim.delete(k),
      generateFrameNumbers: (key: string, { start, end }: { start: number; end: number }) => Array.from({ length: end - start + 1 }, (_, i) => ({ key, frame: start + i })),
      create: (c: { key: string; frames: { key: string; frame: number; duration?: number }[] }) => {
        assert.ok(!this.anim.has(c.key), `animation ${c.key} registered twice`);
        this.anim.set(c.key, {
          key: c.key,
          frames: c.frames.map((f) => {
            const frame = textures.getFrame(f.key, f.frame);
            assert.ok(frame, `${c.key}: frame ${f.frame} of ${f.key} exists`);
            return { textureKey: f.key, textureFrame: f.frame, frame, duration: f.duration ?? 0 };
          }),
        });
      },
    };
    this.cache = new ResourceCacheManager(textures as unknown as Phaser.Textures.TextureManager, () => this.now);
    this.scene = { textures, anims } as unknown as Phaser.Scene;
    GameServices.install({
      cache: this.cache,
      assets: {
        loadAll: async (requests: { key: string }[]) => {
          const result = { loaded: [] as string[], failed: [] as { key: string; error: string }[] };
          await Promise.resolve();
          this.duringLoad?.();
          for (const { key } of requests) {
            this.loads.push(key);
            if (this.failing.has(key)) result.failed.push({ key, error: 'x' });
            else this.tex.set(key, Array.from({ length: 64 }, (_, name) => ({ name, data: {} })));
          }
          return result;
        },
      },
    } as unknown as Services);
  }

  /** Entering the game: the loader and the map's cache cleanup run side by side, as in GameScene.loadWorld. */
  async enter(spriteId = MOHAWK): Promise<unknown> {
    const loading = loadPlayerCombatAssets(this.scene, spriteId, OWNER);
    const cleanup = (async () => {
      for (let i = 0; i < 6; i++) await Promise.resolve();
      this.cache.collectGarbage();
    })();
    const [set] = await Promise.all([loading, cleanup]);
    this.cache.collectGarbage();
    return set;
  }

  /** Back to character creation. */
  leave(): void {
    this.cache.releaseOwner(OWNER);
  }

  /** What sprite.play does with the first frames: throws when a frame is destroyed. */
  play(key: string): void {
    const a = this.anim.get(key);
    assert.ok(a, `animation ${key} is missing`);
    for (const f of a.frames) if (!f.frame.data) throw new Error(`${key}: plays a destroyed frame`);
    for (const f of a.frames) assert.equal(f.frame, this.tex.get(f.textureKey)?.[f.textureFrame], `${key}: frame of the texture loaded now`);
  }

  playEverything(withCombatArt = true): void {
    for (const key of SHARED_ANIMS) this.play(key);
    if (withCombatArt) for (const action of PLAYER_COMBAT_ACTIONS) for (const facing of SET.actions[action].rows) this.play(playerCombatAnimKey(SET, action, facing));
    if (withCombatArt) for (const action of PLAYER_OPTIONAL_COMBAT_ACTIONS) for (const facing of SET.optional[action]?.rows ?? []) this.play(playerCombatAnimKey(SET, action, facing));
  }

  get animationKeys(): string[] {
    return [...this.anim.keys()].sort();
  }

  get textureKeys(): string[] {
    return [...this.tex.keys()].sort();
  }
}

test('the reported crash: play > 30 s, leave, re-enter, attack at once - every clip and the impact still play', async () => {
  const w = new World();
  assert.equal(await w.enter(), SET);
  w.playEverything();
  w.now += 33_000;
  w.leave();
  await w.enter();
  w.playEverything();
  for (const k of ALL_KEYS) assert.ok(w.cache.isInUse(k), `${k} is owned while playing`);
});

test('textures in use are never evicted, however long the session; nothing is reloaded needlessly', async () => {
  const w = new World();
  await w.enter();
  for (let minute = 0; minute < 120; minute++) {
    w.now += 60_000;
    assert.deepEqual(w.cache.collectGarbage(), [], `minute ${minute}`);
  }
  w.playEverything();
  w.leave();
  await w.enter();
  assert.equal(w.loads.length, ALL_KEYS.length, 'a quick return reuses the textures');
});

test('long break in character creation: cleanup during entry never takes a texture the loader found ready', async () => {
  const w = new World();
  await w.enter();
  w.leave();
  w.now += 10 * DEFAULT_GC_GRACE_MS;
  await w.enter();
  w.playEverything();
  assert.equal(w.loads.length, ALL_KEYS.length, 'still there: not evicted in between, not reloaded');
});

test('cleanup while other sheets are still loading does not take the ready ones', async () => {
  const w = new World();
  await w.enter(BALD); // only the impact VFX
  w.leave();
  w.now += 10 * DEFAULT_GC_GRACE_MS;
  w.duringLoad = () => w.cache.collectGarbage();
  await w.enter(MOHAWK);
  w.playEverything();
});

test('unused art is still cleaned up - with its animations - and rebuilt when it is needed again', async () => {
  const w = new World();
  await w.enter(MOHAWK);
  const all = w.animationKeys;
  assert.equal(all.length, SHARED_ANIMS.length + COMBAT_ACTIONS.length * 4, 'every combat clip (4 facings each) + the impact + the red stab');
  w.leave();
  await w.enter(BALD);
  assert.ok(COMBAT_KEYS.every((k) => w.textureKeys.includes(k)), 'kept during the grace period');
  w.now += DEFAULT_GC_GRACE_MS + 1;
  assert.deepEqual(w.cache.collectGarbage().sort(), [...COMBAT_KEYS].sort(), 'the Mohawk sheets are freed, the shared impact is not');
  assert.deepEqual(w.animationKeys, [...SHARED_ANIMS].sort(), 'no animation is left pointing at them');
  w.playEverything(false);
  w.leave();
  w.now += DEFAULT_GC_GRACE_MS + 1;
  w.cache.collectGarbage();
  assert.deepEqual([w.textureKeys, w.animationKeys], [[], []], 'everything can be freed');
  await w.enter(MOHAWK);
  w.playEverything();
  assert.deepEqual(w.animationKeys, all, 'same animations, no duplicates');
});

test('many transitions between characters: nothing accumulates, everything always plays', async () => {
  const w = new World();
  let seed = 5;
  for (let i = 0; i < 200; i++) {
    seed = (seed * 16807) % 2147483647;
    const mohawk = seed % 2 === 0;
    const set = await w.enter(mohawk ? MOHAWK : BALD);
    assert.equal(set, mohawk ? SET : null);
    w.playEverything(mohawk);
    w.now += seed % 70_000;
    w.leave();
    if (seed % 3 === 0) w.now += seed % 90_000;
    assert.ok(w.textureKeys.length <= ALL_KEYS.length && w.animationKeys.length <= SHARED_ANIMS.length + COMBAT_ACTIONS.length * 4, `round ${i}`);
    const { tracked, inUse } = w.cache.stats();
    assert.ok(tracked <= ALL_KEYS.length && inUse === 0, 'nobody holds anything in character creation');
  }
});

test('a texture removed behind the cache\'s back: its stale animation is rebuilt on entry, never played', async () => {
  const w = new World();
  await w.enter();
  w.leave();
  w.scene.textures.remove(PLAYER_IMPACT_VFX.key);
  w.scene.textures.remove(COMBAT_KEYS[1]);
  assert.throws(() => w.play(PLAYER_IMPACT_VFX.animKey), /destroyed frame/, 'the stand-in crashes like Phaser');
  await w.enter();
  w.playEverything();
});

test('a sheet that fails to load: no combat set, nothing held for it, the rest still works, a retry succeeds', async () => {
  const w = new World();
  w.failing.add(COMBAT_KEYS[0]);
  const warn = console.warn;
  console.warn = () => undefined;
  try {
    assert.equal(await w.enter(), null);
  } finally {
    console.warn = warn;
  }
  assert.equal(w.cache.isInUse(COMBAT_KEYS[0]), false);
  w.play(PLAYER_IMPACT_VFX.animKey);
  w.leave();
  w.failing.clear();
  assert.equal(await w.enter(), SET);
  w.playEverything();
});

test('impact timing is unchanged: 60 / 60 / 70 / 80 ms', async () => {
  const w = new World();
  await w.enter(BALD);
  const a = w.scene.anims.get(PLAYER_IMPACT_VFX.animKey);
  assert.deepEqual(a.frames.map((f) => 60 + f.duration), [60, 60, 70, 80]);
});
