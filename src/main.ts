import Phaser from 'phaser';
import { createGameConfig } from './config/GameConfig';
import { findMissingTranslations, initLanguage } from './i18n';
import { installPixelTextSnap, loadPixelFont } from './ui/text/PixelFont';

async function start(): Promise<void> {
  // Saved language (Thai by default) and the UI font must be ready before the first text is drawn.
  initLanguage();
  installPixelTextSnap();
  // Dev-only switch to check the fallback fonts: ?nopixelfont
  const skipFont = import.meta.env.DEV && new URLSearchParams(location.search).has('nopixelfont');
  if (!skipFont) await loadPixelFont();

  const game = new Phaser.Game(createGameConfig());

  // Development hook for debugging / automated browser checks. Stripped from production builds.
  if (import.meta.env.DEV) {
    (window as unknown as { __XENOBLIGHT__: Phaser.Game }).__XENOBLIGHT__ = game;
    const missing = findMissingTranslations();
    if (missing.th.length || missing.en.length) console.warn('[i18n] missing translations', missing);
  }
}

void start();
