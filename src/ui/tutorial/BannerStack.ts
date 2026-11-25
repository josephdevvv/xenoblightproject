import Phaser from 'phaser';
import { PALETTE } from '../../config/palette';
import { t, type TranslationKey } from '../../i18n';
import { localize } from '../../i18n/phaser';
import { typo } from '../UITheme';
import { BANNER_ICONS, BANNER_TIMING, bannerFrame, HINT_BANNER, iconOffset, stackTops, type BannerIcon } from './HintBannerLayout';
import { uiView } from '../layout/UiLayers';

const COLORS = { fill: 0x0e0e12, fillAlpha: 0.78, border: 0xc49a45, accent: 0xf0cc55, outline: 0xc4c4cb, gold: 0xf0cc55 } as const;

interface Banner {
  id: string;
  persistent: boolean;
  key: TranslationKey;
  params?: Record<string, string | number>;
  icon: BannerIcon;
  frame: Phaser.GameObjects.Graphics;
  text: Phaser.GameObjects.Text;
  /** When it was shown (scene clock, ms) - temporary notices leave 3 s later, even at a low frame rate. */
  shownAt: number;
  /** Fading out: keeps its place until it is gone. */
  leaving: boolean;
  /** Its slot's top edge now (null = not placed yet). */
  top: number | null;
}

/**
 * The upper-centre banners: persistent tutorial hints on top, temporary notifications (3 s, then a smooth fade out)
 * stacked below them, never overlapping; when one disappears the ones below glide up. Purely visual - Graphics and
 * Text only, nothing interactive and no Container - so clicks pass straight through to the world (the HUD's
 * "is the pointer over UI" test ignores them). Layout and timing: HintBannerLayout.
 */
export class BannerStack {
  private banners: Banner[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth: number,
  ) {
    localize(scene, () => {
      for (const b of this.banners) this.draw(b);
    });
  }

  /** Banners on screen now, top to bottom (leaving ones included until they are gone). */
  get ids(): string[] {
    return this.banners.map((b) => b.id);
  }

  /** A persistent banner (tutorial hint): shown while `on` (no timeout), fades out when it goes off. */
  setPersistent(id: string, key: TranslationKey, icon: BannerIcon, on: boolean): void {
    const shown = this.find(id);
    if (on && !shown) this.add({ id, key, icon, persistent: true });
    else if (!on && shown) this.leave(shown);
  }

  /** A temporary notification: 3 s, then it fades out. The same id again while shown restarts its 3 s. */
  notify(id: string, key: TranslationKey, icon: BannerIcon, params?: Record<string, string | number>): void {
    const shown = this.find(id);
    if (shown) {
      shown.shownAt = this.scene.time.now;
      shown.params = params;
      this.draw(shown);
      return;
    }
    const temporary = this.banners.filter((b) => !b.persistent && !b.leaving);
    if (temporary.length >= BANNER_TIMING.maxNotices) this.leave(temporary[0]);
    this.add({ id, key, icon, persistent: false, params });
  }

  /** Every frame: temporary notices leave once their time is up. */
  update(): void {
    const now = this.scene.time.now;
    for (const b of this.banners) {
      if (!b.persistent && !b.leaving && now - b.shownAt >= BANNER_TIMING.showMs) this.leave(b);
    }
  }

  private find(id: string): Banner | undefined {
    return this.banners.find((b) => b.id === id && !b.leaving);
  }

  private add(spec: { id: string; key: TranslationKey; icon: BannerIcon; persistent: boolean; params?: Record<string, string | number> }): void {
    const frame = this.scene.add.graphics().setDepth(this.depth).setAlpha(0);
    const text = this.scene.add.text(0, 0, '', typo('label', PALETTE.white)).setOrigin(0, 0.5).setDepth(this.depth + 1).setAlpha(0);
    const banner: Banner = { ...spec, frame, text, shownAt: this.scene.time.now, leaving: false, top: null };
    // persistent hints stay on top; notices go under everything already shown
    const at = spec.persistent ? this.banners.filter((b) => b.persistent).length : this.banners.length;
    this.banners.splice(at, 0, banner);
    this.draw(banner);
    this.layout();
    this.scene.tweens.add({ targets: [frame, text], alpha: 1, duration: BANNER_TIMING.fadeInMs });
  }

  private leave(b: Banner): void {
    b.leaving = true;
    this.scene.tweens.killTweensOf([b.frame, b.text]);
    this.scene.tweens.add({
      targets: [b.frame, b.text],
      alpha: 0,
      duration: BANNER_TIMING.fadeOutMs,
      onComplete: () => {
        b.frame.destroy();
        b.text.destroy();
        this.banners = this.banners.filter((x) => x !== b);
        this.layout();
      },
    });
  }

  /** Every banner to its slot: new ones appear there, the others glide (up when one above has gone). */
  private layout(): void {
    const tops = stackTops(uiView(this.scene, 'hud').height, this.banners.length);
    this.banners.forEach((b, i) => {
      const top = tops[i];
      if (b.top === top) return;
      const first = b.top === null;
      b.top = top;
      const textY = top + Math.floor(HINT_BANNER.height / 2);
      if (first) {
        b.frame.setY(top);
        b.text.setY(textY);
        return;
      }
      this.scene.tweens.add({ targets: b.frame, y: top, duration: BANNER_TIMING.shiftMs, ease: 'Sine.easeOut' });
      this.scene.tweens.add({ targets: b.text, y: textY, duration: BANNER_TIMING.shiftMs, ease: 'Sine.easeOut' });
    });
  }

  /** Text, frame and icon at local y 0 (the Graphics is moved as a whole). */
  private draw(b: Banner): void {
    b.text.setText(t(b.key, b.params));
    const L = bannerFrame(uiView(this.scene, 'hud').width, 0, b.text.width);
    b.text.setX(L.textX);
    const g = b.frame.clear();
    g.fillStyle(COLORS.fill, COLORS.fillAlpha).fillRect(L.x, 0, L.width, L.height);
    // thin gold frame with brighter 3-px L-shaped corners
    g.fillStyle(COLORS.border, 1)
      .fillRect(L.x, 0, L.width, 1)
      .fillRect(L.x, L.height - 1, L.width, 1)
      .fillRect(L.x, 0, 1, L.height)
      .fillRect(L.x + L.width - 1, 0, 1, L.height);
    g.fillStyle(COLORS.accent, 1);
    const right = L.x + L.width - 1;
    const bottom = L.height - 1;
    for (const [cx, cy, dx, dy] of [[L.x, 0, 1, 1], [right, 0, -1, 1], [L.x, bottom, 1, -1], [right, bottom, -1, -1]]) {
      g.fillRect(Math.min(cx, cx + dx * 2), cy, 3, 1).fillRect(cx, Math.min(cy, cy + dy * 2), 1, 3);
    }
    const off = iconOffset(b.icon);
    BANNER_ICONS[b.icon].forEach((row, j) => {
      [...row].forEach((ch, i) => {
        if (ch === '.') return;
        g.fillStyle(ch === 'l' ? COLORS.gold : COLORS.outline, 1).fillRect(L.iconX + off.x + i, off.y + j, 1, 1);
      });
    });
  }
}
