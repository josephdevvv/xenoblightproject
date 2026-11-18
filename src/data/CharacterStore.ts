import type { CharacterData } from './CharacterData';

/**
 * In-memory character storage for Milestone 01 (no account / database yet).
 * Later this becomes the client-side cache of server-owned character data.
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

  getActive(): CharacterData | null {
    return this.activeId ? this.characters.get(this.activeId) ?? null : null;
  }

  getAll(): CharacterData[] {
    return [...this.characters.values()];
  }
}

export const CharacterStore = new CharacterStoreImpl();
