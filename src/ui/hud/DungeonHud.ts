import Phaser from 'phaser';
import { PALETTE, toColorInt } from '../../config/palette';
import type { Point } from '../../core/types';
import type { CharacterData } from '../../data/CharacterData';
import { CharacterStatusService } from '../../status/CharacterStatusService';
import { STATUS_RULES } from '../../status/StatTypes';
import { levelProgress } from '../../progression/LevelProgression';
import { GameServices } from '../../systems/GameServices';
import { t, type TranslationKey } from '../../i18n';
import { labels } from '../../i18n/labels';
import { localize } from '../../i18n/phaser';
import type { TypographyRole } from '../text/Typography';
import { fitText } from '../text/fitText';
import type { IsometricMap } from '../../world/IsometricMap';
import { typo, UI_COLORS } from '../UITheme';
import { HUD_LAYERS, HUD_LAYOUT, HudSpace, hudTextureKey, REF_ELEMENTS, type HudLayerId, type ScreenRect } from './HudLayout';
import { Minimap } from './Minimap';
import { hotbarLayout } from './HotbarLayout';
import { HotbarService } from '../../hotbar/HotbarService';
import { InventoryService } from '../../inventory/InventoryService';
import { itemCount } from '../../inventory/InventoryState';
import { entryIcon } from '../hotbar/hotbarIcons';
import { GoldService } from '../../economy/GoldService';
import { GoldDisplay } from './GoldDisplay';
import { centerInkIn, textInk } from '../text/TextInk';
import { MENU_SLOT } from './HudLayout';
import { GEAR_ICON, MENU_ART, MENU_BAR, MORE_ICON } from './MenuBarArt';
import { cooldownSeconds, elapsedFraction, handAngle, remainingWedge, sweepStep } from './CooldownSweep';
import {
  AUTO_ARROW_PHASES,
  AUTO_BUTTON_STATES,
  AUTO_ICON_SIZE,
  AUTO_TEXT_COLORS,
  autoArrowKey,
  autoArrowPhase,
  autoArrowPixels,
  autoBaseKey,
  autoBasePixels,
  autoButtonState,
  type AutoButtonState,
} from './AutoButtonArt';
import { POTION_KEY_LABEL, POTION_SLOT_KEYS, type PotionSlotKey } from '../../hotbar/PotionSlots';
import { SkillService } from '../../skills/SkillService';
import { isSkillUnlocked } from '../../skills/ActiveSkills';

const BAR = HUD_LAYOUT.bars;
const TEXT = HUD_LAYOUT.dynamic_text;
/**
 * Pack layers not shown in game (the art stays in the pack): the chat box was removed by request; the pack's
 * 10-slot hotbar is replaced by the 8 hotbar slots drawn by the HUD (same size, frame and spacing).
 */
const HIDDEN_LAYERS = new Set<string>(['04_chat', '05_hotbar']);
/** Hotbar slot colours, sampled from the pack's hotbar art. */
const HOTBAR_COLORS = { frame: 0xe5e5eb, fill: 0x0f0f12, divider: 0x6c6c75 } as const;
/** The status block's HP bar (green, like the nameplate HP bars). */
const HUD_HP_GREEN = '#4fbf4f';
/** Lift for top-anchored text (see text()). */
const HUD_TEXT_LIFT = 4;

/** The Navigate label: the art's own text colour while usable (also while navigating), brighter on hover. */
const NAV_COLORS = { enabled: PALETTE.slate, hover: PALETTE.silver, disabled: '#2c2c32' } as const;

export interface DungeonHudOptions {
  character: CharacterData;
  map: IsometricMap;
  onStatus: () => void;
  onSettings: () => void;
  /** Opens / closes the Passive Tree. */
  onPassive: () => void;
  /** Opens / closes the Inventory. */
  onInventory: () => void;
  /** Opens / closes the Skill window. */
  onSkills?: () => void;
  /** The Auto Play button (right of the hotbar): opens its settings. */
  onAutoPlay?: () => void;
  /** The quest tracker's Navigate button (only clickable while enabled): walk to / stop walking to the quest NPC. */
  onNavigate?: () => void;
  /** Current SP (combat); max SP when absent. */
  currentSp?: () => number;
  /** Current HP (combat); max HP when absent. */
  currentHp?: () => number;
  /** A hotbar slot was clicked (0-based) - the same as its key 1-8. */
  onHotbarSlot?: (slot: number) => void;
  /** A click on the Q (HP) / W (SP) potion slot. */
  onPotionSlot?: (key: PotionSlotKey) => void;
}

/**
 * In-game HUD built from the dungeon HUD layer pack: layered chrome PNGs (drawn in the pack's
 * render order) with game-rendered text, code-driven HP / SP / EXP bars, a minimap and a menu bar.
 *
 * Systems that do not exist yet (quests, auto-play, skills on the hotbar, the other menu
 * entries) show their frame only, as visibly inactive placeholders.
 */
export class DungeonHud {
  /** Loads the HUD layer textures (once). Missing files are reported and that layer is skipped. */
  static async load(): Promise<void> {
    const services = await GameServices.ready();
    await Promise.all(
      HUD_LAYERS.filter((layer) => !HIDDEN_LAYERS.has(layer.id)).map((layer) =>
        services.assets
          .load({ key: hudTextureKey(layer.id), type: 'image', url: layer.url })
          .catch((e: Error) => console.warn(`[hud] ${e.message}`)),
      ),
    );
  }

  private readonly space: HudSpace;
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly levelText: Phaser.GameObjects.Text;
  /** Gold in the status block's top-right corner (its name row): coin + amount. */
  private readonly gold: GoldDisplay;
  private readonly hpText: Phaser.GameObjects.Text;
  private readonly spText: Phaser.GameObjects.Text;
  private readonly hpBar: Phaser.GameObjects.Rectangle;
  private readonly spBar: Phaser.GameObjects.Rectangle;
  private readonly expBar: Phaser.GameObjects.Rectangle;
  private readonly expText: Phaser.GameObjects.Text;
  private readonly hpArea: ScreenRect;
  private readonly spArea: ScreenRect;
  private readonly expArea: ScreenRect;
  private readonly coordText: Phaser.GameObjects.Text;
  private readonly minimap: Minimap;
  private readonly unsubscribe: () => void;
  private readonly nameMaxWidth: number;
  private readonly questName: Phaser.GameObjects.Text;
  private readonly questObjective: Phaser.GameObjects.Text;
  private questId: string | null = null;
  private questObjectiveKey = 'objective';
  private questParams: Record<string, number> | undefined;
  private lastTile = '';
  private lastHp: number | null = null;
  private lastSp: number | null = null;
  /** Unspent-points pips on the Status and Passive Tree menu slots (one shared look: unspentPip). */
  private readonly statusPip: Phaser.GameObjects.Rectangle;
  private readonly passivePip: Phaser.GameObjects.Rectangle;
  /** The Status menu button (tutorial spotlight target). */
  readonly statusButton: Phaser.GameObjects.Zone;
  /** The Passive Tree menu button (tutorial spotlight target). */
  readonly passiveButton: Phaser.GameObjects.Zone;
  /** The Inventory menu button (tutorial spotlight target). */
  readonly inventoryButton: Phaser.GameObjects.Zone;
  /** The Skill window menu button (tutorial spotlight target). */
  readonly skillButton: Phaser.GameObjects.Zone;
  /** The Auto Play button right of the hotbar. */
  readonly autoButton: Phaser.GameObjects.Zone;
  /** The round AUTO button: ring + disc, the circular arrows (turning while on), the "AUTO" text. */
  private readonly autoBase: Phaser.GameObjects.Image;
  private readonly autoArrows: Phaser.GameObjects.Image;
  private readonly autoLabel: Phaser.GameObjects.Text;
  /** The quest tracker's Navigate button (tutorial spotlight target): its box, label and state. */
  readonly navButton: Phaser.GameObjects.Zone;
  private readonly navLabel: Phaser.GameObjects.Text;
  private readonly navBox: ScreenRect;
  private navEnabled = true;
  private navHover = false;
  private navLocked = false;
  private autoOn = false;
  private autoHover = false;
  private autoEnabled = true;
  /** What the button shows now (redrawn only when it changes). */
  private autoShown = '';
  /** Where notices below the minimap start: its right edge, under the map name. */
  readonly belowMinimap: { right: number; top: number };
  /** Hotbar slots 1-8: click zones (UI hit testing, checks), icons and quantities. */
  readonly hotbarZones: Phaser.GameObjects.Zone[];
  private readonly hotbarIcons: Phaser.GameObjects.Image[];
  private readonly hotbarCounts: Phaser.GameObjects.Text[];
  /**
   * Cooldown sweep per slot: a grayscale, darkened copy of the icon over the coloured one, masked to the part of the
   * cooldown still to come (CooldownSweep), the clock hand and the seconds left. Redrawn only when a slot's sweep moves
   * a whole step or its seconds change.
   */
  private readonly cooldownViews: { gray: Phaser.GameObjects.Image; mask: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; key: string }[];
  private readonly cooldownHands: Phaser.GameObjects.Graphics;
  /** The Q / W potion slots (tutorial spotlight target: the potion training ends on Q). */
  readonly potionZones: Readonly<Record<PotionSlotKey, Phaser.GameObjects.Zone>>;
  private readonly potionIcons: Readonly<Record<PotionSlotKey, Phaser.GameObjects.Image>>;
  private readonly potionCounts: Readonly<Record<PotionSlotKey, Phaser.GameObjects.Text>>;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: DungeonHudOptions,
    private readonly depth = 0,
  ) {
    this.space = new HudSpace(scene.scale.width, scene.scale.height);

    // 1. Chrome layers, in the pack's render order.
    for (const layer of HUD_LAYERS) {
      if (HIDDEN_LAYERS.has(layer.id)) continue;
      const key = hudTextureKey(layer.id);
      if (!scene.textures.exists(key)) continue;
      const id = layer.id as HudLayerId;
      scene.add.image(this.space.x(id, layer.refX), this.space.y(id, layer.refY), key).setOrigin(0, 0).setDepth(depth);
    }

    // 2. Player status: name, level, HP / SP values and bars.
    const P = '01_player_status';
    const name = this.space.point(P, TEXT.player_name);
    const level = this.space.point(P, TEXT.level);
    this.nameText = this.text(name.x, name.y, '', 'label', PALETTE.white);
    this.levelText = this.text(level.x, level.y, '', 'label', PALETTE.accentLight);
    this.nameMaxWidth = level.x - name.x - 6;
    // Gold: the status block's top-right corner - the 12-px coin fills the name row (between the frame's top bevel
    // and the divider), the amount ends as far from the right border as the name starts from the left one
    const panel = this.space.inner(P, REF_ELEMENTS.playerPanel);
    this.gold = new GoldDisplay(scene, panel.x + panel.width - (name.x - panel.x), panel.y + 1, depth + 1);
    const offGold = GoldService.onChange((c) => {
      if (c === options.character) this.refreshGold();
    });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, offGold);
    this.refreshGold();
    const hpAt = this.space.point(P, TEXT.hp_value);
    const spAt = this.space.point(P, TEXT.mp_value);
    this.hpText = this.text(hpAt.x, hpAt.y, '', 'small', PALETTE.pale);
    this.spText = this.text(spAt.x, spAt.y, '', 'small', PALETTE.pale);
    this.hpArea = this.space.fill(P, BAR.hp.fill_rect as [number, number, number, number]);
    this.spArea = this.space.fill(P, BAR.mp.fill_rect as [number, number, number, number]);
    // HP is green (as on the nameplates); the pack's red is not used
    this.hpBar = this.bar(this.hpArea, HUD_HP_GREEN);
    this.spBar = this.bar(this.spArea, BAR.mp.hex);

    // 3. EXP bar (no EXP system yet: always 0 %).
    const E = '06_exp_bar';
    this.expArea = this.space.fill(E, BAR.exp.fill_rect as [number, number, number, number]);
    this.expBar = this.bar(this.expArea, BAR.exp.hex);
    this.expText = this.text(this.expArea.x + this.expArea.width / 2, this.expArea.y + this.expArea.height / 2, '', 'small', PALETTE.pale, false)
      .setOrigin(0.5);

    // 3b. Hotbar: 8 slots above the EXP bar, centred, numbered 1-8 (top-row keys), icon + quantity.
    const hotbarTop = this.space.frame('05_hotbar', REF_ELEMENTS.hotbarSlots[0]).y;
    const H = hotbarLayout(scene.scale.width, hotbarTop);
    const frames = scene.add.graphics().setDepth(depth + 1);
    frames.fillStyle(HOTBAR_COLORS.divider, 1).fillRect(H.divider.x, H.divider.y, 1, H.divider.height);
    frames.fillRect(H.potionDivider.x, H.potionDivider.y, 1, H.potionDivider.height);
    for (const s of [...H.slots, ...H.potionSlots]) {
      frames.fillStyle(HOTBAR_COLORS.fill, 1).fillRect(s.x, s.y, s.width, s.height);
      frames.fillStyle(HOTBAR_COLORS.frame, 1).fillRect(s.x, s.y, s.width, 1).fillRect(s.x, s.y + s.height - 1, s.width, 1).fillRect(s.x, s.y, 1, s.height).fillRect(s.x + s.width - 1, s.y, 1, s.height);
    }
    H.slots.forEach((s, i) => this.text(s.x + 3, s.y + 2, String(i + 1), 'small', PALETTE.gray, false));
    this.hotbarIcons = H.slots.map((s) => scene.add.image(s.x + Math.floor(s.width / 2), s.y + Math.floor(s.height / 2) + 2, '__DEFAULT').setDepth(depth + 2).setVisible(false));
    this.cooldownViews = H.slots.map((s, i) => {
      const base = this.hotbarIcons[i];
      const gray = scene.add.image(base.x, base.y, '__DEFAULT').setDepth(depth + 2).setVisible(false);
      // grayscale + darker where WebGL FX exist; a dark tint otherwise
      const fx = gray.preFX?.addColorMatrix();
      if (fx) {
        fx.grayscale(1);
        fx.brightness(0.55, true);
      } else gray.setTint(0x555555);
      const mask = scene.make.graphics({}, false);
      gray.setMask(mask.createGeometryMask());
      const text = this.text(s.x + Math.floor(s.width / 2), s.y + Math.floor(s.height / 2) + 2, '', 'small', PALETTE.white, false)
        .setOrigin(0.5, 0.5)
        .setStroke(PALETTE.black, 3)
        .setDepth(depth + 3);
      return { gray, mask, text, key: '' };
    });
    this.cooldownHands = scene.add.graphics().setDepth(depth + 2);
    this.hotbarCounts = H.slots.map((s) =>
      this.text(s.x + s.width - 3, s.y + s.height - 2, '', 'small', PALETTE.white, false)
        .setOrigin(1, 1)
        .setStroke(PALETTE.black, 3)
        .setDepth(depth + 3),
    );
    this.hotbarZones = H.slots.map((s, i) => {
      const zone = scene.add.zone(s.x, s.y, s.width, s.height).setOrigin(0, 0).setDepth(depth + 4).setInteractive();
      zone.on('pointerup', (p: Phaser.Input.Pointer) => {
        if (p.button === 0) this.options.onHotbarSlot?.(i);
      });
      return zone;
    });
    // Potion slots Q (HP) / W (SP) between the hotbar and Auto Play: key cap, icon, quantity; a click uses it
    const potionPart = <T>(make: (s: (typeof H.potionSlots)[number], key: PotionSlotKey) => T): Record<PotionSlotKey, T> => ({
      hp: make(H.potionSlots[0], 'hp'),
      sp: make(H.potionSlots[1], 'sp'),
    });
    potionPart((s, key) => this.text(s.x + 3, s.y + 2, POTION_KEY_LABEL[key], 'small', PALETTE.gray, false));
    this.potionIcons = potionPart((s) => scene.add.image(s.x + Math.floor(s.width / 2), s.y + Math.floor(s.height / 2) + 2, '__DEFAULT').setDepth(depth + 2).setVisible(false));
    this.potionCounts = potionPart((s) => this.text(s.x + s.width - 3, s.y + s.height - 2, '', 'small', PALETTE.white, false).setOrigin(1, 1).setStroke(PALETTE.black, 3).setDepth(depth + 3));
    this.potionZones = potionPart((s, key) => {
      const zone = scene.add.zone(s.x, s.y, s.width, s.height).setOrigin(0, 0).setDepth(depth + 4).setInteractive();
      zone.on('pointerup', (p: Phaser.Input.Pointer) => {
        if (p.button === 0) this.options.onPotionSlot?.(key);
      });
      return zone;
    });
    // Auto Play button right of W: a round gold-ringed AUTO badge (normal / hover / on - the arrows turn - /
    // disabled); a click opens its settings (X toggles Auto Play)
    const A = H.autoButton;
    ensureAutoButtonTextures(scene);
    const half = (AUTO_ICON_SIZE - 1) / 2;
    const cx = A.x + Math.floor(A.width / 2);
    const cy = A.y + Math.floor(A.height / 2);
    // top-left at whole pixels (the art has a centre pixel): crisp at any position
    this.autoBase = scene.add.image(cx - half, cy - half, autoBaseKey('normal')).setOrigin(0, 0).setDepth(depth + 1);
    this.autoArrows = scene.add.image(cx - half, cy - half, autoArrowKey('normal', 0)).setOrigin(0, 0).setDepth(depth + 2);
    this.autoLabel = this.text(cx, cy, 'AUTO', 'small', AUTO_TEXT_COLORS.normal, false).setOrigin(0.5, 0.5).setStroke(PALETTE.black, 2).setDepth(depth + 3);
    this.text(A.x, A.y, 'X', 'small', PALETTE.gray, false).setDepth(depth + 3);
    this.autoButton = scene.add.zone(A.x, A.y, A.width, A.height).setOrigin(0, 0).setDepth(depth + 4).setInteractive({ useHandCursor: true });
    this.autoButton.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.button === 0) this.options.onAutoPlay?.();
    });
    this.autoButton.on('pointerover', () => {
      this.autoHover = true;
      this.drawAutoButton();
    });
    this.autoButton.on('pointerout', () => {
      this.autoHover = false;
      this.drawAutoButton();
    });
    this.drawAutoButton();
    const refreshHotbar = (c: CharacterData): void => {
      if (c === options.character) this.refreshHotbar();
    };
    const offs = [InventoryService.onChange(refreshHotbar), HotbarService.onChange(refreshHotbar), SkillService.onLearned(refreshHotbar)];
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => offs.forEach((off) => off()));
    this.refreshHotbar();

    // 4. Quest tracker (setQuest) + Navigate: walks to the quest's NPC (GameUIScene enables it while the quest
    // leads to an NPC; a second click stops). Its label stays in the art's colour - never red.
    const Q = '02_quest_auto';
    const pin = this.space.frame(Q, REF_ELEMENTS.questPins[0]);
    this.questName = this.text(pin.x + pin.width + 4, pin.y + 1, '', 'small', PALETTE.gray);
    this.questObjective = this.text(pin.x + pin.width + 4, pin.y + 17, '', 'small', PALETTE.silver);
    this.navBox = this.space.frame(Q, REF_ELEMENTS.questNavButton);
    this.navLabel = this.text(this.navBox.x, this.navBox.y, '', 'small', NAV_COLORS.enabled, false);
    const nb = this.navBox;
    this.navButton = scene.add.zone(nb.x, nb.y, nb.width, nb.height).setOrigin(0, 0).setDepth(depth + 4).setInteractive({ useHandCursor: true });
    this.navButton.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.button === 0 && this.navEnabled) this.options.onNavigate?.();
    });
    this.navButton.on('pointerover', () => this.setNavHover(true));
    this.navButton.on('pointerout', () => this.setNavHover(false));
    this.setNavigationEnabled(false);

    // 5. Map, coordinates and menu.
    const M = '03_map_and_menu';
    // Coordinates centred in their box (hud_layout.json's x/y would left-align them).
    const coordBox = this.space.frame(M, REF_ELEMENTS.coordinateBox);
    const coord = this.space.point(M, TEXT.coordinates);
    this.coordText = this.text(coordBox.x + coordBox.width / 2, coord.y, '', 'small', PALETTE.pale).setOrigin(0.5, 0);
    const mapName = this.text(coordBox.x + coordBox.width, coordBox.y + coordBox.height + 3, '', 'small', PALETTE.silver).setOrigin(1, 0);
    const mapFrame = this.space.frame(M, REF_ELEMENTS.minimap);
    this.belowMinimap = { right: mapFrame.x + mapFrame.width, top: Math.ceil(mapName.y + mapName.height) + 2 };
    this.minimap = new Minimap(scene, options.map, this.space.inner(M, REF_ELEMENTS.minimap), depth + 1);
    // Menu bar, 6 slots left to right: Status, Passive Tree, Skills, Inventory, (placeholder), Settings
    this.drawMenuSlots(M);
    const statusSlot = this.space.inner(M, REF_ELEMENTS.menuSlots[MENU_SLOT.status]);
    this.statusButton = this.buildMenuButton(statusSlot, 'hud.menuStatus', () => this.options.onStatus(), (g, slot, color) => {
      // Tiny character-sheet glyph: head + shoulders.
      const cx = slot.x + Math.floor(slot.width / 2);
      g.fillStyle(toColorInt(color), 1);
      g.fillRect(cx - 1, slot.y + 2, 3, 3);
      g.fillRect(cx - 3, slot.y + 6, 7, 2);
      g.fillRect(cx - 4, slot.y + 8, 9, 3);
    });
    // Passive Tree (second slot): a center node with left / right / down branches.
    const passiveSlot = this.space.inner(M, REF_ELEMENTS.menuSlots[MENU_SLOT.passive]);
    this.passiveButton = this.buildMenuButton(passiveSlot, 'hud.menuPassive', () => this.options.onPassive(), (g, slot, color) => {
      const cx = slot.x + Math.floor(slot.width / 2);
      const cy = slot.y + Math.floor(slot.height / 2) - 2;
      g.fillStyle(toColorInt(color), 1);
      g.fillRect(cx - 1, cy - 1, 3, 3);
      g.fillRect(cx - 6, cy, 4, 1);
      g.fillRect(cx + 3, cy, 4, 1);
      g.fillRect(cx, cy + 2, 1, 4);
      g.fillRect(cx - 8, cy - 1, 2, 3);
      g.fillRect(cx + 7, cy - 1, 2, 3);
      g.fillRect(cx - 1, cy + 6, 3, 2);
    });
    this.statusPip = this.unspentPip(statusSlot);
    this.passivePip = this.unspentPip(passiveSlot);
    // Inventory: a bag.
    this.inventoryButton = this.buildMenuButton(this.space.inner(M, REF_ELEMENTS.menuSlots[MENU_SLOT.inventory]), 'hud.menuInventory', () => this.options.onInventory(), (g, slot, color) => {
      const cx = slot.x + Math.floor(slot.width / 2);
      g.fillStyle(toColorInt(color), 1);
      g.fillRect(cx - 2, slot.y + 1, 5, 1);
      g.fillRect(cx - 3, slot.y + 2, 1, 2);
      g.fillRect(cx + 3, slot.y + 2, 1, 2);
      g.fillRect(cx - 5, slot.y + 4, 11, 3);
      g.fillRect(cx - 5, slot.y + 8, 4, 3);
      g.fillRect(cx + 2, slot.y + 8, 4, 3);
      g.fillRect(cx, slot.y + 8, 1, 2);
    });
    // Skills: an open book.
    this.skillButton = this.buildMenuButton(this.space.inner(M, REF_ELEMENTS.menuSlots[MENU_SLOT.skills]), 'hud.menuSkills', () => this.options.onSkills?.(), (g, slot, color) => {
      const cx = slot.x + Math.floor(slot.width / 2);
      const top = slot.y + 2;
      g.fillStyle(toColorInt(color), 1);
      g.fillRect(cx - 6, top + 1, 5, 1).fillRect(cx + 2, top + 1, 5, 1);
      g.fillRect(cx - 7, top + 2, 1, 7).fillRect(cx + 7, top + 2, 1, 7);
      g.fillRect(cx - 6, top + 9, 5, 1).fillRect(cx + 2, top + 9, 5, 1);
      g.fillRect(cx, top + 2, 1, 8);
      g.fillRect(cx - 5, top + 4, 3, 1).fillRect(cx + 3, top + 4, 3, 1);
      g.fillRect(cx - 5, top + 6, 3, 1).fillRect(cx + 3, top + 6, 3, 1);
    });
    // Settings (last slot): a gear.
    this.buildMenuButton(this.space.inner(M, REF_ELEMENTS.menuSlots[MENU_SLOT.settings]), 'hud.menuSettings', () => this.options.onSettings(), (g, slot, color) => {
      const left = slot.x + Math.floor((slot.width - GEAR_ICON[0].length) / 2);
      const top = slot.y + Math.floor((slot.height - GEAR_ICON.length) / 2);
      g.fillStyle(toColorInt(color), 1);
      GEAR_ICON.forEach((row, j) => [...row].forEach((ch, i) => ch === '#' && g.fillRect(left + i, top + j, 1, 1)));
    });

    this.unsubscribe = CharacterStatusService.onChange((c) => {
      if (c === options.character) this.refreshStatus();
    });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe());

    localize(scene, () => {
      this.refreshQuest();
      this.layoutNavLabel();
      this.drawAutoButton();
      mapName.setText(labels.map(options.map.definition.id));
      this.refreshStatus();
    });
  }

  /**
   * The Navigate button: usable (the quest leads to an NPC, nothing in the way), disabled (gray, no click) or locked
   * by the tutorial (gray, but a click still reaches onNavigate - which says why).
   */
  setNavigationState(state: 'enabled' | 'disabled' | 'locked'): void {
    const locked = state === 'locked';
    if (locked !== this.navLocked) {
      this.navLocked = locked;
      this.paintNav();
    }
    this.setNavigationEnabled(state !== 'disabled');
  }

  private setNavigationEnabled(enabled: boolean): void {
    if (enabled === this.navEnabled) return;
    this.navEnabled = enabled;
    if (enabled) this.navButton.setInteractive({ useHandCursor: true });
    else {
      this.navButton.disableInteractive();
      this.navHover = false;
    }
    this.paintNav();
  }

  private setNavHover(on: boolean): void {
    this.navHover = on && this.navEnabled;
    this.paintNav();
  }

  private paintNav(): void {
    this.navLabel.setColor(!this.navEnabled || this.navLocked ? NAV_COLORS.disabled : this.navHover ? NAV_COLORS.hover : NAV_COLORS.enabled);
  }

  /** "พาไป" / "Navigate", its letters centred in the box both ways (measured from the painted pixels). */
  private layoutNavLabel(): void {
    this.navLabel.setText(t('hud.navigate'));
    const ink = textInk(this.navLabel) ?? { left: 0, right: this.navLabel.width - 1, top: 0, bottom: this.navLabel.height - 1 };
    const at = centerInkIn(this.navBox, ink);
    this.navLabel.setPosition(at.x, at.y);
  }

  /** Auto Play running or not: the round button turns bright with ON. */
  setAutoPlay(on: boolean): void {
    if (on === this.autoOn) return;
    this.autoOn = on;
    this.drawAutoButton();
  }

  /** The button can be used now (not dead, not in a conversation): otherwise it is drawn gray. */
  setAutoPlayEnabled(enabled: boolean): void {
    if (enabled === this.autoEnabled) return;
    this.autoEnabled = enabled;
    this.drawAutoButton();
  }

  /** Current look and arrow phase (the arrows turn while on: called every frame, redrawn only on a change). */
  private drawAutoButton(): void {
    const state: AutoButtonState = autoButtonState(this.autoOn, this.autoHover, this.autoEnabled);
    const phase = autoArrowPhase(state, this.scene.time.now);
    const shown = `${state}:${phase}`;
    if (shown === this.autoShown) return;
    const stateChanged = !this.autoShown.startsWith(`${state}:`);
    this.autoShown = shown;
    this.autoArrows.setTexture(autoArrowKey(state, phase));
    if (!stateChanged) return;
    this.autoBase.setTexture(autoBaseKey(state));
    this.autoLabel.setColor(AUTO_TEXT_COLORS[state]);
  }

  /** Small red pip on the Passive Tree menu slot while passive points are unspent (the tutorial has its own spotlight). */
  setPassivePoints(unspent: boolean): void {
    this.passivePip.setVisible(unspent);
  }

  /** The same pip on the Status menu slot while stat points are unspent. */
  setStatusPoints(unspent: boolean): void {
    this.statusPip.setVisible(unspent);
  }

  /** The unspent-points pip of a menu slot: 2x2 red at its top-right corner, hidden until there are points. */
  private unspentPip(slot: ScreenRect): Phaser.GameObjects.Rectangle {
    return this.scene.add.rectangle(slot.x + slot.width - 3, slot.y + 1, 2, 2, toColorInt('#d3424b')).setOrigin(0, 0).setDepth(this.depth + 3).setVisible(false);
  }

  /** Hotbar icons and quantities from the character's hotbar and bag (an item with none left is shown dimmed). */
  refreshHotbar(): void {
    const c = this.options.character;
    const state = HotbarService.state(c);
    this.hotbarIcons.forEach((icon, i) => {
      const e = state[i] ?? null;
      const pic = e ? entryIcon(e) : null;
      const shown = pic !== null && this.scene.textures.exists(pic.texture);
      icon.setVisible(shown);
      const count = e?.type === 'item' ? itemCount(c.inventory, e.itemId) : null;
      // an item with none left, or a skill that is not learned (e.g. from an edited file), is shown dimmed
      const usable = e?.type === 'item' ? count !== 0 : e ? isSkillUnlocked(c, e.skillId) : false;
      if (shown) icon.setTexture(pic.texture, pic.frame).setScale(pic.hudScale).setAlpha(usable ? 1 : 0.35);
      this.hotbarCounts[i].setText(count === null ? '' : String(count));
      // the cooldown copy follows the slot's picture; the next cooldown update redraws it
      const cd = this.cooldownViews[i];
      if (shown) cd.gray.setTexture(pic.texture, pic.frame).setScale(pic.hudScale);
      cd.key = '';
    });
    const potions = HotbarService.potions(c);
    for (const key of POTION_SLOT_KEYS) {
      const itemId = potions[key];
      const pic = itemId ? entryIcon({ type: 'item', itemId }) : null;
      const shown = pic !== null && this.scene.textures.exists(pic.texture);
      const count = itemId ? itemCount(c.inventory, itemId) : null;
      this.potionIcons[key].setVisible(shown);
      if (shown) this.potionIcons[key].setTexture(pic.texture, pic.frame).setScale(pic.hudScale).setAlpha(count === 0 ? 0.35 : 1);
      this.potionCounts[key].setText(count === null ? '' : String(count));
    }
  }

  /**
   * Per-frame: the cooldown sweep of every skill slot, from the skills' real remaining / total cooldown (manual and
   * Auto Play casts alike). `cooldown` = null when the skill is ready.
   */
  updateCooldowns(cooldown: (skillId: string) => { remainingMs: number; totalMs: number } | null): void {
    const state = HotbarService.state(this.options.character);
    let handsDirty = false;
    this.cooldownViews.forEach((cd, i) => {
      const e = state[i] ?? null;
      const c = e?.type === 'skill' && this.hotbarIcons[i].visible ? cooldown(e.skillId) : null;
      const key = c ? `${sweepStep(c.remainingMs, c.totalMs)}:${cooldownSeconds(c.remainingMs)}` : 'ready';
      if (key === cd.key) return;
      cd.key = key;
      handsDirty = true;
      cd.mask.clear();
      if (!c) {
        cd.gray.setVisible(false);
        cd.text.setText('');
        return;
      }
      const icon = this.hotbarIcons[i];
      const wedge = remainingWedge({ x: icon.x, y: icon.y }, Math.ceil(Math.max(icon.displayWidth, icon.displayHeight)), elapsedFraction(c.remainingMs, c.totalMs));
      cd.mask.fillStyle(0xffffff, 1).fillPoints(wedge, true);
      cd.gray.setVisible(true);
      cd.text.setText(String(cooldownSeconds(c.remainingMs)));
    });
    if (!handsDirty) return;
    // the clock hands: one 1-px line from each cooling slot's centre to the edge of its icon
    const g = this.cooldownHands.clear();
    this.cooldownViews.forEach((cd, i) => {
      if (!cd.gray.visible) return;
      const e = state[i];
      const c = e?.type === 'skill' ? cooldown(e.skillId) : null;
      if (!c) return;
      const icon = this.hotbarIcons[i];
      const r = Math.floor(Math.min(icon.displayWidth, icon.displayHeight) / 2);
      const a = handAngle(elapsedFraction(c.remainingMs, c.totalMs));
      g.lineStyle(1, 0xe7e7ee, 0.8).lineBetween(icon.x, icon.y, Math.round(icon.x + Math.cos(a) * r), Math.round(icon.y + Math.sin(a) * r));
    });
  }

  /** The Gold amount (and the coin just left of it), right-aligned at whole pixels. */
  private refreshGold(): void {
    this.gold.set(GoldService.get(this.options.character));
  }

  /** Quest tracker: the active quest's name and objective, or the placeholder text. */
  setQuest(questId: string | null, objectiveKey = 'objective', params?: Record<string, number>): void {
    this.questId = questId;
    this.questObjectiveKey = objectiveKey;
    this.questParams = params;
    this.refreshQuest();
  }

  private refreshQuest(): void {
    const id = this.questId;
    this.questName.setText(id ? labels.questName(id) : t('hud.noActiveQuest')).setColor(id ? '#ffd27a' : PALETTE.gray);
    this.questObjective.setText(id ? labels.questObjective(id, this.questObjectiveKey, this.questParams) : '');
  }

  /** Per-frame: coordinates, minimap and HP (only redrawn when it changes). */
  update(playerTile: Point, monsters: readonly Point[]): void {
    this.drawAutoButton();
    const hp = this.options.currentHp ? Math.round(this.options.currentHp()) : null;
    const sp = this.options.currentSp ? Math.round(this.options.currentSp()) : null;
    if ((hp !== null && hp !== this.lastHp) || (sp !== null && sp !== this.lastSp)) {
      this.lastHp = hp ?? this.lastHp;
      this.lastSp = sp ?? this.lastSp;
      this.refreshStatus();
    }
    const label = `${Math.floor(playerTile.x)}, ${Math.floor(playerTile.y)}`;
    if (label !== this.lastTile) {
      this.lastTile = label;
      this.coordText.setText(label);
    }
    this.minimap.update(playerTile, monsters);
  }

  /** Name, level, HP and SP (current from combat) and EXP towards the next level. */
  refreshStatus(): void {
    const c = this.options.character;
    const derived = CharacterStatusService.derived(c);
    fitText(this.nameText, c.name, this.nameMaxWidth);
    this.levelText.setText(t('hud.level', { level: c.status.level }));
    const maxHp = Math.round(derived.maxHp);
    const hp = Math.min(maxHp, this.options.currentHp ? Math.round(this.options.currentHp()) : maxHp);
    const maxSp = Math.round(derived.maxSp);
    const sp = Math.min(maxSp, this.options.currentSp ? Math.round(this.options.currentSp()) : maxSp);
    this.hpText.setText(t('hud.hp', { current: hp, max: maxHp }));
    this.spText.setText(t('hud.sp', { current: sp, max: maxSp }));
    this.setBar(this.hpBar, this.hpArea, hp, maxHp);
    this.setBar(this.spBar, this.spArea, sp, maxSp);
    const ratio = levelProgress(c.status.level, c.status.exp, STATUS_RULES.maxLevel);
    this.setBar(this.expBar, this.expArea, ratio, 1);
    this.expText.setText(t('hud.exp', { percent: (ratio * 100).toFixed(2) }));
  }

  /**
   * The menu bar's inside, repainted over the pack's off-centre slots: 6 slot frames (1-px border, top highlight
   * line) centred with equal spacing, and the pack's three-bar icon in slot 5 - a placeholder, no function yet.
   */
  private drawMenuSlots(M: HudLayerId): void {
    const g = this.scene.add.graphics().setDepth(this.depth + 0.5);
    const slots = REF_ELEMENTS.menuSlots.map((r) => this.space.frame(M, r));
    const barLeft = this.space.x(M, MENU_BAR.layerRefX) + MENU_BAR.innerLeft;
    g.fillStyle(MENU_ART.fill, 1).fillRect(barLeft, slots[0].y, MENU_BAR.innerWidth, slots[0].height);
    for (const f of slots) {
      g.fillStyle(MENU_ART.border, 1).fillRect(f.x, f.y, f.width, f.height);
      g.fillStyle(MENU_ART.fill, 1).fillRect(f.x + 1, f.y + 1, f.width - 2, f.height - 2);
      g.fillStyle(MENU_ART.highlight, 1).fillRect(f.x + 1, f.y + 1, f.width - 2, 1);
    }
    const more = slots[MENU_SLOT.more];
    g.fillStyle(MENU_ART.border, 1);
    for (const row of MORE_ICON.rows) g.fillRect(more.x + MORE_ICON.fromCol, more.y + row, MORE_ICON.toCol - MORE_ICON.fromCol + 1, 1);
  }

  /**
   * A menu-bar slot: hover outline + translated tooltip, click callback, optional procedural icon
   * (null when the icon is baked into the art).
   */
  private buildMenuButton(
    slot: ScreenRect,
    tooltipKey: TranslationKey,
    onClick: () => void,
    drawIcon: ((g: Phaser.GameObjects.Graphics, slot: ScreenRect, color: string) => void) | null,
  ): Phaser.GameObjects.Zone {
    const icon = drawIcon ? this.scene.add.graphics().setDepth(this.depth + 1) : null;
    const paintIcon = (color: string): void => {
      if (!icon || !drawIcon) return;
      icon.clear();
      drawIcon(icon, slot, color);
    };
    paintIcon(PALETTE.silver);

    const highlight = this.scene.add
      .rectangle(slot.x - 1, slot.y - 1, slot.width + 2, slot.height + 2)
      .setOrigin(0, 0)
      .setStrokeStyle(1, UI_COLORS.accentLight)
      .setDepth(this.depth + 2)
      .setVisible(false);
    const tip = this.text(slot.x + slot.width + 1, slot.y + slot.height + 3, '', 'tooltip', PALETTE.white)
      .setOrigin(1, 0)
      .setBackgroundColor(PALETTE.black)
      .setPadding(3, 1, 3, 1)
      .setDepth(this.depth + 3)
      .setVisible(false);
    localize(this.scene, () => tip.setText(t(tooltipKey)));

    const zone = this.scene.add.zone(slot.x, slot.y, slot.width, slot.height).setOrigin(0, 0).setDepth(this.depth + 4);
    zone.setInteractive({ useHandCursor: true });
    const setHover = (on: boolean): void => {
      highlight.setVisible(on);
      tip.setVisible(on);
      paintIcon(on ? PALETTE.white : PALETTE.silver);
    };
    zone.on('pointerover', () => setHover(true));
    zone.on('pointerout', () => setHover(false));
    zone.on('pointerup', () => {
      // A modal window's blocker swallows the following pointerout, so clear the hover now.
      setHover(false);
      onClick();
    });
    return zone;
  }

  /**
   * hud_layout.json gives the top of the visible glyphs; the UI font's text box starts higher
   * (room for Thai marks), so top-anchored text is lifted by HUD_TEXT_LIFT.
   */
  private text(x: number, y: number, value: string, role: TypographyRole, color: string, anchorTop = true): Phaser.GameObjects.Text {
    const top = anchorTop ? y - HUD_TEXT_LIFT : y;
    return this.scene.add.text(Math.round(x), Math.round(top), value, typo(role, color)).setDepth(this.depth + 2);
  }

  private bar(area: ScreenRect, hex: string): Phaser.GameObjects.Rectangle {
    return this.scene.add.rectangle(area.x, area.y, area.width, area.height, toColorInt(hex)).setOrigin(0, 0).setDepth(this.depth + 1);
  }

  private setBar(bar: Phaser.GameObjects.Rectangle, area: ScreenRect, current: number, max: number): void {
    const ratio = max > 0 ? Phaser.Math.Clamp(current / max, 0, 1) : 0;
    const width = Math.round(area.width * ratio);
    bar.setVisible(width > 0);
    bar.setSize(Math.max(width, 1), area.height);
  }
}

/** The AUTO button's art as small canvas textures (once per game): a base per look, the arrows per look / phase. */
function ensureAutoButtonTextures(scene: Phaser.Scene): void {
  const make = (key: string, pixels: Uint8ClampedArray): void => {
    if (scene.textures.exists(key)) return;
    const texture = scene.textures.createCanvas(key, AUTO_ICON_SIZE, AUTO_ICON_SIZE);
    if (!texture) return;
    const ctx = texture.getContext();
    const image = ctx.createImageData(AUTO_ICON_SIZE, AUTO_ICON_SIZE);
    image.data.set(pixels);
    ctx.putImageData(image, 0, 0);
    texture.refresh();
  };
  for (const state of AUTO_BUTTON_STATES) {
    make(autoBaseKey(state), autoBasePixels(state));
    const phases = state === 'on' ? AUTO_ARROW_PHASES : 1;
    for (let phase = 0; phase < phases; phase++) make(autoArrowKey(state, phase), autoArrowPixels(state, phase));
  }
}
