/**
 * Jeton kovası: saniyede `ratePerSecond` jeton dolar, en çok `burst` birikir. Oyuncu başına komut
 * sınırı için kullanılır; sunucu saati dışarıdan verilir, böylece test deterministik kalır.
 */
export class TokenBucket {
  private tokens: number;
  private at: number;

  constructor(
    private readonly ratePerSecond: number,
    private readonly burst: number,
    startAt: number,
  ) {
    if (!(ratePerSecond > 0) || !(burst >= 1))
      throw new RangeError('Hız pozitif, birikim en az 1 olmalı.');
    this.tokens = burst;
    this.at = startAt;
  }

  /** Bir jeton harcar; yoksa `false` döner ve hiçbir şey harcamaz. */
  take(nowMs: number): boolean {
    if (nowMs > this.at) {
      this.tokens = Math.min(
        this.burst,
        this.tokens + ((nowMs - this.at) / 1000) * this.ratePerSecond,
      );
      this.at = nowMs;
    }
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
