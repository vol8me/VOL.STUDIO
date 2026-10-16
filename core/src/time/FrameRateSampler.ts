import { RollingWindow } from '../collections/RollingWindow';

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
    if (!Number.isFinite(nowMs)) return false;
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
    if (!Number.isFinite(nowMs)) return;
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
