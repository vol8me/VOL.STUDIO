import { approach } from './interpolation';

/** Farklı açılma/sönme süreleriyle 0–1 düzeyini süren deterministik geçiş. */
export class PresenceEnvelope {
  private level = 0;

  constructor(
    private readonly riseMs: number,
    private readonly fallMs: number,
  ) {
    if (!Number.isFinite(riseMs) || riseMs <= 0 || !Number.isFinite(fallMs) || fallMs <= 0)
      throw new RangeError('PresenceEnvelope: geçiş süreleri pozitif ve sonlu olmalı');
  }

  /** Geçersiz akış deltası düzeyi değiştirmez; uzun kare uçta kelepçelenir. */
  update(active: boolean, deltaMs: number): number {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return this.value;
    this.level = approach(
      this.level,
      active ? 1 : 0,
      deltaMs / (active ? this.riseMs : this.fallMs),
    );
    return this.value;
  }

  /** Doğrusal iç düzeyin smoothstep çıktısı; uçlarda hız sıfırdır. */
  get value(): number {
    return this.level * this.level * (3 - 2 * this.level);
  }

  reset(): void {
    this.level = 0;
  }
}
