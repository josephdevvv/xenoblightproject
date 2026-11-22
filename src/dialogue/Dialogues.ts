/**
 * NPC dialogue, exactly as written by the author (Thai only so far: shown as it is in every UI language -
 * no translation has been supplied). One string per dialogue step.
 */
export const DIALOGUES = {
  mateus_first_meeting: [
    'เจ้าคนเร่ร่อนนี่! เดินหลงทางมาจากไหนน่ะที่นี่มันอันตรายนะ',
    'แถวนี้มันเถื่อน ไม่แน่จริงอยู่ไม่ได้ เจ้าควรจะรู้วิธีเอาตัวรอดเบื้องต้นก่อน',
    'ข้าจะบอกวิธีการเพิ่มพลังพื้นฐานให้แก่เจ้า เอาล่ะทำตามนะ',
  ],
} as const satisfies Record<string, readonly string[]>;

export type DialogueId = keyof typeof DIALOGUES;

/** One conversation: a step at a time, finished once. Pure. */
export class DialogueSession {
  private index = 0;
  private done = false;

  constructor(private readonly lines: readonly string[]) {
    if (lines.length === 0) throw new Error('a dialogue needs at least one line');
  }

  get line(): string {
    return this.lines[this.index];
  }

  get step(): number {
    return this.index;
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
