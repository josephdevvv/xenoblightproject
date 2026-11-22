import type { Rect } from '../passiveTree/PassiveTreeLayout';

/** Main Menu layout - pure, unit-tested. Computed from the game's screen size, centred, whole pixels. */
export interface MainMenuLayout {
  /** The logo is centred here at this height (its width follows from the artwork). */
  logo: { cx: number; cy: number; height: number };
  /** New Game, Load Game, Settings - top to bottom. */
  buttons: readonly [Rect, Rect, Rect];
  message: { cx: number; y: number; width: number };
}

const BUTTON = { width: 260, height: 38, gap: 12 } as const;
const LOGO = { max: 214, min: 64, share: 0.45 } as const;
const MESSAGE = 34;
/** Width of the logo artwork relative to its height (LogoTexture's crop). */
export const LOGO_ASPECT = 470 / 263;

export function mainMenuLayout(screenWidth: number, screenHeight: number): MainMenuLayout {
  const fitWidth = Math.floor((screenWidth - 32) / LOGO_ASPECT);
  const stack = BUTTON.height * 3 + BUTTON.gap * 2;
  const gap = Math.max(10, Math.min(26, Math.floor(screenHeight * 0.05)));
  const room = screenHeight - stack - gap - MESSAGE - 8;
  const height = Math.max(LOGO.min, Math.min(LOGO.max, fitWidth, Math.floor(screenHeight * LOGO.share), room));
  const total = height + gap + stack + MESSAGE;
  const top = Math.max(4, Math.floor((screenHeight - total) / 2));
  const cx = Math.floor(screenWidth / 2);
  const w = Math.min(BUTTON.width, screenWidth - 32);
  const x = cx - Math.floor(w / 2);
  const first = top + height + gap;
  const button = (i: number): Rect => [x, first + i * (BUTTON.height + BUTTON.gap), w, BUTTON.height];
  return {
    logo: { cx, cy: top + Math.floor(height / 2), height },
    buttons: [button(0), button(1), button(2)],
    message: { cx, y: first + stack + 10, width: Math.min(520, screenWidth - 32) },
  };
}
