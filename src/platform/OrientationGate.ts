import { onLanguageChange, t } from '../i18n';
import { UI_FONT_STACK } from '../ui/text/Typography';

/**
 * Mobile is landscape only. In portrait a full-screen notice asks the player to turn the device; the game is not
 * created until the screen is landscape, and a game already running is paused (nothing moves, nothing is lost)
 * and goes on where it was once the device is turned back - no reload.
 *
 * Only installed in touch mode (DeviceMode): the desktop version never sees it.
 */
export function isPortrait(width: number, height: number): boolean {
  return height > width;
}

const OVERLAY_ID = 'orientation-gate';

export class OrientationGate {
  private readonly overlay: HTMLDivElement;
  private readonly text: HTMLDivElement;
  private readonly listeners = new Set<(portrait: boolean) => void>();
  private portraitNow: boolean;

  constructor(private readonly win: Window = window) {
    const doc = win.document;
    this.overlay = doc.createElement('div');
    this.overlay.id = OVERLAY_ID;
    this.overlay.setAttribute('role', 'alert');
    Object.assign(this.overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '1000',
      display: 'none',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '22px',
      padding: '24px',
      boxSizing: 'border-box',
      background: 'radial-gradient(ellipse at center, #15131a 0%, #060608 70%)',
      color: '#d8d6de',
      fontFamily: UI_FONT_STACK,
      textAlign: 'center',
      touchAction: 'none',
      userSelect: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    this.overlay.innerHTML = ROTATE_ICON;
    this.text = doc.createElement('div');
    Object.assign(this.text.style, { fontSize: '18px', lineHeight: '1.5', maxWidth: '90vw', borderTop: '1px solid #6b5626', paddingTop: '14px' });
    this.overlay.appendChild(this.text);
    doc.body.appendChild(this.overlay);
    this.refreshText();
    onLanguageChange(() => this.refreshText());

    this.portraitNow = this.measure();
    this.render();
    const check = (): void => {
      const portrait = this.measure();
      if (portrait === this.portraitNow) return;
      this.portraitNow = portrait;
      this.render();
      for (const fn of [...this.listeners]) fn(portrait);
    };
    win.addEventListener('resize', check);
    win.addEventListener('orientationchange', () => win.setTimeout(check, 50));
    win.visualViewport?.addEventListener('resize', check);
  }

  get portrait(): boolean {
    return this.portraitNow;
  }

  /** Resolves at once in landscape, otherwise as soon as the device is turned. */
  waitForLandscape(): Promise<void> {
    if (!this.portraitNow) return Promise.resolve();
    return new Promise((resolve) => {
      const off = this.onChange((portrait) => {
        if (portrait) return;
        off();
        resolve();
      });
    });
  }

  /** Called with `true` when the device turns to portrait, `false` back to landscape. Returns an unsubscribe. */
  onChange(fn: (portrait: boolean) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private measure(): boolean {
    return isPortrait(this.win.innerWidth, this.win.innerHeight);
  }

  private render(): void {
    this.overlay.style.display = this.portraitNow ? 'flex' : 'none';
  }

  private refreshText(): void {
    this.text.textContent = t('orientation.rotate');
  }
}

/** A phone outline turning from portrait to landscape (pixel-stepped strokes, the HUD's silver and gold). */
const ROTATE_ICON = `
<svg width="96" height="96" viewBox="0 0 48 48" shape-rendering="crispEdges" aria-hidden="true">
  <style>
    @keyframes xb-turn { 0%, 30% { transform: rotate(0deg); } 60%, 100% { transform: rotate(-90deg); } }
    .xb-phone { transform-origin: 24px 24px; animation: xb-turn 2.4s ease-in-out infinite; }
  </style>
  <g class="xb-phone">
    <rect x="16" y="8" width="16" height="32" fill="#0e0e12" stroke="#c9c9d1" stroke-width="2" />
    <rect x="18" y="11" width="12" height="24" fill="#1c1a22" />
    <rect x="22" y="37" width="4" height="1" fill="#c9c9d1" />
  </g>
  <path d="M38 14 h4 v4 M42 14 l-6 6" stroke="#d6b25e" stroke-width="2" fill="none" />
</svg>`;
