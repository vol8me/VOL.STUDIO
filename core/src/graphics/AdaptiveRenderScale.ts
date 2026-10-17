export interface AdaptiveRenderScaleOptions {
  /** Alt sınır (0,25–1): sürekli yavaş kareler bu çarpandan öteye inmez. Varsayılan 0,5. */
  min?: number;
  /** Her kısılışta çarpanın çarpıldığı oran (0–1). Varsayılan 0,85. */
  shrink?: number;
  /** Ortalama kare süresi bu eşiği (ms) aşarsa kısılır. Varsayılan 22 (~45 kare/sn altı). */
  slowFrameMs?: number;
  /** Karar penceresindeki kare sayısı. Varsayılan 90. */
  windowFrames?: number;
  /** Bir kısılıştan sonra yeni karar için beklenen oyun süresi (ms): canvas yeniden kurulumu kareyi bozmaz. */
  cooldownMs?: number;
  /** Bundan uzun kare (sekme dönüşü, takılma) ölçüme girmez. Varsayılan 120. */
  ignoreAboveMs?: number;
}

/**
 * Uyarlanır çizim çözünürlüğü: bilinmeyen GPU'da sürekli yavaş kareleri `renderScale` düşürerek
 * toparlar. Saf ve belirlenimcidir (saat okumaz); çağıran kare sürelerini `sample`a verir ve
 * dönen `true` çarpanın değiştiğini söyler (`ViewportManager` yeniden ölçülür).
 *
 * Yalnız KISAR: kare hızı ekran yenilemesine kilitliyken boş pay okunamaz, yükseltme salınım
 * yaratırdı. Pencere boyutu değişince (tam ekran) çağıran `reset` ile 1'e döner ve yeniden ölçer.
 */
export class AdaptiveRenderScale {
  private current = 1;
  private sum = 0;
  private count = 0;
  private cooldown = 0;
  private readonly min: number;
  private readonly shrink: number;
  private readonly slowFrameMs: number;
  private readonly windowFrames: number;
  private readonly cooldownMs: number;
  private readonly ignoreAboveMs: number;

  constructor(options: AdaptiveRenderScaleOptions = {}) {
    this.min = clamp(options.min ?? 0.5, 0.25, 1);
    this.shrink = clamp(options.shrink ?? 0.85, 0.1, 0.99);
    this.slowFrameMs = positive(options.slowFrameMs, 22);
    this.windowFrames = Math.max(1, Math.floor(positive(options.windowFrames, 90)));
    this.cooldownMs = Math.max(0, options.cooldownMs ?? 2500);
    this.ignoreAboveMs = positive(options.ignoreAboveMs, 120);
  }

  /** Geçerli çarpan (0,25–1). */
  get scale(): number {
    return this.current;
  }

  /** Bir karenin süresini (ms) ölçer; çarpan değiştiyse `true`. */
  sample(frameMs: number): boolean {
    if (!Number.isFinite(frameMs) || frameMs <= 0 || frameMs > this.ignoreAboveMs) return false;
    if (this.cooldown > 0) {
      this.cooldown = Math.max(0, this.cooldown - frameMs);
      return false;
    }
    this.sum += frameMs;
    this.count++;
    if (this.count < this.windowFrames) return false;
    const average = this.sum / this.count;
    this.sum = 0;
    this.count = 0;
    if (average <= this.slowFrameMs || this.current <= this.min) return false;
    this.current = Math.max(this.min, this.current * this.shrink);
    this.cooldown = this.cooldownMs;
    return true;
  }

  /** Çarpanı 1'e döndürür ve ölçümü baştan başlatır; değişim varsa `true`. */
  reset(): boolean {
    const changed = this.current !== 1;
    this.current = 1;
    this.sum = 0;
    this.count = 0;
    this.cooldown = 0;
    return changed;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

function positive(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}
