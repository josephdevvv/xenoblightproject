import Phaser from 'phaser';
import { createGameConfig } from './config/GameConfig';
import { findMissingTranslations, initLanguage } from './i18n';
import { loadUiFonts } from './ui/text/Typography';
import { GameCursor } from './ui/cursor/GameCursor';

async function start(): Promise<void> {
  // Saved language (Thai by default) and the UI font must be ready before the first text is drawn.
  initLanguage();
  // Dev-only switch to check the fallback fonts: ?nofont
  const skipFont = import.meta.env.DEV && new URLSearchParams(location.search).has('nofont');
  if (!skipFont) await loadUiFonts();

  const game = new Phaser.Game(createGameConfig());
  // The game's own mouse cursor everywhere (menus, HUD, windows, world).
  GameCursor.install(game);

  // Development hook for debugging / automated browser checks. Stripped from production builds.
  if (import.meta.env.DEV) {
    (window as unknown as { __XENOBLIGHT__: Phaser.Game }).__XENOBLIGHT__ = game;
    const missing = findMissingTranslations();
    if (missing.th.length || missing.en.length) console.warn('[i18n] missing translations', missing);
  }
}

void start();
