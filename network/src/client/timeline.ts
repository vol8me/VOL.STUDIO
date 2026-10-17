/**
 * Sunucunun benzetim saatini SDK'nın sunucu-saati eksenine bağlar. Durum örnekleri
 * SDK'da yama kodlama anıyla (`clock.lastServerTime`) damgalanır; olaylar ise benzetim saatiyle
 * gelir. Yama başına bir (benzetim, sunucu) çifti gözlenir ve fark üstel ortalamayla izlenir.
 */
export class ServerTimeline {
  private offset: number | undefined;

  constructor(private readonly smoothing = 0.2) {
    if (!(smoothing > 0 && smoothing <= 1))
      throw new RangeError('Yumuşatma (0, 1] aralığında olmalı.');
  }

  /** Sunucu ekseni henüz bilinmiyorsa `false`. */
  get known(): boolean {
    return this.offset !== undefined;
  }

  observe(simMs: number, serverMs: number): void {
    if (!Number.isFinite(simMs) || !Number.isFinite(serverMs) || serverMs <= 0) return;
    const sample = serverMs - simMs;
    this.offset =
      this.offset === undefined ? sample : this.offset + (sample - this.offset) * this.smoothing;
  }

  /** Benzetim saatindeki bir anın sunucu eksenindeki karşılığı; ilk gözlemden önce `undefined`. */
  toServer(simMs: number): number | undefined {
    return this.offset === undefined ? undefined : simMs + this.offset;
  }
}
