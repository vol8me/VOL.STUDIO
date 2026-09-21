import { DisposableScope, type CancellableDisposable } from '../lifecycle/DisposableScope';
import { LatestValueWriter } from './LatestValueWriter';

export interface PersistenceStore<T = unknown> {
  load(key: string, fallback: unknown): Promise<unknown>;
  save(key: string, value: T): Promise<void>;
}

export type PersistenceOperation = 'load' | 'save';

export interface PersistedObservableStateOptions<T> {
  readonly store: PersistenceStore<T>;
  readonly key: string;
  readonly initial: T;
  readonly parse: (value: unknown) => T;
  readonly clone: (value: T) => T;
  readonly equals?: (left: T, right: T) => boolean;
  readonly debounceMs?: number;
  readonly onError?: (error: unknown, operation: PersistenceOperation) => void;
  readonly onListenerError?: (error: unknown) => void;
}

/** Doğrulama politikasını tüketicide bırakan, seri yazımlı gözlemlenebilir state. */
export class PersistedObservableState<T> {
  private readonly scope = new DisposableScope();
  private readonly writer: LatestValueWriter<T>;
  private readonly listeners = new Set<(state: T) => void>();
  private readonly debounceMs: number;
  private state: T;
  private timer: CancellableDisposable | null = null;
  private pendingPersist: Promise<void> | null = null;
  private resolvePending: (() => void) | null = null;
  private rejectPending: ((error: unknown) => void) | null = null;
  private generation = 0;
  private disposed = false;

  constructor(private readonly options: PersistedObservableStateOptions<T>) {
    if (!options.key.trim()) throw new RangeError('Kalıcılık anahtarı boş olamaz.');
    this.debounceMs = options.debounceMs ?? 0;
    if (this.debounceMs < 0 || !Number.isFinite(this.debounceMs)) {
      throw new RangeError(`Yazım gecikmesi negatif olmayan sonlu sayı olmalı: ${this.debounceMs}`);
    }
    this.state = options.clone(options.initial);
    this.writer = new LatestValueWriter(
      (value) => options.store.save(options.key, value),
      (error) => this.reportError(error, 'save'),
    );
  }

  async load(): Promise<T> {
    this.assertActive();
    const generation = ++this.generation;
    try {
      const stored = await this.options.store.load(this.options.key, undefined);
      if (this.disposed || generation !== this.generation) return this.get();
      this.state = this.options.clone(this.options.parse(stored));
      this.notify();
      return this.get();
    } catch (error) {
      this.reportError(error, 'load');
      throw error;
    }
  }

  get(): T {
    return this.options.clone(this.state);
  }

  set(value: T): Promise<void> {
    if (this.disposed) return Promise.reject(this.disposedError());
    this.generation++;
    return this.replace(value);
  }

  update(updater: (current: T) => T): Promise<void> {
    if (this.disposed) return Promise.reject(this.disposedError());
    this.generation++;
    return this.replace(updater(this.get()));
  }

  private replace(value: T): Promise<void> {
    const next = this.options.clone(value);
    const equals = this.options.equals ?? Object.is;
    if (equals(this.state, next)) return this.pendingPersist ?? Promise.resolve();
    this.state = next;
    this.notify();
    return this.schedulePersist();
  }

  subscribe(listener: (state: T) => void): () => void {
    this.assertActive();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async flush(): Promise<void> {
    this.assertActive();
    const pending = this.pendingPersist;
    this.commitPendingPersist();
    if (pending) await pending;
    await this.writer.whenIdle();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    this.commitPendingPersist();
    this.scope.dispose();
    this.listeners.clear();
  }

  async flushAndDispose(): Promise<void> {
    this.assertActive();
    const pending = this.pendingPersist;
    this.disposed = true;
    this.generation++;
    this.commitPendingPersist();
    this.scope.dispose();
    this.listeners.clear();
    let failure: unknown;
    try {
      if (pending) await pending;
    } catch (error) {
      failure = error;
    }
    await this.writer.whenIdle();
    if (failure !== undefined) {
      throw failure instanceof Error
        ? failure
        : new Error('Persistence writer rejected with a non-Error value.', { cause: failure });
    }
  }

  private schedulePersist(): Promise<void> {
    if (this.debounceMs === 0) return this.writer.enqueue(this.get());
    if (this.pendingPersist) return this.pendingPersist;

    this.pendingPersist = new Promise<void>((resolve, reject) => {
      this.resolvePending = resolve;
      this.rejectPending = reject;
    });
    this.timer = this.scope.addTimeout(() => {
      this.timer = null;
      this.commitPendingPersist();
    }, this.debounceMs);
    return this.pendingPersist;
  }

  private commitPendingPersist(): void {
    this.timer?.cancel();
    this.timer = null;
    const pending = this.pendingPersist;
    const resolve = this.resolvePending;
    const reject = this.rejectPending;
    this.pendingPersist = null;
    this.resolvePending = null;
    this.rejectPending = null;
    if (!pending) return;

    void this.writer.enqueue(this.get()).then(resolve ?? undefined, reject ?? undefined);
  }

  private notify(): void {
    const snapshot = this.get();
    for (const listener of this.listeners) {
      try {
        listener(this.options.clone(snapshot));
      } catch (error) {
        this.reportListenerError(error);
      }
    }
  }

  private reportError(error: unknown, operation: PersistenceOperation): void {
    try {
      this.options.onError?.(error, operation);
    } catch (callbackError) {
      console.error('[PersistedObservableState] Hata dinleyicisi başarısız oldu:', callbackError);
    }
  }

  private assertActive(): void {
    if (this.disposed) throw this.disposedError();
  }

  private disposedError(): Error {
    return new Error('Kapatılmış kalıcı state kullanılamaz.');
  }

  private reportListenerError(error: unknown): void {
    try {
      this.options.onListenerError?.(error);
    } catch (callbackError) {
      console.error(
        '[PersistedObservableState] Dinleyici hata işleyicisi başarısız oldu:',
        callbackError,
      );
    }
  }
}
