import { DisposableScope } from '@volstudio/core/lifecycle';
import { observeServer, type ServerObservation } from './verdict';

export interface MetricsPollerOptions {
  readonly url?: string;
  readonly intervalMs?: number;
  readonly timeoutMs?: number;
  readonly onSample?: (metrics: unknown) => void;
  readonly onError?: () => void;
}

/** Tek istek uçuşta kalır; örnek geçmişi yerine yalnız en kötü üç değer tutulur. */
export class MetricsPoller {
  private readonly scope = new DisposableScope();
  private readonly controller = new AbortController();
  private pending: Promise<void> = Promise.resolve();
  private busy = false;
  private stopped = false;
  private failures = 0;
  private observed: ServerObservation | null = null;
  private readonly timeoutMs: number;

  constructor(private readonly options: MetricsPollerOptions) {
    const intervalMs = options.intervalMs ?? 1000;
    this.timeoutMs = options.timeoutMs ?? 2000;
    if (
      ![intervalMs, this.timeoutMs].every(
        (value) => Number.isFinite(value) && value > 0 && value <= 2_147_483_647,
      )
    )
      throw new RangeError('Yoklama süreleri timer sınırında pozitif sonlu sayı olmalı.');
    this.scope.addSubscription(() => this.controller.abort());
    if (options.url) {
      const timer = setInterval(() => this.poll(), intervalMs);
      this.scope.addSubscription(() => clearInterval(timer));
    }
  }

  get observation(): ServerObservation | null {
    return this.observed ? { ...this.observed } : null;
  }

  get errors(): number {
    return this.failures;
  }

  private poll(): void {
    if (this.stopped || this.busy || !this.options.url) return;
    this.busy = true;
    this.pending = this.sample(this.options.url).finally(() => {
      this.busy = false;
    });
  }

  private async sample(url: string): Promise<void> {
    const request = new AbortController();
    const abort = (): void => request.abort();
    this.controller.signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, this.timeoutMs);
    try {
      const response = await fetch(url, { signal: request.signal });
      if (!response.ok) throw new Error('İşletim yanıtı başarılı değil.');
      const metrics: unknown = await response.json();
      if (this.stopped) return;
      const next = observeServer([{ metrics }]);
      if (next) {
        const worst = (key: keyof ServerObservation): number | null => {
          const before = this.observed?.[key];
          const after = next[key];
          return before == null ? after : after == null ? before : Math.max(before, after);
        };
        this.observed = {
          stepP95Ms: worst('stepP95Ms'),
          loopP99Ms: worst('loopP99Ms'),
          evictions: worst('evictions'),
        };
      }
      this.options.onSample?.(metrics);
    } catch {
      if (!this.stopped) {
        this.failures++;
        // Gözlemci hatası timer'dan sahipsiz Promise reddi üretemez.
        try {
          this.options.onError?.();
        } catch {
          this.failures++;
        }
      }
    } finally {
      clearTimeout(timer);
      request.abort();
      this.controller.signal.removeEventListener('abort', abort);
    }
  }

  /** Döndüğünde timer, fetch/gövde okuması ve gözlemci çağrısı kalmamıştır. */
  stop(): Promise<void> {
    if (!this.stopped) {
      this.stopped = true;
      this.scope.dispose();
    }
    return this.pending;
  }
}
