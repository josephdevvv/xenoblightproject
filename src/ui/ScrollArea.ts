import Phaser from 'phaser';
import { pointerIn } from './layout/UiLayers';
import { UI_COLORS } from './UITheme';

/**
 * A clipped, vertically scrollable region for screen-space UI. Scrolls with the mouse wheel and by
 * dragging (mouse or touch). Put children in `content` using coordinates relative to the area's
 * top-left; call setContentHeight() after laying them out. The scene's camera must not scroll.
 * With `step`, the offset snaps to multiples of it (rows stay aligned with baked row lines).
 */
export class ScrollArea {
  readonly content: Phaser.GameObjects.Container;
  private readonly zone: Phaser.GameObjects.Zone;
  private readonly track: Phaser.GameObjects.Rectangle;
  private readonly thumb: Phaser.GameObjects.Rectangle;
  private readonly maskShape: Phaser.GameObjects.Graphics;
  private contentHeight = 0;
  private offset = 0;
  /** Unsnapped offset, so slow drags still accumulate into a step. */
  private raw = 0;
  private dragY: number | null = null;
  private visible = true;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly x: number,
    private readonly y: number,
    private readonly width: number,
    private readonly height: number,
    depth: number,
    private readonly step = 0,
  ) {
    this.content = scene.add.container(x, y).setDepth(depth);
    this.maskShape = scene.make.graphics({}, false);
    this.maskShape.fillStyle(0xffffff).fillRect(x, y, width, height);
    this.content.setMask(this.maskShape.createGeometryMask());

    this.track = scene.add.rectangle(x + width - 2, y, 2, height, UI_COLORS.panelBorder).setOrigin(0, 0).setDepth(depth + 1);
    this.thumb = scene.add.rectangle(x + width - 2, y, 2, height, UI_COLORS.accent).setOrigin(0, 0).setDepth(depth + 1);

    // Transparent hit zone for drag-scrolling (sits above the content, below nothing interactive).
    this.zone = scene.add.zone(x, y, width, height).setOrigin(0, 0).setDepth(depth + 2).setInteractive();
    this.zone.on('pointerdown', (p: Phaser.Input.Pointer) => (this.dragY = this.local(p).y));
    scene.input.on('pointermove', this.onPointerMove, this);
    scene.input.on('pointerup', this.onPointerUp, this);
    scene.input.on('wheel', this.onWheel, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.detachInput());
    this.refreshBar();
  }

  setContentHeight(height: number): void {
    this.contentHeight = height;
    this.scrollTo(this.raw);
  }

  scrollTo(offset: number): void {
    const max = Math.max(0, this.contentHeight - this.height);
    this.raw = Phaser.Math.Clamp(offset, 0, max);
    this.offset = this.step > 0 ? Math.min(Math.round(this.raw / this.step) * this.step, max) : this.raw;
    this.content.y = Math.round(this.y - this.offset);
    this.refreshBar();
  }

  get scrollable(): boolean {
    return this.contentHeight > this.height;
  }

  get scrollOffset(): number {
    return this.offset;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.content.setVisible(visible);
    this.zone.setVisible(visible);
    if (visible) this.zone.setInteractive();
    else this.zone.disableInteractive();
    this.refreshBar();
  }

  private contains(px: number, py: number): boolean {
    return px >= this.x && px < this.x + this.width && py >= this.y && py < this.y + this.height;
  }

  /** The pointer in this area's coordinates (through the camera that draws it: UI scale, safe-area offset). */
  private local(pointer: Phaser.Input.Pointer): Phaser.Math.Vector2 {
    return pointerIn(this.scene, this.zone, pointer);
  }

  private onWheel(pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number): void {
    const at = this.local(pointer);
    if (!this.visible || !this.contains(at.x, at.y) || dy === 0) return;
    this.scrollTo(this.step > 0 ? this.offset + Math.sign(dy) * this.step : this.offset + dy * 0.4);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.dragY === null || !pointer.isDown) return;
    const y = this.local(pointer).y;
    this.scrollTo(this.raw + (this.dragY - y));
    this.dragY = y;
  }

  private onPointerUp(): void {
    this.dragY = null;
  }

  private refreshBar(): void {
    const show = this.visible && this.scrollable;
    this.track.setVisible(show);
    this.thumb.setVisible(show);
    if (!show) return;
    const ratio = this.height / this.contentHeight;
    const thumbH = Math.max(12, Math.round(this.height * ratio));
    const max = this.contentHeight - this.height;
    this.thumb.height = thumbH;
    this.thumb.y = Math.round(this.y + (this.height - thumbH) * (max > 0 ? this.offset / max : 0));
  }

  private detachInput(): void {
    this.scene.input.off('pointermove', this.onPointerMove, this);
    this.scene.input.off('pointerup', this.onPointerUp, this);
    this.scene.input.off('wheel', this.onWheel, this);
  }
}
