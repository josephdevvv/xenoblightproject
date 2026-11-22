/**
 * The browser side of save files: a normal download and the native file picker. Only what the player picks
 * is read; nothing is written anywhere by itself.
 */

/** Starts a download. Returns whether the browser was asked to (it decides where the file goes). */
export function downloadText(fileName: string, text: string): boolean {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch (e) {
    console.warn('[save] could not start the download', e);
    return false;
  }
}

export type PickedFile = { kind: 'picked'; text: string } | { kind: 'tooLarge' } | { kind: 'unreadable' } | { kind: 'cancelled' };

let openInput: HTMLInputElement | null = null;

/** Opens the browser's file picker (call it from a click) and reads the chosen file as text. */
export function pickTextFile(accept: string, maxBytes: number): Promise<PickedFile> {
  // a picker that never answered (browsers without the 'cancel' event)
  openInput?.remove();
  return new Promise((resolve) => {
    const input = document.createElement('input');
    openInput = input;
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    const finish = (result: PickedFile): void => {
      input.remove();
      if (openInput === input) openInput = null;
      resolve(result);
    };
    input.addEventListener('cancel', () => finish({ kind: 'cancelled' }));
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) finish({ kind: 'cancelled' });
      else if (file.size > maxBytes) finish({ kind: 'tooLarge' });
      else
        file.text().then(
          (text) => finish({ kind: 'picked', text }),
          () => finish({ kind: 'unreadable' }),
        );
    });
    document.body.appendChild(input);
    input.click();
  });
}
