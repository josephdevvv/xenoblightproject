import Phaser from 'phaser';
import { PALETTE } from '../config/palette';
import { getLanguage, LANGUAGES, setLanguage, t, type Language, type TranslationKey } from '../i18n';
import { localize } from '../i18n/phaser';
import { Button } from './Button';
import { createPanel, setPanelTitle } from './Panel';
import { typo } from './UITheme';

const WIDTH = 320;
const HEIGHT = 140;
/** Extra height for the Save Game row and its message. */
const SAVE_HEIGHT = 62;

export interface SettingsWindowOptions {
  depth: number;
  /** Called after the window opens / closes (e.g. to hide DOM inputs that sit above the canvas). */
  onOpen?: () => void;
  onClose?: () => void;
  /** Label of the button that closes the window (default: Close). */
  closeKey?: TranslationKey;
  /** In game: adds the Save Game button. Returns whether the download was started. */
  onSaveGame?: () => boolean;
}

/**
 * Settings: language, and Save Game while playing (`onSaveGame`). Modal, screen-space, mouse-driven. Choosing a language applies
 * it immediately everywhere (no restart) and saves it for the next visit.
 */
export class SettingsWindow {
  private readonly blocker: Phaser.GameObjects.Rectangle;
  private readonly panel: Phaser.GameObjects.Container;
  private readonly languageButtons = new Map<Language, Button>();
  private saveMessage: Phaser.GameObjects.Text | null = null;
  private saved: boolean | null = null;
  private open = false;

  constructor(
    scene: Phaser.Scene,
    private readonly options: SettingsWindowOptions,
  ) {
    const { width: sw, height: sh } = scene.scale;
    const height = HEIGHT + (options.onSaveGame ? SAVE_HEIGHT : 0);
    const x = Math.round((sw - WIDTH) / 2);
    const y = Math.round((sh - height) / 2);
    this.blocker = scene.add.rectangle(0, 0, sw, sh, 0x000000, 0.55).setOrigin(0, 0).setScrollFactor(0).setDepth(options.depth).setInteractive();
    this.panel = createPanel(scene, x, y, WIDTH, height, ' ').setScrollFactor(0).setDepth(options.depth + 1);
    // Clicks on empty panel areas must not reach anything below.
    this.panel.addAt(scene.add.zone(0, 0, WIDTH, height).setOrigin(0, 0).setInteractive(), 0);

    const languageLabel = scene.add.text(20, 42, '', typo('label', PALETTE.silver));
    this.panel.add(languageLabel);
    LANGUAGES.forEach((language, i) => {
      const button = new Button(scene, 20 + 68 + i * 144, 80, {
        width: 136,
        height: 28,
        label: '',
        onClick: () => setLanguage(language),
      });
      this.panel.add(button);
      this.languageButtons.set(language, button);
    });
    let save: Button | null = null;
    const { onSaveGame } = options;
    if (onSaveGame) {
      save = new Button(scene, WIDTH / 2, 124, { width: WIDTH - 40, height: 28, label: '', variant: 'primary', onClick: () => this.showSaved(onSaveGame()) });
      this.saveMessage = scene.add.text(WIDTH / 2, 144, '', typo('small', PALETTE.silver)).setOrigin(0.5, 0);
      this.panel.add([save, this.saveMessage]);
    }
    const close = new Button(scene, WIDTH - 20 - 48, height - 18, { width: 96, height: 22, label: '', role: 'small', onClick: () => this.close() });
    this.panel.add(close);

    localize(scene, () => {
      setPanelTitle(this.panel, t('settings.title'));
      languageLabel.setText(t('settings.languageLabel'));
      for (const [language, button] of this.languageButtons) {
        button.setLabel(t(`language.${language}`)).setSelected(language === getLanguage());
      }
      close.setLabel(t(options.closeKey ?? 'common.close'));
      save?.setLabel(t('settings.saveGame'));
      this.showSaved(this.saved);
    });

    this.setVisible(false);
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(): void {
    if (this.open) return;
    for (const [language, button] of this.languageButtons) button.setSelected(language === getLanguage());
    this.showSaved(null);
    this.setVisible(true);
    this.options.onOpen?.();
  }

  close(): void {
    if (!this.open) return;
    this.setVisible(false);
    this.options.onClose?.();
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  /** Result of Save Game (null = none yet). */
  private showSaved(started: boolean | null): void {
    this.saved = started;
    this.saveMessage?.setText(started === null ? '' : t(started ? 'settings.saveStarted' : 'settings.saveFailed')).setColor(started ? PALETTE.silver : PALETTE.error);
  }

  private setVisible(visible: boolean): void {
    this.open = visible;
    this.blocker.setVisible(visible);
    this.panel.setVisible(visible);
    if (visible) this.blocker.setInteractive();
    else this.blocker.disableInteractive();
    setInputEnabled(this.panel, visible);
  }
}

/** Enables / disables input on every interactive object inside a container (recursively). */
function setInputEnabled(container: Phaser.GameObjects.Container, enabled: boolean): void {
  container.each((child: Phaser.GameObjects.GameObject) => {
    if (child.input) child.input.enabled = enabled;
    if (child instanceof Phaser.GameObjects.Container) setInputEnabled(child, enabled);
  });
}
