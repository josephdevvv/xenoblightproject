import Phaser from 'phaser';

export interface MovementIntent {
  /** -1 = left, 1 = right (screen space). */
  x: number;
  /** -1 = up, 1 = down (screen space). */
  y: number;
}

/** Reads WASD into a digital screen-space intent. Opposite keys cancel each other out. */
export class KeyboardMovementInput {
  private readonly keys: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;

  constructor(scene: Phaser.Scene) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) {
      throw new Error('Keyboard input is not available.');
    }
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      up: keyboard.addKey(K.W),
      down: keyboard.addKey(K.S),
      left: keyboard.addKey(K.A),
      right: keyboard.addKey(K.D),
    };
  }

  read(): MovementIntent {
    const k = this.keys;
    return {
      x: (k.right.isDown ? 1 : 0) - (k.left.isDown ? 1 : 0),
      y: (k.down.isDown ? 1 : 0) - (k.up.isDown ? 1 : 0),
    };
  }
}
