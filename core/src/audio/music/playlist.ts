import type { MusicEngine } from './engine';

/**
 * Parça listesi — bir parça bitince kısa bir boşluktan sonra sıradakini çalar
 * ve liste tükenince yeniden karıştırıp devam eder.
 *
 * Motor tek bir parçayı çalar ve `loop: true` verilirse o parça sonsuza kadar
 * döner; yani listedeki ikinci parçaya hiç sıra gelmez. Sıralamayı, boşluğu ve
 * karıştırmayı yönetecek bir katman yoktu, bu sınıf o boşluğu doldurur.
 *
 * Oyun bilgisi taşımaz: yalnızca parça id'leri, süreler ve bir rastgelelik
 * kaynağı alır.
 */
export interface MusicPlaylistOptions {
  /** Sırayla çalınacak parça id'leri. En az bir tane olmalı. */
  tracks: readonly string[];
  /** Parçalar arası sessizlik (ms). Varsayılan 2000. */
  gapMs?: number;
  /** Parça giriş fade süresi (saniye). */
  fadeInSec?: number;
  /** `stop()` çağrıldığında çıkış fade süresi (saniye). */
  fadeOutSec?: number;
  /**
   * Sıra karıştırılsın mı? Varsayılan `true` — her açılışta farklı bir parçayla
   * başlanması istendiği için.
   */
  shuffle?: boolean;
  /** Rastgelelik kaynağı. Testte deterministik bir üreteç verilebilir. */
  random?: () => number;
  /** Zamanlayıcılar — testte sahte zamanlayıcı verilebilir. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** Parça değiştiğinde bildirilir (HUD/log için). */
  onTrackChange?: (trackId: string) => void;
}

export class MusicPlaylist {
  private readonly tracks: readonly string[];
  private readonly gapMs: number;
  private readonly fadeInSec: number;
  private readonly fadeOutSec: number;
  private readonly shuffle: boolean;
  private readonly random: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly onTrackChange?: (trackId: string) => void;

  private queue: string[] = [];
  private cursor = 0;
  private running = false;
  private gapHandle: unknown = null;
  private unsubscribe: (() => void) | null = null;
  private lastPlayed: string | null = null;
  /** `start()` ile `play()` arasında `stop()` gelirse sesi bastırmak için. */
  private startToken = 0;

  constructor(
    private readonly engine: Pick<MusicEngine, 'play' | 'stop' | 'onTrackEnd'>,
    options: MusicPlaylistOptions,
  ) {
    if (options.tracks.length === 0) {
      throw new Error('[MusicPlaylist] En az bir parça gerekli.');
    }
    this.tracks = [...options.tracks];
    this.gapMs = Math.max(0, options.gapMs ?? 2000);
    this.fadeInSec = options.fadeInSec ?? 2;
    this.fadeOutSec = options.fadeOutSec ?? 1;
    this.shuffle = options.shuffle ?? true;
    this.random = options.random ?? Math.random;
    this.setTimer =
      options.setTimer ?? ((fn, ms) => globalThis.setTimeout(fn, ms) as unknown as number);
    this.clearTimer = options.clearTimer ?? ((handle) => globalThis.clearTimeout(handle as number));
    this.onTrackChange = options.onTrackChange;
  }

  /** Şu an çalan parça (boşluk sırasında `null`). */
  get currentTrackId(): string | null {
    return this.running ? this.queue[this.cursor] ?? null : null;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Listeyi baştan kurar ve ilk parçayı çalar. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.buildQueue();
    this.cursor = 0;
    this.unsubscribe = this.engine.onTrackEnd((trackId) => this.handleTrackEnd(trackId));
    void this.playCurrent();
  }

  /** Listeyi durdurur, bekleyen boşluk zamanlayıcısını iptal eder. */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.startToken++;
    this.clearGap();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.engine.stop({ fadeOut: this.fadeOutSec });
  }

  /** Sıradaki parçaya boşluk beklemeden geçer. */
  skip(): void {
    if (!this.running) return;
    this.clearGap();
    this.advanceCursor();
    void this.playCurrent();
  }

  /** Sıra karıştırma: Fisher-Yates. */
  private buildQueue(): void {
    const next = [...this.tracks];
    if (this.shuffle) {
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(this.clampRandom() * (i + 1));
        const a = next[i];
        const b = next[j];
        next[i] = b;
        next[j] = a;
      }
      // Yeni turun ilk parçası önceki turun sonuncusuyla aynı olmasın —
      // aksi halde aynı parça arka arkaya iki kez çalar.
      if (next.length > 1 && this.lastPlayed !== null && next[0] === this.lastPlayed) {
        const a = next[0];
        const b = next[1];
        next[0] = b;
        next[1] = a;
      }
    }
    this.queue = next;
  }

  /** Bozuk bir rastgelelik kaynağı sırayı çökertmesin. */
  private clampRandom(): number {
    const value = this.random();
    if (!Number.isFinite(value)) return 0;
    return Math.min(0.999999, Math.max(0, value));
  }

  private advanceCursor(): void {
    this.cursor++;
    if (this.cursor >= this.queue.length) {
      this.buildQueue();
      this.cursor = 0;
    }
  }

  private handleTrackEnd(trackId: string): void {
    if (!this.running) return;
    // Başka bir sistemin çaldığı parça bittiyse (ör. savaş müziği) listeyi
    // ilerletme; yalnızca kendi parçamızın bitişi sırayı ilerletir.
    if (trackId !== this.queue[this.cursor]) return;

    this.lastPlayed = trackId;
    this.advanceCursor();
    this.clearGap();
    const token = this.startToken;
    this.gapHandle = this.setTimer(() => {
      this.gapHandle = null;
      if (!this.running || token !== this.startToken) return;
      void this.playCurrent();
    }, this.gapMs);
  }

  private async playCurrent(): Promise<void> {
    const trackId = this.queue[this.cursor];
    if (trackId === undefined) return;

    const token = this.startToken;
    try {
      await this.engine.play(trackId, { fadeIn: this.fadeInSec });
      // `await` sırasında durdurulduysa sesi bastır.
      if (!this.running || token !== this.startToken) {
        this.engine.stop({ fadeOut: 0 });
        return;
      }
      this.lastPlayed = trackId;
      this.onTrackChange?.(trackId);
    } catch (error) {
      console.warn(`[MusicPlaylist] Parça çalınamadı, atlanıyor: ${trackId}`, error);
      if (!this.running || token !== this.startToken) return;
      // Tek parçalık listede sonsuz döngüye girmemek için boşluk kadar bekle.
      this.advanceCursor();
      this.clearGap();
      this.gapHandle = this.setTimer(() => {
        this.gapHandle = null;
        if (!this.running || token !== this.startToken) return;
        void this.playCurrent();
      }, this.gapMs);
    }
  }

  private clearGap(): void {
    if (this.gapHandle !== null) {
      this.clearTimer(this.gapHandle);
      this.gapHandle = null;
    }
  }
}
