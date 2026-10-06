interface WriteDeferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
}

interface PendingWrite<T> {
  value: T;
  readonly deferred: WriteDeferred;
}

/** Seri yazım sürerken bekleyen ara değerleri en güncel değerle birleştirir. */
export class LatestValueWriter<T> {
  private pending: PendingWrite<T> | null = null;
  private running: Promise<void> | null = null;
  private failure: { readonly error: unknown } | null = null;
  private readonly idleWaiters = new Set<() => void>();

  constructor(
    private readonly write: (value: T) => Promise<void>,
    private readonly onError?: (error: unknown) => void,
  ) {}

  enqueue(value: T): Promise<void> {
    if (this.pending) {
      this.pending.value = value;
      return this.pending.deferred.promise;
    }

    const deferred = this.createDeferred();
    this.pending = { value, deferred };
    this.startDrain();
    return deferred.promise;
  }

  whenIdle(): Promise<void> {
    if (!this.running && !this.pending) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.add(resolve));
  }

  /** Boşalma koordinasyonundan farklı olarak son yazımın dayanıklılık sonucunu taşır. */
  async flush(): Promise<void> {
    await this.whenIdle();
    if (this.failure) throw this.failure.error;
  }

  private startDrain(): void {
    if (this.running) return;
    this.running = this.drain().finally(() => {
      this.running = null;
      if (this.pending) this.startDrain();
      else this.resolveIdle();
    });
  }

  private async drain(): Promise<void> {
    while (this.pending) {
      const batch = this.pending;
      this.pending = null;
      try {
        await this.write(batch.value);
        this.failure = null;
        batch.deferred.resolve();
      } catch (error) {
        this.failure = { error };
        this.reportError(error);
        batch.deferred.reject(error);
      }
    }
  }

  private reportError(error: unknown): void {
    try {
      this.onError?.(error);
    } catch (callbackError) {
      console.error('[LatestValueWriter] Hata dinleyicisi başarısız oldu:', callbackError);
    }
  }

  private resolveIdle(): void {
    for (const resolve of this.idleWaiters) resolve();
    this.idleWaiters.clear();
  }

  private createDeferred(): WriteDeferred {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((ok, fail) => {
      resolve = ok;
      reject = fail;
    });
    void promise.catch(() => undefined);
    return { promise, resolve, reject };
  }
}
