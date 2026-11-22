import Phaser from 'phaser';
import { getLogoTexture } from '../assets/LogoTexture';
import { TextureKeys } from '../assets/TextureKeys';
import { GAME_HEIGHT, GAME_WIDTH, SCENES } from '../config/constants';
import { PALETTE } from '../config/palette';
import { CharacterStore } from '../data/CharacterStore';
import { getLanguage, t, type TranslationKey } from '../i18n';
import { localize } from '../i18n/phaser';
import { pickTextFile } from '../save/fileIO';
import { MAX_SAVE_CHARS, parseSave, type GameSave, type SaveFileError } from '../save/SaveFile';
import { SaveService } from '../save/SaveService';
import { AtmosphereEffects } from '../world/AtmosphereEffects';
import { ChoiceDialog } from '../ui/ChoiceDialog';
import { drawPanelFrame, INV_COLORS as C } from '../ui/inventory/inventoryTheme';
import { mainMenuLayout } from '../ui/menu/MainMenuLayout';
import { FrameButton } from '../ui/passiveTree/PassiveTreeWindow';
import { SettingsWindow } from '../ui/SettingsWindow';
import { fitText } from '../ui/text/fitText';
import { typo } from '../ui/UITheme';

type MenuMessage = SaveFileError | 'storage' | 'unreadable';

/**
 * First screen: logo, New Game (character creation), Load Game (a save file from the player's computer) and
 * Settings (language). Leaving the game leads back here; the game keeps saving progress in the browser as
 * before.
 */
export class MainMenuScene extends Phaser.Scene {
  private atmosphere!: AtmosphereEffects;
  private settings!: SettingsWindow;
  private dialog!: ChoiceDialog;
  private messageText!: Phaser.GameObjects.Text;
  private messageWidth = 0;
  private message: MenuMessage | null = null;
  /** The scene is being left. */
  private busy = false;

  constructor() {
    super(SCENES.MainMenu);
  }

  create(): void {
    this.busy = false;
    this.message = null;
    this.cameras.main.setBackgroundColor(PALETTE.void).fadeIn(400, 0, 0, 0);
    this.atmosphere = new AtmosphereEffects(this, new Phaser.Geom.Rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT))
      .addDriftLayer({ textureKey: TextureKeys.fx.fog, count: 7, depth: -10, scale: [5, 8], alpha: [0.05, 0.09], speed: [4, 10] })
      .addVignette(-5);

    const L = mainMenuLayout(this.scale.width, this.scale.height);
    const logo = getLogoTexture(this, L.logo.height);
    if (logo) {
      const image = this.add.image(0, 0, logo).setOrigin(0, 0);
      image.setPosition(Math.round(L.logo.cx - image.width / 2), Math.round(L.logo.cy - image.height / 2));
    } else this.add.text(L.logo.cx, L.logo.cy, 'XENOBLIGHT', typo('display', PALETTE.white)).setOrigin(0.5);

    const frames = this.add.graphics();
    const root = this.add.container(0, 0, [frames]);
    const actions: [TranslationKey, () => void][] = [
      ['menu.newGame', () => this.newGame()],
      ['menu.loadGame', () => void this.loadGame()],
      ['menu.settings', () => this.busy || this.settings.show()],
    ];
    const buttons = actions.map(([key, onClick], i) => {
      drawPanelFrame(frames, L.buttons[i]);
      const [x, y, , h] = L.buttons[i];
      frames.fillStyle(C.red, 1).fillRect(x + 12, y + Math.floor(h / 2) - 2, 4, 4);
      const button = new FrameButton(this, root, L.buttons[i], C.lineText, onClick);
      button.label.setStyle(typo('section', C.lineText));
      return { key, button };
    });
    this.messageWidth = L.message.width;
    this.messageText = this.add.text(L.message.cx, L.message.y, '', typo('small', PALETTE.error)).setOrigin(0.5, 0);

    // the window is translucent: the buttons step aside for it
    this.settings = new SettingsWindow(this, { depth: 100, closeKey: 'common.back', onOpen: () => root.setVisible(false), onClose: () => root.setVisible(true) });
    this.dialog = new ChoiceDialog(this, 200);
    const onEscape = (): void => this.settings.close();
    this.input.keyboard?.on('keydown-ESC', onEscape);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown-ESC', onEscape);
      this.dialog.forget();
    });

    localize(this, () => {
      for (const { key, button } of buttons) button.label.setText(t(key));
      this.showMessage(this.message);
    });
  }

  update(_time: number, delta: number): void {
    this.atmosphere.update(delta);
  }

  // -------------------------------------------------------------------------------------------

  private newGame(): void {
    if (this.busy) return;
    this.leave(SCENES.CharacterCreation);
  }

  private async loadGame(): Promise<void> {
    if (this.busy) return;
    this.showMessage(null);
    // The menu stays usable meanwhile: a browser may never say that its picker was cancelled.
    const file = await pickTextFile('.json,application/json', MAX_SAVE_CHARS * 4);
    if (!this.sys.isActive() || this.busy || file.kind === 'cancelled') return;
    if (file.kind !== 'picked') {
      this.showMessage(file.kind);
      return;
    }
    const result = parseSave(file.text);
    if (result.ok) this.confirmRestore(result.save);
    else this.showMessage(result.error);
  }

  /** Anything that would be replaced is named first; nothing happens before the player agrees. */
  private confirmRestore(save: GameSave): void {
    const { name } = save.profile;
    const active = CharacterStore.getActive();
    const lines: string[] = [];
    if (SaveService.hasCharacter(name)) lines.push(t('save.replaceCharacter', { name }));
    if (active) lines.push(t('save.replaceSession', { name: active.name }));
    if (lines.length === 0) {
      this.restore(save);
      return;
    }
    const info = t('save.fileInfo', { name, level: save.status.level });
    const when = save.savedAt === null ? '' : new Date(save.savedAt).toLocaleString(getLanguage() === 'th' ? 'th-TH' : 'en-GB');
    this.dialog.show({
      title: t('save.confirmTitle'),
      lines: [when ? `${info}  ·  ${when}` : info, ...lines],
      choices: [
        { label: t('save.confirmLoad'), tone: 'danger', onChoose: () => this.restore(save) },
        { label: t('common.cancel'), tone: 'quiet', onChoose: () => undefined },
      ],
    });
  }

  private restore(save: GameSave): void {
    if (this.busy) return;
    const character = SaveService.restore(save);
    if (!character) {
      this.showMessage('storage');
      return;
    }
    CharacterStore.add(character);
    CharacterStore.setActive(character.id);
    this.leave(SCENES.Game, { savedLocation: save.savedLocation });
  }

  private leave(scene: string, data: object = {}): void {
    this.busy = true;
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(scene, data));
  }

  private showMessage(message: MenuMessage | null): void {
    this.message = message;
    fitText(this.messageText, message ? t(`save.errors.${message}`) : '', this.messageWidth);
  }
}
