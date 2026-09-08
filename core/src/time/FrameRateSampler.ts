/**
 * Kayan pencere istatistiği. min/max yalnızca pencereden eleman DÜŞTÜĞÜNDE tam
 * tarama ile güncellenir; her eklemede `Math.min(...values)` çağırmak ölçüm
 * aracının kendi maliyetini ölçtüğü şeye yaklaştırır.
 */
export class RollingWindow {
  private readonly values: number[] = [];
  private readonly capacity: number;
  private total = 0;
  private minValue = 0;
  private maxValue = 0;

  constructor(capacity = 60) {
    this.capacity = Math.max(1, Math.floor(capacity));
  }

  push(value: number): void {
    this.values.push(value);
    this.total += value;

    if (this.values.length > this.capacity) {
      const removed = this.values.shift()!;
      this.total -= removed;
      if (removed === this.minValue || removed === this.maxValue) {
        this.recomputeExtremes();
        return;
      }
    } else if (this.values.length === 1) {
      this.minValue = value;
      this.maxValue = value;
      return;
    }

    if (value < this.minValue) this.minValue = value;
    if (value > this.maxValue) this.maxValue = value;
  }

  clear(): void {
    this.values.length = 0;
    this.total = 0;
    this.minValue = 0;
    this.maxValue = 0;
  }

  get count(): number {
    return this.values.length;
  }

  get average(): number {
    return this.values.length > 0 ? this.total / this.values.length : 0;
  }

  get min(): number {
    return this.minValue;
  }

  get max(): number {
    return this.maxValue;
  }

  private recomputeExtremes(): void {
    let min = Infinity;
    let max = -Infinity;
    for (const sample of this.values) {
      if (sample < min) min = sample;
      if (sample > max) max = sample;
    }
    this.minValue = Number.isFinite(min) ? min : 0;
    this.maxValue = Number.isFinite(max) ? max : 0;
  }
}

/**
 * Kare aralığı örnekleyicisi — damgalardan aralık üretir, aralıklardan FPS.
 *
 * **`Diagnostics` ile `FpsMeter` bunu PAYLAŞIR.** İki ayrı FPS hesabı aynı anda
 * 58 ve 60 gösterebilir ve hangisinin doğru olduğu sorusunun cevabı olmaz;
 * ölçüm bu yüzden tek yerde tanımlıdır. CORE'un dışa açık yüzeyine çıkmaz.
 */
export class FrameRateSampler {
  private readonly window: RollingWindow;
  private lastMs = 0;
  /*
   * Taban AYRI bir bayrakla izlenir. "lastMs > 0" yeterli görünür ama
   * `performance.now()` sayfa açılışında tam 0 dönebilir; o durumda taban hiç
   * kurulmaz ve örnekleyici sessizce hiçbir örnek üretmez.
   */
  private hasBaseline = false;

  constructor(capacity = 60) {
    this.window = new RollingWindow(capacity);
  }

  /**
   * Kare sınırını damgalar. Taban kurulu değilse örnek ÜRETMEZ, yalnız tabanı
   * kurar — ilk kare "sayfa açılışından beri geçen süre" kadar uzun görünürdü.
   *
   * @returns Bir örnek üretildiyse `true`.
   */
  sample(nowMs: number): boolean {
    const hadBaseline = this.hasBaseline;
    if (hadBaseline) this.window.push(nowMs - this.lastMs);
    this.lastMs = nowMs;
    this.hasBaseline = true;
    return hadBaseline;
  }

  /**
   * Tabanı örnek üretmeden ileri taşır. Sekme arka plandan döndüğünde
   * kullanılır: aradaki duraklama bir kare aralığı DEĞİLDİR ve pencereye
   * girerse FPS dakikalarca düşük görünür.
   */
  markBaseline(nowMs: number): void {
    this.lastMs = nowMs;
    this.hasBaseline = true;
  }

  /** Ham ölçüm ekler — damga değil, süre. */
  push(value: number): void {
    this.window.push(value);
  }

  clear(): void {
    this.window.clear();
    this.lastMs = 0;
    this.hasBaseline = false;
  }

  get count(): number {
    return this.window.count;
  }

  /** Ortalama kare aralığı (ms). */
  get average(): number {
    return this.window.average;
  }

  /** En kısa kare aralığı (ms). */
  get min(): number {
    return this.window.min;
  }

  /** En uzun kare aralığı (ms). */
  get max(): number {
    return this.window.max;
  }

  /** Ortalama kare aralığından türetilen FPS; örnek yoksa 0. */
  get fps(): number {
    const average = this.window.average;
    return average > 0 ? 1000 / average : 0;
  }
}
