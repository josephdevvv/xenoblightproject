import type { CharacterData } from '../data/CharacterData';

type Listener = (character: CharacterData, gold: number) => void;
const listeners = new Set<Listener>();

/** Largest Gold a character can hold (far above anything this build pays; keeps the value a safe integer). */
export const MAX_GOLD = 999_999_999;

/** A stored Gold value -> a valid one: a whole number 0..MAX_GOLD (anything else is 0). */
export function sanitizeGold(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
  return Math.min(MAX_GOLD, Math.max(0, Math.floor(raw)));
}

/** The single place that changes a character's Gold (earned on kills; nothing spends it yet). */
export const GoldService = {
  get(character: CharacterData): number {
    return sanitizeGold(character.gold);
  },

  /** Adds Gold (whole, positive amounts only). Returns what was added. */
  add(character: CharacterData, amount: number): number {
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    const before = this.get(character);
    character.gold = Math.min(MAX_GOLD, before + Math.floor(amount));
    const added = character.gold - before;
    if (added > 0) for (const l of listeners) l(character, character.gold);
    return added;
  },

  onChange(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
