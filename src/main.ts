import Phaser from 'phaser';
import { createGameConfig } from './config/GameConfig';
import { findMissingTranslations, initLanguage, setTouchWording } from './i18n';
import { loadUiFonts } from './ui/text/Typography';
import { GameCursor } from './ui/cursor/GameCursor';
import { initDeviceMode } from './platform/DeviceMode';
import { OrientationGate } from './platform/OrientationGate';
import { attachTouchGame, prepareTouchPage } from './platform/TouchPage';

async function start(): Promise<void> {
  // Saved language (Thai by default) and the UI font must be ready before the first text is drawn.
  initLanguage();
  // Desktop or touch (mobile, landscape only) - decided once; desktop never runs the touch code paths.
  const touch = initDeviceMode();
  setTouchWording(touch);
  if (touch) prepareTouchPage();
  // Dev-only switch to check the fallback fonts: ?nofont
  const skipFont = import.meta.env.DEV && new URLSearchParams(location.search).has('nofont');
  if (!skipFont) await loadUiFonts();

  // Mobile: the game is created only in landscape (a notice asks to turn the device first).
  const gate = touch ? new OrientationGate() : null;
  if (gate) await gate.waitForLandscape();

  const game = new Phaser.Game(createGameConfig({ touch }));
  if (gate) attachTouchGame(game, gate);
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
