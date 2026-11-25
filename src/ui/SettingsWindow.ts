import Phaser from 'phaser';
import { PALETTE } from '../config/palette';
import { getLanguage, LANGUAGES, setLanguage, t, type Language, type TranslationKey } from '../i18n';
import { localize } from '../i18n/phaser';
import { Button } from './Button';
import { createPanel, setPanelTitle } from './Panel';
import { typo } from './UITheme';
import { UI_SCALE } from './layout/UiScale';
import { uiView } from './layout/UiLayers';

const WIDTH = 320;
const HEIGHT = 140;
/** Extra height for the Save Game row and its message. */
const SAVE_HEIGHT = 62;
/** Extra height for the UI Scale row (in game only). */
const SCALE_HEIGHT = 50;

export interface SettingsWindowOptions {
  depth: number;
  /** Called after the window opens / closes (e.g. to hide DOM inputs that sit above the canvas). */
  onOpen?: () => void;
  onClose?: () => void;
  /** Label of the button that closes the window (default: Close). */
  closeKey?: TranslationKey;
  /** In game: adds the Save Game button. Returns whether the download was started. */
  onSaveGame?: () => boolean;
  /**
   * In game only: the UI Scale row (from 100 %, step 5, no upper limit). `set` applies and saves it at once; `limit` is
   * the largest scale the windows can use on this screen (the row says so when the choice is above it).
   */
  uiScale?: { value: () => number; set: (percent: number) => void; limit: () => number };
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
    const { width: sw, height: sh } = uiView(scene, 'windows');
    const scaleRow = options.uiScale ? SCALE_HEIGHT : 0;
    const height = HEIGHT + scaleRow + (options.onSaveGame ? SAVE_HEIGHT : 0);
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
    // UI Scale (in game): - 100 % +, a step of 5 per click, applied at once
    let scaleLabel: Phaser.GameObjects.Text | null = null;
    let refreshScale = (): void => undefined;
    const { uiScale } = options;
    if (uiScale) {
      scaleLabel = scene.add.text(20, 116, '', typo('label', PALETTE.silver));
      const value = scene.add.text(196, 128, '', typo('label', PALETTE.white)).setOrigin(0.5);
      const note = scene.add.text(WIDTH / 2, 146, '', typo('small', PALETTE.slate)).setOrigin(0.5, 0);
      const minus = new Button(scene, 140, 128, { width: 36, height: 24, label: '-', onClick: () => uiScale.set(uiScale.value() - UI_SCALE.step) });
      const plus = new Button(scene, 252, 128, { width: 36, height: 24, label: '+', onClick: () => uiScale.set(uiScale.value() + UI_SCALE.step) });
      this.panel.add([scaleLabel, value, note, minus, plus]);
      refreshScale = () => {
        const v = uiScale.value();
        const limit = uiScale.limit();
        value.setText(`${v}%`);
        note.setText(v > limit ? t('settings.uiScaleLimit', { percent: limit }) : '');
        minus.setEnabled?.(v > UI_SCALE.min);
      };
    }
    let save: Button | null = null;
    const { onSaveGame } = options;
    if (onSaveGame) {
      save = new Button(scene, WIDTH / 2, 124 + scaleRow, { width: WIDTH - 40, height: 28, label: '', variant: 'primary', onClick: () => this.showSaved(onSaveGame()) });
      this.saveMessage = scene.add.text(WIDTH / 2, 144 + scaleRow, '', typo('small', PALETTE.silver)).setOrigin(0.5, 0);
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
      scaleLabel?.setText(t('settings.uiScaleLabel'));
      refreshScale();
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
