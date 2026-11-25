/**
 * NPC dialogue. Each conversation is a list of translation keys, one per dialogue step; the texts live in
 * the i18n dictionaries under `dialogues.<id>.l<step>` (Thai exactly as the author wrote it, English
 * translations), so a conversation is always shown in the current UI language.
 */
const lines = <Id extends string>(id: Id, count: number): readonly string[] => Array.from({ length: count }, (_, i) => `dialogues.${id}.l${i + 1}`);

export const DIALOGUES = {
  mateus_first_meeting: lines('mateus_first_meeting', 3),
  mateus_rusty_dagger: lines('mateus_rusty_dagger', 3),
  mateus_rusty_dagger_turn_in: lines('mateus_rusty_dagger_turn_in', 3),
  mateus_void_mite_hunt: lines('mateus_void_mite_hunt', 4),
  mateus_void_mite_hunt_done: lines('mateus_void_mite_hunt_done', 3),
  roland_potion_intro: lines('roland_potion_intro', 2),
  roland_potion_select: lines('roland_potion_select', 1),
  roland_potion_use: lines('roland_potion_use', 1),
  roland_potion_hotkey: lines('roland_potion_hotkey', 1),
  roland_wolf_hunt: lines('roland_wolf_hunt', 4),
  roland_wolf_hunt_done: lines('roland_wolf_hunt_done', 2),
  roland_avian_intro: lines('roland_avian_intro', 10),
  roland_avian_scroll: lines('roland_avian_scroll', 1),
  roland_avian_skills: lines('roland_avian_skills', 1),
  roland_avian_hotkey: lines('roland_avian_hotkey', 1),
  roland_avian_go: lines('roland_avian_go', 1),
  roland_avian_done: lines('roland_avian_done', 6),
  // Reach Level 10 offered but its talk was cut off after the reward: lines 2-6 again
  roland_level10_offer: lines('roland_avian_done', 6).slice(1),
  // Reach Level 10 turned in: line 1 pays 1,000 Gold, the last one completes the quest (on to Sonny)
  roland_level10_done: lines('roland_level10_done', 4),
  // ...cut off after the reward: lines 2-4 again
  roland_level10_done_rest: lines('roland_level10_done', 4).slice(1),
  // the gate guards (GateTalks): the question, then a branch per answer
  sonny_gate: lines('sonny_gate', 2),
  sonny_not_yet: lines('sonny_not_yet', 1),
  sonny_from_roland: lines('sonny_from_roland', 2),
  sonny_just_walking: lines('sonny_just_walking', 2),
  jack_gate: lines('jack_gate', 1),
  jack_from_roland: lines('jack_from_roland', 2),
  jack_just_walking: lines('jack_just_walking', 2),
  roland_auto_monsters: lines('roland_auto_monsters', 1),
  roland_auto_skills: lines('roland_auto_skills', 1),
  roland_auto_options: lines('roland_auto_options', 1),
  roland_auto_range: lines('roland_auto_range', 1),
  roland_auto_recovery: lines('roland_auto_recovery', 1),
} as const satisfies Record<string, readonly string[]>;

export type DialogueId = keyof typeof DIALOGUES;

/** One conversation: a step at a time, finished once. Pure. `lines` are translation keys. */
export class DialogueSession {
  private index = 0;
  private done = false;

  constructor(private readonly lines: readonly string[]) {
    if (lines.length === 0) throw new Error('a dialogue needs at least one line');
  }

  /** Translation key of the step shown now. */
  get line(): string {
    return this.lines[this.index];
  }

  get step(): number {
    return this.index;
  }

  /** The line shown now is the last one. */
  get isLastStep(): boolean {
    return this.index === this.lines.length - 1;
  }

  get isDone(): boolean {
    return this.done;
  }

  /** NEXT: the following step, or the end. Returns true once, when the last step was confirmed. */
  next(): boolean {
    if (this.done) return false;
    if (this.index < this.lines.length - 1) {
      this.index++;
      return false;
    }
    this.done = true;
    return true;
  }
}
