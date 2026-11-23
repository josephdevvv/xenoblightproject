import Phaser from 'phaser';
import { SCENES } from '../config/constants';
import type { CharacterData } from '../data/CharacterData';
import { CharacterStore } from '../data/CharacterStore';
import { DungeonHud } from '../ui/hud/DungeonHud';
import { InventoryWindow } from '../ui/inventory/InventoryWindow';
import { PassiveTreeWindow } from '../ui/passiveTree/PassiveTreeWindow';
import { DeathOverlay } from '../ui/death/DeathOverlay';
import { ChoiceDialog } from '../ui/ChoiceDialog';
import { DialogueWindow } from '../ui/dialogue/DialogueWindow';
import { rectOfObject, SpotlightOverlay, type SpotlightTarget } from '../ui/tutorial/SpotlightOverlay';
import { t } from '../i18n';
import { QuestService } from '../quests/QuestService';
import { equipmentTutorialStep, statusTutorialStep, TUTORIAL_QUEST_02 } from '../quests/TutorialQuest02';
import { trackedQuest } from '../quests/QuestTracker';
import { characterInventorySource } from '../inventory/CharacterInventorySource';
import { InventoryService } from '../inventory/InventoryService';
import { bagIndexOf } from '../inventory/InventoryState';
import { isHotkeyPress } from '../ui/input/typing';
import { ItemNotifications } from '../ui/notifications/ItemNotifications';
import { unspentPoints } from '../ui/hud/UnspentPoints';
import { CharacterStatusService } from '../status/CharacterStatusService';
import { downloadText } from '../save/fileIO';
import { SAVE_FILE_NAME, serializeSave } from '../save/SaveFile';
import { SettingsWindow } from '../ui/SettingsWindow';
import { StatusWindow } from '../ui/StatusWindow';
import type { GameScene } from './GameScene';
import { HotbarAssignWindow } from '../ui/hotbar/HotbarAssignWindow';
import { HotbarService } from '../hotbar/HotbarService';
import { hotbarSlotOfKey } from '../hotbar/Hotbar';
import { potionTutorialStep, TUTORIAL_QUEST_04, type PotionTutorialStep } from '../quests/TutorialQuest04';
import { DIALOGUES } from '../dialogue/Dialogues';
import { NPC_DEFINITIONS } from '../npcs/NpcDefinition';
import type { UseProblem } from '../items/ConsumableUse';

/** Spotlight ids of the Status tutorial start with this. */
const STATUS_SPOTLIGHT = 'status.';

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
  /** "Leave the game?" */
  private leaveDialog: ChoiceDialog | null = null;
  private spotlightOverlay: SpotlightOverlay | null = null;
  private itemNotifications: ItemNotifications | null = null;
  /** "Assign Hotkey" (two rows of four slots). */
  private assignWindow: HotbarAssignWindow | null = null;
  /** The potion training step shown last (its guide line is opened when the step begins). */
  private potionStep: PotionTutorialStep | null = null;
  /** A guide line of the potion training suspended combat (and has to let it go again). */
  private guideSuspended = false;

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
    this.leaveDialog = null;
    this.spotlightOverlay = null;
    this.itemNotifications = null;
    this.assignWindow = null;
    this.potionStep = null;
    this.guideSuspended = false;
    const character = this.resolveCharacter(data.characterId);
    this.character = character;
    const game = this.gameScene();
    if (!character || !game?.map) {
      console.warn('[GameUI] no active character or map; UI not created');
      return;
    }
    const currentHp = (): number => this.gameScene()?.combat?.getPlayerHp() ?? Number.POSITIVE_INFINITY;
    this.hud = new DungeonHud(
      this,
      {
        character,
        map: game.map,
        onStatus: () => this.canOpenWindows() && this.toggleStatus(),
        onSettings: () => this.canOpenWindows() && this.settingsWindow?.toggle(),
        onPassive: () => this.canOpenWindows() && this.togglePassiveTree(),
        onInventory: () => this.canOpenWindows() && this.toggleInventory(),
        currentHp,
        onHotbarSlot: (slot) => this.canUseHotbar() && this.useHotbarSlot(slot),
      },
      0,
    );
    this.statusWindow = new StatusWindow(this, character, 10, currentHp);
    // T toggles the Status window, as its HUD button does: not while typing, with Settings open on top, or
    // while a tutorial spotlight shuts other controls out - except the Status tutorial's own spotlight.
    const onT = (e: KeyboardEvent): void => {
      if (!isHotkeyPress(e, document.activeElement as HTMLElement | null)) return;
      const spotlight = this.spotlightOverlay;
      const allowed = !spotlight?.isActive || (spotlight.current?.id.startsWith(STATUS_SPOTLIGHT) ?? false);
      if (this.canOpenWindows() && !this.settingsWindow?.isOpen && allowed) this.toggleStatus();
    };
    this.input.keyboard?.on('keydown-T', onT);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown-T', onT));
    // nothing is taken off while the equipment tutorial is still running
    const canUnequip = (): boolean => QuestService.quest02(character).state !== 'EQUIPMENT_TUTORIAL';
    this.inventoryWindow = new InventoryWindow(this, 12, characterInventorySource(character, canUnequip));
    // Consumables: USE (the game checks every rule) and ASSIGN HOTKEY (a compact window above the Inventory).
    const assign = new HotbarAssignWindow(this, 16);
    this.assignWindow = assign;
    this.inventoryWindow.onUse = (itemId, bagIndex) => this.reportUse(this.gameScene()?.useItem(itemId, bagIndex) ?? 'notUsable');
    this.inventoryWindow.onAssign = (itemId) => assign.open(itemId, () => HotbarService.state(character));
    assign.onChoose = (slot, itemId) => {
      if (!HotbarService.assignItem(character, slot, itemId)) return;
      assign.close();
      // the potion training goes on once the potion has its hotkey (Roland's last part opens by itself)
      if (QuestService.hotkeyAssigned(character, itemId)) this.gameScene()?.continuePotionTraining();
    };
    const offHotbar = HotbarService.onChange((c) => {
      if (c === character && assign.isOpen) assign.refresh();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, offHotbar);
    // Top-row keys 1-8 use the hotbar slots (KeyboardEvent.code Digit1-Digit8 - never the numpad); held keys
    // do not repeat, and nothing happens while typing, in a conversation, a tutorial spotlight or a window.
    const onKey = (e: KeyboardEvent): void => {
      const slot = hotbarSlotOfKey(e.code);
      if (slot < 0 || e.repeat || !isHotkeyPress(e, document.activeElement as HTMLElement | null)) return;
      if (this.canUseHotbar()) this.useHotbarSlot(slot);
    };
    this.input.keyboard?.on('keydown', onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown', onKey));
    this.inventoryWindow.onProblem = (_action, problem) => {
      if (problem === 'bagFull') this.itemNotifications?.showText(t('notifications.bagFull'));
      else if (problem === 'failed') this.itemNotifications?.showText(t('notifications.equipFailed'));
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
      passive.onStateChange = () => this.refreshPointGuides(character);
      // the passive tutorial begins after the conversation with Mateus (Tutorial Quest 01)
      passive.tutorialEnabled = () => QuestService.isPassiveTutorialOpen(character);
      // P toggles the tree (not while Settings is open on top).
      const onP = (): void => {
        if (this.canOpenWindows() && !this.settingsWindow?.isOpen) this.togglePassiveTree();
      };
      this.input.keyboard?.on('keydown-P', onP);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown-P', onP));
    }
    // Unspent-points pips (Status, Passive Tree): every status change - level-ups, allocations, passive
    // upgrades and resets - goes through CharacterStatusService, and a loaded save is shown from the start.
    const offPoints = CharacterStatusService.onChange((c) => {
      if (c === character) this.refreshPointGuides(character);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, offPoints);
    this.refreshPointGuides(character);
    this.settingsWindow = new SettingsWindow(this, { depth: 20, onSaveGame: () => downloadText(SAVE_FILE_NAME, serializeSave(character, this.gameScene()?.captureSavedLocation() ?? null)) });
    const leave = new ChoiceDialog(this, 28);
    this.leaveDialog = leave;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => leave.forget());
    // Quests: tracker, NPC dialogue (above the windows, below the death screen).
    this.dialogueWindow = new DialogueWindow(this, 30);
    const refreshQuest = (): void => {
      const tracked = trackedQuest(character);
      this.hud?.setQuest(tracked?.questId ?? null, tracked?.objectiveKey, tracked?.params);
      this.refreshPointGuides(character);
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
      this.leaveDialog = null;
      this.spotlightOverlay = null;
      this.itemNotifications = null;
    });
  }

  update(_time: number, delta: number): void {
    this.updatePotionTraining();
    this.deathOverlay?.update(delta);
    this.spotlightOverlay?.update(delta, this.spotlightTarget());
    this.itemNotifications?.update(delta);
    this.statusWindow?.update();
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
    if (this.assignWindow?.isOpen) {
      this.assignWindow.close();
      return true;
    }
    if (this.leaveDialog?.isOpen) {
      this.leaveDialog.close();
      return true;
    }
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

  /** Windows open only while the player may act: not in a conversation, not dying / dead, not asked to leave. */
  private canOpenWindows(): boolean {
    return !this.leaveDialog?.isOpen && (this.gameScene()?.canPerform('openWindow') ?? true);
  }

  /** Leaving ends the session and unsaved progress is lost: asked first. */
  confirmLeave(onLeave: () => void): void {
    this.leaveDialog?.show({
      title: t('menu.leaveTitle'),
      lines: [t('menu.unsavedLost')],
      choices: [
        { label: t('menu.leave'), tone: 'danger', onChoose: onLeave },
        { label: t('menu.stay'), tone: 'quiet', onChoose: () => undefined },
      ],
    });
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
    if (this.settingsWindow?.isOpen || this.leaveDialog?.isOpen || !this.isPlayerAlive()) return null;
    // the potion training points at controls while its own guide lines are open
    const potion = this.potionSpotlight();
    if (potion) return potion;
    if (!this.canOpenWindows()) return null;
    const status = this.statusSpotlight();
    if (status || this.statusWindow?.isOpen) return status;
    return this.passiveSpotlight() ?? this.equipmentSpotlight();
  }

  /**
   * Status tutorial (Tutorial Quest 02, after the turn-in): the Status button, the six main stats (any one),
   * CONFIRM. It ends when a point was really spent (QuestService), not on a click.
   */
  private statusSpotlight(): SpotlightTarget | null {
    const { character, statusWindow: w } = this;
    if (!character || !w || this.inventoryWindow?.isOpen || this.passiveWindow?.isOpen) return null;
    const step = statusTutorialStep(QuestService.quest02(character), w.isOpen, w.hasPending);
    if (!step) return null;
    const rect = step === 'openStatus' ? () => rectOfObject(this, this.hud?.statusButton) : () => w.tutorialArea(step === 'chooseStat' ? 'stats' : 'confirm');
    return { id: `${STATUS_SPOTLIGHT}${step}`, rect, label: t(`statusTutorial.${step}`) };
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

  /** Equipment tutorial (Tutorial Quest 02): Inventory button, the dagger in the bag, EQUIP. */
  private equipmentSpotlight(): SpotlightTarget | null {
    const { character, inventoryWindow: w } = this;
    if (!character || !w || this.passiveWindow?.isOpen) return null;
    const step = equipmentTutorialStep(QuestService.quest02(character), character.inventory, w.isOpen, w.selection.current);
    if (!step) return null;
    const control =
      step === 'openInventory'
        ? this.hud?.inventoryButton
        : step === 'selectItem'
          ? w.slotZone({ kind: 'bag', index: bagIndexOf(character.inventory, TUTORIAL_QUEST_02.reward.itemId) })
          : w.equipZone;
    return { id: step, rect: () => rectOfObject(this, control), label: t(`equipmentTutorial.${step}`) };
  }

  // -------------------------------------------------------------------------------------------
  // Potion training (Tutorial Quest 04): Inventory button > the potion > its details and USE (explained only,
  // never used) > ASSIGN HOTKEY > a slot. Roland's guide lines (non-modal dialogue) open as each step begins.
  // -------------------------------------------------------------------------------------------

  /** The potion training step now, from what is really open and selected. */
  private currentPotionStep(): PotionTutorialStep | null {
    const { character, inventoryWindow: w, assignWindow: a } = this;
    if (!character || !w || !a) return null;
    const potion = TUTORIAL_QUEST_04.potionItemId;
    const selected = w.selection.current;
    const potionSelected = selected?.kind === 'bag' && character.inventory?.bag[selected.index]?.itemId === potion;
    return potionTutorialStep(QuestService.quest04(character), { inventoryOpen: w.isOpen, potionSelected, assignOpen: a.isOpen, hasPotion: bagIndexOf(character.inventory, potion) >= 0 });
  }

  /** Opens / closes Roland's guide line when the step changes. The player cannot be attacked while one is open. */
  private updatePotionTraining(): void {
    const dialogue = this.dialogueWindow;
    const step = this.currentPotionStep();
    if (!dialogue || step === this.potionStep) return;
    this.potionStep = step;
    const guides = TUTORIAL_QUEST_04.guideDialogueIds;
    const open = Object.values(guides).find((id) => dialogue.isShowing(DIALOGUES[id]));
    if (open) dialogue.dismiss();
    this.releaseGuideSuspension();
    const guide = step === 'selectPotion' || step === 'explainUse' || step === 'assignHotkey' ? guides[step] : null;
    if (!guide || dialogue.isOpen || !this.character) return;
    const character = this.character;
    this.gameScene()?.combat?.setSuspended(true);
    this.guideSuspended = true;
    dialogue.open(
      NPC_DEFINITIONS[TUTORIAL_QUEST_04.npcId].name,
      DIALOGUES[guide],
      () => {
        this.releaseGuideSuspension();
        if (step === 'explainUse') QuestService.advance04(character, 'explainUse');
      },
      { modal: false, position: 'top' },
    );
  }

  /** Lets combat go on after a guide line - only if a guide line was what held it (never during a conversation). */
  private releaseGuideSuspension(): void {
    if (!this.guideSuspended) return;
    this.guideSuspended = false;
    if (!this.dialogueWindow?.isModal) this.gameScene()?.combat?.setSuspended(false);
  }

  /** What the potion training points at now (null = nothing; a normal conversation is open, or no step). */
  private potionSpotlight(): SpotlightTarget | null {
    const { character, inventoryWindow: w, assignWindow: a } = this;
    if (!character || !w || !a || this.dialogueWindow?.isModal) return null;
    const step = this.currentPotionStep();
    if (!step) return null;
    let rect: SpotlightTarget['rect'];
    if (step === 'openInventory') {
      if (this.statusWindow?.isOpen || this.passiveWindow?.isOpen) return null;
      rect = () => rectOfObject(this, this.hud?.inventoryButton);
    } else if (step === 'selectPotion') {
      rect = () => rectOfObject(this, w.slotZone({ kind: 'bag', index: bagIndexOf(character.inventory, TUTORIAL_QUEST_04.potionItemId) }));
    } else if (step === 'explainUse') rect = () => w.detailArea();
    else if (step === 'assignHotkey') rect = () => rectOfObject(this, w.assignZone);
    else rect = () => a.slotArea();
    return { id: `potion.${step}`, rect, label: t(`potionTutorial.${step}`) };
  }

  // -------------------------------------------------------------------------------------------
  // Hotbar
  // -------------------------------------------------------------------------------------------

  /** The hotbar works only while the player may act and nothing else is in front of the world. */
  private canUseHotbar(): boolean {
    const windows = [this.statusWindow, this.inventoryWindow, this.passiveWindow, this.settingsWindow, this.assignWindow];
    return this.canOpenWindows() && !this.spotlightOverlay?.isActive && !windows.some((w) => w?.isOpen);
  }

  private useHotbarSlot(slot: number): void {
    this.reportUse(this.gameScene()?.useHotbarSlot(slot) ?? null);
  }

  /** Says why an item could not be used, where that helps (a tutorial block and death say nothing). */
  private reportUse(problem: UseProblem | null): void {
    if (problem === 'hpFull') this.itemNotifications?.showText(t('notifications.hpFull'));
    else if (problem === 'none') this.itemNotifications?.showText(t('notifications.noItemLeft'));
  }

  private isPlayerAlive(): boolean {
    return this.gameScene()?.death?.life.isAlive() ?? true;
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
    for (let i = 0; i < 8 && this.closeWindows(); i++);
  }

  get isPassiveTreeOpen(): boolean {
    return this.passiveWindow?.isOpen ?? false;
  }

  /** Opens / closes the Status window (one modal window at a time: the Inventory and the Passive Tree close first). */
  toggleStatus(): void {
    const w = this.statusWindow;
    if (!w) return;
    if (!w.isOpen) {
      if (this.inventoryWindow?.isOpen) this.inventoryWindow.close();
      if (this.passiveWindow?.isOpen) this.passiveWindow.close();
    }
    w.toggle();
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

  /** The unspent-points pips on the Status and Passive Tree menu buttons. */
  private refreshPointGuides(character: CharacterData): void {
    const points = unspentPoints(character);
    this.hud?.setStatusPoints(points.status);
    this.hud?.setPassivePoints(points.passive);
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
