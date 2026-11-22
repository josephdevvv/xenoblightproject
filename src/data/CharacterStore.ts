import type { CharacterData } from './CharacterData';

/**
 * The characters of the running session, in memory. Names are only names: a character is identified by its id,
 * any number may share a name, and closing or reloading the page discards everything that was not exported.
 */
class CharacterStoreImpl {
  private readonly characters = new Map<string, CharacterData>();
  private activeId: string | null = null;

  add(character: CharacterData): void {
    this.characters.set(character.id, character);
  }

  setActive(id: string): void {
    if (!this.characters.has(id)) {
      throw new Error(`Unknown character id: ${id}`);
    }
    this.activeId = id;
  }

  /** Begins a session with this character; the previous one is gone. */
  startSession(character: CharacterData): void {
    this.characters.clear();
    this.add(character);
    this.setActive(character.id);
  }

  /** Ends the session: its unsaved progress is gone. */
  endSession(): void {
    this.characters.clear();
    this.activeId = null;
  }

  getActive(): CharacterData | null {
    return this.activeId ? this.characters.get(this.activeId) ?? null : null;
  }

  getAll(): CharacterData[] {
    return [...this.characters.values()];
  }
}

export const CharacterStore = new CharacterStoreImpl();
