import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SCENES } from '../config/constants';
import { PALETTE, toColorInt } from '../config/palette';
import { AssetManager } from '../assets/AssetManager';
import { getLogoTexture } from '../assets/LogoTexture';
import { GameServices } from '../systems/GameServices';
import { LoadingScreen } from '../ui/LoadingScreen';
import { DIRECTIONS } from '../core/Direction';
import { TextureKeys } from '../assets/TextureKeys';
import { getCharacterSpriteId } from '../characters/CharacterAssetIds';
import { CharacterView } from '../characters/CharacterView';
import {
  GENDERS,
  getHairstyles,
  HAIR_COLORS,
  indexOfOption,
  OUTFITS,
  type Gender,
} from '../data/AppearanceCatalog';
import {
  createCharacterData,
  createDefaultAppearance,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  validateCharacterName,
  type CharacterAppearance,
} from '../data/CharacterData';
import { CharacterStore } from '../data/CharacterStore';
import { CharacterStatusService } from '../status/CharacterStatusService';
import { AtmosphereEffects } from '../world/AtmosphereEffects';
import { Button } from '../ui/Button';
import { ColorSwatchPicker } from '../ui/ColorSwatchPicker';
import { OptionSelector } from '../ui/OptionSelector';
import { createPanel } from '../ui/Panel';
import { TextInputField } from '../ui/TextInputField';
import { textStyle } from '../ui/UITheme';

const PREVIEW_SCALE = 3;
const LOGO_HEIGHT = 112;
/** Top of the two main panels (below the logo header). */
const PANEL_TOP = 112;
const PANEL_HEIGHT = 356;
const HINT_TEXT = `${NAME_MIN_LENGTH}-${NAME_MAX_LENGTH} letters or numbers`;

/**
 * Character creation: Gender -> Hairstyle -> Hair Colour -> Outfit -> Name -> Create.
 * The preview always shows the single complete sprite sheet resolved for the current selection.
 */
export class CharacterCreationScene extends Phaser.Scene {
  private appearance!: CharacterAppearance;
  private preview!: CharacterView;
  private previewDirection = DIRECTIONS.indexOf('S');

  private genderButtons!: Map<Gender, Button>;
  private hairstyleSelector!: OptionSelector;
  private hairColorName!: Phaser.GameObjects.Text;
  private nameInput!: TextInputField;
  private messageText!: Phaser.GameObjects.Text;
  private spriteIdText!: Phaser.GameObjects.Text;
  private directionText!: Phaser.GameObjects.Text;
  private createButton!: Button;
  private atmosphere!: AtmosphereEffects;
  private submitting = false;
  /** Genders whose full sheet set has been queued for background prefetch in this visit. */
  private readonly prefetchedGenders = new Set<Gender>();

  constructor() {
    super(SCENES.CharacterCreation);
  }

  create(): void {
    const previous = CharacterStore.getActive();
    this.appearance = previous ? { ...previous.appearance } : createDefaultAppearance();
    this.previewDirection = DIRECTIONS.indexOf('S');
    this.submitting = false;
    this.prefetchedGenders.clear();

    this.createBackdrop();
    const loading = new LoadingScreen(this).show();
    this.cameras.main.fadeIn(400, 0, 0, 0);

    // The preview's sprite sheet is loaded on demand (deduplicated) before the UI is built,
    // so the first frame of the preview is already the real art.
    void GameServices.ready()
      .then(() => AssetManager.ensureCharacterSheets(this, this.appearance, { walk: false }))
      .then(() => {
        if (!this.sys.isActive()) return;
        this.createHeader();
        this.createOptionsPanel(previous?.name ?? '');
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
    const bounds = new Phaser.Geom.Rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT);
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
      this.add.text(28, 34, 'XENOBLIGHT', textStyle(28, PALETTE.white, { letterSpacing: 6, fontStyle: 'bold' }));
    }
    this.add.text(GAME_WIDTH - 28, 44, 'CHARACTER CREATION', textStyle(12, PALETTE.silver, { letterSpacing: 3 })).setOrigin(1, 0);
    this.add.rectangle(GAME_WIDTH - 28, 64, 36, 1, toColorInt(PALETTE.accent)).setOrigin(1, 0);
    this.add.text(GAME_WIDTH - 28, 74, 'MILESTONE 01  ·  PROTOTYPE', textStyle(9, PALETTE.stone, { letterSpacing: 2 })).setOrigin(1, 0);
  }

  private createOptionsPanel(initialName: string): void {
    createPanel(this, 24, PANEL_TOP, 456, PANEL_HEIGHT);
    const labelX = 48;
    const controlX = 330;
    const row = (y: number, step: string, label: string): void => {
      this.add.text(labelX, y, step, textStyle(10, PALETTE.accentLight)).setOrigin(0, 0.5);
      this.add.text(labelX + 26, y, label, textStyle(11, PALETTE.silver, { letterSpacing: 2 })).setOrigin(0, 0.5);
    };

    // 01 Gender
    row(150, '01', 'GENDER');
    this.genderButtons = new Map();
    GENDERS.forEach((g, i) => {
      const button = new Button(this, 264 + i * 132, 150, {
        width: 124,
        height: 28,
        label: g.label.toUpperCase(),
        onClick: () => this.selectGender(g.id),
      });
      this.genderButtons.set(g.id, button);
    });

    // 02 Hairstyle
    row(198, '02', 'HAIRSTYLE');
    this.hairstyleSelector = new OptionSelector(this, controlX, 198, {
      width: 260,
      options: getHairstyles(this.appearance.gender).map((h) => h.label),
      index: indexOfOption(getHairstyles(this.appearance.gender), this.appearance.hairstyleId),
      onChange: (i) => {
        this.appearance.hairstyleId = getHairstyles(this.appearance.gender)[i].id;
        this.refreshAll();
      },
    });

    // 03 Hair colour
    row(246, '03', 'HAIR COLOR');
    new ColorSwatchPicker(this, 200, 246, {
      colors: HAIR_COLORS.map((c) => c.hex),
      index: indexOfOption(HAIR_COLORS, this.appearance.hairColorId),
      size: 22,
      gap: 12,
      onChange: (i) => {
        this.appearance.hairColorId = HAIR_COLORS[i].id;
        this.refreshAll();
      },
    });
    this.hairColorName = this.add.text(380, 246, '', textStyle(12, PALETTE.white)).setOrigin(0, 0.5);

    // 04 Outfit
    row(294, '04', 'OUTFIT');
    new OptionSelector(this, controlX, 294, {
      width: 260,
      options: OUTFITS.map((o) => o.label),
      index: indexOfOption(OUTFITS, this.appearance.outfitId),
      onChange: (i) => {
        this.appearance.outfitId = OUTFITS[i].id;
        this.refreshAll();
      },
    });

    // 05 Name
    row(342, '05', 'NAME');
    this.nameInput = new TextInputField(this, controlX, 342, {
      width: 260,
      placeholder: 'Enter character name',
      maxLength: NAME_MAX_LENGTH,
      value: initialName,
    });
    this.nameInput.onSubmit(() => this.submit());
    this.nameInput.onInput(() => this.showMessage(HINT_TEXT, false));
    this.messageText = this.add.text(200, 368, HINT_TEXT, textStyle(10, PALETTE.gray)).setOrigin(0, 0.5);

    // Create
    this.createButton = new Button(this, 252, 424, {
      width: 408,
      height: 38,
      label: 'CREATE CHARACTER',
      fontSize: 14,
      variant: 'primary',
      onClick: () => this.submit(),
    });
  }

  private createPreviewPanel(): void {
    createPanel(this, 496, PANEL_TOP, 440, PANEL_HEIGHT, 'PREVIEW');
    const cx = 716;
    const feetY = 332;

    this.spriteIdText = this.add.text(cx, 150, '', textStyle(9, PALETTE.gray)).setOrigin(0.5);

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
    this.directionText = this.add.text(cx, 408, '', textStyle(11, PALETTE.silver, { letterSpacing: 2 })).setOrigin(0.5);
    this.add.text(cx, 440, 'ROTATE TO CHECK ALL 8 DIRECTIONS', textStyle(9, PALETTE.gray, { letterSpacing: 1 })).setOrigin(0.5);
  }

  // -------------------------------------------------------------------------------------------
  // Behaviour
  // -------------------------------------------------------------------------------------------

  private selectGender(gender: Gender): void {
    if (gender === this.appearance.gender) return;
    // Keep the same slot index so switching gender feels stable.
    const slot = indexOfOption(getHairstyles(this.appearance.gender), this.appearance.hairstyleId);
    const styles = getHairstyles(gender);
    this.appearance.gender = gender;
    this.appearance.hairstyleId = styles[Math.min(slot, styles.length - 1)].id;
    this.hairstyleSelector.setOptions(
      styles.map((h) => h.label),
      indexOfOption(styles, this.appearance.hairstyleId),
    );
    this.refreshAll();
  }

  private rotatePreview(delta: number): void {
    const n = DIRECTIONS.length;
    this.previewDirection = (this.previewDirection + delta + n) % n;
    this.refreshPreviewDirection();
  }

  private refreshAll(): void {
    for (const [gender, button] of this.genderButtons) button.setSelected(gender === this.appearance.gender);
    const color = HAIR_COLORS[indexOfOption(HAIR_COLORS, this.appearance.hairColorId)];
    this.hairColorName.setText(color.label);

    this.preview.setAppearance(this.appearance);
    this.spriteIdText.setText(getCharacterSpriteId(this.appearance));
    this.refreshPreviewDirection();
    this.prefetchLikelyAppearances();
  }

  /**
   * Background-loads the sheets the player can reach next, so changing an option shows the new
   * sprite immediately: first everything one click away, then the rest of the current gender.
   * Already-loaded sheets are skipped, so calling this after every change is cheap.
   */
  private prefetchLikelyAppearances(): void {
    const a = this.appearance;
    const near: CharacterAppearance[] = [];
    for (const color of HAIR_COLORS) near.push({ ...a, hairColorId: color.id });
    for (const style of getHairstyles(a.gender)) near.push({ ...a, hairstyleId: style.id });
    for (const outfit of OUTFITS) near.push({ ...a, outfitId: outfit.id });
    const otherGender: Gender = a.gender === 'male' ? 'female' : 'male';
    const slot = indexOfOption(getHairstyles(a.gender), a.hairstyleId);
    near.push({ ...a, gender: otherGender, hairstyleId: getHairstyles(otherGender)[slot].id });

    const gender = a.gender;
    void AssetManager.prefetchStandingSheets(this, near).then(() => {
      if (!this.sys.isActive() || this.prefetchedGenders.has(gender)) return;
      this.prefetchedGenders.add(gender);
      const all: CharacterAppearance[] = [];
      for (const outfit of OUTFITS) {
        for (const style of getHairstyles(gender)) {
          for (const color of HAIR_COLORS) all.push({ gender, hairstyleId: style.id, hairColorId: color.id, outfitId: outfit.id });
        }
      }
      void AssetManager.prefetchStandingSheets(this, all);
    });
  }

  private refreshPreviewDirection(): void {
    const direction = DIRECTIONS[this.previewDirection];
    this.preview.animator.setMotion('stand', direction);
    this.directionText.setText(direction);
  }

  private showMessage(text: string, isError: boolean): void {
    this.messageText.setText(text).setColor(isError ? PALETTE.error : PALETTE.gray);
    this.nameInput.setInvalid(isError);
  }

  private submit(): void {
    if (this.submitting) return;
    const result = validateCharacterName(this.nameInput.value);
    if (!result.valid) {
      this.showMessage(result.error, true);
      this.cameras.main.shake(120, 0.002);
      return;
    }

    this.submitting = true;
    this.nameInput.blur();
    this.createButton.setEnabled(false);

    const character = createCharacterData(result.name, this.appearance);
    // Prototype identity = name: an existing name continues its saved status, a new name starts at level 1.
    CharacterStatusService.loadInto(character);
    CharacterStore.add(character);
    CharacterStore.setActive(character.id);

    this.cameras.main.fadeOut(450, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(SCENES.Game);
    });
  }
}
