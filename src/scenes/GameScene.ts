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
import { MONSTER_DEFINITIONS, type MonsterId } from '../monsters/MonsterDefinition';
import { MonsterSpawner } from '../monsters/MonsterSpawner';
import { MONSTER_SPAWNS } from '../monsters/MonsterSpawns';
import { CharacterStatusService } from '../status/CharacterStatusService';
import { t } from '../i18n';
import { GameServices, type Services } from '../systems/GameServices';
import type { GameUIScene } from './GameUIScene';
import { VisibilityCuller } from '../systems/performance/VisibilityCuller';
import { StableCameraFollow } from '../render/StableCameraFollow';
import { CombatSystem } from '../combat/CombatSystem';
import type { MonsterEntity } from '../monsters/MonsterEntity';
import { ClickMarker } from '../ui/world/ClickMarker';
import { npcSheetKey, npcsOnMap } from '../npcs/NpcDefinition';
import { NpcEntity } from '../npcs/NpcEntity';
import { MONSTER_CURSOR, MonsterCursor } from '../ui/world/MonsterCursor';
import { PLAYER_MOVEMENT } from '../player/PlayerController';
import { GameHud } from '../ui/GameHud';
import { PassiveTreeWindow } from '../ui/passiveTree/PassiveTreeWindow';
import { PlayerDeathController } from '../player/death/PlayerDeathController';
import { AttackVfxLayer } from '../combat/vfx/AttackVfxLayer';
import { getCharacterSpriteId } from '../characters/CharacterAssetIds';
import { PlayerCombatAnimator } from '../characters/combat/PlayerCombatAnimator';
import { loadPlayerCombatAssets } from '../characters/combat/PlayerCombatAssets';
import type { PlayerCombatSet } from '../characters/combat/PlayerCombatArt';
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
  /** Attack / on-hit VFX, drawn on the target's body above every character (DEPTH.AttackVfx). */
  attackVfx!: AttackVfxLayer;
  /** Player combat clips (combat idle / dagger thrust / hit reaction), when the appearance has combat art. */
  playerCombat: PlayerCombatAnimator | null = null;
  private combatSet: PlayerCombatSet | null = null;
  /** Death / ghost / respawn flow and the dead-state action gate. */
  death!: PlayerDeathController;
  private culler!: VisibilityCuller;
  private cameraFollow!: StableCameraFollow;
  monsters!: MonsterSpawner;
  combat!: CombatSystem;
  /** Stationary NPCs on this map (idle routines only - no interaction yet). */
  npcs: NpcEntity[] = [];
  clickMarker!: ClickMarker;
  monsterCursor!: MonsterCursor;
  private readonly monstersWithArt = new Set<MonsterId>();
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
      // dying / dead / respawning: only the respawn button leaves the death screen
      if (this.death && !this.death.life.isAlive()) return;
      // An open UI window (Status) closes first; otherwise ESC keeps its original meaning.
      const ui = this.scene.get(SCENES.GameUI) as GameUIScene;
      if (this.scene.isActive(SCENES.GameUI) && ui.closeWindows()) return;
      this.returnToCreation();
    };
    this.input.keyboard?.on('keydown-ESC', onEscape);
    // 1: Drifter Lv.1 attack skill (dagger thrust, 200 % ATK) as the next swing on the current target
    const onSkill = (): void => {
      if (this.ready && this.death.life.canPerform('attack')) this.combat.useSkill('drifter_lv1');
    };
    this.input.keyboard?.on('keydown-ONE', onSkill);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.input.on(Phaser.Input.Events.GAME_OUT, this.onPointerOut, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.ready = false;
      this.input.keyboard?.off('keydown-ESC', onEscape);
      this.input.keyboard?.off('keydown-ONE', onSkill);
      this.attackVfx?.clear();
      this.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
      this.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
      this.input.off(Phaser.Input.Events.GAME_OUT, this.onPointerOut, this);
      this.monsterCursor?.reset();
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
    // Combat decides first (target approach / attacks), then the player moves - only while alive.
    const alive = this.death.life.isAlive();
    this.combat.update(delta);
    if (alive) this.player.update(delta);
    if (alive) this.playerCombat?.update(this.combat.isInCombat(), this.player.getState() === 'walk', this.player.getFacing());
    // Camera first, then draw the player and its name plate at camera-stable whole pixels. The camera
    // holds still while the player is not alive (the ghost stays on the death spot).
    const feet = this.player.getWorldPosition();
    if (alive) this.cameraFollow.update(feet.x, feet.y, delta);
    this.player.view.setRenderPosition(this.cameraFollow.renderX(feet.x), this.cameraFollow.renderY(feet.y));
    this.monsters.update(delta, this.cameras.main, GameServices.get().performance, this.combat.monsterContext);
    for (const npc of this.npcs) npc.update(delta);
    this.combat.updateMarker();
    this.attackVfx.update();
    // pointer outside the canvas keeps its last position: only a pointer over the game can hover
    this.monsterCursor.update(delta, alive && this.input.manager.isOver && this.pointerOverMonster(this.input.activePointer) !== null);
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
        ...npcsOnMap(this.mapId).map((n) =>
          services.assets
            .load({ key: npcSheetKey(n), type: 'spritesheet', url: n.art.url, frameWidth: n.art.meta.frameWidth, frameHeight: n.art.meta.frameHeight })
            .catch((e: Error) => console.warn(`[npcs] ${n.id} not shown: ${e.message}`)),
        ),
        StatusWindow.load(),
        PassiveTreeWindow.load(),
        loadPlayerCombatAssets(this, getCharacterSpriteId(character.appearance)).then((set) => (this.combatSet = set)),
        services.assets
          .load({ key: MONSTER_CURSOR.key, type: 'image', url: MONSTER_CURSOR.url })
          .catch((e: Error) => console.warn(`[cursor] ${e.message} - normal cursor over monsters`)),
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
    // NPCs: stationary, on their tile (only those whose art loaded)
    this.npcs = npcsOnMap(this.mapId)
      .filter((n) => this.textures.exists(npcSheetKey(n)))
      .map((n) => new NpcEntity(this, this.map, n));
    const npcTiles = this.npcs.map(({ definition: { tile } }) => ({ minX: tile.col, minY: tile.row, maxX: tile.col + 1, maxY: tile.row + 1 }));

    this.monsters.spawn((MONSTER_SPAWNS[this.mapId] ?? []).filter((p) => this.monstersWithArt.has(p.monster)), {
      avoid: { world: spawnWorld, minDistancePx: MONSTER_MIN_SPAWN_DISTANCE_PX },
      reserved: [this.player.getFootprint(), ...npcTiles],
    });

    // Combat: player vs monsters, click targeting (see onPointerDown)
    this.combat = new CombatSystem(this, character, this.player, this.monsters);
    this.attackVfx = new AttackVfxLayer(this);
    this.combat.vfx = this.attackVfx;
    this.playerCombat = this.combatSet ? new PlayerCombatAnimator(view, this.combatSet) : null;
    if (this.playerCombat) this.player.actions = this.playerCombat;
    this.clickMarker = new ClickMarker(this);
    this.monsterCursor = new MonsterCursor(this.textures);

    // Camera
    const cam = this.cameras.main;
    cam.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
    // Smooth follow (same 0.12 lerp, view 24 px above the feet) without pixel jitter - see StableCameraFollow.
    cam.setRoundPixels(true);
    this.cameraFollow = new StableCameraFollow(cam, { lerp: 0.12, offsetY: -24 });
    this.cameraFollow.update(spawnWorld.x, spawnWorld.y, 0);
    view.setRenderPosition(this.cameraFollow.renderX(spawnWorld.x), this.cameraFollow.renderY(spawnWorld.y));

    // Death -> ghost -> respawn at the save point (none exist yet: the map spawn).
    this.death = new PlayerDeathController({
      scene: this,
      combat: this.combat,
      player: this.player,
      camera: cam,
      cameraFollow: this.cameraFollow,
      mapId: this.mapId,
      mapSpawn: spawn,
      savePoint: () => null,
      ui: () => (this.scene.isActive(SCENES.GameUI) ? (this.scene.get(SCENES.GameUI) as GameUIScene) : null),
    });

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

  /**
   * Left click: a monster under the pointer is targeted (approach + attack until it dies); anywhere else
   * on walkable ground the player walks there. Clicks on the HUD / open windows never reach the world.
   */
  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.ready || !pointer.leftButtonDown() || !this.death.life.canPerform('move') || this.isOverUi(pointer)) return;
    const world = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    const monster = this.pickMonster(world.x, world.y);
    if (monster) {
      this.monsterCursor.press();
      this.combat.attack(monster);
      return;
    }
    const tile = this.map.worldToTile(world.x, world.y);
    if (!this.map.isInside(Math.floor(tile.x), Math.floor(tile.y))) return;
    const moving = this.combat.moveTo(tile);
    // destination ripple only on walkable ground the player is really heading to
    const r = PLAYER_MOVEMENT.radius;
    const standable = this.map.isAreaFree({ minX: tile.x - r, minY: tile.y - r, maxX: tile.x + r, maxY: tile.y + r });
    if (moving && standable) this.clickMarker.show(world.x, world.y);
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.ready) return;
    this.monsterCursor.release(this.pointerOverMonster(pointer) !== null);
  }

  private onPointerOut(): void {
    this.monsterCursor?.reset();
  }

  private isOverUi(pointer: Phaser.Input.Pointer): boolean {
    const ui = this.scene.get(SCENES.GameUI) as GameUIScene;
    return this.scene.isActive(SCENES.GameUI) && ui.isPointerOverUi(pointer);
  }

  /** The living monster under the pointer (never through the UI), or null. */
  private pointerOverMonster(pointer: Phaser.Input.Pointer): MonsterEntity | null {
    if (!this.ready || this.isOverUi(pointer)) return null;
    const world = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    return this.pickMonster(world.x, world.y);
  }

  /** Living monster whose sprite (plus a few px of slack) is under a world point; the front-most wins. */
  private pickMonster(x: number, y: number): MonsterEntity | null {
    let best: MonsterEntity | null = null;
    for (const m of this.monsters.getMonsters()) {
      if (!m.isAlive()) continue;
      const b = m.sprite.getBounds();
      if (x < b.x - 4 || x > b.right + 4 || y < b.y - 4 || y > b.bottom + 4) continue;
      if (!best || m.sprite.depth > best.sprite.depth) best = m;
    }
    return best;
  }

  /**
   * Loads (once) the animated sprite set of every monster in this map's spawn table and holds it while the
   * map is shown. A monster whose art fails to load is left out (reported), the map still opens.
   */
  private async loadMonsterTextures(services: Services): Promise<void> {
    const ids = [...new Set((MONSTER_SPAWNS[this.mapId] ?? []).map((p) => p.monster))];
    this.monstersWithArt.clear();
    await Promise.all(
      ids.map(async (id) => {
        try {
          const keys = await AssetManager.ensureMonsterArt(this, MONSTER_DEFINITIONS[id]);
          for (const key of keys) services.cache.retain(key, this.monsterOwner());
          this.monstersWithArt.add(id);
        } catch (error) {
          console.warn(`[monsters] ${id} not shown: ${(error as Error).message}`);
        }
      }),
    );
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
