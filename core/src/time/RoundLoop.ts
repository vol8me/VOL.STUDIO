import { Cooldown } from './Cooldown';

export interface RoundLoopOptions {
  /** İlk turun numarası. Varsayılan 1. */
  startRound?: number;
  /** Turlar arası mola (ms). */
  breakMs: number;
  /**
   * Toplam tur sayısı. Verilirse son tur bitince döngü DURUR ve
   * `onComplete` tetiklenir; verilmezse sonsuz sürer (endless mod).
   */
  totalRounds?: number;
  /** Yeni tur başladığında — tur numarasıyla. */
  onRoundStart?: (round: number) => void;
  /** `totalRounds` tamamlanınca BİR KEZ. */
  onComplete?: () => void;
}

/**
 * Tur/dalga döngüsü — headless.
 *
 * Bir dönem `WaveCounter.startAutoLoop()` içinde, yani bir HUD bileşeninin
 * içinde yaşıyordu: bileşen turu kendi ilerletiyor, kendi defterini tutuyor ve
 * `totalWaves`e ulaşınca kendi duruyordu. Bir tur orkestrasyonunun sunum
 * katmanında durmasının sebebi yoktu ve oyunun kendi tur yöneticisiyle iki
 * defter kaçınılmaz olarak kayıyordu.
 *
 * Artık gösterimden bağımsız: `RoundLoop` turu yürütür, `WaveCounter` (ya da
 * herhangi bir görsel) yalnızca çıktısını çizer. Tower defense'te dalga
 * molası, roguelite'ta oda arası, bir yarışta tur sayacı aynı parçadır.
 *
 * `Scheduler` gibi delta-time ile sürülür: duraklatılan oyunda mola akmaz.
 *
 * ```ts
 * const loop = new RoundLoop({ breakMs: 5000, totalRounds: 10, onRoundStart: spawnWave });
 * loop.start();
 * // her karede:
 * loop.update(dt);
 * counter.setWave(loop.getRound());
 * counter.setRemainingSeconds(loop.getRemainingMs() / 1000);
 * ```
 */
export class RoundLoop {
  private readonly breakTimer: Cooldown;
  private readonly totalRounds?: number;
  private readonly onRoundStart?: (round: number) => void;
  private readonly onComplete?: () => void;
  private round: number;
  private running = false;
  private completed = false;

  constructor(options: RoundLoopOptions) {
    this.round = options.startRound ?? 1;
    this.breakTimer = new Cooldown(Math.max(0, options.breakMs));
    this.totalRounds = options.totalRounds;
    this.onRoundStart = options.onRoundStart;
    this.onComplete = options.onComplete;
  }

  /**
   * Döngüyü başlatır ve İLK turu HEMEN bildirir (mola beklemeden).
   *
   * Molanın önce gelmesi, oyuncuyu daha ilk saniyede boş bir ekranla
   * karşılardı; ilk tur anında başlar, mola turlar ARASINDA olur.
   */
  start(): void {
    if (this.running || this.completed) return;
    this.running = true;
    this.onRoundStart?.(this.round);
    this.breakTimer.trigger();
  }

  /** Molayı dondurur; `update()` çağrıları etkisiz kalır. */
  pause(): void {
    this.running = false;
  }

  /** Duraklatılmış döngüyü kaldığı yerden sürdürür. */
  resume(): void {
    if (!this.completed) this.running = true;
  }

  /**
   * Molayı beklemeden sıradaki tura geçer — "hazırım" butonu için.
   * Döngü çalışmıyorsa ya da bitmişse hiçbir şey yapmaz.
   */
  skipBreak(): void {
    if (!this.running || this.completed) return;
    this.advance();
  }

  update(deltaMs: number): void {
    if (!this.running || this.completed) return;

    this.breakTimer.update(deltaMs);
    if (this.breakTimer.isReady()) {
      this.advance();
    }
  }

  getRound(): number {
    return this.round;
  }

  /** Sonraki tura kalan süre (ms). */
  getRemainingMs(): number {
    return this.breakTimer.getRemaining();
  }

  /** Mola ilerlemesi [0, 1] — geri sayım çubuğu için. */
  getBreakProgress(): number {
    return this.breakTimer.getProgress();
  }

  isRunning(): boolean {
    return this.running;
  }

  isComplete(): boolean {
    return this.completed;
  }

  private advance(): void {
    const next = this.round + 1;

    if (this.totalRounds !== undefined && next > this.totalRounds) {
      this.completed = true;
      this.running = false;
      this.onComplete?.();
      return;
    }

    this.round = next;
    this.onRoundStart?.(next);
    this.breakTimer.trigger();
  }
}
