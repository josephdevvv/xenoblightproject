import Phaser from 'phaser';
import { DEPTH, SCENES } from '../config/constants';
import { PALETTE } from '../config/palette';
import { AssetManager } from '../assets/AssetManager';
import { TextureKeys } from '../assets/TextureKeys';
import { CharacterView } from '../characters/CharacterView';
import { createCharacterData, createDefaultAppearance, type CharacterData } from '../data/CharacterData';
import { CharacterStore } from '../data/CharacterStore';
import { KeyboardMovementInput } from '../player/KeyboardMovementInput';
import { PlayerController } from '../player/PlayerController';
import { MONSTER_DEFINITIONS } from '../monsters/MonsterDefinition';
import { MonsterSpawner } from '../monsters/MonsterSpawner';
import { MONSTER_SPAWNS } from '../monsters/MonsterSpawns';
import { CharacterStatusService } from '../status/CharacterStatusService';
import { t } from '../i18n';
import { GameServices, type Services } from '../systems/GameServices';
import type { GameUIScene } from './GameUIScene';
import { VisibilityCuller } from '../systems/performance/VisibilityCuller';
import { StableCameraFollow } from '../render/StableCameraFollow';
import { GameHud } from '../ui/GameHud';
import { DungeonHud } from '../ui/hud/DungeonHud';
import { StatusWindow } from '../ui/StatusWindow';
import { LoadingScreen } from '../ui/LoadingScreen';
import { AtmosphereEffects } from '../world/AtmosphereEffects';
import type { IsometricMap } from '../world/IsometricMap';
import { DEFAULT_MAP_ID } from '../world/loading/MapRegistry';

const CULLING_DEBUG_SOURCE = 'Culling';
const MONSTER_DEBUG_SOURCE = 'Monsters';
/** Minimum distance (world px, rendered coordinates) between a monster and the player spawn. */
const MONSTER_MIN_SPAWN_DISTANCE_PX = 20;

/**
 * First playable map. Loading goes through MapLoadingManager (PRELOAD -> PREPARE -> BUILD ->
 * TRANSITION -> CLEANUP) while the player's sprite sheets load in parallel; the world becomes
 * interactive only when both are ready.
 */
export class GameScene extends Phaser.Scene {
  map!: IsometricMap;
  player!: PlayerController;
  private atmosphere!: AtmosphereEffects;
  private hud!: GameHud;
  private culler!: VisibilityCuller;
  private cameraFollow!: StableCameraFollow;
  monsters!: MonsterSpawner;
  private loading!: LoadingScreen;
  private mapId = DEFAULT_MAP_ID;
  private ready = false;
  private failed = false;
  private leaving = false;

  constructor() {
    super(SCENES.Game);
  }

  create(): void {
    this.ready = false;
    this.failed = false;
    this.leaving = false;
    const character = this.resolveCharacter();

    this.cameras.main.setBackgroundColor(PALETTE.void);
    this.loading = new LoadingScreen(this).show(t('world.entering'));

    const onEscape = (): void => {
      // An open UI window (Status) closes first; otherwise ESC keeps its original meaning.
      const ui = this.scene.get(SCENES.GameUI) as GameUIScene;
      if (this.scene.isActive(SCENES.GameUI) && ui.closeWindows()) return;
      this.returnToCreation();
    };
    this.input.keyboard?.on('keydown-ESC', onEscape);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.ready = false;
      this.input.keyboard?.off('keydown-ESC', onEscape);
      this.scene.stop(SCENES.GameUI);
      const services = GameServices.tryGet();
      services?.debugSources.delete(CULLING_DEBUG_SOURCE);
      services?.debugSources.delete(MONSTER_DEBUG_SOURCE);
      services?.cache.releaseOwner(this.monsterOwner());
      services?.maps.exit(this.mapId);
    });

    void this.loadWorld(character);
  }

  update(_time: number, delta: number): void {
    if (!this.ready) return;
    this.player.update(delta);
    // Camera first, then draw the player and its name plate at camera-stable whole pixels.
    const feet = this.player.getWorldPosition();
    this.cameraFollow.update(feet.x, feet.y, delta);
    this.player.view.setRenderPosition(this.cameraFollow.renderX(feet.x), this.cameraFollow.renderY(feet.y));
    this.monsters.update(delta, this.cameras.main, GameServices.get().performance);
    this.map.updateOcclusion(this.player.getFootprint(), this.player.getScreenRect(), delta);
    this.atmosphere.update(delta);
    this.culler.update();
    this.hud.update(this.player.view);
  }

  private async loadWorld(character: CharacterData): Promise<void> {
    const services = await GameServices.ready();
    try {
      const [prepared] = await Promise.all([
        services.maps.enter(this, this.mapId, { onProgress: (p) => this.loading.setProgress(p) }),
        AssetManager.ensureCharacterSheets(this, character.appearance, { walk: true }),
        this.loadMonsterTextures(services),
        DungeonHud.load(),
        StatusWindow.load(),
      ]);
      if (!this.sys.isActive()) return;
      this.map = prepared.map;
      this.setupWorld(character, services);
      this.loading.hide();
      this.cameras.main.fadeIn(500, 0, 0, 0);
      this.ready = true;
      // Screen-space UI (HUD + Status window) lives in its own overlay scene so UI clicks never
      // reach the world.
      this.scene.launch(SCENES.GameUI, { characterId: character.id });
    } catch (error) {
      if (!this.sys.isActive()) return;
      console.error('[GameScene] map load failed', error);
      this.failed = true;
      this.loading.showError(t('world.mapLoadFailed'), t('world.mapLoadFailedHint'));
    }
  }

  private setupWorld(character: CharacterData, services: Services): void {
    const bounds = this.map.getWorldBounds();

    // Atmosphere: counts were tuned for the original 2240 x 1288 world; keep the same density on larger maps.
    const density = Math.max(1, (bounds.width * bounds.height) / (2240 * 1288));
    const n = (count: number): number => Math.round(count * density);
    this.atmosphere = new AtmosphereEffects(this, bounds)
      .addDriftLayer({ textureKey: TextureKeys.fx.cloud, count: n(6), depth: DEPTH.CloudShadow, scale: [9, 13], alpha: [0.16, 0.24], speed: [6, 12] })
      .addDriftLayer({ textureKey: TextureKeys.fx.fog, count: n(14), depth: DEPTH.GroundFx, scale: [5, 8], alpha: [0.05, 0.09], speed: [5, 12] })
      .addDriftLayer({ textureKey: TextureKeys.fx.fog, count: n(8), depth: DEPTH.HighFog, scale: [7, 11], alpha: [0.025, 0.05], speed: [8, 16] })
      .addVignette();
    for (const p of this.map.getSmokeSources()) this.atmosphere.addSmoke(p.x, p.y, p.y + 1);
    for (const o of this.map.obstacles) {
      if (o.definition.glow) {
        const g = o.definition.glow;
        this.atmosphere.addGlow(o.world.x, o.world.y + g.offsetY, o.world.y - 1, g.scale, g.alpha);
      }
    }

    // Player
    const spawn = this.map.getSpawnPoint();
    const spawnWorld = this.map.tileToWorld(spawn.x, spawn.y);
    const view = new CharacterView(this, character.appearance, spawnWorld.x, spawnWorld.y);
    this.player = new PlayerController(this.map, view, new KeyboardMovementInput(this), spawn);

    // Monsters: static visual entities, validated against the map and the player spawn.
    this.monsters = new MonsterSpawner(this, this.map);
    this.monsters.spawn(MONSTER_SPAWNS[this.mapId] ?? [], {
      avoid: { world: spawnWorld, minDistancePx: MONSTER_MIN_SPAWN_DISTANCE_PX },
      reserved: [this.player.getFootprint()],
    });

    // Camera
    const cam = this.cameras.main;
    cam.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
    // Smooth follow (same 0.12 lerp, view 24 px above the feet) without pixel jitter - see StableCameraFollow.
    cam.setRoundPixels(true);
    this.cameraFollow = new StableCameraFollow(cam, { lerp: 0.12, offsetY: -24 });
    this.cameraFollow.update(spawnWorld.x, spawnWorld.y, 0);
    view.setRenderPosition(this.cameraFollow.renderX(spawnWorld.x), this.cameraFollow.renderY(spawnWorld.y));

    // Visibility management: static map images, and smoke that pauses (not resets) off-screen.
    this.culler = new VisibilityCuller(cam);
    for (const image of this.map.getStaticImages()) this.culler.add(image);
    // Monsters only go to the culler when they can never move.
    for (const monster of this.monsters.getMonsters()) if (!monster.moves) this.culler.add(monster.sprite);
    for (const s of this.atmosphere.smokeEmitters) {
      const smokeBounds = new Phaser.Geom.Rectangle(s.x - 64, s.y - 240, 128, 260);
      this.culler.add(s.emitter, smokeBounds, (visible) => (visible ? s.emitter.resume() : s.emitter.pause()));
    }
    this.culler.update(true);
    services.debugSources.set(CULLING_DEBUG_SOURCE, () => {
      const c = this.culler.getStats();
      return `${c.visible} / ${c.total} static objects drawn`;
    });
    services.debugSources.set(MONSTER_DEBUG_SOURCE, () => {
      const list = this.monsters.getMonsters();
      return `${list.length} (${[...new Set(list.map((m) => m.definition.id))].join(', ')})`;
    });

    // HUD
    this.hud = new GameHud(this, character);
    this.hud.update(this.player.view);
  }

  /** Loads (once) every monster sprite used by this map's spawn table and holds it while the map is shown. */
  private async loadMonsterTextures(services: Services): Promise<void> {
    const ids = [...new Set((MONSTER_SPAWNS[this.mapId] ?? []).map((p) => p.monster))];
    const keys = await Promise.all(ids.map((id) => AssetManager.ensureMonsterTexture(this, MONSTER_DEFINITIONS[id])));
    for (const key of keys) services.cache.retain(key, this.monsterOwner());
  }

  private monsterOwner(): string {
    return `monsters:${this.mapId}`;
  }

  /** Normally set by character creation; falls back to a default for direct scene testing. */
  private resolveCharacter(): CharacterData {
    const active = CharacterStore.getActive();
    if (active) return active;
    const fallback = createCharacterData('Wanderer', createDefaultAppearance());
    CharacterStatusService.loadInto(fallback);
    CharacterStore.add(fallback);
    CharacterStore.setActive(fallback.id);
    return fallback;
  }

  private returnToCreation(): void {
    if (this.leaving || (!this.ready && !this.failed)) return;
    this.leaving = true;
    this.scene.stop(SCENES.GameUI);
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(SCENES.CharacterCreation);
    });
  }
}
