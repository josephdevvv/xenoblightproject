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
import { HotbarService } from '../hotbar/HotbarService';
import { itemCount } from '../inventory/InventoryState';
import { hpRestored, useProblem, type UseProblem } from '../items/ConsumableUse';
import { isActiveSkillId, isSkillUnlocked } from '../skills/ActiveSkills';
import { monsterSheetKey } from '../monsters/art/MonsterArt';
import { InventoryService } from '../inventory/InventoryService';
import { MONSTER_CURSOR, MonsterCursor } from '../ui/world/MonsterCursor';
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
import { DEFAULT_MAP_ID } from '../world/loading/MapRegistry';
import { placeSavedLocation, type SavedLocation } from '../save/SavedLocation';
import { respawnTile } from '../world/SpawnPoints';

export interface GameSceneData {
  /** Save point of a loaded save file: the player continues there; otherwise at the map's start. */
  savedLocation?: SavedLocation | null;
}

const CULLING_DEBUG_SOURCE = 'Culling';
const MONSTER_DEBUG_SOURCE = 'Monsters';
/** Cache owner of the player's own art (standing, walk, combat sheets, impact VFX) while this scene runs. */
const PLAYER_ART_OWNER = 'player-art';
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
  /** Stationary NPCs on this map. */
  npcs: NpcEntity[] = [];
  /** Left click on an NPC that has something to say (walk there, then talk). */
  npcInteraction!: NpcInteraction<NpcEntity>;
  /** Dotted path on the ground to the active quest's NPC. */
  questTrail!: PathTrail;
  questTrailView!: PathTrailView;
  private character!: CharacterData;
  clickMarker!: ClickMarker;
  monsterCursor!: MonsterCursor;
  private readonly monstersWithArt = new Set<MonsterId>();
  private loading!: LoadingScreen;
  private mapId = DEFAULT_MAP_ID;
  private ready = false;
  private failed = false;
  private leaving = false;
  /** Only for placing the player once after loading a file - respawning never uses it. */
  private loadedLocation: SavedLocation | null = null;

  constructor() {
    super(SCENES.Game);
  }

  create(data: GameSceneData = {}): void {
    this.loadedLocation = data.savedLocation ?? null;
    this.scene.settings.data = {}; // Phaser would hand the same data to the next start without any
    this.ready = false;
    this.failed = false;
    this.leaving = false;
    const character = this.resolveCharacter();
    this.character = character;

    this.cameras.main.setBackgroundColor(PALETTE.void);
    this.loading = new LoadingScreen(this).show(t('world.entering'));

    const onEscape = (): void => {
      // dying / dead / respawning: only the respawn button leaves the death screen
      if (this.death && !this.death.life.isAlive()) return;
      if (this.isTalking()) return; // a conversation ends with its own NEXT button
      // An open UI window closes first; otherwise ESC leaves the game (asked first: nothing is saved by itself).
      const ui = this.scene.isActive(SCENES.GameUI) ? (this.scene.get(SCENES.GameUI) as GameUIScene) : null;
      if (ui?.closeWindows()) return;
      if (ui && this.ready) ui.confirmLeave(() => this.returnToMenu());
      else this.returnToMenu();
    };
    this.input.keyboard?.on('keydown-ESC', onEscape);
    // Keys 1-8 belong to the hotbar (GameUIScene). Skills are disabled for now: no key fires one directly -
    // when they come back they are used through the hotbar (useHotbarSlot).
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.input.on(Phaser.Input.Events.GAME_OUT, this.onPointerOut, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.ready = false;
      this.input.keyboard?.off('keydown-ESC', onEscape);
      this.attackVfx?.dispose();
      this.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
      this.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
      this.input.off(Phaser.Input.Events.GAME_OUT, this.onPointerOut, this);
      this.monsterCursor?.reset();
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
    if (alive && !this.isTalking()) this.player.update(delta);
    if (alive) this.npcInteraction.update();
    else this.npcInteraction.cancel();
    this.questTrail.update(delta, this.player.getTilePosition(), alive ? (this.questNpc()?.position ?? null) : null);
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
    // pointer outside the canvas keeps its last position: only a pointer over the game can hover
    this.monsterCursor.update(delta, alive && !this.isTalking() && this.input.manager.isOver && this.pointerOverMonster(this.input.activePointer) !== null);
    this.map.updateOcclusion(this.player.getFootprint(), this.player.getScreenRect(), delta);
    this.atmosphere.update(delta);
    this.culler.update();
    this.hud.update(this.player.view);
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

    // A loaded save: back where the player stood, if one can stand there on this map
    const saved = placeSavedLocation(this.loadedLocation, this.mapId, this.map, PLAYER_MOVEMENT.radius);
    this.loadedLocation = null;
    if (saved) this.player.teleport(saved);
    const startWorld = saved ? this.map.tileToWorld(saved.x, saved.y) : spawnWorld;

    // Combat: player vs monsters, click targeting (see onPointerDown)
    this.combat = new CombatSystem(this, character, this.player, this.monsters);
    this.attackVfx = new AttackVfxLayer(this);
    this.combat.vfx = this.attackVfx;
    this.playerCombat = this.combatSet ? new PlayerCombatAnimator(view, this.combatSet) : null;
    if (this.playerCombat) this.player.actions = this.playerCombat;
    this.npcInteraction = new NpcInteraction<NpcEntity>(this.player, (npc) => this.talkTo(npc));
    const onManualMove = this.player.onManualMove;
    this.player.onManualMove = () => {
      onManualMove?.();
      this.npcInteraction.cancel();
    };
    // The tutorial quests follow what the player does (first passive node, dagger worn, a stat point spent)
    const syncQuest = (c: CharacterData): void => {
      if (c === character) QuestService.sync(c);
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, CharacterStatusService.onChange(syncQuest));
    this.questTrail = new PathTrail(new Pathfinder(this.map.layout, { radius: PLAYER_MOVEMENT.radius }));
    this.questTrailView = new PathTrailView(this, (x, y) => this.map.tileToWorld(x, y));
    this.clickMarker = new ClickMarker(this);
    this.monsterCursor = new MonsterCursor(this.textures);

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
    this.hud.update(this.player.view);
  }

  /**
   * Left click: a monster under the pointer is targeted (approach + attack until it dies); an NPC with
   * something to say is approached and talked to; anywhere else on walkable ground the player walks there. Clicks on the HUD / open windows never reach the world.
   */
  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.ready || !pointer.leftButtonDown() || !this.canPerform('move') || this.isOverUi(pointer)) return;
    this.npcInteraction.cancel(); // any new command replaces a pending approach
    const world = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    const monster = this.pickMonster(world.x, world.y);
    const npc = this.pickTalkingNpc(world.x, world.y);
    if (npc && (!monster || npc.sprite.depth >= monster.sprite.depth)) {
      if (!this.canPerform('interact')) return;
      this.combat.clearTarget();
      this.npcInteraction.request(npc);
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
  // -------------------------------------------------------------------------------------------

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
    return isQuest05AtRoland(QuestService.quest05(c)) ? TUTORIAL_QUEST_05.npcId : null;
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
  }

  /** NPCs that react to a click now (the others behave as before: the click is a walk command). */
  private pickTalkingNpc(x: number, y: number): NpcEntity | null {
    const npc = this.questNpc();
    return npc?.contains(x, y) ? npc : null;
  }

  private talkTo(npc: NpcEntity): void {
    const ui = this.scene.isActive(SCENES.GameUI) ? (this.scene.get(SCENES.GameUI) as GameUIScene) : null;
    const dialogue = ui?.dialogue;
    if (!ui || !dialogue || dialogue.isOpen || npc !== this.questNpc()) return;
    const { character } = this;
    const name = npc.definition.name;
    if (npc.definition.id === TUTORIAL_QUEST_04.npcId) {
      this.talkToRoland(ui, name);
      return;
    }
    if (QuestService.advance(character, 'talk')) {
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

  /** Roland's conversations: potion training (start, and its last part after the hotkey) and the wolf hunt's turn-in. */
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
    return false;
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
  useItem(itemId: string, bagIndex = -1): UseProblem | null {
    if (!this.ready) return 'notUsable';
    const { character } = this;
    const hp = this.combat.getPlayerHp();
    const maxHp = this.combat.getPlayerMaxHp();
    const problem = useProblem(itemId, {
      alive: this.death.life.isAlive() && !this.combat.isDefeated(),
      quantity: itemCount(character.inventory, itemId),
      hp,
      maxHp,
      blocked: !this.canPerform('useItem') || QuestService.isItemUseBlocked(character),
    });
    if (problem) return problem;
    const restore = hpRestored(itemId, hp, maxHp);
    if (!InventoryService.consumeOne(character, itemId, bagIndex)) return 'none';
    this.combat.healPlayer(restore);
    return null;
  }

  /** A hotbar slot (key 1-8 or a click): uses its item, or its skill once skills can be unlocked. */
  useHotbarSlot(slot: number): UseProblem | null {
    const entry = HotbarService.state(this.character)[slot] ?? null;
    if (!entry) return null;
    if (entry.type === 'item') return this.useItem(entry.itemId);
    // skills are disabled: nothing is unlocked, so nothing happens
    if (isActiveSkillId(entry.skillId) && isSkillUnlocked(this.character, entry.skillId) && this.canPerform('attack')) this.combat.useSkill(entry.skillId);
    return null;
  }

  /** The usual EXP / LEVEL UP feedback for quest EXP that was just paid (nothing when it was not). */
  private showQuestExp(paid: QuestExpPaid | null): void {
    if (paid && paid.exp > 0) this.combat.showExpGain(paid.exp, paid.levels);
  }

  private beginConversation(ui: GameUIScene): void {
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
