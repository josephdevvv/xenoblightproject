import Phaser from 'phaser';
import { PALETTE, toColorInt } from '../../config/palette';
import type { Point } from '../../core/types';
import type { CharacterData } from '../../data/CharacterData';
import { CharacterStatusService } from '../../status/CharacterStatusService';
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

const BAR = HUD_LAYOUT.bars;
const TEXT = HUD_LAYOUT.dynamic_text;
/** Pack layers not shown in game (the chat box was removed by request; the art stays in the pack). */
const HIDDEN_LAYERS = new Set<string>(['04_chat']);
/** Lift for top-anchored text (see text()). */
const HUD_TEXT_LIFT = 4;

export interface DungeonHudOptions {
  character: CharacterData;
  map: IsometricMap;
  onStatus: () => void;
  onSettings: () => void;
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
  private lastTile = '';

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
    const hpAt = this.space.point(P, TEXT.hp_value);
    const spAt = this.space.point(P, TEXT.mp_value);
    this.hpText = this.text(hpAt.x, hpAt.y, '', 'small', PALETTE.pale);
    this.spText = this.text(spAt.x, spAt.y, '', 'small', PALETTE.pale);
    this.hpArea = this.space.fill(P, BAR.hp.fill_rect as [number, number, number, number]);
    this.spArea = this.space.fill(P, BAR.mp.fill_rect as [number, number, number, number]);
    this.hpBar = this.bar(this.hpArea, BAR.hp.hex);
    this.spBar = this.bar(this.spArea, BAR.mp.hex);

    // 3. EXP bar (no EXP system yet: always 0 %).
    const E = '06_exp_bar';
    this.expArea = this.space.fill(E, BAR.exp.fill_rect as [number, number, number, number]);
    this.expBar = this.bar(this.expArea, BAR.exp.hex);
    this.expText = this.text(this.expArea.x + this.expArea.width / 2, this.expArea.y + this.expArea.height / 2, '', 'small', PALETTE.pale, false)
      .setOrigin(0.5);

    // 4. Quest tracker + AUTO (placeholders: no quest or auto-play system yet).
    const Q = '02_quest_auto';
    const pin = this.space.frame(Q, REF_ELEMENTS.questPins[0]);
    const questText = this.text(pin.x + pin.width + 4, pin.y + 1, '', 'small', PALETTE.gray);
    const auto = this.space.point(Q, TEXT.auto_label);
    const autoText = this.text(auto.x, auto.y, '', 'small', PALETTE.slate);

    // 5. Map, coordinates and menu.
    const M = '03_map_and_menu';
    // Coordinates centred in their box (hud_layout.json's x/y would left-align them).
    const coordBox = this.space.frame(M, REF_ELEMENTS.coordinateBox);
    const coord = this.space.point(M, TEXT.coordinates);
    this.coordText = this.text(coordBox.x + coordBox.width / 2, coord.y, '', 'small', PALETTE.pale).setOrigin(0.5, 0);
    const mapName = this.text(coordBox.x + coordBox.width, coordBox.y + coordBox.height + 3, '', 'small', PALETTE.silver).setOrigin(1, 0);
    this.minimap = new Minimap(scene, options.map, this.space.inner(M, REF_ELEMENTS.minimap), depth + 1);
    this.buildMenuButton(this.space.inner(M, REF_ELEMENTS.menuSlots[0]), 'hud.menuStatus', () => this.options.onStatus(), (g, slot, color) => {
      // Tiny character-sheet glyph: head + shoulders.
      const cx = slot.x + Math.floor(slot.width / 2);
      g.fillStyle(toColorInt(color), 1);
      g.fillRect(cx - 1, slot.y + 2, 3, 3);
      g.fillRect(cx - 3, slot.y + 6, 7, 2);
      g.fillRect(cx - 4, slot.y + 8, 9, 3);
    });
    // The pack's menu button (three bars, baked into the art) opens Settings.
    this.buildMenuButton(this.space.inner(M, REF_ELEMENTS.menuMore), 'hud.menuSettings', () => this.options.onSettings(), null);

    this.unsubscribe = CharacterStatusService.onChange((c) => {
      if (c === options.character) this.refreshStatus();
    });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe());

    localize(scene, () => {
      questText.setText(t('hud.noActiveQuest'));
      autoText.setText(t('hud.auto'));
      mapName.setText(labels.map(options.map.definition.id));
      this.refreshStatus();
    });
  }

  /** Per-frame: coordinates and minimap. */
  update(playerTile: Point, monsters: readonly Point[]): void {
    const label = `${Math.floor(playerTile.x)}, ${Math.floor(playerTile.y)}`;
    if (label !== this.lastTile) {
      this.lastTile = label;
      this.coordText.setText(label);
    }
    this.minimap.update(playerTile, monsters);
  }

  /** Name, level and HP / SP from the character status (current values = max until combat exists). */
  refreshStatus(): void {
    const c = this.options.character;
    const derived = CharacterStatusService.derived(c);
    fitText(this.nameText, c.name, this.nameMaxWidth);
    this.levelText.setText(t('hud.level', { level: c.status.level }));
    const hp = Math.round(derived.maxHp);
    const sp = Math.round(derived.maxSp);
    this.hpText.setText(t('hud.hp', { current: hp, max: hp }));
    this.spText.setText(t('hud.sp', { current: sp, max: sp }));
    this.setBar(this.hpBar, this.hpArea, hp, hp);
    this.setBar(this.spBar, this.spArea, sp, sp);
    this.setBar(this.expBar, this.expArea, 0, 1);
    // No EXP system yet: the bar and value show 0 %.
    this.expText.setText(t('hud.exp', { percent: (0).toFixed(2) }));
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
  ): void {
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
