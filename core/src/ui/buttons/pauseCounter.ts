export interface PauseCounterOptions {
  /** 'up' saniye 0'dan başlar artar; 'down' `startSeconds`'tan 0'a azalır. */
  direction: 'up' | 'down';
  /** direction:'down' için başlangıç saniyesi; direction:'up' için yok sayılır. */
  startSeconds?: number;
  /** Tam bir saniye geçtiğinde çağrılır (duraklatılmışken değil). Geç kalan zamanlayıcıda ara saniyeler tek çağrıya sığar. */
  onTick?: (seconds: number) => void;
  /** direction:'down' iken sayaç 0'a ulaştığında bir kez çağrılır; sayaç kendiliğinden durur. */
  onComplete?: () => void;
  /** Tek yönlü saat (ms); verilmezse `performance.now`. */
  now?: () => number;
}

/**
 * PauseResumeButton'ın isteğe bağlı SAYAÇ TARİFİ: düğmenin sunumundan ayrı, DOM'suz saniye sayacı.
 *
 * Süreyi `setInterval` tik sayısından değil geçen gerçek zamandan türetir. İki sonucu vardır: duraklatma kesirli saniyeyi
 * DONDURUR (0,9 sn'de duraklatıp devam edince kalan 0,1 sn sayılır; her duraklatmada tam bir saniye yenmez) ve arka planda
 * kısılan zamanlayıcı sayacı geri bırakmaz (geç tetiklenince geçen süre kadar ilerler).
 */
export class PauseCounter {
  private readonly direction: 'up' | 'down';
  private readonly startSeconds: number;
  private readonly onTick?: (seconds: number) => void;
  private readonly onComplete?: () => void;
  private readonly clock: () => number;
  /** Tamamlanmış çalışma dilimlerinde geçen süre (ms). */
  private elapsedBeforeMs = 0;
  /** Çalışan dilimin başlangıcı; duraklatılmışken null. */
  private startedAt: number | null = null;
  private timer: number | null = null;
  private lastSeconds: number;
  private disposed = false;

  constructor(options: PauseCounterOptions) {
    this.direction = options.direction;
    this.startSeconds =
      options.direction === 'down' ? Math.max(0, Math.floor(options.startSeconds ?? 0)) : 0;
    this.onTick = options.onTick;
    this.onComplete = options.onComplete;
    this.clock = options.now ?? (() => performance.now());
    this.lastSeconds = this.startSeconds;
  }

  /** Şu anki saniye değeri (duraklatılmışken donmuştur). */
  getSeconds(): number {
    return this.secondsAt(this.elapsedMs());
  }

  isRunning(): boolean {
    return this.startedAt !== null;
  }

  /**
   * Sayacı sürdürür; zaten çalışıyorsa ya da yok edildiyse bir şey yapmaz. Tamamlanmış 'down' sayaç sürdürülürse sıradaki
   * saniye sınırında `onComplete` yeniden çağrılır ve sayaç yine durur (eski düğme sözleşmesi).
   */
  resume(): void {
    if (this.startedAt !== null || this.disposed) return;
    this.startedAt = this.clock();
    this.schedule();
  }

  /** Sayacı dondurur: geçen süre korunur, `resume` kalan kesirden sürer. */
  pause(): void {
    if (this.startedAt === null) return;
    this.elapsedBeforeMs = this.elapsedMs();
    this.startedAt = null;
    this.clearTimer();
  }

  dispose(): void {
    this.pause();
    this.disposed = true;
  }

  private elapsedMs(): number {
    return this.startedAt === null
      ? this.elapsedBeforeMs
      : this.elapsedBeforeMs + Math.max(0, this.clock() - this.startedAt);
  }

  private secondsAt(elapsedMs: number): number {
    const whole = Math.floor(elapsedMs / 1000);
    return this.direction === 'down' ? Math.max(0, this.startSeconds - whole) : whole;
  }

  /** Bir sonraki tam saniye sınırına kurulur; erken tetiklenen zamanlayıcı en az 1 ms sonra yeniden kurulur. */
  private schedule(): void {
    this.clearTimer();
    const remainder = this.elapsedMs() % 1000;
    this.timer = window.setTimeout(() => this.tick(), Math.max(1, Math.ceil(1000 - remainder)));
  }

  private tick(): void {
    this.timer = null;
    if (this.startedAt === null) return;
    const seconds = this.secondsAt(this.elapsedMs());
    // 'down' sayaç başlangıçta 0 ise ilk saniye sınırında tamamlanır (sayaç hiç azalmasa da).
    const finished = this.direction === 'down' && seconds === 0;
    if (seconds !== this.lastSeconds) {
      this.lastSeconds = seconds;
      this.onTick?.(seconds);
    } else if (!finished) {
      // Erken tetiklenme: henüz yeni bir saniye dolmadı.
      this.schedule();
      return;
    }
    if (finished) {
      this.pause();
      this.onComplete?.();
      return;
    }
    // Geri bırakılmış `onTick` sayacı durdurmuş olabilir (örn. sahibi duraklattı).
    if (this.startedAt !== null) this.schedule();
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    window.clearTimeout(this.timer);
    this.timer = null;
  }
}
