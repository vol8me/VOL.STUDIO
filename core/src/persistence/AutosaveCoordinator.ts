import { DisposableScope } from '../lifecycle/DisposableScope';
import { observeAppVisibility, type AppVisibilityState } from '../lifecycle/appVisibility';
import { LatestValueWriter } from './LatestValueWriter';

const DEFAULT_INTERVAL_MS = 30_000;

export interface AutosaveCoordinatorOptions<T> {
  readonly capture: () => T;
  readonly save: (value: T) => Promise<void>;
  readonly intervalMs?: number;
  readonly onError?: (error: unknown) => void;
  readonly observeVisibility?: (listener: (state: AppVisibilityState) => void) => () => void;
}

/** Periyodik ve arka-plan kayıtlarını tek, son-değer-kazanır kuyruğunda toplar. */
export class AutosaveCoordinator<T> {
  private readonly scope = new DisposableScope();
  private readonly writer: LatestValueWriter<T>;
  private stopped = false;

  constructor(private readonly options: AutosaveCoordinatorOptions<T>) {
    const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    if (!(intervalMs > 0) || !Number.isFinite(intervalMs)) {
      throw new RangeError(`Otomatik kayıt aralığı pozitif ve sonlu olmalı: ${intervalMs}`);
    }
    this.writer = new LatestValueWriter(options.save, (error) => this.reportError(error));

    try {
      this.scope.addInterval(() => this.requestSave(), intervalMs);
      const observe = options.observeVisibility ?? observeAppVisibility;
      this.scope.addSubscription(
        observe((state) => {
          if (state === 'background') this.requestSave();
        }),
      );
    } catch (error) {
      this.scope.dispose();
      throw error;
    }
  }

  requestSave(): void {
    if (this.stopped) return;
    const value = this.capture();
    if (value === null) return;
    void this.writer.enqueue(value).catch(() => undefined);
  }

  flush(): Promise<void> {
    if (this.stopped) {
      return Promise.reject(new Error('Durdurulmuş otomatik kayıt kuyruğu flush edilemez.'));
    }
    const value = this.capture();
    if (value === null) return Promise.reject(new Error('Kayıt anlık görüntüsü alınamadı.'));
    return this.writer.enqueue(value);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.scope.dispose();
  }

  destroy(): void {
    this.stop();
  }

  async flushAndDispose(): Promise<void> {
    if (this.stopped) {
      throw new Error('Durdurulmuş otomatik kayıt kuyruğu flush edilemez.');
    }
    this.stopped = true;
    this.scope.dispose();
    const value = this.capture();
    if (value === null) {
      await this.writer.whenIdle();
      throw new Error('Kayıt anlık görüntüsü alınamadı.');
    }
    await this.writer.enqueue(value);
    await this.writer.whenIdle();
  }

  private capture(): T | null {
    try {
      return this.options.capture();
    } catch (error) {
      this.reportError(error);
      return null;
    }
  }

  private reportError(error: unknown): void {
    try {
      this.options.onError?.(error);
    } catch (callbackError) {
      console.error('[AutosaveCoordinator] Hata dinleyicisi başarısız oldu:', callbackError);
    }
  }
}
