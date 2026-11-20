import Phaser from 'phaser';
import { SCENES } from '../config/constants';
import type { CharacterData } from '../data/CharacterData';
import { CharacterStore } from '../data/CharacterStore';
import { DungeonHud } from '../ui/hud/DungeonHud';
import { SettingsWindow } from '../ui/SettingsWindow';
import { StatusWindow } from '../ui/StatusWindow';
import type { GameScene } from './GameScene';

export interface GameUISceneData {
  characterId?: string;
}

/**
 * Screen-space gameplay UI drawn above GameScene (launched / stopped by it): the dungeon HUD, the
 * Status window and Settings. Keeping the UI in its own scene means its camera never scrolls and its
 * pointer input never reaches the world.
 */
export class GameUIScene extends Phaser.Scene {
  private statusWindow: StatusWindow | null = null;
  private hud: DungeonHud | null = null;
  private settingsWindow: SettingsWindow | null = null;

  constructor() {
    super(SCENES.GameUI);
  }

  create(data: GameUISceneData): void {
    this.statusWindow = null;
    this.hud = null;
    this.settingsWindow = null;
    const character = this.resolveCharacter(data.characterId);
    const game = this.gameScene();
    if (!character || !game?.map) {
      console.warn('[GameUI] no active character or map; UI not created');
      return;
    }
    this.hud = new DungeonHud(
      this,
      {
        character,
        map: game.map,
        onStatus: () => this.statusWindow?.toggle(),
        onSettings: () => this.settingsWindow?.toggle(),
      },
      0,
    );
    this.statusWindow = new StatusWindow(this, character, 10);
    this.settingsWindow = new SettingsWindow(this, { depth: 20 });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.statusWindow = null;
      this.hud = null;
      this.settingsWindow = null;
    });
  }

  update(): void {
    const game = this.gameScene();
    if (!this.hud || !game?.player) return;
    this.hud.update(
      game.player.getTilePosition(),
      game.monsters.getMonsters().map((m) => m.position),
    );
  }

  get isStatusOpen(): boolean {
    return this.statusWindow?.isOpen ?? false;
  }

  openStatus(): void {
    this.statusWindow?.show();
  }

  /** Closes any open window (discarding pending changes). Returns true if something was closed. */
  closeWindows(): boolean {
    if (this.settingsWindow?.isOpen) {
      this.settingsWindow.close();
      return true;
    }
    if (this.statusWindow?.isOpen) {
      this.statusWindow.close();
      return true;
    }
    return false;
  }

  get isSettingsOpen(): boolean {
    return this.settingsWindow?.isOpen ?? false;
  }

  private gameScene(): GameScene | null {
    return this.scene.isActive(SCENES.Game) ? (this.scene.get(SCENES.Game) as GameScene) : null;
  }

  private resolveCharacter(id: string | undefined): CharacterData | null {
    return (id ? CharacterStore.getAll().find((c) => c.id === id) : undefined) ?? CharacterStore.getActive();
  }
}
