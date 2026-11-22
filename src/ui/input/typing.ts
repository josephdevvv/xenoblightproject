/** The parts of a DOM element this needs. */
export interface FocusTarget {
  readonly tagName?: string;
  readonly type?: string;
  readonly isContentEditable?: boolean;
}

/** Input types that take no text: a key pressed there is still a hotkey. */
const NO_TEXT_INPUTS = new Set(['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit']);

/** The player is typing: a text input, text area, select or editable element has the keyboard. */
export function isTypingTarget(target: FocusTarget | null | undefined): boolean {
  if (!target) return false;
  if (target.isContentEditable === true) return true;
  const tag = target.tagName?.toUpperCase();
  if (tag === 'INPUT') return !NO_TEXT_INPUTS.has(target.type?.toLowerCase() ?? 'text');
  return tag === 'TEXTAREA' || tag === 'SELECT';
}

/** A letter hotkey: a fresh press (no auto-repeat) without Ctrl / Alt / Meta, and not while typing. */
export function isHotkeyPress(e: Pick<KeyboardEvent, 'repeat' | 'ctrlKey' | 'altKey' | 'metaKey' | 'isComposing'> & { target: unknown }, focused: FocusTarget | null): boolean {
  if (e.repeat || e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return false;
  return !isTypingTarget(focused) && !isTypingTarget(e.target as FocusTarget | null);
}
