/**
 * Nişan çizgisinin görünürlük düzeyi (0..1): nişan etkinleşince kısa sürede açılır, bırakılınca
 * daha yavaş söner. Düzey doğrusal ilerler, çıktısı yumuşatılır; çizgi namludan uzanıp geri çekilir.
 */
export class AimPresence {
  private level = 0;

  constructor(
    private readonly fadeInMs: number,
    private readonly fadeOutMs: number,
  ) {
    if (!(fadeInMs > 0 && fadeOutMs > 0)) throw new RangeError('Geçiş süreleri pozitif olmalı');
  }

  /** Düzeyi `deltaMs` kadar ilerletir ve yumuşatılmış değeri döndürür. */
  update(active: boolean, deltaMs: number): number {
    const step = deltaMs / (active ? this.fadeInMs : this.fadeOutMs);
    this.level = Math.min(1, Math.max(0, this.level + (active ? step : -step)));
    return this.value;
  }

  /** Yumuşatılmış düzey (smoothstep). */
  get value(): number {
    return this.level * this.level * (3 - 2 * this.level);
  }

  reset(): void {
    this.level = 0;
  }
}
