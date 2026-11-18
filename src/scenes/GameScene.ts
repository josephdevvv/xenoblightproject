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
import { GameServices, type Services } from '../systems/GameServices';
import { VisibilityCuller } from '../systems/performance/VisibilityCuller';
import { GameHud } from '../ui/GameHud';
import { LoadingScreen } from '../ui/LoadingScreen';
import { AtmosphereEffects } from '../world/AtmosphereEffects';
import type { IsometricMap } from '../world/IsometricMap';
import { DEFAULT_MAP_ID } from '../world/loading/MapRegistry';

const CULLING_DEBUG_SOURCE = 'Culling';

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
    this.loading = new LoadingScreen(this).show('ENTERING');

    const onEscape = (): void => this.returnToCreation();
    this.input.keyboard?.on('keydown-ESC', onEscape);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.ready = false;
      this.input.keyboard?.off('keydown-ESC', onEscape);
      const services = GameServices.tryGet();
      services?.debugSources.delete(CULLING_DEBUG_SOURCE);
      services?.maps.exit(this.mapId);
    });

    void this.loadWorld(character);
  }

  update(_time: number, delta: number): void {
    if (!this.ready) return;
    this.player.update(delta);
    this.map.updateOcclusion(this.player.getFootprint(), this.player.getScreenRect(), delta);
    this.atmosphere.update(delta);
    this.culler.update();
    this.hud.update(this.player);
  }

  private async loadWorld(character: CharacterData): Promise<void> {
    const services = await GameServices.ready();
    try {
      const [prepared] = await Promise.all([
        services.maps.enter(this, this.mapId, { onProgress: (p) => this.loading.setProgress(p) }),
        AssetManager.ensureCharacterSheets(this, character.appearance, { walk: true }),
      ]);
      if (!this.sys.isActive()) return;
      this.map = prepared.map;
      this.setupWorld(character, services);
      this.loading.hide();
      this.cameras.main.fadeIn(500, 0, 0, 0);
      this.ready = true;
    } catch (error) {
      if (!this.sys.isActive()) return;
      console.error('[GameScene] map load failed', error);
      this.failed = true;
      this.loading.showError('FAILED TO LOAD MAP', 'Press ESC to return to character creation');
    }
  }

  private setupWorld(character: CharacterData, services: Services): void {
    const bounds = this.map.getWorldBounds();

    // Atmosphere
    this.atmosphere = new AtmosphereEffects(this, bounds)
      .addDriftLayer({ textureKey: TextureKeys.fx.cloud, count: 6, depth: DEPTH.CloudShadow, scale: [9, 13], alpha: [0.16, 0.24], speed: [6, 12] })
      .addDriftLayer({ textureKey: TextureKeys.fx.fog, count: 14, depth: DEPTH.GroundFx, scale: [5, 8], alpha: [0.05, 0.09], speed: [5, 12] })
      .addDriftLayer({ textureKey: TextureKeys.fx.fog, count: 8, depth: DEPTH.HighFog, scale: [7, 11], alpha: [0.025, 0.05], speed: [8, 16] })
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

    // Camera
    const cam = this.cameras.main;
    cam.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
    cam.startFollow(view.sprite, true, 0.12, 0.12);
    cam.setFollowOffset(0, 24);
    cam.setRoundPixels(true);

    // Visibility management: static map images, and smoke that pauses (not resets) off-screen.
    this.culler = new VisibilityCuller(cam);
    for (const image of this.map.getStaticImages()) this.culler.add(image);
    for (const s of this.atmosphere.smokeEmitters) {
      const smokeBounds = new Phaser.Geom.Rectangle(s.x - 64, s.y - 240, 128, 260);
      this.culler.add(s.emitter, smokeBounds, (visible) => (visible ? s.emitter.resume() : s.emitter.pause()));
    }
    this.culler.update(true);
    services.debugSources.set(CULLING_DEBUG_SOURCE, () => {
      const c = this.culler.getStats();
      return `${c.visible} / ${c.total} static objects drawn`;
    });

    // HUD
    this.hud = new GameHud(this, character, this.map.definition.name);
    this.hud.update(this.player);
  }

  /** Normally set by character creation; falls back to a default for direct scene testing. */
  private resolveCharacter(): CharacterData {
    const active = CharacterStore.getActive();
    if (active) return active;
    const fallback = createCharacterData('Wanderer', createDefaultAppearance());
    CharacterStore.add(fallback);
    CharacterStore.setActive(fallback.id);
    return fallback;
  }

  private returnToCreation(): void {
    if (this.leaving || (!this.ready && !this.failed)) return;
    this.leaving = true;
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(SCENES.CharacterCreation);
    });
  }
}
