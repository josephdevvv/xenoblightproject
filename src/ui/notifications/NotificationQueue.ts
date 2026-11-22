/** Timing and order of the on-screen notifications - pure, unit-tested. */
export const NOTIFICATION_TIMING = { visibleMs: 3000, fadeMs: 500 } as const;

export interface QueuedNotification<T> {
  readonly content: T;
  /** Time on screen. 0 until it is shown. */
  ageMs: number;
}

/**
 * At most `capacity` notifications are on screen, oldest first; the others wait their turn (their time starts
 * when they appear). Each is fully visible for `visibleMs`, fades out over `fadeMs` and is then dropped.
 */
export class NotificationQueue<T> {
  private readonly shown: QueuedNotification<T>[] = [];
  private readonly waiting: T[] = [];

  constructor(
    private readonly capacity: number,
    private readonly timing: { visibleMs: number; fadeMs: number } = NOTIFICATION_TIMING,
  ) {}

  push(content: T): void {
    this.waiting.push(content);
    this.fill();
  }

  update(deltaMs: number): void {
    const end = this.timing.visibleMs + this.timing.fadeMs;
    for (const n of this.shown) n.ageMs += deltaMs;
    for (let i = this.shown.length - 1; i >= 0; i--) if (this.shown[i].ageMs >= end) this.shown.splice(i, 1);
    this.fill();
  }

  /** On screen now, top to bottom. */
  get visible(): readonly QueuedNotification<T>[] {
    return this.shown;
  }

  get waitingCount(): number {
    return this.waiting.length;
  }

  /** 1 while visible, falling to 0 during the fade. */
  alphaOf(n: QueuedNotification<T>): number {
    const fading = n.ageMs - this.timing.visibleMs;
    return fading <= 0 ? 1 : Math.max(0, 1 - fading / this.timing.fadeMs);
  }

  private fill(): void {
    while (this.shown.length < this.capacity && this.waiting.length > 0) this.shown.push({ content: this.waiting.shift()!, ageMs: 0 });
  }
}
