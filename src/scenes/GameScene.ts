import Phaser from 'phaser';
import { DEPTH, SCENES } from '../config/constants';
import { PALETTE } from '../config/palette';
import { TextureKeys } from '../assets/TextureKeys';
import { CharacterView } from '../characters/CharacterView';
import { createCharacterData, createDefaultAppearance, type CharacterData } from '../data/CharacterData';
import { CharacterStore } from '../data/CharacterStore';
import { KeyboardMovementInput } from '../player/KeyboardMovementInput';
import { PlayerController } from '../player/PlayerController';
import { GameHud } from '../ui/GameHud';
import { AtmosphereEffects } from '../world/AtmosphereEffects';
import { IsometricMap } from '../world/IsometricMap';
import { TEST_MAP } from '../world/MapData';

/** First playable map: isometric ground, props, atmosphere and the controllable player. */
export class GameScene extends Phaser.Scene {
  map!: IsometricMap;
  player!: PlayerController;
  private atmosphere!: AtmosphereEffects;
  private hud!: GameHud;
  private leaving = false;

  constructor() {
    super(SCENES.Game);
  }

  create(): void {
    this.leaving = false;
    const character = this.resolveCharacter();

    this.cameras.main.setBackgroundColor(PALETTE.void);

    // World
    this.map = new IsometricMap(TEST_MAP);
    this.map.build(this);
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
    cam.fadeIn(500, 0, 0, 0);

    // HUD
    this.hud = new GameHud(this, character, this.map.definition.name);
    this.hud.update(this.player);

    const onEscape = (): void => this.returnToCreation();
    this.input.keyboard?.on('keydown-ESC', onEscape);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown-ESC', onEscape));
  }

  update(_time: number, delta: number): void {
    this.player.update(delta);
    this.map.updateOcclusion(this.player.getFootprint(), this.player.getScreenRect(), delta);
    this.atmosphere.update(delta);
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
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(SCENES.CharacterCreation);
    });
  }
}
