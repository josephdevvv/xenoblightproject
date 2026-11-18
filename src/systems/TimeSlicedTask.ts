import Phaser from 'phaser';

/**
 * Runs a generator over several frames, spending at most `budgetMs` per frame, so that creating
 * many game objects (e.g. a map's tiles) never stalls a single frame.
 *
 * The generator may yield a progress value (0..1). The promise rejects if the generator throws or
 * the scene shuts down before it finishes.
 */
export function runTimeSliced(
  scene: Phaser.Scene,
  steps: Iterator<number | void>,
  budgetMs: number,
  onProgress?: (progress: number) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let finished = false;
    const cleanup = (): void => {
      finished = true;
      scene.events.off(Phaser.Scenes.Events.UPDATE, tick);
      scene.events.off(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
    };
    const onShutdown = (): void => {
      cleanup();
      reject(new Error('Scene shut down before the task finished.'));
    };
    function tick(): void {
      if (finished) return;
      const start = performance.now();
      try {
        do {
          const step = steps.next();
          if (step.done) {
            cleanup();
            onProgress?.(1);
            resolve();
            return;
          }
          if (typeof step.value === 'number') onProgress?.(step.value);
        } while (performance.now() - start < budgetMs);
      } catch (error) {
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
    scene.events.on(Phaser.Scenes.Events.UPDATE, tick);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
    tick(); // first slice right away
  });
}
