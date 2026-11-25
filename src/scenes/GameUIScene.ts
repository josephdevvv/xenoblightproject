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
import { t, type TranslationKey } from '../i18n';
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
import { POTION_KEY_LABEL, potionKind, potionSlotOfKey, type PotionSlotKey } from '../hotbar/PotionSlots';
import { potionTutorialStep, TUTORIAL_QUEST_04, type PotionTutorialStep } from '../quests/TutorialQuest04';
import { DIALOGUES } from '../dialogue/Dialogues';
import { NPC_DEFINITIONS } from '../npcs/NpcDefinition';
import type { ScrollProblem, UseProblem } from '../items/ConsumableUse';
import { SkillWindow } from '../ui/skills/SkillWindow';
import { AutoPlayWindow } from '../ui/autoplay/AutoPlayWindow';
import { AutoPlayService } from '../autoplay/AutoPlayService';
import { AUTO_INFO_STEPS, autoTutorialStep, potionHotkeyFinished, potionHotkeyStep, TUTORIAL_QUEST_07, type AutoInfoStep, type PotionHotkeyView } from '../quests/TutorialQuest07';
import { MONSTER_SPAWNS } from '../monsters/MonsterSpawns';
import { SkillService } from '../skills/SkillService';
import { scrollGuideOf, scrollTutorialStep, TUTORIAL_QUEST_06, type ScrollTutorialStep } from '../quests/TutorialQuest06';
import { labels } from '../i18n/labels';
import { itemDefinition } from '../items/ItemCatalog';
import { BannerStack } from '../ui/tutorial/BannerStack';
import { FeatureService, type FeatureId } from '../features/FeatureUnlocks';
import { QuestAcceptWatcher } from '../quests/QuestNotices';
import { PortalService } from '../world/Portals';
import { GoldService } from '../economy/GoldService';
import { HintService, showClickToMoveHint, showNavigateHint } from '../tutorial/TutorialHints';
import { isTouchMode } from '../platform/DeviceMode';
import { TouchControls } from '../ui/touch/TouchControls';
import { TargetHud } from '../ui/touch/TargetHud';
import { installUiLayers, pointerIn, uiView } from '../ui/layout/UiLayers';
import { uiZooms, type UiZooms } from '../ui/layout/UiScale';
import { getUiScale, onUiScaleChange, setUiScale } from '../settings/UiScaleSetting';
import type { DialogueSnapshot } from '../ui/dialogue/DialogueWindow';
import type { PotionTutorialStep as PotionStep } from '../quests/TutorialQuest04';

/** Mobile: the potion buttons' names in notices (desktop: the keys Q / W). */
const TOUCH_POTION_LABEL = { hp: 'HP', sp: 'SP' } as const;
/** Mobile touch controls: above the HUD (0-4), below the banners' windows (10+); the target HUD with them. */
const TOUCH_DEPTH = 3;

/** How long the potion training points at the Q slot after the potion was put there, before Roland goes on. */
const POTION_FLASH_MS = 1100;

/** Spotlight ids of the Status tutorial start with this. */
const STATUS_SPOTLIGHT = 'status.';

export interface GameUISceneData {
  characterId?: string;
  /**
   * Rebuilt for a new view size or UI scale (relayoutWhenSafe): what was open comes back as it was - the windows, the
   * conversation (same line, same callback), the tutorial guide lines and the Auto Combat tutorial's step.
   */
  restore?: UiRestore;
}

type WindowName = 'status' | 'inventory' | 'skills' | 'passive' | 'auto' | 'settings';

interface UiRestore {
  windows: WindowName[];
  dialogue: DialogueSnapshot | null;
  autoInfoIndex: number;
  potionStep: PotionStep | null;
  scrollGuide: keyof typeof TUTORIAL_QUEST_06.guideDialogueIds | null;
  autoGuide: AutoInfoStep | null;
  guideSuspended: boolean;
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
  /** "Left-click to move and talk to NPCs" - from the first entry until Mateus's first conversation, once. */
  /** Upper-centre banners: the left-click hint (persistent) and 3-s notices (locked feature, quest accepted / done). */
  private banners: BannerStack | null = null;
  private itemNotifications: ItemNotifications | null = null;
  /** "Assign Hotkey" (two rows of four slots). */
  private assignWindow: HotbarAssignWindow | null = null;
  /** The potion training step shown last (its guide line is opened when the step begins). */
  private potionStep: PotionTutorialStep | null = null;
  /** A guide line of the potion training suspended combat (and has to let it go again). */
  private guideSuspended = false;
  /** The Skill window (K). */
  private skillWindow: SkillWindow | null = null;
  /** Auto Combat tutorial: Roland's information lines clicked through so far (memory only: a reload starts them again). */
  private autoInfoIndex = 0;
  /** The Auto Combat tutorial line shown last. */
  private autoGuide: AutoInfoStep | null = null;
  /** The potion training just put the potion on Q: that slot is pointed at for a moment. */
  private potionFlash: PotionSlotKey | null = null;
  /** Auto Play settings (the button right of the hotbar; X toggles Auto Play itself). */
  private autoWindow: AutoPlayWindow | null = null;
  /** Roland's scroll tutorial guide line shown last (lines 11-13 of the Dark Avian quest). */
  private scrollGuide: keyof typeof TUTORIAL_QUEST_06.guideDialogueIds | null = null;
  /** Mobile (touch mode only): the joystick, action wheel and potion buttons, and the target HUD. */
  private readonly touch = isTouchMode();
  /** The UI scale's zoom of each layer for this view (UiScale; set when the UI is built). */
  private zooms: UiZooms = { hud: 1, windows: 1, hudLimit: 100 };
  /** The view size or the UI scale changed: the UI is rebuilt for it at the next safe moment (relayoutWhenSafe). */
  private relayoutPending = false;
  private touchControls: TouchControls | null = null;
  private targetHud: TargetHud | null = null;

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
    this.skillWindow = null;
    this.autoWindow = null;
    this.potionFlash = null;
    this.autoInfoIndex = data.restore?.autoInfoIndex ?? 0;
    this.autoGuide = null;
    this.scrollGuide = null;
    this.touchControls = null;
    this.relayoutPending = false;
    // the UI layers: the HUD and the windows zoomed by the UI scale (as far as each fits this view), the spotlight in
    // screen pixels - set up first, every layout below reads its layer's room (uiView)
    this.zooms = uiZooms({ width: this.scale.width, height: this.scale.height }, getUiScale(), this.touch);
    installUiLayers(this, this.zooms);
    // the view size (browser window, mobile viewport) or the UI scale changes: rebuild for it
    const relayout = (): void => {
      this.relayoutPending = true;
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, relayout);
    const offScale = onUiScaleChange(relayout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, relayout);
      offScale();
    });
    this.targetHud = null;
    const character = this.resolveCharacter(data.characterId);
    this.character = character;
    const game = this.gameScene();
    if (!character || !game?.map) {
      console.warn('[GameUI] no active character or map; UI not created');
      return;
    }
    const currentHp = (): number => this.gameScene()?.combat?.getPlayerHp() ?? Number.POSITIVE_INFINITY;
    const currentSp = (): number => this.gameScene()?.combat?.getPlayerSp() ?? Number.POSITIVE_INFINITY;
    this.hud = new DungeonHud(
      this,
      {
        character,
        map: game.map,
        onStatus: () => this.canOpenWindows() && this.toggleStatus(),
        onSettings: () => this.canOpenWindows() && this.settingsWindow?.toggle(),
        onPassive: () => this.canOpenWindows() && this.togglePassiveTree(),
        onInventory: () => this.canOpenWindows() && this.toggleInventory(),
        onSkills: () => this.canOpenWindows() && this.toggleSkills(),
        onAutoPlay: () => this.featureReady('autoCombat') && this.canOpenWindows() && this.toggleAutoPlayWindow(),
        onNavigate: () => this.onNavigate(),
        currentHp,
        currentSp,
        onHotbarSlot: (slot) => this.canUseHotbar() && this.useHotbarSlot(slot),
        onPotionSlot: (key) => this.canUseHotbar() && this.usePotionSlot(key),
        touch: this.touch,
      },
      0,
    );
    if (this.touch) this.createTouchControls(character);
    this.statusWindow = new StatusWindow(this, character, 10, currentHp, currentSp);
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
    const inventoryWindow = new InventoryWindow(this, 12, characterInventorySource(character, canUnequip));
    this.inventoryWindow = inventoryWindow;
    // the header's Gold: the same balance as the HUD, updated on every change
    inventoryWindow.setGold(GoldService.get(character));
    const offGold = GoldService.onChange((c, gold) => {
      if (c === character) inventoryWindow.setGold(gold);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, offGold);
    // Consumables: USE (the game checks every rule) and ASSIGN HOTKEY (a compact window above the Inventory).
    const assign = new HotbarAssignWindow(this, 16);
    this.assignWindow = assign;
    this.inventoryWindow.onUse = (itemId, bagIndex) => {
      // null = used (so no `??` fallback here: it would turn a success into a problem)
      const game = this.gameScene();
      const problem = game ? game.useItem(itemId, bagIndex) : 'notUsable';
      this.reportUse(problem);
      // the scroll tutorial goes on at the HUD's Skill button: the Inventory steps aside once the skill is learned
      if (problem === null && itemDefinition(itemId)?.category === 'skill_scroll' && QuestService.quest06(character).state === 'SCROLL_TUTORIAL') this.inventoryWindow?.close();
    };
    // ASSIGN HOTKEY: an HP potion goes straight to Q, an SP potion to W (no slot choice, nothing used up); any
    // other consumable still chooses one of the slots 1-8
    this.inventoryWindow.onAssign = (itemId) => {
      if (!potionKind(itemId)) {
        assign.open({ type: 'item', itemId }, labels.itemName(itemId), () => HotbarService.state(character));
        return;
      }
      const key = HotbarService.assignPotion(character, itemId);
      if (!key) return;
      this.itemNotifications?.showText(t('notifications.potionAssigned', { name: labels.itemName(itemId), key: (this.touch ? TOUCH_POTION_LABEL : POTION_KEY_LABEL)[key] }));
      // the potion training: point at Q for a moment, then Roland's last part opens by itself
      if (QuestService.hotkeyAssigned(character, itemId)) {
        this.inventoryWindow?.close();
        this.potionFlash = key;
        this.time.delayedCall(POTION_FLASH_MS, () => {
          this.potionFlash = null;
          this.gameScene()?.continuePotionTraining();
        });
      }
    };
    // Skills: the list, details, and ASSIGN HOTKEY for a learned skill (the same assignment window as items).
    const skills = new SkillWindow(this, 13, character);
    this.skillWindow = skills;
    skills.onAssign = (skillId) => assign.open({ type: 'skill', skillId }, labels.skillName(skillId), () => HotbarService.state(character));
    assign.onChoose = (slot, entry) => {
      if (!HotbarService.assign(character, slot, entry)) return;
      assign.close();
      if (entry.type === 'item') {
        // the potion training goes on once the potion has its hotkey (Roland's last part opens by itself)
        if (QuestService.hotkeyAssigned(character, entry.itemId)) this.gameScene()?.continuePotionTraining();
        return;
      }
      // the scroll tutorial ends once Power Thrust has its hotkey: the Skill window closes and line 14 opens
      if (QuestService.skillAssigned(character, entry.skillId)) {
        skills.close();
        this.updateScrollTraining();
        this.gameScene()?.continueAvianBriefing();
      }
    };
    const offLearned = SkillService.onLearned((c, skillId) => {
      if (c === character) this.itemNotifications?.showText(t('notifications.skillLearned', { skill: labels.skillName(skillId) }));
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, offLearned);
    const offHotbar = HotbarService.onChange((c) => {
      if (c === character && assign.isOpen) assign.refresh();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, offHotbar);
    // Top-row keys 1-8 use the hotbar slots (KeyboardEvent.code Digit1-Digit8 - never the numpad), Q / W the potion
    // slots; held keys do not repeat, and nothing happens while typing, in a conversation, a tutorial spotlight or a
    // window. (WASD no longer moves the character: W belongs to the SP potion.)
    const onKey = (e: KeyboardEvent): void => {
      const potion = potionSlotOfKey(e.code);
      if (potion) {
        if (!e.repeat && isHotkeyPress(e, document.activeElement as HTMLElement | null) && this.canUseHotbar()) this.usePotionSlot(potion);
        return;
      }
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
    // Auto Play: its settings window (above the Skill window, below Settings); X turns Auto Play on / off at any time
    // (window open or not), except while typing.
    const monsterTypes = [...new Set((MONSTER_SPAWNS[game.map.definition.id] ?? []).map((p) => p.monster))];
    this.autoWindow = new AutoPlayWindow(this, 18, character, monsterTypes);
    // START closes the window at once: the Auto Combat tutorial finishes first (its step needs the window open)
    this.autoWindow.onStarted = () => this.finishAutoTutorialOnStart();
    const onX = (e: KeyboardEvent): void => {
      if (!isHotkeyPress(e, document.activeElement as HTMLElement | null)) return;
      if (!this.featureReady('autoCombat')) return; // locked until the Auto Combat tutorial
      AutoPlayService.toggle(character);
    };
    this.input.keyboard?.on('keydown-X', onX);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown-X', onX));
    let autoShown = AutoPlayService.isOn(character);
    this.hud.setAutoPlay(autoShown);
    const offAuto = AutoPlayService.onChange((c) => {
      if (c !== character || AutoPlayService.isOn(c) === autoShown) return;
      autoShown = AutoPlayService.isOn(c);
      this.hud?.setAutoPlay(autoShown);
      this.itemNotifications?.showText(t(autoShown ? 'autoPlay.notifyOn' : 'autoPlay.notifyOff'));
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, offAuto);
    // K toggles the Skill window (not while typing or with Settings open on top).
    const onK = (e: KeyboardEvent): void => {
      if (!isHotkeyPress(e, document.activeElement as HTMLElement | null)) return;
      if (this.canOpenWindows() && !this.settingsWindow?.isOpen && !this.assignWindow?.isOpen) this.toggleSkills();
    };
    this.input.keyboard?.on('keydown-K', onK);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown-K', onK));
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
    this.settingsWindow = new SettingsWindow(this, {
      depth: 20,
      onSaveGame: () => downloadText(SAVE_FILE_NAME, serializeSave(character, this.gameScene()?.captureSavedLocation() ?? null)),
      // in-game only (never on the main menu / character creation): 100-150 %, applied at once, saved
      uiScale: { value: () => getUiScale(), set: (percent) => setUiScale(percent), limit: () => this.zooms.hudLimit },
    });
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
    // the Reach Level 10 objective shows the level now: refreshed on every status change (level-ups)
    const offLevel = CharacterStatusService.onChange((c) => {
      if (c === character) refreshQuest();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, offLevel);
    // after Reach Level 10 the tracker follows the gate portal (Sonny > the portal > nothing)
    const offPortal = PortalService.onChange((c) => {
      if (c === character) refreshQuest();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, offPortal);
    refreshQuest();
    // Tutorial spotlight: above the HUD and the windows, below dialogue and the death screen.
    this.spotlightOverlay = new SpotlightOverlay(this, 25);
    // First-entry hint: just above the HUD, below every window; visual only (clicks reach the world).
    this.banners = new BannerStack(this, 5);
    const banners = this.banners;
    // quest notices: "Quest accepted / completed: <name>" (a loaded save announces nothing it already had)
    const accepted = new QuestAcceptWatcher(character);
    const questName = (id: string): string => t(`quests.${id}.name` as TranslationKey);
    const offAccepted = QuestService.onChange((c) => {
      if (c !== character) return;
      for (const id of accepted.newlyAccepted()) banners.notify(`quest.accepted.${id}`, 'notices.questAccepted', 'quest', { name: questName(id) });
      FeatureService.sync(c); // a tutorial step reached: its feature unlocks (saved)
    });
    const offCompleted = QuestService.onCompleted((c, id) => {
      if (c === character) banners.notify(`quest.completed.${id}`, 'notices.questCompleted', 'done', { name: questName(id) });
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      offAccepted();
      offCompleted();
    });
    FeatureService.sync(character); // older saves: unlocked from their quest progress
    // Notices for received items: below the minimap, above dialogue, below the death screen.
    const notifications = new ItemNotifications(this, { ...this.hud.belowMinimap, right: Math.min(uiView(this, 'hud').width - 4, this.hud.belowMinimap.right + 8) }, 36);
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
      this.banners = null;
      this.itemNotifications = null;
      this.skillWindow = null;
      this.autoWindow = null;
      this.touchControls = null;
      this.targetHud = null;
    });
    if (data.restore) this.restoreUi(data.restore);
  }

  /** After a rebuild: the windows, the conversation and the tutorial guide state as they were. */
  private restoreUi(r: UiRestore): void {
    this.potionStep = r.potionStep;
    this.scrollGuide = r.scrollGuide;
    this.autoGuide = r.autoGuide;
    this.guideSuspended = r.guideSuspended;
    const open: Record<WindowName, () => void> = {
      status: () => this.toggleStatus(),
      inventory: () => this.toggleInventory(),
      skills: () => this.toggleSkills(),
      passive: () => this.togglePassiveTree(),
      auto: () => this.toggleAutoPlayWindow(),
      settings: () => this.settingsWindow?.show(),
    };
    for (const w of r.windows) open[w]();
    if (r.dialogue) this.dialogueWindow?.restore(r.dialogue);
  }

  /**
   * Mobile: the joystick (bottom-left), the sword + hotkey wheel and the potion buttons (bottom-right) and the
   * target HUD (top-centre). They use the very same actions as the desktop keys and clicks.
   */
  private createTouchControls(character: CharacterData): void {
    const controls = new TouchControls(
      this,
      character,
      {
        onSteer: (direction) => this.gameScene()?.steer(direction),
        onAttack: () => {
          // talk to the NPC in range, or attack the selected monster (GameScene.touchAction decides)
          if (this.canOpenWindows() && !this.spotlightOverlay?.isActive) this.gameScene()?.touchAction();
        },
        onSlot: (slot) => this.canUseHotbar() && this.useHotbarSlot(slot),
        onPotion: (key) => this.canUseHotbar() && this.usePotionSlot(key),
      },
      TOUCH_DEPTH,
    );
    this.touchControls = controls;
    this.targetHud = new TargetHud(this, TOUCH_DEPTH);
    // the finger may be lifted while the game is paused (device turned) or in the background: let go of the joystick
    const release = (): void => controls.release();
    this.game.events.on(Phaser.Core.Events.PAUSE, release);
    this.game.events.on(Phaser.Core.Events.BLUR, release);
    this.game.events.on(Phaser.Core.Events.HIDDEN, release);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.PAUSE, release);
      this.game.events.off(Phaser.Core.Events.BLUR, release);
      this.game.events.off(Phaser.Core.Events.HIDDEN, release);
      controls.release();
    });
  }

  /**
   * The view size (browser window, mobile viewport) or the UI scale changed: every UI here is laid out from its
   * layer's room when it is built, so the scene is rebuilt at once - with the open windows, the conversation (same line,
   * same callback) and the tutorial guide state carried over (restoreUi). Only the death screen and the leave dialog
   * wait (they are rebuilt right after). Returns true when it restarted.
   */
  private relayoutWhenSafe(): boolean {
    if (!this.relayoutPending || !this.isPlayerAlive() || this.leaveDialog?.isOpen) return false;
    this.relayoutPending = false;
    const windows: WindowName[] = [];
    if (this.statusWindow?.isOpen) windows.push('status');
    if (this.inventoryWindow?.isOpen) windows.push('inventory');
    if (this.skillWindow?.isOpen) windows.push('skills');
    if (this.passiveWindow?.isOpen) windows.push('passive');
    if (this.autoWindow?.isOpen) windows.push('auto');
    if (this.settingsWindow?.isOpen) windows.push('settings');
    const restore: UiRestore = {
      windows,
      dialogue: this.dialogueWindow?.snapshot() ?? null,
      autoInfoIndex: this.autoInfoIndex,
      potionStep: this.potionStep,
      scrollGuide: this.scrollGuide,
      autoGuide: this.autoGuide,
      guideSuspended: this.guideSuspended,
    };
    this.scene.restart({ characterId: this.character?.id, restore } satisfies GameUISceneData);
    return true;
  }


  /** One-time hints follow their rule (no close button, no timeout); one that ends fades out. */
  private updateHints(): void {
    const c = this.character;
    if (!c || !this.banners) return;
    // mobile: the same hint in touch words (joystick to move, tap NPCs) with the joystick icon
    this.banners.setPersistent('hint.clickToMove', 'hints.clickToMove', this.touch ? 'joystick' : 'mouse', showClickToMoveHint(QuestService.quest01(c).state, HintService.isDone(c, 'click_to_move')));
    this.banners.update();
  }

  /** The feature is unlocked; otherwise the "complete the tutorial" notice is shown and false returned. */
  private featureReady(feature: FeatureId): boolean {
    const c = this.character;
    if (!c || FeatureService.isUnlocked(c, feature)) return true;
    this.banners?.notify('feature.locked', 'features.locked', 'lock');
    return false;
  }

  update(_time: number, delta: number): void {
    if (this.relayoutWhenSafe()) return;
    this.updatePotionTraining();
    this.updateScrollTraining();
    this.updateLevelTutorials();
    this.updateHints();
    this.deathOverlay?.update(delta);
    this.spotlightOverlay?.update(delta, this.spotlightTarget());
    this.itemNotifications?.update(delta);
    this.statusWindow?.update();
    const game = this.gameScene();
    if (!this.hud || !game?.player) return;
    this.hud.updateCooldowns((id) => game.skillCooldown(id));
    this.touchControls?.update((id) => game.skillCooldown(id));
    // the action button shows what a tap does now: a speech bubble near an NPC to talk to, else the sword
    this.touchControls?.setActionMode(game.touchActionMode());
    this.targetHud?.set(this.isPlayerAlive() ? game.touchTarget() : null);
    // the AUTO button is gray while it cannot be used (dead, a conversation, the leave dialog)
    const c = this.character;
    this.hud.setAutoPlayEnabled(!!c && FeatureService.isUnlocked(c, 'autoCombat') && this.canOpenWindows() && this.isPlayerAlive());
    // Navigate: locked until its tutorial; then only while the quest leads to an NPC (and nothing is in the way)
    const navLocked = !c || !FeatureService.isUnlocked(c, 'navigate');
    this.hud.setNavigationState(navLocked ? 'locked' : this.canOpenWindows() && game.canNavigate() ? 'enabled' : 'disabled');
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
    for (const o of this.children.list) {
      const v = o as Phaser.GameObjects.GameObject & Partial<Phaser.GameObjects.Components.Visible & Phaser.GameObjects.Components.AlphaSingle>;
      if (v.visible === false || v.alpha === 0) continue;
      // the pointer in the coordinates of the layer that draws it (the HUD and the windows have their own UI scale)
      const { x, y } = pointerIn(this, o, pointer);
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
    if (this.skillWindow?.isOpen) {
      this.skillWindow.close();
      return true;
    }
    if (this.autoWindow?.isOpen) {
      this.autoWindow.close();
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
    const scroll = this.scrollSpotlight();
    if (scroll) return scroll;
    const level = this.levelSpotlight();
    if (level) return level;
    if (!this.canOpenWindows()) return null;
    const navigate = this.navigateSpotlight();
    if (navigate) return navigate;
    const status = this.statusSpotlight();
    if (status || this.statusWindow?.isOpen) return status;
    return this.passiveSpotlight() ?? this.equipmentSpotlight();
  }

  /** Navigate tutorial (Mateus's last quest turned in, Roland next): the quest tracker's Navigate button, once. */
  private navigateSpotlight(): SpotlightTarget | null {
    const c = this.character;
    if (!c || !this.isNavigateTutorial()) return null;
    return { id: 'navigate.roland', rect: () => rectOfObject(this, this.hud?.navButton), label: t('navigateTutorial.click') };
  }

  private isNavigateTutorial(): boolean {
    const c = this.character;
    return !!c && showNavigateHint(QuestService.quest03(c).state, QuestService.quest04(c).state, HintService.isDone(c, 'navigate_to_roland'));
  }

  /** Navigate clicked: walk to the quest NPC, or stop walking. During its tutorial, starting it finishes the step. */
  private onNavigate(): void {
    const game = this.gameScene();
    if (!game || !this.featureReady('navigate') || !this.canOpenWindows()) return;
    const tutorial = this.isNavigateTutorial();
    const result = game.toggleQuestNavigation();
    if (tutorial && (result === 'started' || result === 'arrived') && this.character) HintService.complete(this.character, 'navigate_to_roland');
    this.spotlightOverlay?.update(0, this.spotlightTarget());
  }

  /**
   * Status tutorial (Tutorial Quest 02, after the turn-in): the Status button, the six main stats (any one),
   * CONFIRM. It ends when a point was really spent (QuestService), not on a click.
   */
  private statusSpotlight(): SpotlightTarget | null {
    const { character, statusWindow: w } = this;
    if (!character || !w || this.inventoryWindow?.isOpen || this.passiveWindow?.isOpen || this.skillWindow?.isOpen) return null;
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
    if (!w || !step || this.inventoryWindow?.isOpen || this.skillWindow?.isOpen) return null;
    const control = step === 'open' ? this.hud?.passiveButton : w.tutorialControl;
    return { id: step, rect: () => rectOfObject(this, control), label: t(`passive.tutorial.${step}`) };
  }

  /** Equipment tutorial (Tutorial Quest 02): Inventory button, the dagger in the bag, EQUIP. */
  private equipmentSpotlight(): SpotlightTarget | null {
    const { character, inventoryWindow: w } = this;
    if (!character || !w || this.passiveWindow?.isOpen || this.skillWindow?.isOpen) return null;
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
    const flash = this.potionFlash;
    // mobile: the HP potion button (the Q slot is hidden)
    if (flash) return { id: 'potion.qSlot', rect: () => rectOfObject(this, (this.touchControls ?? this.hud)?.potionZones[flash]), label: t('potionTutorial.qSlot') };
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
  // Scroll tutorial (Tutorial Quest 06, lines 11-13): Inventory button > the scroll > USE (learned) > Skill button
  // > Power Thrust > ASSIGN HOTKEY > a slot. Roland's guide lines (non-modal) open as each part begins; every
  // step goes on only when the thing was really done.
  // -------------------------------------------------------------------------------------------

  private currentScrollStep(): ScrollTutorialStep | null {
    const { character, inventoryWindow: w, assignWindow: a, skillWindow: s } = this;
    if (!character || !w || !a || !s) return null;
    const scroll = TUTORIAL_QUEST_06.reward.itemId;
    const selected = w.selection.current;
    return scrollTutorialStep(QuestService.quest06(character), {
      learned: SkillService.isLearned(character, TUTORIAL_QUEST_06.skillId),
      hasScroll: bagIndexOf(character.inventory, scroll) >= 0,
      inventoryOpen: w.isOpen,
      scrollSelected: selected?.kind === 'bag' && character.inventory?.bag[selected.index]?.itemId === scroll,
      skillsOpen: s.isOpen,
      skillSelected: s.selected === TUTORIAL_QUEST_06.skillId,
      assignOpen: a.isOpen,
    });
  }

  /** Opens / closes Roland's guide line when the tutorial reaches another part (dialogue 11, 12 or 13). */
  private updateScrollTraining(): void {
    const dialogue = this.dialogueWindow;
    const character = this.character;
    if (!dialogue || !character) return;
    const step = this.currentScrollStep();
    const guide = step ? scrollGuideOf(step) : null;
    if (guide === this.scrollGuide) return;
    const ids = TUTORIAL_QUEST_06.guideDialogueIds;
    if (Object.values(ids).some((id) => dialogue.isShowing(DIALOGUES[id]))) {
      dialogue.dismiss();
      this.releaseGuideSuspension();
    }
    // another conversation is still open (e.g. the intro's last line): the guide line waits for it
    if (guide && dialogue.isOpen) return;
    this.scrollGuide = guide;
    if (!guide) return;
    this.gameScene()?.combat?.setSuspended(true);
    this.guideSuspended = true;
    dialogue.open(NPC_DEFINITIONS[TUTORIAL_QUEST_06.npcId].name, DIALOGUES[ids[guide]], () => this.releaseGuideSuspension(), { modal: false, position: 'top' });
  }

  /** What the scroll tutorial points at now (null = nothing; a normal conversation is open, or no step). */
  private scrollSpotlight(): SpotlightTarget | null {
    const { character, inventoryWindow: w, assignWindow: a, skillWindow: s } = this;
    if (!character || !w || !a || !s || this.dialogueWindow?.isModal) return null;
    const step = this.currentScrollStep();
    if (!step) return null;
    let rect: SpotlightTarget['rect'];
    if (step === 'openInventory') {
      if (this.statusWindow?.isOpen || this.passiveWindow?.isOpen || s.isOpen) return null;
      rect = () => rectOfObject(this, this.hud?.inventoryButton);
    } else if (step === 'selectScroll') {
      rect = () => rectOfObject(this, w.slotZone({ kind: 'bag', index: bagIndexOf(character.inventory, TUTORIAL_QUEST_06.reward.itemId) }));
    } else if (step === 'useScroll') rect = () => rectOfObject(this, w.scrollUseZone);
    else if (step === 'openSkills') {
      if (this.statusWindow?.isOpen || this.passiveWindow?.isOpen || w.isOpen) return null;
      rect = () => rectOfObject(this, this.hud?.skillButton);
    } else if (step === 'selectSkill') rect = () => rectOfObject(this, s.rowZone(TUTORIAL_QUEST_06.skillId));
    else if (step === 'assignSkill') rect = () => rectOfObject(this, s.assignZone);
    else rect = () => a.slotArea();
    return { id: `scroll.${step}`, rect, label: t(`scrollTutorial.${step}`) };
  }

  // -------------------------------------------------------------------------------------------
  // Reach Level 10 tutorials (Tutorial Quest 07, after Roland's talk): 1) the SP potion onto W - Inventory button >
  // the potion > ASSIGN HOTKEY > CLOSE; 2) Auto Combat - its button > five settings panels, a Roland line each (click
  // it to go on) > START, which starts Auto Play and closes the window. Each is recorded once it is done.
  // -------------------------------------------------------------------------------------------

  private potionHotkeyView(): PotionHotkeyView | null {
    const { character, inventoryWindow: w } = this;
    if (!character || !w) return null;
    const sp = TUTORIAL_QUEST_07.spPotionItemId;
    const selected = w.selection.current;
    return {
      spInBag: bagIndexOf(character.inventory, sp) >= 0,
      wHasSp: HotbarService.potions(character).sp === sp,
      inventoryOpen: w.isOpen,
      spSelected: selected?.kind === 'bag' && character.inventory?.bag[selected.index]?.itemId === sp,
    };
  }

  /** Records a finished tutorial, and shows / hides Roland's Auto Combat lines as the steps change. */
  private updateLevelTutorials(): void {
    const character = this.character;
    const view = this.potionHotkeyView();
    if (!character || !view) return;
    const quest = QuestService.quest07(character);
    if (quest.state !== 'ACTIVE' || quest.autoTutorialDone) {
      this.showAutoGuide(null);
      return;
    }
    if (!quest.potionTutorialDone) {
      if (potionHotkeyFinished(quest, view)) QuestService.advance07(character, 'potionTutorialDone');
      return;
    }
    const step = autoTutorialStep(quest, this.autoWindow?.isOpen ?? false, this.autoInfoIndex);
    // START pressed (or Auto Play already running at that step): Auto Play goes on, the window closes, done
    if (step === 'start' && AutoPlayService.isOn(character)) {
      this.showAutoGuide(null);
      this.autoWindow?.close();
      this.autoInfoIndex = 0;
      QuestService.advance07(character, 'autoTutorialDone');
      return;
    }
    this.showAutoGuide(step && (AUTO_INFO_STEPS as readonly string[]).includes(step) ? (step as AutoInfoStep) : null);
  }

  /** START clicked in the Auto Combat tutorial's last step: the tutorial is done (Auto Play keeps running). */
  private finishAutoTutorialOnStart(): void {
    const character = this.character;
    if (!character) return;
    const quest = QuestService.quest07(character);
    if (autoTutorialStep(quest, true, this.autoInfoIndex) !== 'start' || !AutoPlayService.isOn(character)) return;
    this.showAutoGuide(null);
    this.autoInfoIndex = 0;
    QuestService.advance07(character, 'autoTutorialDone');
  }

  /** Roland's line for an information step (non-modal; a click on it goes on to the next panel). */
  private showAutoGuide(step: AutoInfoStep | null): void {
    const dialogue = this.dialogueWindow;
    if (!dialogue || step === this.autoGuide) return;
    const ids = TUTORIAL_QUEST_07.autoGuideDialogueIds;
    if (Object.values(ids).some((id) => dialogue.isShowing(DIALOGUES[id]))) dialogue.dismiss();
    if (step && dialogue.isOpen) return; // another conversation first
    this.autoGuide = step;
    if (!step) return;
    // at the bottom for the upper panels, at the top for the lower ones - never over the panel being explained
    const position = step === 'monsters' || step === 'options' ? 'bottom' : 'top';
    dialogue.open(
      NPC_DEFINITIONS[TUTORIAL_QUEST_07.npcId].name,
      DIALOGUES[ids[step]],
      () => {
        if (this.autoGuide === step) this.autoInfoIndex++;
      },
      { modal: false, position },
    );
  }

  /** What the Reach Level 10 tutorials point at now (null = nothing; a conversation is open, or no step). */
  private levelSpotlight(): SpotlightTarget | null {
    const { character, inventoryWindow: w, autoWindow: a } = this;
    if (!character || !w || !a || this.dialogueWindow?.isModal) return null;
    const quest = QuestService.quest07(character);
    const view = this.potionHotkeyView();
    const potion = view ? potionHotkeyStep(quest, view) : null;
    const otherWindow = this.statusWindow?.isOpen || this.passiveWindow?.isOpen || this.skillWindow?.isOpen || this.assignWindow?.isOpen;
    if (potion) {
      let rect: SpotlightTarget['rect'];
      if (potion === 'openInventory') {
        if (otherWindow || a.isOpen) return null;
        rect = () => rectOfObject(this, this.hud?.inventoryButton);
      } else if (potion === 'selectSp') {
        rect = () => rectOfObject(this, w.slotZone({ kind: 'bag', index: bagIndexOf(character.inventory, TUTORIAL_QUEST_07.spPotionItemId) }));
      } else if (potion === 'assign') rect = () => rectOfObject(this, w.assignZone);
      else rect = () => rectOfObject(this, w.closeZone);
      return { id: `level.potion.${potion}`, rect, label: t(`levelTutorial.${potion}`) };
    }
    const auto = autoTutorialStep(quest, a.isOpen, this.autoInfoIndex);
    if (!auto) return null;
    if (auto === 'open') {
      if (otherWindow || w.isOpen) return null;
      return { id: 'level.auto.open', rect: () => rectOfObject(this, this.hud?.autoButton), label: t('levelTutorial.openAuto') };
    }
    if (auto === 'start') return { id: 'level.auto.start', rect: () => rectOfObject(this, a.startZone), label: t('levelTutorial.start') };
    return { id: `level.auto.${auto}`, rect: () => a.tutorialArea(auto), label: t('levelTutorial.info') };
  }

  // -------------------------------------------------------------------------------------------
  // Hotbar
  // -------------------------------------------------------------------------------------------

  /** The hotbar works only while the player may act and nothing else is in front of the world. */
  private canUseHotbar(): boolean {
    const windows = [this.statusWindow, this.inventoryWindow, this.passiveWindow, this.settingsWindow, this.assignWindow, this.skillWindow, this.autoWindow];
    return this.canOpenWindows() && !this.spotlightOverlay?.isActive && !windows.some((w) => w?.isOpen);
  }

  /** A window, a spotlight or a dialog is in front of the world (skill target-select mode ends). */
  get worldBlocked(): boolean {
    return !this.canUseHotbar();
  }

  /** Q / W: the potion on that slot (an empty slot does nothing). */
  private usePotionSlot(key: PotionSlotKey): void {
    this.reportUse(this.gameScene()?.usePotionSlot(key) ?? null);
  }

  private useHotbarSlot(slot: number): void {
    this.reportUse(this.gameScene()?.useHotbarSlot(slot) ?? null);
  }

  /** Says why an item could not be used, where that helps (a tutorial block and death say nothing). */
  private reportUse(problem: UseProblem | ScrollProblem | null): void {
    if (problem === 'hpFull') this.itemNotifications?.showText(t('notifications.hpFull'));
    else if (problem === 'spFull') this.itemNotifications?.showText(t('notifications.spFull'));
    else if (problem === 'none') this.itemNotifications?.showText(t('notifications.noItemLeft'));
    else if (problem === 'alreadyLearned') this.itemNotifications?.showText(t('notifications.alreadyLearned'));
  }

  private isPlayerAlive(): boolean {
    return this.gameScene()?.death?.life.isAlive() ?? true;
  }

  /** The NPC dialogue window. */
  get dialogue(): DialogueWindow | null {
    return this.dialogueWindow;
  }

  /** A conversation is open. Roland's tutorial guide lines (non-modal hints at the top) do not count. */
  get isDialogueOpen(): boolean {
    return this.dialogueWindow?.isModal ?? false;
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
      this.skillWindow?.close();
      this.autoWindow?.close();
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
      this.skillWindow?.close();
      this.autoWindow?.close();
    }
    w.toggle();
  }

  /** Opens / closes the Auto Play settings (one modal window at a time: the others close first). */
  toggleAutoPlayWindow(): void {
    const w = this.autoWindow;
    if (!w) return;
    if (!w.isOpen) {
      if (this.statusWindow?.isOpen) this.statusWindow.close();
      if (this.inventoryWindow?.isOpen) this.inventoryWindow.close();
      if (this.passiveWindow?.isOpen) this.passiveWindow.close();
      this.skillWindow?.close();
      this.autoWindow?.close();
    }
    w.toggle();
  }

  get isSkillWindowOpen(): boolean {
    return this.skillWindow?.isOpen ?? false;
  }

  /** Opens / closes the Skill window (one modal window at a time: the others close first). */
  toggleSkills(): void {
    const w = this.skillWindow;
    if (!w) return;
    if (!w.isOpen) {
      if (this.statusWindow?.isOpen) this.statusWindow.close();
      if (this.inventoryWindow?.isOpen) this.inventoryWindow.close();
      if (this.passiveWindow?.isOpen) this.passiveWindow.close();
      this.autoWindow?.close();
    }
    w.toggle();
  }

  /** Opens / closes the Passive Tree (one modal window at a time: Status and the Inventory close first). */
  togglePassiveTree(): void {
    const w = this.passiveWindow;
    if (!w) return;
    if (!w.isOpen && this.statusWindow?.isOpen) this.statusWindow.close();
    if (!w.isOpen && this.inventoryWindow?.isOpen) this.inventoryWindow.close();
    if (!w.isOpen) this.skillWindow?.close();
    if (!w.isOpen) this.autoWindow?.close();
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
