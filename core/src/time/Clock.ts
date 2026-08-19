/**
 * Duraklatılabilir, ölçeklenebilir geçen-zaman sayacı.
 *
 * `Date.now()` farkı YERİNE oyun döngüsünün delta'sıyla ilerler; duraklama,
 * alt-tab ve yavaş çekim otomatik olarak doğru davranır. Skor süresi, yetenek
 * ömrü ve zorluk eğrisi gibi "oyunun içinde geçen zaman"ı okuyan her yer
 * gerçek zamanı değil bunu okumalıdır.
 */
export class Clock {
  private elapsedMs = 0;
  private running: boolean;
  private scale = 1;

  constructor(options: { autoStart?: boolean } = {}) {
    this.running = options.autoStart ?? true;
  }

  /** Geçen süre (ms), ölçek uygulanmış hâliyle. */
  getElapsed(): number {
    return this.elapsedMs;
  }

  getElapsedSeconds(): number {
    return this.elapsedMs / 1000;
  }

  isRunning(): boolean {
    return this.running;
  }

  start(): void {
    this.running = true;
  }

  pause(): void {
    this.running = false;
  }

  /** Sayacı sıfırlar; çalışma durumu ve ölçek KORUNUR. */
  reset(): void {
    this.elapsedMs = 0;
  }

  /**
   * Zaman ölçeği — yavaş çekim (0.5), hızlandırma (2), dondurma (0).
   * Negatif değer 0'a kelepçelenir: geriye akan zaman, süreye dayanan her
   * hesabı (cooldown, ilerleme oranı) tanımsız hâle getirirdi.
   */
  setScale(scale: number): void {
    this.scale = Number.isFinite(scale) ? Math.max(0, scale) : 0;
  }

  getScale(): number {
    return this.scale;
  }

  update(deltaMs: number): void {
    if (!this.running || deltaMs <= 0) return;
    this.elapsedMs += deltaMs * this.scale;
  }
}
