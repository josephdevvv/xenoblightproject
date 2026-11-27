/**
 * Hover / press state of a drawn button (pure, unit-tested). Hover and press are kept apart: Phaser sends
 * `pointerover` AFTER `pointerdown` when the pointer was not over the button yet - every touch tap, and a click
 * without a mouse move first - so a hover must never cancel a press, or the release would not count.
 */
export class ButtonPress {
  private isHovered = false;
  private isPressed = false;

  get hovered(): boolean {
    return this.isHovered;
  }

  get pressed(): boolean {
    return this.isPressed;
  }

  over(): void {
    this.isHovered = true;
  }

  /** The pointer left the button: no hover, and a press there is given up. */
  out(): void {
    this.isHovered = false;
    this.isPressed = false;
  }

  press(): void {
    this.isHovered = true;
    this.isPressed = true;
  }

  /** Released over the button: true when it was pressed there (a click). */
  release(): boolean {
    const click = this.isPressed;
    this.isPressed = false;
    this.isHovered = true;
    return click;
  }

  reset(): void {
    this.isHovered = false;
    this.isPressed = false;
  }
}
