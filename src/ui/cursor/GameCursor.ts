import type Phaser from 'phaser';

/**
 * The game's mouse cursor (art-source/ui/cursor/game_cursor.png, as delivered: 32 x 17 with two
 * frames side by side - the plain cursor on the left, the same cursor with a 1-px light glow on the
 * right). The frames are not on an even grid, so each is cut out with its own rectangle, aligned on the
 * dark outline: the tip pixel is (1, 1) of both 10 x 10 frames, so the click point never moves.
 *   frame 1: default / hover (also buttons - replaces the browser's hand cursor) and after release
 *   frame 2: left mouse button held down
 * Frames become native CSS cursors (no input lag, nothing drawn by the game), scaled x2 with nearest
 * neighbour like the monster target cursor. Other systems may take the cursor over for a moment
 * (setOverride - the monster target cursor) and give it back.
 */
export const GAME_CURSOR = {
  url: 'assets/ui/cursor/game_cursor.png',
  sheetWidth: 32,
  sheetHeight: 17,
  /** Source rectangles of the frames (x, y, w, h) in the sheet. */
  frames: [
    [3, 3, 10, 10],
    [19, 3, 10, 10],
  ] as ReadonlyArray<readonly [number, number, number, number]>,
  /** Click point inside a frame: the tip (top-left pixel of the outline). */
  hotspot: { x: 1, y: 1 },
  scale: 2,
} as const;

export type GameCursorState = 'default' | 'down';

let css: Record<GameCursorState, string> | null = null;
let pressed = false;
let override: string | null = null;
let canvas: HTMLCanvasElement | null = null;
let manager: Phaser.Input.InputManager | null = null;

/** CSS cursor value for one frame of the sheet. */
function frameCss(image: CanvasImageSource, index: number): string {
  const [sx, sy, w, h] = GAME_CURSOR.frames[index];
  const k = GAME_CURSOR.scale;
  const c = document.createElement('canvas');
  c.width = w * k;
  c.height = h * k;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false; // crisp pixels, alpha untouched
  ctx.drawImage(image, sx, sy, w, h, 0, 0, w * k, h * k);
  return `url(${c.toDataURL('image/png')}) ${GAME_CURSOR.hotspot.x * k} ${GAME_CURSOR.hotspot.y * k}, auto`;
}

function apply(): void {
  if (!css || !canvas || !manager) return;
  const value = override ?? css[pressed ? 'down' : 'default'];
  manager.defaultCursor = value; // Phaser restores this after a button's hover ends
  if (canvas.style.cursor !== value) canvas.style.cursor = value;
  document.body.style.cursor = css.default; // letterbox area around the canvas
}

export const GameCursor = {
  /** Loads the sheet once and takes over the cursor of the whole game (menus and gameplay). */
  install(game: Phaser.Game): void {
    const start = (): void => {
      canvas = game.canvas;
      manager = game.input;
      // Interactive objects created with useHandCursor ask for 'pointer': show the game cursor instead.
      // (InputManager.setCursor exists at runtime but is missing from Phaser's type definitions.)
      const cursors = manager as unknown as { setCursor(io: Phaser.Types.Input.InteractiveObject): void };
      const setCursor = cursors.setCursor.bind(manager);
      cursors.setCursor = (io: Phaser.Types.Input.InteractiveObject): void => {
        if (io.cursor === 'pointer') apply();
        else setCursor(io);
      };
      const image = new Image();
      image.onload = () => {
        css = { default: frameCss(image, 0), down: frameCss(image, 1) };
        apply();
      };
      image.onerror = () => console.warn(`[cursor] ${GAME_CURSOR.url} failed to load - system cursor kept`);
      image.src = GAME_CURSOR.url;
      // press / release anywhere in the game; released outside the window counts too
      canvas.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        pressed = true;
        apply();
      });
      const up = (e: PointerEvent): void => {
        if (e.button !== 0 || !pressed) return;
        pressed = false;
        apply();
      };
      window.addEventListener('pointerup', up);
      window.addEventListener('blur', () => {
        pressed = false;
        apply();
      });
    };
    if (game.isBooted) start();
    else game.events.once('ready', start); // Phaser.Core.Events.READY
  },

  /** Another cursor (e.g. the monster target cursor) for now; null gives the cursor back. */
  setOverride(value: string | null): void {
    override = value;
    apply();
  },

  /** Current state (for checks). */
  getState(): { loaded: boolean; pressed: boolean; overridden: boolean } {
    return { loaded: css !== null, pressed, overridden: override !== null };
  },

  /** The CSS value the game cursor shows now ('' before it loaded). */
  current(): string {
    return css ? override ?? css[pressed ? 'down' : 'default'] : '';
  },
};
