import Phaser from 'phaser';
import type { Point } from '../core/types';
import { DEPTH, SCENES } from '../config/constants';
import { PALETTE } from '../config/palette';
import { AssetManager } from '../assets/AssetManager';
import { TextureKeys } from '../assets/TextureKeys';
import { CharacterView } from '../characters/CharacterView';
import { createCharacterData, createDefaultAppearance, type CharacterData } from '../data/CharacterData';
import { CharacterStore } from '../data/CharacterStore';
import { PlayerController } from '../player/PlayerController';
import { MONSTER_DEFINITIONS, type MonsterId } from '../monsters/MonsterDefinition';
import { MonsterSpawner } from '../monsters/MonsterSpawner';
import { MONSTER_SPAWNS } from '../monsters/MonsterSpawns';
import { CharacterStatusService } from '../status/CharacterStatusService';
import { t, type TranslationKey } from '../i18n';
import { loadItemIcons } from '../items/ItemIcons';
import { GameServices, type Services } from '../systems/GameServices';
import type { GameUIScene } from './GameUIScene';
import { VisibilityCuller } from '../systems/performance/VisibilityCuller';
import { StableCameraFollow } from '../render/StableCameraFollow';
import { CombatSystem } from '../combat/CombatSystem';
import type { MonsterEntity } from '../monsters/MonsterEntity';
import { ClickMarker } from '../ui/world/ClickMarker';
import { npcSheetKey, npcsOnMap, type NpcId } from '../npcs/NpcDefinition';
import { NpcEntity } from '../npcs/NpcEntity';
import { NpcInteraction } from '../npcs/NpcInteraction';
import { PathTrail } from '../world/navigation/PathTrail';
import { Pathfinder } from '../world/navigation/Pathfinder';
import { PathTrailView } from '../ui/world/PathTrailView';
import { DIALOGUES } from '../dialogue/Dialogues';
import type { PlayerAction } from '../player/death/PlayerLifeState';
import { npcQuestMarker } from '../quests/QuestMarkers';
import { QuestService } from '../quests/QuestService';
import { isQuest01Active, TUTORIAL_QUEST_01 } from '../quests/TutorialQuest01';
import { isQuest02AtMateus, TUTORIAL_QUEST_02 } from '../quests/TutorialQuest02';
import { isQuest03AtMateus, TUTORIAL_QUEST_03 } from '../quests/TutorialQuest03';
import { QuestRewards, type QuestExpPaid, type QuestTurnIn } from '../quests/QuestRewards';
import { isQuest04AtRoland, TUTORIAL_QUEST_04 } from '../quests/TutorialQuest04';
import { isQuest05AtRoland, TUTORIAL_QUEST_05 } from '../quests/TutorialQuest05';
import { isQuest06AtRoland, TUTORIAL_QUEST_06 } from '../quests/TutorialQuest06';
import { isQuest07AtRoland, isQuest07ToSonny, TUTORIAL_QUEST_07 } from '../quests/TutorialQuest07';
import { HotbarService } from '../hotbar/HotbarService';
import { itemCount } from '../inventory/InventoryState';
import { hpRestored, scrollProblem, spRestored, useProblem, type ScrollProblem, type UseProblem } from '../items/ConsumableUse';
import { itemDefinition } from '../items/ItemCatalog';
import { SkillService } from '../skills/SkillService';
import { isSkillId, needsTarget, SKILL_DEFINITIONS, skillHealAmount, type SkillId } from '../skills/SkillDefinitions';
import { labels } from '../i18n/labels';
import type { ActionDirection, Direction } from '../core/Direction';
import { monsterSheetKey } from '../monsters/art/MonsterArt';
import { InventoryService } from '../inventory/InventoryService';
import { MONSTER_CURSOR, MonsterCursor } from '../ui/world/MonsterCursor';
import { NPC_CURSOR, NpcCursor } from '../ui/world/NpcCursor';
import { PortalEntity } from '../world/PortalEntity';
import { arrivalGuard, arrivalPoint, onPortalTile, PORTALS, PortalService, stepWarps, updateWarpGuard, warpAllowed, type PortalId, type WarpGuard } from '../world/Portals';
import { GATE_ANSWERS, gateTalkOf, type GateTalk } from '../dialogue/GateTalks';
import type { InteractableNpc } from '../npcs/NpcInteraction';
import { SKILL_CURSOR, SkillTargetCursor } from '../ui/world/SkillTargetCursor';
import { GOLD_ICON } from '../ui/hud/GoldIcon';
import { HintService } from '../tutorial/TutorialHints';
import { AutoPlayController } from '../autoplay/AutoPlayController';
import { AutoPlayService } from '../autoplay/AutoPlayService';
import { QuestNavigation, type NavigationStart } from '../navigation/QuestNavigation';
import { AutoPlayRangeView } from '../ui/world/AutoPlayRangeView';
import type { PotionSlotKey } from '../hotbar/PotionSlots';
import { PLAYER_MOVEMENT } from '../player/PlayerController';
import { GameHud } from '../ui/GameHud';
import { PassiveTreeWindow } from '../ui/passiveTree/PassiveTreeWindow';
import { PlayerDeathController } from '../player/death/PlayerDeathController';
import { AttackVfxLayer } from '../combat/vfx/AttackVfxLayer';
import { getCharacterSpriteId, walkSpriteIdOf } from '../characters/CharacterAssetIds';
import { PlayerCombatAnimator } from '../characters/combat/PlayerCombatAnimator';
import { loadPlayerCombatAssets } from '../characters/combat/PlayerCombatAssets';
import type { PlayerCombatSet } from '../characters/combat/PlayerCombatArt';
import { DungeonHud } from '../ui/hud/DungeonHud';
import { LoadingScreen } from '../ui/LoadingScreen';
import { AtmosphereEffects } from '../world/AtmosphereEffects';
import type { IsometricMap } from '../world/IsometricMap';
import { DEFAULT_MAP_ID, startMapId } from '../world/loading/MapRegistry';
import { placeSavedLocation, type SavedLocation } from '../save/SavedLocation';
import { respawnTile } from '../world/SpawnPoints';

export interface GameSceneData {
  /** Save point of a loaded save file: the player continues there (on its map); otherwise at the map's start. */
  savedLocation?: SavedLocation | null;
  /** The map to enter (a portal to another map); default: the saved location's map, else the first map. */
  mapId?: string;
  /** Where to appear on it (tile space) - the portal's destination. */
  arrival?: Point;
}



const CULLING_DEBUG_SOURCE = 'Culling';
const MONSTER_DEBUG_SOURCE = 'Monsters';
/** Cache owner of the player's own art (standing, walk, combat sheets, impact VFX) while this scene runs. */
const PLAYER_ART_OWNER = 'player-art';
/**
 * Two potions never go in at the same moment: after one is used, another waits this long - whoever asks (Q, the
 * Inventory's USE, Auto Combat). Stops a manual press and an automatic use from both landing at once.
 */
const POTION_DOUBLE_USE_GUARD_MS = 300;

/** Minimum distance (world px, rendered coordinates) between a monster and the player spawn. */
const MONSTER_MIN_SPAWN_DISTANCE_PX = 20;

/** The cast animation has four directions: the nearest one to where the player faces. */
const CAST_FACING: Readonly<Record<Direction, ActionDirection>> = { N: 'NE', NE: 'NE', E: 'SE', SE: 'SE', S: 'SW', SW: 'SW', W: 'NW', NW: 'NW' };

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
  /** Stationary NPCs on this map. */
  npcs: NpcEntity[] = [];
  /** Left click on an NPC that has something to say (walk there, then talk). */
  npcInteraction!: NpcInteraction<NpcEntity>;
  /** The quest tracker's Navigate: walking to the quest NPC (independent of Auto Combat). */
  navigation!: QuestNavigation<InteractableNpc>;
  /** The portal on this map (hidden until opened), walking up to it, and the NPC talk cursor. */
  portal: PortalEntity | null = null;
  /** The player stood on the portal's tile last frame (a warp needs a step ONTO it). */
  private onPortal = false;
  npcCursor!: NpcCursor;
  /** Dotted path on the ground to the active quest's NPC. */
  questTrail!: PathTrail;
  questTrailView!: PathTrailView;
  private character!: CharacterData;
  clickMarker!: ClickMarker;
  monsterCursor!: MonsterCursor;
  /** The skill cursor of target-select mode (idle / pressed). */
  skillCursor!: SkillTargetCursor;
  /** Target-select mode: this skill is cast on the monster the next left click hits. */
  private skillTargeting: SkillId | null = null;
  /** Auto Play (attack only): decisions every few frames through the normal combat commands. */
  autoPlay!: AutoPlayController<MonsterEntity>;
  private autoRange!: AutoPlayRangeView;
  /** A right click cancelled target-select mode: the browser menu it would open is skipped once. */
  private suppressContextMenu = false;
  private readonly monstersWithArt = new Set<MonsterId>();
  private loading!: LoadingScreen;
  private mapId = DEFAULT_MAP_ID;
  private ready = false;
  private failed = false;
  private leaving = false;
  /** No potion before this (scene time): see POTION_DOUBLE_USE_GUARD_MS. */
  private potionGuardUntil = 0;
  /** When each skill with a cooldown can be used again (scene time; not saved). */
  private readonly skillReadyAt = new Map<string, number>();
  /** Only for placing the player once after loading a file - respawning never uses it. */
  private loadedLocation: SavedLocation | null = null;
  /** Where a portal from another map puts the player (once, after the map is built). */
  private arrival: Point | null = null;
  /** Right after arriving through a portal: no warping back at once (see WARP_GUARD). */
  private warpGuard: WarpGuard | null = null;

  constructor() {
    super(SCENES.Game);
  }

  create(data: GameSceneData = {}): void {
    this.loadedLocation = data.savedLocation ?? null;
    this.mapId = startMapId(data);
    this.arrival = data.arrival ?? null;
    this.scene.settings.data = {}; // Phaser would hand the same data to the next start without any
    this.ready = false;
    this.failed = false;
    this.skillReadyAt.clear();
    this.potionGuardUntil = 0;
    this.skillTargeting = null;
    this.leaving = false;
    const character = this.resolveCharacter();
    this.character = character;

    this.cameras.main.setBackgroundColor(PALETTE.void);
    this.loading = new LoadingScreen(this).show(t('world.entering'));

    const onEscape = (): void => {
      // dying / dead / respawning: only the respawn button leaves the death screen
      if (this.death && !this.death.life.isAlive()) return;
      if (this.isTalking()) return; // a conversation ends with its own NEXT button
      // target-select mode is cancelled first (nothing else happens)
      if (this.skillTargeting) {
        this.cancelSkillTargeting();
        return;
      }
      // An open UI window closes first; otherwise ESC leaves the game (asked first: nothing is saved by itself).
      const ui = this.scene.isActive(SCENES.GameUI) ? (this.scene.get(SCENES.GameUI) as GameUIScene) : null;
      if (ui?.closeWindows()) return;
      if (ui && this.ready) ui.confirmLeave(() => this.returnToMenu());
      else this.returnToMenu();
    };
    this.input.keyboard?.on('keydown-ESC', onEscape);
    // Keys 1-8 belong to the hotbar (GameUIScene). No key fires a skill directly: skills are used through the
    // hotbar (useHotbarSlot); a target-required one then waits for its click (target-select mode).
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.input.on(Phaser.Input.Events.GAME_OUT, this.onPointerOut, this);
    // released outside the game: only the skill cursor needs to hear it (the attack cursor keeps its own rules)
    const onUpOutside = (): void => {
      if (this.skillCursor?.state === 'press') this.skillCursor.set(this.skillTargeting ? 'idle' : 'none');
    };
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, onUpOutside);
    const onContextMenu = (e: MouseEvent): void => {
      if (!this.suppressContextMenu) return;
      this.suppressContextMenu = false;
      e.preventDefault();
    };
    this.game.canvas.addEventListener('contextmenu', onContextMenu);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.canvas.removeEventListener('contextmenu', onContextMenu);
      this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, onUpOutside);
      this.skillTargeting = null;
      this.skillCursor?.set('none');
      this.ready = false;
      this.input.keyboard?.off('keydown-ESC', onEscape);
      this.attackVfx?.dispose();
      this.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
      this.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
      this.input.off(Phaser.Input.Events.GAME_OUT, this.onPointerOut, this);
      this.monsterCursor?.reset();
      this.npcCursor?.reset();
      this.scene.stop(SCENES.GameUI);
      const services = GameServices.tryGet();
      services?.debugSources.delete(CULLING_DEBUG_SOURCE);
      services?.debugSources.delete(MONSTER_DEBUG_SOURCE);
      services?.cache.releaseOwner(this.monsterOwner());
      services?.cache.releaseOwner(PLAYER_ART_OWNER);
      services?.maps.exit(this.mapId);
    });

    void this.loadWorld(character);
  }

  update(_time: number, delta: number): void {
    if (!this.ready) return;
    // Combat decides first (target approach / attacks), then the player moves - only while alive.
    const alive = this.death.life.isAlive();
    this.combat.update(delta);
    this.updateAutoPlay(alive);
    if (alive && !this.isTalking()) this.player.update(delta);
    if (alive) this.npcInteraction.update();
    else this.npcInteraction.cancel();
    if (alive) this.updatePortalStep();
    this.updateNavigation(alive);
    this.questTrail.update(delta, this.player.getTilePosition(), alive ? (this.questTarget()?.position ?? null) : null);
    if (this.portal) {
      this.portal.sync(PortalService.state(this.character, this.portal.definition.id as PortalId));
      this.portal.update(delta);
    }
    if (this.warpGuard) this.warpGuard = updateWarpGuard(this.warpGuard, this.portalDistance());
    this.questTrailView.draw(this.questTrail);
    if (alive) this.playerCombat?.update(this.combat.isInCombat(), this.player.getState() === 'walk', this.player.getFacing());
    // Camera first, then draw the player and its name plate at camera-stable whole pixels. The camera
    // holds still while the player is not alive (the ghost stays on the death spot).
    const feet = this.player.getWorldPosition();
    if (alive) this.cameraFollow.update(feet.x, feet.y, delta);
    this.player.view.setRenderPosition(this.cameraFollow.renderX(feet.x), this.cameraFollow.renderY(feet.y));
    this.monsters.update(delta, this.cameras.main, GameServices.get().performance, this.combat.monsterContext);
    for (const npc of this.npcs) {
      // from the quest state as it is when the frame is drawn: steps that follow each other at once never flicker
      npc.questMarker.set(npcQuestMarker(this.character, npc.definition.id));
      npc.update(delta);
    }
    this.combat.updateMarker();
    this.attackVfx.update();
    // target-select mode ends by itself when the player can no longer use it (window, conversation, death)
    if (this.skillTargeting && (!alive || !this.canPerform('attack') || this.uiScene()?.worldBlocked)) this.cancelSkillTargeting();
    // pointer outside the canvas keeps its last position: only a pointer over the game can hover
    if (this.skillCursor.state === 'none') {
      const free = alive && !this.isTalking() && this.input.manager.isOver;
      const over = free ? this.pointerTarget(this.input.activePointer) : null;
      // the cursor that lets go first, then the one that takes over (both use the game cursor's override)
      if (over === 'monster') {
        this.npcCursor.update(false);
        this.monsterCursor.update(delta, true);
      } else {
        this.monsterCursor.update(delta, false);
        this.npcCursor.update(over === 'npc');
      }
    }
    this.map.updateOcclusion(this.player.getFootprint(), this.player.getScreenRect(), delta);
    this.atmosphere.update(delta);
    this.culler.update();
    this.hud.update(this.player.view, alive ? this.playerVitals() : null);
  }

  /** HP / SP for the player's nameplate bars (live combat values). */
  private playerVitals(): { hp: number; maxHp: number; sp: number; maxSp: number } {
    return { hp: this.combat.getPlayerHp(), maxHp: this.combat.getPlayerMaxHp(), sp: this.combat.getPlayerSp(), maxSp: this.combat.getPlayerMaxSp() };
  }

  private async loadWorld(character: CharacterData): Promise<void> {
    const services = await GameServices.ready();
    // Hold the character's sheets from now on: map entry cleans the cache before the player's view exists.
    const spriteId = getCharacterSpriteId(character.appearance);
    for (const key of [spriteId, walkSpriteIdOf(spriteId)]) services.cache.retain(key, PLAYER_ART_OWNER);
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
        PassiveTreeWindow.load(),
        loadItemIcons(),
        loadPlayerCombatAssets(this, spriteId, PLAYER_ART_OWNER).then((set) => (this.combatSet = set)),
        services.assets
          .load({ key: MONSTER_CURSOR.key, type: 'image', url: MONSTER_CURSOR.url })
          .catch((e: Error) => console.warn(`[cursor] ${e.message} - normal cursor over monsters`)),
        services.assets
          .load({ key: NPC_CURSOR.key, type: 'image', url: NPC_CURSOR.url })
          .catch((e: Error) => console.warn(`[cursor] ${e.message} - normal cursor over NPCs`)),
        ...Object.values(PORTALS)
          .filter((p) => p.mapId === this.mapId)
          .map((p) => services.assets.load({ key: p.art.key, type: 'spritesheet', url: p.art.url, frameWidth: p.art.size, frameHeight: p.art.size }).catch((e: Error) => console.warn(`[portal] ${e.message}`))),
        ...[GOLD_ICON.large, GOLD_ICON.small, GOLD_ICON.hud].map((icon) =>
          services.assets.load({ key: icon.key, type: 'image', url: icon.url }).catch((e: Error) => console.warn(`[gold] ${e.message}`)),
        ),
        services.assets
          .load({ key: SKILL_CURSOR.key, type: 'image', url: SKILL_CURSOR.url })
          .catch((e: Error) => console.warn(`[cursor] ${e.message} - normal cursor in skill target mode`)),
      ]);
      if (!this.sys.isActive()) return;
      this.map = prepared.map;
      this.setupWorld(character, services);
      this.loading.hide();
      this.cameras.main.fadeIn(500, 0, 0, 0);
      this.ready = true;
      this.beginTutorialQuest(character);
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
    // movement by left click only (no keyboard movement: W is the SP potion key)
    this.player = new PlayerController(this.map, view, spawn);

    // Monsters: static visual entities, validated against the map and the player spawn.
    this.monsters = new MonsterSpawner(this, this.map);
    // NPCs: stationary, on their tile (only those whose art loaded)
    this.npcs = npcsOnMap(this.mapId)
      .filter((n) => this.textures.exists(npcSheetKey(n)))
      .map((n) => new NpcEntity(this, this.map, n));
    // The portal of this map (shown once opened - its state is saved)
    const portal = Object.values(PORTALS).find((p) => p.mapId === this.mapId);
    this.portal = portal && this.textures.exists(portal.art.key) ? new PortalEntity(this, this.map, portal) : null;
    const npcTiles = this.npcs.map(({ definition: { tile } }) => ({ minX: tile.col, minY: tile.row, maxX: tile.col + 1, maxY: tile.row + 1 }));

    this.monsters.spawn((MONSTER_SPAWNS[this.mapId] ?? []).filter((p) => this.monstersWithArt.has(p.monster)), {
      avoid: { world: spawnWorld, minDistancePx: MONSTER_MIN_SPAWN_DISTANCE_PX },
      reserved: [this.player.getFootprint(), ...npcTiles],
    });

    // A loaded save: back where the player stood, if one can stand there on this map
    const saved = placeSavedLocation(this.loadedLocation, this.mapId, this.map, PLAYER_MOVEMENT.radius);
    this.loadedLocation = null;
    if (saved) this.player.teleport(saved);
    // Through a portal from another map: at its destination, when one can stand there
    const arrived = !saved ? placeSavedLocation(this.arrival ? { mapId: this.mapId, ...this.arrival } : null, this.mapId, this.map, PLAYER_MOVEMENT.radius) : null;
    this.arrival = null;
    if (arrived) this.player.teleport(arrived);
    this.warpGuard = arrived ? arrivalGuard(this.time.now, this.portalDistance()) : null;
    this.onPortal = this.portal !== null && onPortalTile(this.player.getTilePosition(), this.portal.definition.tile);
    const here = saved ?? arrived;
    const startWorld = here ? this.map.tileToWorld(here.x, here.y) : spawnWorld;

    // Combat: player vs monsters, click targeting (see onPointerDown)
    this.combat = new CombatSystem(this, character, this.player, this.monsters);
    this.attackVfx = new AttackVfxLayer(this);
    this.combat.vfx = this.attackVfx;
    this.playerCombat = this.combatSet ? new PlayerCombatAnimator(view, this.combatSet) : null;
    if (this.playerCombat) this.player.actions = this.playerCombat;
    this.npcInteraction = new NpcInteraction<NpcEntity>(this.player, (npc) => this.talkTo(npc));
    this.navigation = new QuestNavigation<InteractableNpc>(this.player);
    this.autoPlay = new AutoPlayController<MonsterEntity>(this.autoPlayPort());
    this.combat.onPlayerAttacked = (monster) => this.autoPlay.notifyAttacked(monster);
    // Auto Play switched off (START / STOP button or X): everything it started stops at once
    let autoWasOn = AutoPlayService.isOn(this.character);
    const offAuto = AutoPlayService.onChange((c) => {
      if (c !== this.character) return;
      const on = AutoPlayService.isOn(c);
      if (autoWasOn && !on) this.stopAutoPlayActions();
      autoWasOn = on;
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, offAuto);
    this.autoRange = new AutoPlayRangeView(this, (x, y) => this.map.tileToWorld(x, y));
    // The tutorial quests follow what the player does (first passive node, dagger worn, a stat point spent)
    const syncQuest = (c: CharacterData): void => {
      if (c === character) QuestService.sync(c);
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, CharacterStatusService.onChange(syncQuest));
    this.questTrail = new PathTrail(new Pathfinder(this.map.layout, { radius: PLAYER_MOVEMENT.radius }));
    this.questTrailView = new PathTrailView(this, (x, y) => this.map.tileToWorld(x, y));
    this.clickMarker = new ClickMarker(this);
    this.monsterCursor = new MonsterCursor(this.textures);
    this.npcCursor = new NpcCursor(this.textures);
    this.skillCursor = new SkillTargetCursor(this.textures);

    // Camera
    const cam = this.cameras.main;
    cam.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
    // Smooth follow (same 0.12 lerp, view 24 px above the feet) without pixel jitter - see StableCameraFollow.
    cam.setRoundPixels(true);
    this.cameraFollow = new StableCameraFollow(cam, { lerp: 0.12, offsetY: -24 });
    this.cameraFollow.update(startWorld.x, startWorld.y, 0);
    view.setRenderPosition(this.cameraFollow.renderX(startWorld.x), this.cameraFollow.renderY(startWorld.y));

    // Death -> ghost -> respawn at the spawn point (never at a save point).
    this.death = new PlayerDeathController({
      scene: this,
      combat: this.combat,
      player: this.player,
      camera: cam,
      cameraFollow: this.cameraFollow,
      respawnAt: () => respawnTile(this.mapId, spawn),
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
    this.hud.update(this.player.view, this.playerVitals());
  }

  /**
   * Left click: a monster under the pointer is targeted (approach + attack until it dies); an NPC with
   * something to say is approached and talked to; anywhere else on walkable ground the player walks there. Clicks on the HUD / open windows never reach the world.
   */
  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.ready && this.skillTargeting) {
      this.onTargetingPointerDown(pointer);
      return;
    }
    if (!this.ready || !pointer.leftButtonDown() || !this.canPerform('move') || this.isOverUi(pointer)) return;
    this.npcInteraction.cancel(); // any new command replaces a pending approach
    this.navigation.cancel(); // ...and Navigate: the click's own path takes over
    this.autoPlay.notifyManual(); // a command by hand: Auto Play waits a moment instead of overriding it
    const world = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    const monster = this.pickMonster(world.x, world.y);
    const npc = this.pickTalkingNpc(world.x, world.y);
    if (npc && (!monster || npc.sprite.depth >= monster.sprite.depth)) {
      if (!this.canPerform('interact')) return;
      this.npcCursor.press();
      this.combat.clearTarget();
      this.npcInteraction.request(npc);
      return;
    }
    // an open portal: a click walks onto its tile (stepping on it warps - see updatePortalStep)
    if (!monster && this.portal?.contains(world.x, world.y)) {
      this.combat.moveTo(this.portal.position);
      return;
    }
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

  /** Save point for a save file: where the player stands now. null while there is no world or the player is not alive. */
  captureSavedLocation(): SavedLocation | null {
    if (!this.ready || !this.death.life.isAlive()) return null;
    const { x, y } = this.player.getTilePosition();
    return { mapId: this.mapId, x, y };
  }

  /** Gameplay action gate: nothing but chat while dying / dead or in a conversation. */
  canPerform(action: PlayerAction): boolean {
    if (!this.death?.life.canPerform(action)) return false;
    return action === 'chat' || !this.isTalking();
  }

  /** An NPC conversation is open. */
  isTalking(): boolean {
    return this.scene.isActive(SCENES.GameUI) && (this.scene.get(SCENES.GameUI) as GameUIScene).isDialogueOpen;
  }

  // -------------------------------------------------------------------------------------------
  // Tutorial Quest 01: find Mateus -> talk -> the existing Passive Tree tutorial
  // Tutorial Quest 02: back to Mateus -> talk (Rusty Dagger) -> equipment tutorial -> back to Mateus
  //   (100 EXP) -> Status tutorial
  // Tutorial Quest 03: back to Mateus -> talk -> 5 Void Mites -> back to Mateus (20 potions, 200 EXP)
  // Tutorial Quest 04: to Roland -> talk -> potion training (GameUIScene) -> talk on (wolf hunt)
  // Tutorial Quest 05: 5 Mutant Wolves -> back to Roland (150 EXP)
  // Tutorial Quest 06: Roland -> talk (Power Thrust scroll) -> scroll tutorial (GameUIScene) -> line 14 ->
  //   10 Dark Avians -> back to Roland (150 EXP, no conversation)
  // -------------------------------------------------------------------------------------------

  /**
   * The quest tracker's Navigate: walks to the quest NPC (the normal pathfinding), or - while doing so - stops at
   * once. "unavailable": no quest NPC, not alive, talking. A target or an NPC approach in progress is dropped.
   */
  toggleQuestNavigation(): NavigationStart | 'stopped' | 'unavailable' {
    if (this.navigation.active) {
      this.navigation.stop();
      return 'stopped';
    }
    const npc = this.questTarget();
    if (!this.ready || !npc || !this.death.life.isAlive() || !this.canPerform('move')) return 'unavailable';
    this.npcInteraction.cancel();
    this.combat.clearTarget();
    return this.navigation.start(npc);
  }

  /** Navigate can be used now: the quest leads to an NPC, the player is alive and free to move. */
  canNavigate(): boolean {
    return this.ready && this.questTarget() !== null && this.death.life.isAlive() && this.canPerform('move');
  }

  /**
   * Per frame: navigation ends in range of the NPC (stops, faces it), when the quest NPC changes, at death or when
   * the path ended. While it runs Auto Combat (if on) waits as for a manual command - it is not switched off.
   */
  /**
   * Per frame: stepping onto the open portal's tile warps at once (no click, no dialog) - never while Auto Play /
   * Auto Combat runs, never right after an arrival (WARP_GUARD), never twice without stepping off.
   */
  private updatePortalStep(): void {
    const p = this.portal;
    if (!p) return;
    const isOn = onPortalTile(this.player.getTilePosition(), p.definition.tile);
    const wasOn = this.onPortal;
    this.onPortal = isOn;
    const state = PortalService.state(this.character, p.definition.id as PortalId);
    if (stepWarps({ wasOn, isOn, autoPlay: AutoPlayService.isOn(this.character), state, allowed: warpAllowed(this.warpGuard, this.time.now) })) this.enterPortal(p);
  }

  /** Distance (tiles) from the player to this map's portal; Infinity without one. */
  private portalDistance(): number {
    if (!this.portal) return Infinity;
    const p = this.player.getTilePosition();
    return Math.hypot(this.portal.position.x - p.x, this.portal.position.y - p.y);
  }

  private updateNavigation(alive: boolean): void {
    if (!alive) {
      this.navigation.cancel();
      return;
    }
    this.navigation.update(this.questTarget());
    if (this.navigation.active) this.autoPlay.notifyManual();
  }

  /**
   * Where the quest leads now (dotted path, Navigate): its NPC - or, once Sonny opened it, the gate portal until the
   * player went through.
   */
  questTarget(): InteractableNpc | null {
    const npc = this.questNpc();
    if (npc) return npc;
    const p = this.portal;
    const leads = p && isQuest07ToSonny(QuestService.quest07(this.character)) && PortalService.state(this.character, p.definition.id as PortalId) === 'UNLOCKED';
    return leads ? p : null;
  }

  /** The NPC the active quest sends the player to (dotted path), or null. */
  questNpc(): NpcEntity | null {
    const id = this.questNpcId();
    return id === null ? null : (this.npcs.find((n) => n.definition.id === id) ?? null);
  }

  private questNpcId(): NpcId | null {
    const c = this.character;
    if (isQuest01Active(QuestService.quest01(c))) return TUTORIAL_QUEST_01.npcId;
    if (isQuest02AtMateus(QuestService.quest02(c))) return TUTORIAL_QUEST_02.npcId;
    if (isQuest03AtMateus(QuestService.quest03(c))) return TUTORIAL_QUEST_03.npcId;
    if (isQuest04AtRoland(QuestService.quest04(c))) return TUTORIAL_QUEST_04.npcId;
    if (isQuest05AtRoland(QuestService.quest05(c))) return TUTORIAL_QUEST_05.npcId;
    if (isQuest06AtRoland(QuestService.quest06(c))) return TUTORIAL_QUEST_06.npcId;
    const quest07 = QuestService.quest07(c);
    if (isQuest07AtRoland(quest07, c.status.level)) return TUTORIAL_QUEST_07.npcId;
    // Reach Level 10 completed: on to Sonny at the north gate - until he opened the portal
    return isQuest07ToSonny(quest07) && PortalService.state(c, 'dawnkeep_gate') === 'LOCKED' ? TUTORIAL_QUEST_07.nextNpcId : null;
  }

  /** Entering the map: new characters get the quest; a handoff that was cut off is finished. */
  private beginTutorialQuest(character: CharacterData): void {
    QuestService.advance(character, 'start');
    QuestService.advance(character, 'startPassiveTutorial');
    QuestService.sync(character);
    // a repaired save file without the dagger: the equipment tutorial needs it - still only once
    if (QuestService.quest02(character).state === 'EQUIPMENT_TUTORIAL') InventoryService.grantOnce(character, TUTORIAL_QUEST_02.reward);
    // the Void Mite hunt was turned in before it gave potions: the potion training needs them - given once
    if (QuestService.quest03(character).state === 'COMPLETED') InventoryService.grantOnce(character, TUTORIAL_QUEST_03.reward);
    // the scroll tutorial needs the Power Thrust scroll while the skill is not learned - still only once (grant id)
    if (QuestService.quest06(character).state === 'SCROLL_TUTORIAL' && !SkillService.isLearned(character, TUTORIAL_QUEST_06.skillId)) {
      InventoryService.grantOnce(character, TUTORIAL_QUEST_06.reward);
    }
  }

  /** NPCs that react to a click now: the quest NPC and the gate guards (the others: the click is a walk command). */
  private isTalkable(npc: NpcEntity): boolean {
    return npc === this.questNpc() || gateTalkOf(npc.definition.id) !== null;
  }

  /** The talkable NPC under a world point (the front-most), or null. */
  private pickTalkingNpc(x: number, y: number): NpcEntity | null {
    let best: NpcEntity | null = null;
    for (const n of this.npcs) if (this.isTalkable(n) && n.contains(x, y) && (!best || n.sprite.depth > best.sprite.depth)) best = n;
    return best;
  }

  /** What a click there would act on, by the same rules as onPointerDown (cursor choice). */
  private pointerTarget(pointer: Phaser.Input.Pointer): 'monster' | 'npc' | null {
    if (!this.ready || this.isOverUi(pointer)) return null;
    const world = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    const monster = this.pickMonster(world.x, world.y);
    const npc = this.pickTalkingNpc(world.x, world.y);
    if (npc && (!monster || npc.sprite.depth >= monster.sprite.depth)) return 'npc';
    return monster ? 'monster' : null;
  }

  private talkTo(npc: NpcEntity): void {
    const ui = this.scene.isActive(SCENES.GameUI) ? (this.scene.get(SCENES.GameUI) as GameUIScene) : null;
    const dialogue = ui?.dialogue;
    if (!ui || !dialogue || dialogue.isOpen || !this.isTalkable(npc)) return;
    const { character } = this;
    const name = npc.definition.name;
    const gate = gateTalkOf(npc.definition.id);
    if (gate) {
      this.gateTalk(ui, name, gate);
      return;
    }
    if (npc.definition.id === TUTORIAL_QUEST_04.npcId) {
      this.talkToRoland(ui, name);
      return;
    }
    if (QuestService.advance(character, 'talk')) {
      HintService.complete(character, 'click_to_move'); // the "left-click" hint fades out now, for good
      this.beginConversation(ui);
      dialogue.open(name, DIALOGUES[TUTORIAL_QUEST_01.dialogueId], () => {
        this.combat.setSuspended(false);
        QuestService.advance(character, 'finishDialogue');
        QuestService.advance(character, 'startPassiveTutorial');
        QuestService.sync(character);
      });
    } else if (QuestService.advance02(character, 'talk')) {
      this.beginConversation(ui);
      dialogue.open(
        name,
        DIALOGUES[TUTORIAL_QUEST_02.dialogueId],
        () => {
          this.combat.setSuspended(false);
          QuestService.advance02(character, 'finishDialogue');
          QuestService.sync(character);
        },
        {
          beforeStep: (step) => step !== TUTORIAL_QUEST_02.rewardBeforeStep || this.giveQuest02Reward(ui),
          onInterrupted: () => {
            this.combat.setSuspended(false);
            QuestService.advance02(character, 'cancelTalk');
          },
        },
      );
    } else if (QuestService.advance02(character, 'turnIn')) {
      // the dagger is worn: 100 EXP before the second line, then the Status tutorial
      this.beginConversation(ui);
      dialogue.open(
        name,
        DIALOGUES[TUTORIAL_QUEST_02.turnInDialogueId],
        () => {
          this.combat.setSuspended(false);
          QuestService.advance02(character, 'finishTurnIn');
          QuestService.sync(character);
        },
        {
          beforeStep: (step) => {
            if (step === TUTORIAL_QUEST_02.expBeforeStep) this.showQuestExp(QuestRewards.quest02(character));
            return true;
          },
          onInterrupted: () => {
            this.combat.setSuspended(false);
            QuestService.advance02(character, 'cancelTurnIn');
          },
        },
      );
    } else if (QuestService.advance03(character, 'talk')) {
      // the Void Mite hunt: a picture of the creature with the first line; hunting starts after the last one
      this.beginConversation(ui);
      const picture = { texture: monsterSheetKey('void_mite', 'idle'), frame: 0, scale: 3 };
      dialogue.open(
        name,
        DIALOGUES[TUTORIAL_QUEST_03.acceptDialogueId],
        () => {
          this.combat.setSuspended(false);
          QuestService.advance03(character, 'accept');
        },
        {
          picture: (step) => (step === TUTORIAL_QUEST_03.previewStep ? picture : null),
          onInterrupted: () => {
            this.combat.setSuspended(false);
            QuestService.advance03(character, 'cancelTalk');
          },
        },
      );
    } else if (QuestService.advance03(character, 'turnIn')) {
      // 5/5: 20 potions and 200 EXP when the last line is confirmed; then on to Roland
      this.beginConversation(ui);
      dialogue.open(
        name,
        DIALOGUES[TUTORIAL_QUEST_03.completeDialogueId],
        () => {
          this.combat.setSuspended(false);
          this.finishTurnIn(ui, QuestRewards.quest03(character), () => QuestService.advance03(character, 'cancelTurnIn'));
          QuestService.sync(character);
        },
        {
          onInterrupted: () => {
            this.combat.setSuspended(false);
            QuestService.advance03(character, 'cancelTurnIn');
          },
        },
      );
    }
  }

  /**
   * The gate guards (Sonny, Jack): the question with two answers, then the branch of the chosen answer. Sonny's
   * "Roland sent me" branch opens the portal when it ends (once - PortalService); everything else is just talk.
   */
  private gateTalk(ui: GameUIScene, name: string, gate: GateTalk): void {
    const dialogue = ui.dialogue!;
    const end = (): void => this.combat.setSuspended(false);
    this.beginConversation(ui);
    dialogue.open(name, DIALOGUES[gate.intro], end, {
      onInterrupted: end,
      choices: {
        step: gate.questionStep,
        options: GATE_ANSWERS,
        onChoose: (answer) => {
          dialogue.open(name, DIALOGUES[gate.branches[answer]], () => {
            end();
            if (answer === gate.opensPortalOn) PortalService.unlock(this.character, 'dawnkeep_gate');
          }, { onInterrupted: end });
        },
      },
    });
  }

  /** Through an open portal: to its destination at once (the camera jumps with the player); the arrow goes away. */
  private enterPortal(portal: PortalEntity): void {
    if (this.leaving || !warpAllowed(this.warpGuard, this.time.now)) return; // just arrived: no warping straight back
    if (!PortalService.enter(this.character, portal.definition.id as PortalId)) return;
    this.combat.clearTarget();
    this.navigation.cancel();
    this.npcInteraction.cancel();
    const dest = portal.definition.destination as { mapId?: string; col: number; row: number };
    if (dest.mapId && dest.mapId !== this.mapId) {
      // another map: the scene starts again on it (the character, its progress and settings stay as they are)
      this.leaving = true;
      this.player.halt();
      this.scene.restart({ mapId: dest.mapId, arrival: arrivalPoint(dest) } satisfies GameSceneData);
      return;
    }
    this.player.teleport(arrivalPoint(dest));
    this.cameraFollow.snap();
    this.warpGuard = arrivalGuard(this.time.now, this.portalDistance());
    this.onPortal = onPortalTile(this.player.getTilePosition(), portal.definition.tile);
  }

  /**
   * A turn-in that pays at the end of its conversation: the usual feedback, or - when its items did not fit -
   * the reason, and the quest waits to be turned in again (nothing was given, nothing is lost).
   */
  private finishTurnIn(ui: GameUIScene, result: QuestTurnIn, undo: () => void): void {
    if (result.ok) {
      this.showQuestExp(result);
      return;
    }
    undo();
    if (result.error !== 'notReady') ui.notifications?.showText(t(result.error === 'bagFull' ? 'notifications.bagFull' : 'notifications.itemFailed'));
  }

  /**
   * Roland's conversations: potion training (start, and its last part after the hotkey), the wolf hunt's turn-in,
   * the Dark Avian hunt (intro with the scroll, line 14 after the hotkey) and its turn-in.
   */
  private talkToRoland(ui: GameUIScene, name: string): boolean {
    const { character } = this;
    const dialogue = ui.dialogue!;
    if (QuestService.advance04(character, 'talk')) {
      this.beginConversation(ui);
      dialogue.open(name, DIALOGUES[TUTORIAL_QUEST_04.introDialogueId], () => {
        this.combat.setSuspended(false);
        QuestService.advance04(character, 'finishIntro');
      }, { onInterrupted: () => {
        this.combat.setSuspended(false);
        QuestService.advance04(character, 'cancelTalk');
      } });
      return true;
    }
    if (this.continuePotionTraining()) return true;
    if (QuestService.advance05(character, 'turnIn')) {
      this.beginConversation(ui);
      dialogue.open(name, DIALOGUES[TUTORIAL_QUEST_05.completeDialogueId], () => {
        this.combat.setSuspended(false);
        this.finishTurnIn(ui, QuestRewards.quest05(character), () => QuestService.advance05(character, 'cancelTurnIn'));
      }, { onInterrupted: () => {
        this.combat.setSuspended(false);
        QuestService.advance05(character, 'cancelTurnIn');
      } });
      return true;
    }
    if (QuestService.advance06(character, 'talk')) {
      // lines 1-10, the Dark Avian above line 9; clicking through line 10 gives the scroll (once)
      this.beginConversation(ui);
      const picture = this.avianPreview();
      dialogue.open(name, DIALOGUES[TUTORIAL_QUEST_06.introDialogueId], () => {
        this.combat.setSuspended(false);
        this.giveQuest06Scroll(ui);
      }, {
        picture: (step) => (step === TUTORIAL_QUEST_06.previewStep ? picture : null),
        onInterrupted: () => {
          this.combat.setSuspended(false);
          QuestService.advance06(character, 'cancelTalk');
        },
      });
      return true;
    }
    if (this.continueAvianBriefing()) return true;
    if (QuestService.advance06(character, 'turnIn')) {
      // 10/10: six lines - clicking through line 1 pays 150 EXP + the Heal scroll (once); the last line accepts
      // Reach Level 10 with its potions. A full bag stops at line 1 (nothing paid) and the turn-in waits.
      this.beginConversation(ui);
      dialogue.open(name, DIALOGUES[TUTORIAL_QUEST_06.turnInDialogueId], () => {
        this.combat.setSuspended(false);
        this.acceptQuest07(ui);
      }, {
        beforeStep: (step) => {
          if (step !== 1) return true;
          const result = QuestRewards.quest06(character);
          if (result.ok) {
            this.showQuestExp(result);
            return true;
          }
          if (result.error !== 'notReady') ui.notifications?.showText(t(result.error === 'bagFull' ? 'notifications.bagFull' : 'notifications.itemFailed'));
          return false;
        },
        onInterrupted: () => {
          this.combat.setSuspended(false);
          QuestService.advance06(character, 'cancelTurnIn'); // only before the reward (afterwards Quest 07 is offered)
        },
      });
      return true;
    }
    if (QuestService.quest07(character).state === 'OFFERED') {
      // the turn-in talk was cut off after its reward: lines 2-6 again, then the acceptance
      this.beginConversation(ui);
      dialogue.open(name, DIALOGUES[TUTORIAL_QUEST_07.offerDialogueId], () => {
        this.combat.setSuspended(false);
        this.acceptQuest07(ui);
      }, { onInterrupted: () => this.combat.setSuspended(false) });
      return true;
    }
    if (QuestService.advance07(character, 'turnIn')) {
      // Lv 10: four lines - clicking through line 1 pays 1,000 Gold (once); the last line completes the quest and
      // the dotted path turns to Sonny
      this.beginConversation(ui);
      dialogue.open(name, DIALOGUES[TUTORIAL_QUEST_07.turnInDialogueId], () => {
        this.combat.setSuspended(false);
        QuestService.advance07(character, 'complete');
      }, {
        beforeStep: (step) => {
          if (step === TUTORIAL_QUEST_07.rewardBeforeStep) this.combat.showGoldGain(QuestRewards.quest07(character));
          return true;
        },
        onInterrupted: () => {
          this.combat.setSuspended(false);
          QuestService.advance07(character, 'cancelTurnIn'); // only before the reward (afterwards it resumes at line 2)
        },
      });
      return true;
    }
    if (QuestService.quest07(character).state === 'REWARDED') {
      // the Lv 10 talk was cut off after its reward: lines 2-4 again, then completed
      this.beginConversation(ui);
      dialogue.open(name, DIALOGUES[TUTORIAL_QUEST_07.resumeDialogueId], () => {
        this.combat.setSuspended(false);
        QuestService.advance07(character, 'complete');
      }, { onInterrupted: () => this.combat.setSuspended(false) });
      return true;
    }
    return false;
  }

  /**
   * Reach Level 10 accepted (the last line of Roland's talk): 80 HP + 50 SP potions, each once by its grant id, then
   * the quest runs. A full bag: the reason is shown and the offer waits (what was given stays given, never twice).
   */
  private acceptQuest07(ui: GameUIScene): void {
    const { character } = this;
    if (QuestService.quest07(character).state !== 'OFFERED') return;
    for (const supply of TUTORIAL_QUEST_07.supplies) {
      const error = InventoryService.grantOnce(character, supply);
      if (error !== null && error !== 'alreadyGranted') {
        ui.notifications?.showText(t(error === 'bagFull' ? 'notifications.bagFull' : 'notifications.itemFailed'));
        return;
      }
    }
    QuestService.advance07(character, 'accept');
  }

  /**
   * Line 14 ("off you go"): right after Power Thrust got its hotkey, or by talking to Roland again (e.g. after
   * loading). Its end starts the Dark Avian hunt.
   */
  continueAvianBriefing(): boolean {
    const ui = this.scene.isActive(SCENES.GameUI) ? (this.scene.get(SCENES.GameUI) as GameUIScene) : null;
    const dialogue = ui?.dialogue;
    const roland = this.npcs.find((n) => n.definition.id === TUTORIAL_QUEST_06.npcId);
    if (!ui || !dialogue || dialogue.isOpen || !roland || !QuestService.advance06(this.character, 'finalTalk')) return false;
    const { character } = this;
    this.beginConversation(ui);
    dialogue.open(roland.definition.name, DIALOGUES[TUTORIAL_QUEST_06.finalDialogueId], () => {
      this.combat.setSuspended(false);
      QuestService.advance06(character, 'startHunt');
    }, {
      onInterrupted: () => {
        this.combat.setSuspended(false);
        QuestService.advance06(character, 'cancelFinal');
      },
    });
    return true;
  }

  /** The Power Thrust scroll, once per character (grant id). Not given = the reason is shown and Roland can be asked again. */
  private giveQuest06Scroll(ui: GameUIScene): void {
    const error = InventoryService.grantOnce(this.character, TUTORIAL_QUEST_06.reward);
    if (error !== null && error !== 'alreadyGranted') {
      console.error(`[quests] ${TUTORIAL_QUEST_06.id}: scroll not given (${error})`);
      ui.notifications?.showText(t(error === 'bagFull' ? 'notifications.bagFull' : 'notifications.itemFailed'));
      QuestService.advance06(this.character, 'cancelTalk');
      return;
    }
    QuestService.advance06(this.character, 'scrollGiven');
  }

  /**
   * The Dark Avian for the dialogue picture: the top half of its first idle frame (the art is drawn 32 px above
   * the ground line, so the lower half of the cell is empty). The extra frame is added to the loaded sheet once.
   */
  private avianPreview(): { texture: string; frame: string | number; scale: number } {
    const key = monsterSheetKey('dark_avian', 'idle');
    if (!this.textures.exists(key)) return { texture: key, frame: 0, scale: 3 };
    const texture = this.textures.get(key);
    const PREVIEW = 'dialogue_preview';
    if (!texture.has(PREVIEW)) {
      const f = texture.get(0);
      texture.add(PREVIEW, f.sourceIndex, f.cutX, f.cutY, f.cutWidth, Math.floor(f.cutHeight / 2));
    }
    return { texture: key, frame: PREVIEW, scale: 3 };
  }

  /**
   * The potion training's last part (dialogues 6-9, the Mutant Wolf picture on the 8th): right after the hotkey
   * was assigned, or by talking to Roland again (e.g. after loading). Its end starts the wolf hunt.
   */
  continuePotionTraining(): boolean {
    const ui = this.scene.isActive(SCENES.GameUI) ? (this.scene.get(SCENES.GameUI) as GameUIScene) : null;
    const dialogue = ui?.dialogue;
    const roland = this.npcs.find((n) => n.definition.id === TUTORIAL_QUEST_04.npcId);
    if (!ui || !dialogue || dialogue.isOpen || !roland || !QuestService.advance04(this.character, 'finalTalk')) return false;
    const { character } = this;
    this.beginConversation(ui);
    const picture = { texture: monsterSheetKey('mutant_wolf', 'idle'), frame: 0, scale: 2 };
    dialogue.open(roland.definition.name, DIALOGUES[TUTORIAL_QUEST_04.finalDialogueId], () => {
      this.combat.setSuspended(false);
      QuestService.advance04(character, 'complete');
    }, {
      picture: (step) => (step === TUTORIAL_QUEST_04.wolfPreviewStep ? picture : null),
      onInterrupted: () => {
        this.combat.setSuspended(false);
        QuestService.advance04(character, 'cancelFinal');
      },
    });
    return true;
  }

  /**
   * Uses one of an item (Inventory USE, hotbar): every rule is checked first - alive, not blocked by a tutorial
   * step, one in the bag, HP not full - and only then is ONE taken out of the bag and HP restored (never above
   * max HP). null = used; otherwise why not (nothing changed).
   */
  useItem(itemId: string, bagIndex = -1): UseProblem | ScrollProblem | null {
    if (!this.ready) return 'notUsable';
    if (itemDefinition(itemId)?.category === 'skill_scroll') return this.useScroll(itemId, bagIndex);
    const { character } = this;
    const hp = this.combat.getPlayerHp();
    const maxHp = this.combat.getPlayerMaxHp();
    const sp = this.combat.getPlayerSp();
    const maxSp = this.combat.getPlayerMaxSp();
    const problem = useProblem(itemId, {
      alive: this.death.life.isAlive() && !this.combat.isDefeated(),
      quantity: itemCount(character.inventory, itemId),
      hp,
      maxHp,
      sp,
      maxSp,
      blocked: !this.canPerform('useItem') || QuestService.isItemUseBlocked(character),
    });
    if (problem) return problem;
    if (this.time.now < this.potionGuardUntil) return 'blocked'; // one just went in (manual and automatic at once)
    const restore = hpRestored(itemId, hp, maxHp);
    const restoreSp = spRestored(itemId, sp, maxSp);
    if (!InventoryService.consumeOne(character, itemId, bagIndex)) return 'none';
    this.potionGuardUntil = this.time.now + POTION_DOUBLE_USE_GUARD_MS;
    if (restore > 0) this.combat.healPlayer(restore);
    if (restoreSp > 0) this.combat.restoreSp(restoreSp);
    return null;
  }

  /** Q / W: the potion on that slot, by the normal USE rules (nothing at full HP). An empty slot does nothing. */
  usePotionSlot(key: PotionSlotKey): UseProblem | ScrollProblem | null {
    const itemId = HotbarService.potions(this.character)[key];
    return itemId ? this.useItem(itemId) : null;
  }

  /**
   * A skill scroll: checked first (alive, no conversation, one in the bag, skill not known yet), then ONE is taken
   * out of the bag and its skill is learned for good. A known skill uses nothing up.
   */
  private useScroll(itemId: string, bagIndex: number): ScrollProblem | null {
    const { character } = this;
    const ui = this.scene.isActive(SCENES.GameUI) ? (this.scene.get(SCENES.GameUI) as GameUIScene) : null;
    const problem = scrollProblem(itemId, {
      alive: this.death.life.isAlive() && !this.combat.isDefeated(),
      // Roland's guide lines are not modal: the scroll tutorial asks for this very click
      blocked: !this.death.life.canPerform('useItem') || (ui?.dialogue?.isModal ?? false),
      quantity: itemCount(character.inventory, itemId),
      learned: (skill) => SkillService.isLearned(character, skill),
    });
    if (problem) return problem;
    const skill = itemDefinition(itemId)?.teaches;
    if (!skill || !InventoryService.consumeOne(character, itemId, bagIndex)) return 'none';
    SkillService.learn(character, skill);
    return null;
  }

  /** A hotbar slot (key 1-8 or a click): uses its item, or its skill (learned skills only). */
  useHotbarSlot(slot: number): UseProblem | ScrollProblem | null {
    const entry = HotbarService.state(this.character)[slot] ?? null;
    if (!entry) return null;
    if (entry.type === 'item') return this.useItem(entry.itemId);
    this.useSkill(entry.skillId);
    return null;
  }

  /**
   * A skill from the hotbar. Power Thrust enters target-select mode (the click on a monster casts it: it replaces
   * the next swing on that target, same hit frame and VFX); Heal restores 30 % of max HP at once with the cast
   * animation and then waits 30 s. Why a skill did nothing is shown as a notice.
   */
  private useSkill(id: string): void {
    const ui = this.scene.isActive(SCENES.GameUI) ? (this.scene.get(SCENES.GameUI) as GameUIScene) : null;
    const notify = (key: TranslationKey, params?: Record<string, string | number>): void => ui?.notifications?.showText(t(key, params));
    if (!this.ready || !this.death.life.isAlive() || this.combat.isDefeated()) return;
    if (!isSkillId(id) || !SkillService.isLearned(this.character, id)) {
      notify('notifications.skillLocked');
      return;
    }
    const def = SKILL_DEFINITIONS[id];
    const now = this.time.now;
    const readyAt = this.skillReadyAt.get(id) ?? 0;
    if (now < readyAt) {
      notify('notifications.skillCooldown', { skill: labels.skillName(id), seconds: Math.ceil((readyAt - now) / 1000) });
      return;
    }
    if (this.combat.getPlayerSp() < def.spCost) {
      notify('notifications.notEnoughSp', { skill: labels.skillName(id), cost: def.spCost });
      return;
    }
    if (needsTarget(def)) {
      // target-required: no cast yet - the skill cursor asks for the target, the click casts it
      if (this.canPerform('attack')) this.beginSkillTargeting(id);
      return;
    }
    // self-target (Heal): cast at once on the player, never target-select mode
    if (this.castSelfSkill(id) === 'hpFull') notify('notifications.hpFull');
  }

  /** Learned, off cooldown and enough SP. */
  private skillReady(id: SkillId): boolean {
    return SkillService.isLearned(this.character, id) && this.time.now >= (this.skillReadyAt.get(id) ?? 0) && this.combat.getPlayerSp() >= SKILL_DEFINITIONS[id].spCost;
  }

  /** A skill's cooldown now (HUD sweep): remaining / total ms from its real ready time, or null when ready. */
  skillCooldown(id: string): { remainingMs: number; totalMs: number } | null {
    if (!isSkillId(id)) return null;
    const remainingMs = (this.skillReadyAt.get(id) ?? 0) - this.time.now;
    const totalMs = SKILL_DEFINITIONS[id].cooldownMs;
    return remainingMs > 0 && totalMs > 0 ? { remainingMs: Math.min(remainingMs, totalMs), totalMs } : null;
  }

  /** It goes off now: pays the SP and starts the cooldown (false = it cannot: nothing paid). */
  private activateSkill(id: SkillId): boolean {
    const def = SKILL_DEFINITIONS[id];
    if (!this.skillReady(id) || !this.combat.spendSp(def.spCost)) return false;
    if (def.cooldownMs > 0) this.skillReadyAt.set(id, this.time.now + def.cooldownMs);
    return true;
  }

  /** A self skill (Heal) on the player: hotkey and Auto Play. null = cast; otherwise why not (nothing changed). */
  private castSelfSkill(id: SkillId): 'hpFull' | 'blocked' | null {
    const def = SKILL_DEFINITIONS[id];
    if (def.kind !== 'heal' || !this.skillReady(id) || !this.canPerform('cast')) return 'blocked';
    const maxHp = this.combat.getPlayerMaxHp();
    if (this.combat.getPlayerHp() >= maxHp) return 'hpFull';
    if (!this.activateSkill(id)) return 'blocked'; // SP paid, cooldown started - only now
    this.player.actions.play('cast', CAST_FACING[this.player.getFacing()]);
    this.combat.healPlayer(skillHealAmount(def, maxHp));
    return null;
  }

  /** A target skill on a monster: the target click and Auto Play. It replaces the next swing on that monster. */
  private castAttackSkill(id: SkillId, monster: MonsterEntity): boolean {
    const def = SKILL_DEFINITIONS[id];
    if (def.kind !== 'attack' || !this.skillReady(id) || !this.canPerform('attack')) return false;
    if (this.combat.getTarget() !== monster) this.combat.attack(monster);
    // queued for the next swing: SP is paid and the cooldown starts when that swing really goes off
    return this.combat.useSkill(def.attackId, () => this.activateSkill(id));
  }

  // -------------------------------------------------------------------------------------------
  // Auto Play (attack only): AutoPlayController decides, these are its hands - the same commands as manual play.
  // -------------------------------------------------------------------------------------------

  private autoPlayPort(): ConstructorParameters<typeof AutoPlayController<MonsterEntity>>[0] {
    const range = (): number => this.combat.playerStats().attackRange;
    return {
      now: () => this.time.now,
      canAct: () => this.ready && this.death.life.isAlive() && !this.combat.isDefeated() && this.canPerform('attack'),
      me: () => this.player.getTilePosition(),
      hp: () => this.combat.getPlayerHp(),
      maxHp: () => this.combat.getPlayerMaxHp(),
      candidates: () =>
        this.monsters.getMonsters().map((m) => ({ ref: m, monsterId: m.definition.id, position: m.position, alive: m.isAlive(), engaged: m.getMode() === 'chase' })),
      currentTarget: () => this.combat.getTarget(),
      attack: (m) => {
        this.npcInteraction.cancel();
        this.combat.attack(m);
      },
      hasQueuedSkill: () => this.combat.getQueuedSkill() !== null,
      inReach: (m) => {
        const me = this.player.getTilePosition();
        return Math.hypot(m.position.x - me.x, m.position.y - me.y) <= range() + 1;
      },
      hotbar: () => HotbarService.state(this.character),
      learned: (id) => SkillService.isLearned(this.character, id),
      skillReady: (id) => this.skillReady(id),
      castAttackSkill: (id, m) => this.castAttackSkill(id, m),
      castSelfSkill: (id) => this.castSelfSkill(id) === null,
      // ONLY the potion on Q - an empty slot or none left skips it (the bag is never searched for another one)
      drinkPotion: () => {
        const id = HotbarService.potions(this.character).hp;
        return id !== null && itemCount(this.character.inventory, id) > 0 && this.useItem(id) === null;
      },
      // ONLY the potion on W (the SP Recovery Potion) - an empty slot or none left skips it
      sp: () => ({ sp: this.combat.getPlayerSp(), max: this.combat.getPlayerMaxSp() }),
      recoverSp: () => {
        const id = HotbarService.potions(this.character).sp;
        return id !== null && itemCount(this.character.inventory, id) > 0 && this.useItem(id) === null;
      },
      moveTo: (p) => this.combat.moveTo(p),
      isMoving: () => this.player.hasPath(),
    };
  }

  /**
   * Auto Play was just switched off: the target is cleared with its pending swing and queued skill (nothing lands,
   * nothing is paid), the walk path is dropped and the character stands idle. Nothing retargets until it is
   * started again; manual clicks work at once. Settings are untouched. (At death the death flow handles all of it.)
   */
  private stopAutoPlayActions(): void {
    this.autoPlay.stop();
    if (!this.ready || !this.death.life.isAlive() || this.combat.isDefeated()) return;
    this.combat.clearTarget();
    this.player.actions.reset?.();
    this.player.halt();
  }

  /** Runs Auto Play, turns it off at death (it never restarts by itself) and shows the hunting circle. */
  private updateAutoPlay(alive: boolean): void {
    const c = this.character;
    if (AutoPlayService.isOn(c) && !alive) {
      AutoPlayService.setOn(c, false);
      this.uiScene()?.notifications?.showText(t('autoPlay.offDeath'));
    }
    const on = AutoPlayService.isOn(c);
    const settings = AutoPlayService.settings(c);
    this.autoPlay.update(on, settings);
    this.autoRange.show(on && settings.range.mode === 'radius' ? { center: this.autoPlay.anchor, radius: settings.range.radius } : null);
  }

  /** The usual EXP / LEVEL UP feedback for quest EXP that was just paid (nothing when it was not). */
  private showQuestExp(paid: QuestExpPaid | null): void {
    if (paid && paid.exp > 0) this.combat.showExpGain(paid.exp, paid.levels);
  }

  private beginConversation(ui: GameUIScene): void {
    this.navigation.cancel();
    ui.closeAllWindows();
    this.combat.setSuspended(true);
    this.player.halt();
  }

  /**
   * The Rusty Dagger, once per character. False = it could not be given: the reason is shown, the conversation
   * ends and Mateus can be asked again - the quest never goes on without the item.
   */
  private giveQuest02Reward(ui: GameUIScene): boolean {
    const error = InventoryService.grantOnce(this.character, TUTORIAL_QUEST_02.reward);
    if (error !== null && error !== 'alreadyGranted') {
      console.error(`[quests] ${TUTORIAL_QUEST_02.id}: reward not given (${error})`);
      ui.notifications?.showText(t(error === 'bagFull' ? 'notifications.bagFull' : 'notifications.itemFailed'));
      return false;
    }
    return QuestService.advance02(this.character, 'grantReward');
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.ready) return;
    // the pressed skill cursor lasts while the button is held: back to "ready", or to the normal cursor after a cast
    if (this.skillCursor.state === 'press') this.skillCursor.set(this.skillTargeting ? 'idle' : 'none');
    this.monsterCursor.release(this.pointerOverMonster(pointer) !== null);
    this.npcCursor.release(this.pointerTarget(pointer) === 'npc');
  }

  // -------------------------------------------------------------------------------------------
  // Skill target-select mode: a target-required skill from the hotbar shows the skill cursor; the next left click
  // on a monster IS the cast (that monster becomes the target and the skill replaces the next swing - same rules
  // as before). Esc, a right click, a window, a conversation or death cancel it. Self skills never enter it.
  // -------------------------------------------------------------------------------------------

  private beginSkillTargeting(id: SkillId): void {
    this.skillTargeting = id;
    this.monsterCursor.reset();
    this.npcCursor.reset();
    this.skillCursor.set('idle');
  }

  private cancelSkillTargeting(): void {
    this.skillTargeting = null;
    this.skillCursor.set('none');
  }

  private onTargetingPointerDown(pointer: Phaser.Input.Pointer): void {
    const id = this.skillTargeting!;
    if (pointer.rightButtonDown()) {
      this.suppressContextMenu = true;
      this.cancelSkillTargeting();
      return;
    }
    if (!pointer.leftButtonDown() || this.isOverUi(pointer)) return;
    this.skillCursor.set('press');
    const world = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    const monster = this.pickMonster(world.x, world.y);
    // a click beside every monster casts nothing: the mode stays until a monster is clicked or it is cancelled
    if (!monster) return;
    this.npcInteraction.cancel();
    this.autoPlay.notifyManual();
    if (!this.castAttackSkill(id, monster)) return;
    this.skillTargeting = null; // cast: the cursor goes back to normal when the button is released
  }

  private uiScene(): GameUIScene | null {
    return this.scene.isActive(SCENES.GameUI) ? (this.scene.get(SCENES.GameUI) as GameUIScene) : null;
  }

  private onPointerOut(): void {
    this.monsterCursor?.reset();
    this.npcCursor?.reset();
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
    CharacterStatusService.startNew(fallback);
    CharacterStore.startSession(fallback);
    return fallback;
  }

  private returnToMenu(): void {
    if (this.leaving || (!this.ready && !this.failed)) return;
    this.leaving = true;
    this.scene.stop(SCENES.GameUI);
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(SCENES.MainMenu);
    });
  }
}
