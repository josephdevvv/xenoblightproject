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
import { findHairColor, type Gender } from '../data/AppearanceCatalog';
import {
  createCharacterData,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  validateCharacterName,
  type CharacterAppearance,
  type LocalizedMessage,
} from '../data/CharacterData';
import {
  allTrialAppearances,
  DEFAULT_STARTER_CHOICE,
  NO_HAIR_COLOR_ID,
  STARTER_GENDERS,
  STARTER_HAIR_COLOR_ID,
  STARTER_HAIRSTYLE_IDS,
  STARTER_OUTFIT_ID,
  starterAppearance,
  starterHairColors,
  TRIAL_OUTFIT_IDS,
  trialAppearance,
} from '../data/StarterCharacters';
import { CharacterStore } from '../data/CharacterStore';
import { t, translate, type TranslationKey, type TranslationParams } from '../i18n';
import { labels } from '../i18n/labels';
import { localize } from '../i18n/phaser';
import { CharacterStatusService } from '../status/CharacterStatusService';
import { AtmosphereEffects } from '../world/AtmosphereEffects';
import { Button } from '../ui/Button';
import { createPanel, setPanelTitle } from '../ui/Panel';
import { cycleIndex, selectorRowYs } from '../ui/selector/SelectorCycle';
import { SelectorRow } from '../ui/SelectorRow';
import { SettingsWindow } from '../ui/SettingsWindow';
import { TextInputField } from '../ui/TextInputField';
import { typo } from '../ui/UITheme';

const PREVIEW_SCALE = 3;
const LOGO_HEIGHT = 112;
/** Top of the two main panels (below the logo header). */
const PANEL_TOP = 112;
const PANEL_HEIGHT = 356;
const HINT: LocalizedMessage = { key: 'creation.nameHint', params: { min: NAME_MIN_LENGTH, max: NAME_MAX_LENGTH } };

/** The selector rows (and the name field under them): one bar per option, the same size and the same gap. */
const SELECTOR = { x: 330, width: 260, height: 28, firstY: 146, step: 44 };

/**
 * Character creation: Gender -> Hairstyle -> Hair colour -> Trial Outfit -> Name -> Create. Each of the four options
 * is one arrow selector row ("<  value  >"): the arrows step through the options and the preview follows at once.
 * The player picks gender, a starter hairstyle and - when that hairstyle has hair - its colour; the Drifter outfit and
 * class are fixed by StarterCharacters. Trial Outfit only changes what the preview wears (TRIAL_OUTFIT_IDS): the new
 * character always starts in the starter outfit.
 * The preview always shows the single complete sprite sheet resolved for the current selection.
 */
export class CharacterCreationScene extends Phaser.Scene {
  private appearance!: CharacterAppearance;
  /** Null until this run's UI is built (the scene object is reused when it restarts). */
  private preview: CharacterView | null = null;
  private previewDirection = DIRECTIONS.indexOf('S');

  /** The outfit the preview wears (never saved - see TRIAL_OUTFIT_IDS). */
  private trialOutfitId: string = STARTER_OUTFIT_ID;
  /** The colour last picked, kept while Bald (no colour) is shown so it comes back with the next hairstyle. */
  private hairColorChoice: string = STARTER_HAIR_COLOR_ID;
  private genderRow!: SelectorRow;
  private hairstyleRow!: SelectorRow;
  private hairColorRow!: SelectorRow;
  private outfitRow!: SelectorRow;
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
    this.trialOutfitId = STARTER_OUTFIT_ID;
    this.hairColorChoice = this.appearance.hairColorId === NO_HAIR_COLOR_ID ? STARTER_HAIR_COLOR_ID : this.appearance.hairColorId;

    this.createBackdrop();
    // laid out for 960 x 480 (GAME_WIDTH / GAME_HEIGHT below are its design size): centred in a wider / taller mobile view
    keepCentered(this, { width: GAME_WIDTH, height: GAME_HEIGHT }, { fitSafe: true });
    const loading = new LoadingScreen(this).show();
    this.cameras.main.fadeIn(400, 0, 0, 0);

    // The preview's sprite sheet is loaded on demand (deduplicated) before the UI is built,
    // so the first frame of the preview is already the real art.
    void GameServices.ready()
      .then(() => AssetManager.ensureCharacterSheets(this, trialAppearance(this.appearance, this.trialOutfitId), { walk: false }))
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
    const rowLabels: { text: Phaser.GameObjects.Text; key: TranslationKey }[] = [];
    const row = (y: number, step: string, key: TranslationKey): void => {
      this.add.text(labelX, y, step, typo('label', PALETTE.accentLight)).setOrigin(0, 0.5);
      rowLabels.push({ text: this.add.text(labelX + 26, y, '', typo('label', PALETTE.silver)).setOrigin(0, 0.5), key });
    };

    // 01-04: one arrow selector row per option, all the same bar, evenly spaced; 05 (the name) continues the column
    const [genderY, hairstyleY, hairColorY, outfitY, nameY] = selectorRowYs(SELECTOR.firstY, SELECTOR.step, 5) as [number, number, number, number, number];
    const selector = (y: number, onCycle: (delta: -1 | 1) => void): SelectorRow => new SelectorRow(this, SELECTOR.x, y, { width: SELECTOR.width, height: SELECTOR.height, onCycle });
    row(genderY, '01', 'creation.gender');
    this.genderRow = selector(genderY, (delta) => this.cycleGender(delta));
    row(hairstyleY, '02', 'creation.hairstyle');
    this.hairstyleRow = selector(hairstyleY, (delta) => this.cycleHairstyle(delta));
    row(hairColorY, '03', 'creation.hairColor');
    this.hairColorRow = selector(hairColorY, (delta) => this.cycleHairColor(delta));
    row(outfitY, '04', 'creation.trialOutfit');
    this.outfitRow = selector(outfitY, (delta) => this.cycleTrialOutfit(delta));

    // 05 Name
    row(nameY, '05', 'creation.name');
    this.nameInput = new TextInputField(this, SELECTOR.x, nameY, {
      width: SELECTOR.width,
      placeholder: t('creation.namePlaceholder'),
      maxLength: NAME_MAX_LENGTH,
    });
    this.nameInput.onSubmit(() => this.submit());
    this.nameInput.onInput(() => this.showMessage(HINT, false));
    this.messageText = this.add.text(SELECTOR.x - SELECTOR.width / 2, nameY + 26, '', typo('small', PALETTE.gray)).setOrigin(0, 0.5);

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

    this.preview = new CharacterView(this, trialAppearance(this.appearance, this.trialOutfitId), cx, feetY, { walk: false });
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

  /** Left / right on Gender. The hairstyle keeps its slot (Bald stays Bald, hair stays hair) and the colour stays. */
  private cycleGender(delta: number): void {
    const gender: Gender = STARTER_GENDERS[cycleIndex(STARTER_GENDERS.indexOf(this.appearance.gender), delta, STARTER_GENDERS.length)]!;
    if (gender === this.appearance.gender) return;
    const slot = Math.max(0, STARTER_HAIRSTYLE_IDS[this.appearance.gender].indexOf(this.appearance.hairstyleId));
    const styles = STARTER_HAIRSTYLE_IDS[gender];
    this.choose(gender, styles[Math.min(slot, styles.length - 1)]!);
  }

  /** Left / right on Hairstyle: the next starter hairstyle of this gender, in the colour picked last. */
  private cycleHairstyle(delta: number): void {
    const styles = STARTER_HAIRSTYLE_IDS[this.appearance.gender];
    this.choose(this.appearance.gender, styles[cycleIndex(styles.indexOf(this.appearance.hairstyleId), delta, styles.length)]!);
  }

  /** Left / right on Hair Colour: the next colour approved for this hairstyle (Bald has none - the arrows are off). */
  private cycleHairColor(delta: number): void {
    const colors = starterHairColors(this.appearance.hairstyleId);
    if (colors.length < 2) return;
    this.hairColorChoice = colors[cycleIndex(colors.indexOf(this.appearance.hairColorId), delta, colors.length)]!;
    this.choose(this.appearance.gender, this.appearance.hairstyleId);
  }

  /** Left / right on Trial Outfit: what the preview wears. */
  private cycleTrialOutfit(delta: number): void {
    this.trialOutfitId = TRIAL_OUTFIT_IDS[cycleIndex(TRIAL_OUTFIT_IDS.indexOf(this.trialOutfitId), delta, TRIAL_OUTFIT_IDS.length)]!;
    this.refreshAll();
  }

  /** The one place a selection changes: always a supported starter look (StarterCharacters), shown at once. */
  private choose(gender: Gender, hairstyleId: string): void {
    this.appearance = starterAppearance({ gender, hairstyleId, hairColorId: this.hairColorChoice });
    this.refreshAll();
  }

  private rotatePreview(delta: number): void {
    const n = DIRECTIONS.length;
    this.previewDirection = (this.previewDirection + delta + n) % n;
    this.refreshPreviewDirection();
  }

  private refreshAll(): void {
    const { gender, hairstyleId, hairColorId } = this.appearance;
    const hasColor = hairColorId !== NO_HAIR_COLOR_ID;
    this.genderRow.setValue(labels.gender(gender), STARTER_GENDERS.length);
    this.hairstyleRow.setValue(labels.hairstyle(hairstyleId), STARTER_HAIRSTYLE_IDS[gender].length);
    this.hairColorRow.setValue(hasColor ? labels.hairColor(hairColorId) : '-', starterHairColors(hairstyleId).length, hasColor ? findHairColor(hairColorId).hex : null);
    this.outfitRow.setValue(labels.outfit(this.trialOutfitId), TRIAL_OUTFIT_IDS.length);

    // the preview wears the trial outfit; everything else is the selection itself
    const shown = trialAppearance(this.appearance, this.trialOutfitId);
    this.preview?.setAppearance(shown);
    this.spriteIdText.setText(getCharacterSpriteId(shown));
    this.refreshPreviewDirection();
    // The standing sheets are small: load every look of this gender (all hairstyles, colours, trial outfits) so each
    // arrow press shows at once.
    void AssetManager.prefetchStandingSheets(this, allTrialAppearances().filter((a) => a.gender === gender));
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
