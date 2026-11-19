import Phaser from 'phaser';
import { SCENES } from '../config/constants';
import type { CharacterData } from '../data/CharacterData';
import { CharacterStore } from '../data/CharacterStore';
import { Button } from '../ui/Button';
import { StatusWindow } from '../ui/StatusWindow';

export interface GameUISceneData {
  characterId?: string;
}

/**
 * Screen-space gameplay UI drawn above GameScene (launched / stopped by it). Keeping the UI in its
 * own scene means its camera never scrolls and its pointer input never reaches the world.
 */
export class GameUIScene extends Phaser.Scene {
  private statusWindow: StatusWindow | null = null;

  constructor() {
    super(SCENES.GameUI);
  }

  create(data: GameUISceneData): void {
    this.statusWindow = null;
    const character = this.resolveCharacter(data.characterId);
    if (!character) {
      console.warn('[GameUI] no active character; UI not created');
      return;
    }
    this.statusWindow = new StatusWindow(this, character, 10);
    // Sits just under the HUD info panel (12,12 250x74).
    new Button(this, 12 + 46, 96 + 12, { width: 92, height: 24, label: 'STATUS', fontSize: 11, onClick: () => this.statusWindow?.toggle() });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => (this.statusWindow = null));
  }

  get isStatusOpen(): boolean {
    return this.statusWindow?.isOpen ?? false;
  }

  openStatus(): void {
    this.statusWindow?.show();
  }

  /** Closes any open window (discarding pending changes). Returns true if something was closed. */
  closeWindows(): boolean {
    if (!this.statusWindow?.isOpen) return false;
    this.statusWindow.close();
    return true;
  }

  private resolveCharacter(id: string | undefined): CharacterData | null {
    return (id ? CharacterStore.getAll().find((c) => c.id === id) : undefined) ?? CharacterStore.getActive();
  }
}
