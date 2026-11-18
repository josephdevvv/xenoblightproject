import Phaser from 'phaser';

export interface AssetRequest {
  key: string;
  type: 'image' | 'spritesheet';
  url: string;
  frameWidth?: number;
  frameHeight?: number;
}

export interface AssetBatchResult {
  loaded: string[];
  failed: { key: string; error: string }[];
}

export interface AssetLoadingStatus {
  /** Requests queued or in flight. */
  pending: number;
  /** Keys whose last load attempt failed. */
  failed: number;
  busy: boolean;
}

interface QueuedRequest {
  request: AssetRequest;
  resolve: () => void;
  reject: (error: Error) => void;
}

/**
 * On-demand asset loading on top of one long-lived Phaser loader (owned by SystemScene).
 *
 *  - Deduplicates: concurrent requests for the same key share one promise; loaded keys resolve at once.
 *  - Batches: requests made while the loader is busy are queued and started together afterwards.
 *  - Errors never throw out of the loader: the request's promise rejects and the key is recorded as
 *    failed (a later request retries it).
 */
export class AssetLoadingManager {
  private readonly inflight = new Map<string, Promise<void>>();
  private readonly failures = new Map<string, string>();
  private queue: QueuedRequest[] = [];
  private running = false;

  constructor(
    private readonly loader: Phaser.Loader.LoaderPlugin,
    private readonly textures: Phaser.Textures.TextureManager,
  ) {}

  isLoaded(key: string): boolean {
    return this.textures.exists(key);
  }

  isLoading(key: string): boolean {
    return this.inflight.has(key);
  }

  load(request: AssetRequest): Promise<void> {
    if (this.textures.exists(request.key)) return Promise.resolve();
    const existing = this.inflight.get(request.key);
    if (existing) return existing;

    this.failures.delete(request.key);
    const promise = new Promise<void>((resolve, reject) => {
      this.queue.push({ request, resolve, reject });
    });
    this.inflight.set(request.key, promise);
    const clear = (): void => {
      this.inflight.delete(request.key);
    };
    promise.then(clear, clear);
    this.flush();
    return promise;
  }

  /** Loads several assets; never rejects - inspect the result instead. */
  async loadAll(requests: AssetRequest[], onProgress?: (progress: number) => void): Promise<AssetBatchResult> {
    const result: AssetBatchResult = { loaded: [], failed: [] };
    if (requests.length === 0) {
      onProgress?.(1);
      return result;
    }
    let done = 0;
    await Promise.all(
      requests.map((r) =>
        this.load(r).then(
          () => result.loaded.push(r.key),
          (e: Error) => result.failed.push({ key: r.key, error: e.message }),
        ).finally(() => onProgress?.(++done / requests.length)),
      ),
    );
    return result;
  }

  getStatus(): AssetLoadingStatus {
    return { pending: this.inflight.size, failed: this.failures.size, busy: this.running };
  }

  getFailures(): ReadonlyMap<string, string> {
    return this.failures;
  }

  private flush(): void {
    if (this.running || this.queue.length === 0) return;
    const batch = this.queue;
    this.queue = [];
    this.running = true;

    const onError = (file: Phaser.Loader.File): void => {
      this.failures.set(file.key, `Failed to load ${file.url ?? file.key}`);
    };
    this.loader.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
    this.loader.once(Phaser.Loader.Events.COMPLETE, () => {
      this.loader.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
      this.running = false;
      for (const item of batch) {
        if (this.textures.exists(item.request.key)) {
          item.resolve();
        } else {
          const message = this.failures.get(item.request.key) ?? `Asset "${item.request.key}" did not load`;
          this.failures.set(item.request.key, message);
          item.reject(new Error(message));
        }
      }
      this.flush();
    });

    for (const { request: r } of batch) {
      if (r.type === 'spritesheet') {
        this.loader.spritesheet(r.key, r.url, { frameWidth: r.frameWidth ?? 64, frameHeight: r.frameHeight ?? 64 });
      } else {
        this.loader.image(r.key, r.url);
      }
    }
    this.loader.start();
  }
}
