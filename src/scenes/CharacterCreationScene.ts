import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SCENES } from '../config/constants';
import { keepCentered } from '../ui/layout/CenteredDesign';
import { PALETTE, toColorInt } from '../config/palette';
import { AssetManager } from '../assets/AssetManager';
import { getLogoTexture } from '../assets/LogoTexture';
import { GameServices } from '../systems/GameServices';
import { LoadingScreen } from '../ui/LoadingScreen';
import { DIRECTIONS } from '../core/Direction';
import { TextureKeys } from '../assets/TextureKeys';
import { getCharacterSpriteId } from '../characters/CharacterAssetIds';
import { CharacterView } from '../characters/CharacterView';
import { GENDERS, type Gender } from '../data/AppearanceCatalog';
import {
  createCharacterData,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  validateCharacterName,
  type CharacterAppearance,
  type LocalizedMessage,
} from '../data/CharacterData';
import {
  allStarterAppearances,
  DEFAULT_STARTER_CHOICE,
  STARTER_HAIRSTYLE_IDS,
  STARTER_OUTFIT_ID,
  starterAppearance,
  starterHairColors,
} from '../data/StarterCharacters';
import { CharacterStore } from '../data/CharacterStore';
import { t, translate, type TranslationKey, type TranslationParams } from '../i18n';
import { labels } from '../i18n/labels';
import { localize } from '../i18n/phaser';
import { CharacterStatusService } from '../status/CharacterStatusService';
import { AtmosphereEffects } from '../world/AtmosphereEffects';
import { Button } from '../ui/Button';
import { createPanel, setPanelTitle } from '../ui/Panel';
import { SettingsWindow } from '../ui/SettingsWindow';
import { TextInputField } from '../ui/TextInputField';
import { typo } from '../ui/UITheme';

const PREVIEW_SCALE = 3;
const LOGO_HEIGHT = 112;
/** Top of the two main panels (below the logo header). */
const PANEL_TOP = 112;
const PANEL_HEIGHT = 356;
const HINT: LocalizedMessage = { key: 'creation.nameHint', params: { min: NAME_MIN_LENGTH, max: NAME_MAX_LENGTH } };

/**
 * Character creation: Gender -> Hairstyle -> Hair colour -> Name -> Create. The player picks gender, a starter
 * hairstyle and - when that hairstyle has more than one approved colour (Mohawk, Side Swept, Straight Bangs) - the hair colour; the
 * Drifter outfit and class are fixed by StarterCharacters. The outfit row is a preview, not a choice.
 * The preview always shows the single complete sprite sheet resolved for the current selection.
 */
export class CharacterCreationScene extends Phaser.Scene {
  private appearance!: CharacterAppearance;
  /** Null until this run's UI is built (the scene object is reused when it restarts). */
  private preview: CharacterView | null = null;
  private previewDirection = DIRECTIONS.indexOf('S');

  private genderButtons!: Map<Gender, Button>;
  /** One button per starter hairstyle slot (Bald + the gender's hairstyles). */
  private hairstyleButtons: Button[] = [];
  /** One button per selectable hair colour slot (shown only when the hairstyle has several colours). */
  private hairColorButtons: Button[] = [];
  /** Shown instead of the colour buttons when the colour is fixed (e.g. Mohawk Blonde, Bald). */
  private hairColorFixedText!: Phaser.GameObjects.Text;
  private settings!: SettingsWindow;
  /** The message under the name field, kept as a key so it can be re-translated. */
  private message: { text: LocalizedMessage; isError: boolean } = { text: HINT, isError: false };
  private nameInput!: TextInputField;
  private messageText!: Phaser.GameObjects.Text;
  private spriteIdText!: Phaser.GameObjects.Text;
  private directionText!: Phaser.GameObjects.Text;
  private createButton!: Button;
  private atmosphere!: AtmosphereEffects;
  private submitting = false;

  constructor() {
    super(SCENES.CharacterCreation);
  }

  create(): void {
    // Always a fresh character: nothing is taken over from an earlier one.
    this.appearance = starterAppearance(DEFAULT_STARTER_CHOICE);
    this.previewDirection = DIRECTIONS.indexOf('S');
    this.submitting = false;
    // Drop references from the previous run (its objects were destroyed on shutdown).
    this.preview = null;
    this.hairstyleButtons = [];
    this.hairColorButtons = [];

    this.createBackdrop();
    // laid out for 960 x 480 (GAME_WIDTH / GAME_HEIGHT below are its design size): centred in a wider / taller mobile view
    keepCentered(this, { width: GAME_WIDTH, height: GAME_HEIGHT }, { fitSafe: true });
    const loading = new LoadingScreen(this).show();
    this.cameras.main.fadeIn(400, 0, 0, 0);

    // The preview's sprite sheet is loaded on demand (deduplicated) before the UI is built,
    // so the first frame of the preview is already the real art.
    void GameServices.ready()
      .then(() => AssetManager.ensureCharacterSheets(this, this.appearance, { walk: false }))
      .then(() => {
        if (!this.sys.isActive()) return;
        this.createHeader();
        this.createOptionsPanel();
        this.createPreviewPanel();
        this.refreshAll();
        loading.hide();
      });
  }

  update(_time: number, delta: number): void {
    this.atmosphere.update(delta);
  }

  // -------------------------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------------------------

  private createBackdrop(): void {
    // more than the design area: the fog still covers a wider mobile view around the centred layout
    const bounds = new Phaser.Geom.Rectangle(-320, -240, GAME_WIDTH + 640, GAME_HEIGHT + 480);
    this.atmosphere = new AtmosphereEffects(this, bounds)
      .addDriftLayer({ textureKey: TextureKeys.fx.fog, count: 7, depth: -10, scale: [5, 8], alpha: [0.05, 0.09], speed: [4, 10] })
      .addVignette(-5); // behind the UI on this screen
  }

  private createHeader(): void {
    const logoKey = getLogoTexture(this, LOGO_HEIGHT);
    if (logoKey) {
      this.add.image(14, 0, logoKey).setOrigin(0, 0);
    } else {
      // Fallback if the logo file is missing.
      this.add.text(28, 34, 'XENOBLIGHT', typo('display', PALETTE.white));
    }
    const title = this.add.text(GAME_WIDTH - 28, 38, '', typo('heading', PALETTE.pale)).setOrigin(1, 0);
    this.add.rectangle(GAME_WIDTH - 28, 64, 36, 1, toColorInt(PALETTE.accent)).setOrigin(1, 0);
    const subtitle = this.add.text(GAME_WIDTH - 28, 68, '', typo('small', PALETTE.slate)).setOrigin(1, 0);

    // Settings (language) is reachable before entering the game.
    this.settings = new SettingsWindow(this, {
      depth: 1000,
      onOpen: () => this.nameInput?.setVisible(false),
      onClose: () => this.nameInput?.setVisible(true),
    });
    const settingsButton = new Button(this, GAME_WIDTH - 28 - 48, 18, {
      width: 96,
      height: 22,
      label: '',
      role: 'small',
      onClick: () => this.settings.toggle(),
    });
    const backButton = new Button(this, GAME_WIDTH - 28 - 48 - 104, 18, { width: 96, height: 22, label: '', role: 'small', onClick: () => this.backToMenu() });
    const onEscape = (): void => {
      if (this.settings.isOpen) this.settings.close();
      else this.backToMenu();
    };
    this.input.keyboard?.on('keydown-ESC', onEscape);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown-ESC', onEscape));

    localize(this, () => {
      title.setText(t('creation.title'));
      subtitle.setText(t('creation.subtitle'));
      settingsButton.setLabel(t('common.settings'));
      backButton.setLabel(t('common.back'));
    });
  }

  private createOptionsPanel(): void {
    createPanel(this, 24, PANEL_TOP, 456, PANEL_HEIGHT);
    const labelX = 48;
    const controlX = 330;
    const rowLabels: { text: Phaser.GameObjects.Text; key: TranslationKey }[] = [];
    const row = (y: number, step: string, key: TranslationKey): void => {
      this.add.text(labelX, y, step, typo('label', PALETTE.accentLight)).setOrigin(0, 0.5);
      rowLabels.push({ text: this.add.text(labelX + 26, y, '', typo('label', PALETTE.silver)).setOrigin(0, 0.5), key });
    };

    // 01 Gender
    row(146, '01', 'creation.gender');
    this.genderButtons = new Map();
    GENDERS.forEach((g, i) => {
      const button = new Button(this, 264 + i * 132, 146, {
        width: 124,
        height: 28,
        label: '',
        onClick: () => this.selectGender(g.id),
      });
      this.genderButtons.set(g.id, button);
    });

    // 02 Hairstyle (one button per starter hairstyle of the gender, labels follow the gender). Up to three slots keep the
    // original 84 px buttons (x 178-446); four share the same span inside the panel (x 178-472) with narrower buttons; five
    // or more become a two-row grid (y 180 / 206, small captions) in the band between the gender and hair-colour rows.
    row(192, '02', 'creation.hairstyle');
    const hairSlots = Math.max(...Object.values(STARTER_HAIRSTYLE_IDS).map((ids) => ids.length));
    const hairGap = 6;
    const hairRows = hairSlots <= 4 ? 1 : 2;
    const hairCols = Math.ceil(hairSlots / hairRows);
    // even width so every button centre stays on a whole pixel
    const hairWidth = hairSlots <= 3 ? 84 : Math.floor((472 - 178 - hairGap * (hairCols - 1)) / hairCols / 2) * 2;
    const hairStep = hairSlots <= 3 ? 92 : hairWidth + hairGap;
    this.hairstyleButtons = Array.from({ length: hairSlots }, (_, slot) => slot).map(
      (slot) =>
        new Button(this, 178 + hairWidth / 2 + (slot % hairCols) * hairStep, hairRows === 1 ? 192 : 180 + Math.floor(slot / hairCols) * 26, {
          width: hairWidth,
          height: hairRows === 1 ? 28 : 24,
          label: '',
          ...(hairRows === 1 ? {} : { role: 'small' as const }),
          onClick: () => this.selectHairstyle(slot),
        }),
    );

    // 03 Hair colour (buttons when the hairstyle offers several colours, otherwise the fixed colour as text)
    row(238, '03', 'creation.hairColor');
    const colorSlots = Math.max(...allStarterAppearances().map((a) => starterHairColors(a.hairstyleId).length));
    this.hairColorButtons = Array.from({ length: colorSlots }, (_, slot) => slot).map(
      (slot) =>
        new Button(this, 204 + slot * 56, 238, {
          width: 52,
          height: 24,
          label: '',
          role: 'small',
          onClick: () => this.selectHairColor(slot),
        }),
    );
    this.hairColorFixedText = this.add.text(202, 238, '', typo('body', PALETTE.white)).setOrigin(0, 0.5);

    // 04 Outfit preview: always the Drifter starter outfit (not selectable)
    row(282, '04', 'creation.outfitPreview');
    const outfitName = this.add.text(202, 282, '', typo('body', PALETTE.white)).setOrigin(0, 0.5);

    // 05 Name
    row(324, '05', 'creation.name');
    this.nameInput = new TextInputField(this, controlX, 324, {
      width: 260,
      placeholder: t('creation.namePlaceholder'),
      maxLength: NAME_MAX_LENGTH,
    });
    this.nameInput.onSubmit(() => this.submit());
    this.nameInput.onInput(() => this.showMessage(HINT, false));
    this.messageText = this.add.text(200, 350, '', typo('small', PALETTE.gray)).setOrigin(0, 0.5);

    // Create
    this.createButton = new Button(this, 252, 424, {
      width: 408,
      height: 38,
      label: '',
      role: 'section',
      variant: 'primary',
      onClick: () => this.submit(),
    });

    localize(this, () => {
      for (const r of rowLabels) r.text.setText(t(r.key));
      for (const [gender, button] of this.genderButtons) button.setLabel(labels.gender(gender));
      outfitName.setText(labels.outfit(STARTER_OUTFIT_ID));
      this.nameInput.setPlaceholder(t('creation.namePlaceholder'));
      this.createButton.setLabel(t('creation.create'));
      this.showMessage(this.message.text, this.message.isError);
      if (this.preview) this.refreshAll();
    });
  }

  private createPreviewPanel(): void {
    const panel = createPanel(this, 496, PANEL_TOP, 440, PANEL_HEIGHT, ' ');
    const cx = 716;
    const feetY = 332;

    this.spriteIdText = this.add.text(cx, 150, '', typo('small', PALETTE.slate)).setOrigin(0.5);

    this.add
      .image(cx, feetY - 10, TextureKeys.fx.glow)
      .setScale(4.5, 2.2)
      .setAlpha(0.14)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.add
      .image(cx, feetY, TextureKeys.pathTiles[0])
      .setOrigin(0.5, 16 / 40)
      .setScale(PREVIEW_SCALE);

    this.preview = new CharacterView(this, this.appearance, cx, feetY, { walk: false });
    this.preview.setScale(PREVIEW_SCALE);

    new Button(this, cx - 84, 408, { width: 32, height: 26, label: '<', onClick: () => this.rotatePreview(-1) });
    new Button(this, cx + 84, 408, { width: 32, height: 26, label: '>', onClick: () => this.rotatePreview(1) });
    this.directionText = this.add.text(cx, 408, '', typo('label', PALETTE.silver)).setOrigin(0.5);
    const rotateHint = this.add.text(cx, 440, '', typo('small', PALETTE.gray)).setOrigin(0.5);

    localize(this, () => {
      setPanelTitle(panel, t('creation.preview'));
      rotateHint.setText(t('creation.rotateHint'));
      if (this.preview) this.refreshPreviewDirection();
    });
  }

  // -------------------------------------------------------------------------------------------
  // Behaviour
  // -------------------------------------------------------------------------------------------

  private selectGender(gender: Gender): void {
    if (gender === this.appearance.gender) return;
    // Keep the slot (Bald stays Bald, hair stays hair) so switching gender feels stable.
    const slot = Math.max(0, STARTER_HAIRSTYLE_IDS[this.appearance.gender].indexOf(this.appearance.hairstyleId));
    this.appearance = starterAppearance({ gender, hairstyleId: STARTER_HAIRSTYLE_IDS[gender][slot] });
    this.refreshAll();
  }

  private selectHairstyle(slot: number): void {
    const hairstyleId = STARTER_HAIRSTYLE_IDS[this.appearance.gender][slot];
    if (!hairstyleId || hairstyleId === this.appearance.hairstyleId) return;
    this.appearance = starterAppearance({ gender: this.appearance.gender, hairstyleId });
    this.refreshAll();
  }

  private selectHairColor(slot: number): void {
    const hairColorId = starterHairColors(this.appearance.hairstyleId)[slot];
    if (!hairColorId || hairColorId === this.appearance.hairColorId) return;
    this.appearance = starterAppearance({ gender: this.appearance.gender, hairstyleId: this.appearance.hairstyleId, hairColorId });
    this.refreshAll();
  }

  private rotatePreview(delta: number): void {
    const n = DIRECTIONS.length;
    this.previewDirection = (this.previewDirection + delta + n) % n;
    this.refreshPreviewDirection();
  }

  private refreshAll(): void {
    for (const [gender, button] of this.genderButtons) button.setSelected(gender === this.appearance.gender);
    const styles = STARTER_HAIRSTYLE_IDS[this.appearance.gender];
    this.hairstyleButtons.forEach((button, slot) => {
      const id = styles[slot];
      button.setVisible(Boolean(id));
      if (id) button.setLabel(labels.hairstyle(id)).setSelected(id === this.appearance.hairstyleId);
    });
    const colors = starterHairColors(this.appearance.hairstyleId);
    const choosable = colors.length > 1;
    this.hairColorButtons.forEach((button, slot) => {
      const id = colors[slot];
      button.setVisible(choosable && Boolean(id));
      if (choosable && id) button.setLabel(labels.hairColor(id)).setSelected(id === this.appearance.hairColorId);
    });
    this.hairColorFixedText.setVisible(!choosable).setText(this.appearance.hairColorId === 'none' ? '-' : labels.hairColor(this.appearance.hairColorId));

    this.preview?.setAppearance(this.appearance);
    this.spriteIdText.setText(getCharacterSpriteId(this.appearance));
    this.refreshPreviewDirection();
    // The starter looks are small: load them all so every switch is instant.
    void AssetManager.prefetchStandingSheets(this, allStarterAppearances());
  }

  private refreshPreviewDirection(): void {
    const direction = DIRECTIONS[this.previewDirection];
    this.preview?.animator.setMotion('stand', direction);
    this.directionText.setText(labels.direction(direction));
  }

  private showMessage(text: LocalizedMessage, isError: boolean): void {
    this.message = { text, isError };
    this.messageText.setText(translate(text.key, text.params as TranslationParams | undefined)).setColor(isError ? PALETTE.error : PALETTE.gray);
    this.nameInput.setInvalid(isError);
  }

  private submit(): void {
    if (this.submitting || this.settings.isOpen) return;
    const result = validateCharacterName(this.nameInput.value);
    if (!result.valid) {
      this.showMessage(result.error, true);
      this.cameras.main.shake(120, 0.002);
      return;
    }

    this.nameInput.blur();
    this.enterGame(result.name);
  }

  private backToMenu(): void {
    if (this.submitting || this.settings.isOpen) return;
    this.submitting = true;
    this.nameInput.blur();
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(SCENES.MainMenu));
  }

  private enterGame(name: string): void {
    this.submitting = true;
    this.createButton.setEnabled(false);
    // Every New Game is its own, fresh character - whatever it is called.
    const character = createCharacterData(name, { gender: this.appearance.gender, hairstyleId: this.appearance.hairstyleId, hairColorId: this.appearance.hairColorId });
    CharacterStatusService.startNew(character);
    CharacterStore.startSession(character);

    this.cameras.main.fadeOut(450, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(SCENES.Game, {});
    });
  }
}
