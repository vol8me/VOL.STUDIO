/**
 * Sabit adımlı duvar saati biriktiricisi. Colyseus `setFixedTimestep` aralığı adım süresine eşitler ve Node
 * `setInterval` kesirli milisaniyeyi kırptığı için 30 Hz'de 33 ms'lik tetikleme 33,33 ms'lik adımı yaklaşık
 * her yüz tetiklemede bir kaçırır: adımlar arası p99 iki adıma (~66 ms) çıkar. Bu sınıf adım süresinden
 * kısa aralıkla çağrılır ve geçen süreyi biriktirir; sapma bir tetikleme aralığıyla sınırlı kalır.
 */
export class StepClock {
  private lastAt: number;
  private pending = 0;

  constructor(
    private readonly stepMs: number,
    startAt: number,
    /** Uzun duraklamadan sonra arka arkaya en çok bu kadar adım koşulur; kalanı atılır (sarmal yok). */
    private readonly maxCatchUp = 5,
  ) {
    this.lastAt = startAt;
  }

  /** `nowMs` anında koşulması gereken adım sayısı. */
  due(nowMs: number): number {
    if (nowMs > this.lastAt) {
      this.pending += nowMs - this.lastAt;
      this.lastAt = nowMs;
    }
    let steps = 0;
    while (this.pending >= this.stepMs && steps < this.maxCatchUp) {
      this.pending -= this.stepMs;
      steps++;
    }
    if (steps === this.maxCatchUp) this.pending = 0;
    return steps;
  }
}
