import type { CharacterData } from '../data/CharacterData';
import { createAutoPlaySettings, type AutoPlaySettings } from './AutoPlaySettings';

type Listener = (character: CharacterData) => void;
const listeners = new Set<Listener>();
/** Running characters (runtime only: Auto Play always starts off, also after loading a file). */
const running = new WeakSet<CharacterData>();

/** The single place that changes Auto Play's settings and on / off state. */
export const AutoPlayService = {
  settings(character: CharacterData): AutoPlaySettings {
    return character.autoPlay ?? createAutoPlaySettings();
  },

  update(character: CharacterData, change: (s: AutoPlaySettings) => AutoPlaySettings): void {
    character.autoPlay = change(this.settings(character));
    for (const l of listeners) l(character);
  },

  isOn(character: CharacterData): boolean {
    return running.has(character);
  },

  setOn(character: CharacterData, on: boolean): void {
    if (on === running.has(character)) return;
    if (on) running.add(character);
    else running.delete(character);
    for (const l of listeners) l(character);
  },

  toggle(character: CharacterData): boolean {
    this.setOn(character, !this.isOn(character));
    return this.isOn(character);
  },

  onChange(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
