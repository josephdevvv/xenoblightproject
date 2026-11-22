import Phaser from 'phaser';
import { SCENES } from '../config/constants';
import type { CharacterData } from '../data/CharacterData';
import { CharacterStore } from '../data/CharacterStore';
import { DungeonHud } from '../ui/hud/DungeonHud';
import { InventoryWindow } from '../ui/inventory/InventoryWindow';
import { PassiveTreeWindow } from '../ui/passiveTree/PassiveTreeWindow';
import { DeathOverlay } from '../ui/death/DeathOverlay';
import { DialogueWindow } from '../ui/dialogue/DialogueWindow';
import { rectOfObject, SpotlightOverlay, type SpotlightTarget } from '../ui/tutorial/SpotlightOverlay';
import { t } from '../i18n';
import { QuestService } from '../quests/QuestService';
import { isQuest01Active, TUTORIAL_QUEST_01 } from '../quests/TutorialQuest01';
import { equipmentTutorialStep, isQuest02AtMateus, TUTORIAL_QUEST_02 } from '../quests/TutorialQuest02';
import { characterInventorySource } from '../inventory/CharacterInventorySource';
import { InventoryService } from '../inventory/InventoryService';
import { bagIndexOf } from '../inventory/InventoryState';
import { ItemNotifications } from '../ui/notifications/ItemNotifications';
import { availablePoints } from '../passives/PassiveProgress';
import { CharacterStatusService } from '../status/CharacterStatusService';
import { SettingsWindow } from '../ui/SettingsWindow';
import { StatusWindow } from '../ui/StatusWindow';
import type { GameScene } from './GameScene';

export interface GameUISceneData {
  characterId?: string;
}

/**
 * Screen-space gameplay UI drawn above GameScene (launched / stopped by it): the dungeon HUD, the
 * Status window and Settings. Keeping the UI in its own scene means its camera never scrolls and its
 * pointer input never reaches the world.
 */
export class GameUIScene extends Phaser.Scene {
  private character: CharacterData | null = null;
  private statusWindow: StatusWindow | null = null;
  private hud: DungeonHud | null = null;
  private settingsWindow: SettingsWindow | null = null;
  private passiveWindow: PassiveTreeWindow | null = null;
  private inventoryWindow: InventoryWindow | null = null;
  private deathOverlay: DeathOverlay | null = null;
  private dialogueWindow: DialogueWindow | null = null;
  private spotlightOverlay: SpotlightOverlay | null = null;
  private itemNotifications: ItemNotifications | null = null;

  constructor() {
    super(SCENES.GameUI);
  }

  create(data: GameUISceneData): void {
    this.statusWindow = null;
    this.hud = null;
    this.settingsWindow = null;
    this.passiveWindow = null;
    this.inventoryWindow = null;
    this.deathOverlay = null;
    this.dialogueWindow = null;
    this.spotlightOverlay = null;
    this.itemNotifications = null;
    const character = this.resolveCharacter(data.characterId);
    this.character = character;
    const game = this.gameScene();
    if (!character || !game?.map) {
      console.warn('[GameUI] no active character or map; UI not created');
      return;
    }
    this.hud = new DungeonHud(
      this,
      {
        character,
        map: game.map,
        onStatus: () => this.canOpenWindows() && this.statusWindow?.toggle(),
        onSettings: () => this.canOpenWindows() && this.settingsWindow?.toggle(),
        onPassive: () => this.canOpenWindows() && this.togglePassiveTree(),
        onInventory: () => this.canOpenWindows() && this.toggleInventory(),
        currentHp: () => this.gameScene()?.combat?.getPlayerHp() ?? Number.POSITIVE_INFINITY,
      },
      0,
    );
    this.statusWindow = new StatusWindow(this, character, 10);
    // nothing is taken off while the equipment tutorial is still running
    const canUnequip = (): boolean => QuestService.quest02(character).state !== 'EQUIPMENT_TUTORIAL';
    this.inventoryWindow = new InventoryWindow(this, 12, characterInventorySource(character, canUnequip));
    this.inventoryWindow.onUnequipProblem = (problem) => {
      if (problem === 'bagFull') this.itemNotifications?.showText(t('notifications.bagFull'));
      else if (problem === 'notSaved') this.itemNotifications?.showText(t('notifications.unequipFailed'));
    };
    // I toggles the Inventory (not while Settings is open on top).
    const onI = (): void => {
      if (this.canOpenWindows() && !this.settingsWindow?.isOpen) this.toggleInventory();
    };
    this.input.keyboard?.on('keydown-I', onI);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown-I', onI));
    if (character.passives) {
      const passive = new PassiveTreeWindow(this, character, 14);
      this.passiveWindow = passive;
      passive.onStateChange = () => this.refreshPassiveGuide(character);
      // the passive tutorial begins after the conversation with Mateus (Tutorial Quest 01)
      passive.tutorialEnabled = () => QuestService.isPassiveTutorialOpen(character);
      const unsubscribe = CharacterStatusService.onChange((c) => {
        if (c === character) this.refreshPassiveGuide(character);
      });
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);
      // P toggles the tree (not while Settings is open on top).
      const onP = (): void => {
        if (this.canOpenWindows() && !this.settingsWindow?.isOpen) this.togglePassiveTree();
      };
      this.input.keyboard?.on('keydown-P', onP);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown-P', onP));
      this.refreshPassiveGuide(character);
    }
    this.settingsWindow = new SettingsWindow(this, { depth: 20 });
    // Quests: tracker, NPC dialogue (above the windows, below the death screen).
    this.dialogueWindow = new DialogueWindow(this, 30);
    const refreshQuest = (): void => {
      const quest02 = QuestService.quest02(character);
      if (isQuest01Active(QuestService.quest01(character))) this.hud?.setQuest(TUTORIAL_QUEST_01.id);
      else if (isQuest02AtMateus(quest02)) this.hud?.setQuest(TUTORIAL_QUEST_02.id);
      else if (quest02.state === 'EQUIPMENT_TUTORIAL') this.hud?.setQuest(TUTORIAL_QUEST_02.id, 'objectiveEquip');
      else this.hud?.setQuest(null);
      this.refreshPassiveGuide(character);
      // at once, not next frame: fast clicking through the dialogue must not reach the world behind it
      this.spotlightOverlay?.update(0, this.spotlightTarget());
    };
    const offQuest = QuestService.onChange((c) => {
      if (c === character) refreshQuest();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, offQuest);
    refreshQuest();
    // Tutorial spotlight: above the HUD and the windows, below dialogue and the death screen.
    this.spotlightOverlay = new SpotlightOverlay(this, 25);
    // Notices for received items: below the minimap, above dialogue, below the death screen.
    const notifications = new ItemNotifications(this, { ...this.hud.belowMinimap, right: Math.min(this.scale.width - 4, this.hud.belowMinimap.right + 8) }, 36);
    this.itemNotifications = notifications;
    const offGained = InventoryService.onGained((c, itemId, quantity) => {
      if (c === character) notifications.showItem(itemId, quantity);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, offGained);
    // Death screen above everything (HUD, windows): blocks all input while the player is not alive.
    const death = new DeathOverlay(this, 40);
    this.deathOverlay = death;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => death.dispose());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.statusWindow = null;
      this.hud = null;
      this.settingsWindow = null;
      this.passiveWindow = null;
      this.inventoryWindow = null;
      this.deathOverlay = null;
      this.dialogueWindow = null;
      this.spotlightOverlay = null;
      this.itemNotifications = null;
    });
  }

  update(_time: number, delta: number): void {
    this.deathOverlay?.update(delta);
    this.spotlightOverlay?.update(delta, this.spotlightTarget());
    this.itemNotifications?.update(delta);
    const game = this.gameScene();
    if (!this.hud || !game?.player) return;
    this.hud.update(
      game.player.getTilePosition(),
      game.monsters
        .getMonsters()
        .filter((m) => m.isAlive())
        .map((m) => m.position),
    );
  }

  /**
   * True when the pointer is over UI: an interactive UI element, a visible pixel of HUD art (cropped
   * images such as the minimap count only their visible window) or an open window. World clicks are
   * ignored there, so the UI never moves or attacks.
   */
  isPointerOverUi(pointer: Phaser.Input.Pointer): boolean {
    // a tutorial spotlight shuts the world out completely
    if (this.spotlightOverlay?.isActive || this.input.hitTestPointer(pointer).length > 0) return true;
    const x = pointer.x;
    const y = pointer.y;
    for (const o of this.children.list) {
      const v = o as Phaser.GameObjects.GameObject & Partial<Phaser.GameObjects.Components.Visible & Phaser.GameObjects.Components.AlphaSingle>;
      if (v.visible === false || v.alpha === 0) continue;
      if (o instanceof Phaser.GameObjects.Image) {
        if (o.isCropped) {
          const c = (o as unknown as { _crop: { x: number; y: number; width: number; height: number } })._crop;
          const left = o.x - o.displayOriginX + c.x;
          const top = o.y - o.displayOriginY + c.y;
          if (x >= left && x < left + c.width && y >= top && y < top + c.height) return true;
          continue;
        }
        const b = o.getBounds();
        if (!b.contains(x, y)) continue;
        const lx = Math.floor((x - b.x) / (o.scaleX || 1));
        const ly = Math.floor((y - b.y) / (o.scaleY || 1));
        const alpha = this.textures.getPixelAlpha(lx, ly, o.texture.key, o.frame.name);
        if (alpha === null || alpha > 0) return true;
      } else if (o instanceof Phaser.GameObjects.Container && o.getBounds().contains(x, y)) {
        return true;
      }
    }
    return false;
  }

  get isStatusOpen(): boolean {
    return this.statusWindow?.isOpen ?? false;
  }

  openStatus(): void {
    this.statusWindow?.show();
  }

  /** Closes any open window (discarding pending changes). Returns true if something was closed. */
  closeWindows(): boolean {
    if (this.settingsWindow?.isOpen) {
      this.settingsWindow.close();
      return true;
    }
    if (this.passiveWindow?.isOpen) {
      this.passiveWindow.close();
      return true;
    }
    if (this.inventoryWindow?.isOpen) {
      this.inventoryWindow.close();
      return true;
    }
    if (this.statusWindow?.isOpen) {
      this.statusWindow.close();
      return true;
    }
    return false;
  }

  /** Windows open only while the player may act: not in a conversation, not dying / dead. */
  private canOpenWindows(): boolean {
    return this.gameScene()?.canPerform('openWindow') ?? true;
  }

  /** The tutorial spotlight. */
  get spotlight(): SpotlightOverlay | null {
    return this.spotlightOverlay;
  }

  /** Notices on the right below the minimap. */
  get notifications(): ItemNotifications | null {
    return this.itemNotifications;
  }

  /**
   * The control a tutorial asks for now. None while the player may not act (conversation, dying, dead) or
   * another window is open; it comes back by itself afterwards.
   */
  private spotlightTarget(): SpotlightTarget | null {
    if (!this.canOpenWindows() || this.statusWindow?.isOpen || this.settingsWindow?.isOpen) return null;
    return this.passiveSpotlight() ?? this.equipmentSpotlight();
  }

  /**
   * Passive Tree tutorial: its menu button, then the center node, then UNLOCK (the tutorial's own steps - they
   * advance only when the thing was really done).
   */
  private passiveSpotlight(): SpotlightTarget | null {
    const w = this.passiveWindow;
    const step = w?.tutorial;
    if (!w || !step || this.inventoryWindow?.isOpen) return null;
    const control = step === 'open' ? this.hud?.passiveButton : w.tutorialControl;
    return { id: step, rect: () => rectOfObject(this, control), label: t(`passive.tutorial.${step}`) };
  }

  /** Equipment tutorial (Tutorial Quest 02): Inventory button, the dagger in the bag, the Weapon slot. */
  private equipmentSpotlight(): SpotlightTarget | null {
    const { character, inventoryWindow: w } = this;
    if (!character || !w || this.passiveWindow?.isOpen) return null;
    const step = equipmentTutorialStep(QuestService.quest02(character), character.inventory, w.isOpen, w.selection.current);
    if (!step) return null;
    const control =
      step === 'openInventory'
        ? this.hud?.inventoryButton
        : w.slotZone(step === 'selectItem' ? { kind: 'bag', index: bagIndexOf(character.inventory, TUTORIAL_QUEST_02.reward.itemId) } : { kind: 'equipment', slot: 'weapon' });
    return { id: step, rect: () => rectOfObject(this, control), label: t(`equipmentTutorial.${step}`) };
  }

  /** The NPC dialogue window. */
  get dialogue(): DialogueWindow | null {
    return this.dialogueWindow;
  }

  get isDialogueOpen(): boolean {
    return this.dialogueWindow?.isOpen ?? false;
  }

  /** The death screen (DeathUi for PlayerDeathController). */
  get death(): DeathOverlay | null {
    return this.deathOverlay;
  }

  /** Closes every window at once (death). */
  closeAllWindows(): void {
    for (let i = 0; i < 4 && this.closeWindows(); i++);
  }

  get isPassiveTreeOpen(): boolean {
    return this.passiveWindow?.isOpen ?? false;
  }

  get isInventoryOpen(): boolean {
    return this.inventoryWindow?.isOpen ?? false;
  }

  /** Opens / closes the Inventory (one modal window at a time: Status and the Passive Tree close first). */
  toggleInventory(): void {
    const w = this.inventoryWindow;
    if (!w) return;
    if (!w.isOpen) {
      if (this.statusWindow?.isOpen) this.statusWindow.close();
      if (this.passiveWindow?.isOpen) this.passiveWindow.close();
    }
    w.toggle();
  }

  /** Opens / closes the Passive Tree (one modal window at a time: Status and the Inventory close first). */
  togglePassiveTree(): void {
    const w = this.passiveWindow;
    if (!w) return;
    if (!w.isOpen && this.statusWindow?.isOpen) this.statusWindow.close();
    if (!w.isOpen && this.inventoryWindow?.isOpen) this.inventoryWindow.close();
    w.toggle();
  }

  /** The unspent-points pip on the Passive Tree menu button. */
  private refreshPassiveGuide(character: CharacterData): void {
    if (character.passives) this.hud?.setPassivePoints(availablePoints(character.passives) > 0);
  }

  get isSettingsOpen(): boolean {
    return this.settingsWindow?.isOpen ?? false;
  }

  private gameScene(): GameScene | null {
    return this.scene.isActive(SCENES.Game) ? (this.scene.get(SCENES.Game) as GameScene) : null;
  }

  private resolveCharacter(id: string | undefined): CharacterData | null {
    return (id ? CharacterStore.getAll().find((c) => c.id === id) : undefined) ?? CharacterStore.getActive();
  }
}
