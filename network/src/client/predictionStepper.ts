import type { Predict } from '@colyseus/sdk';

export interface PredictionStepperOptions {
  readonly maxSliceMs: number;
  readonly maxSlices: number;
  /** Bir çağrıda tüketilebilecek toplam girdi; sunucunun tamponuyla uyumlu seçilir. */
  readonly maxSteps: number;
}

/**
 * SDK saati tek sahibidir. Uzun render aralığı sınırlı ara tick'lere bölünür;
 * her tick'in girdileri sonraki tick'ten ve son poz okumasından önce tüketilir.
 * Dilim sınırını aşan eski boşluk ilk tick'te SDK'nın hitch politikasına kalır.
 */
export class PredictionStepper {
  private lastTime: number | undefined;
  private advancing = false;
  private disposed = false;
  private readonly options: PredictionStepperOptions;

  constructor(
    private readonly predict: Pick<Predict, 'tick'>,
    options: PredictionStepperOptions,
  ) {
    options = {
      maxSliceMs: options.maxSliceMs,
      maxSlices: options.maxSlices,
      maxSteps: options.maxSteps,
    };
    if (
      !Number.isFinite(options.maxSliceMs) ||
      options.maxSliceMs <= 0 ||
      !Number.isSafeInteger(options.maxSlices) ||
      options.maxSlices < 1 ||
      !Number.isSafeInteger(options.maxSteps) ||
      options.maxSteps < 1
    )
      throw new RangeError('Öngörü dilimi, dilim sayısı ve girdi sınırı pozitif olmalı.');
    this.options = options;
  }

  advance(nowMs: number, consume: () => void): number {
    if (this.disposed) return 0;
    if (this.advancing) throw new Error('Öngörü adımı sırasında yeniden giriş yapılamaz.');
    if (
      !Number.isFinite(nowMs) ||
      nowMs < 0 ||
      (this.lastTime !== undefined && nowMs <= this.lastTime)
    )
      return 0;
    const { maxSliceMs, maxSlices, maxSteps } = this.options;
    const slices =
      this.lastTime === undefined
        ? 1
        : Math.min(maxSlices, Math.ceil((nowMs - this.lastTime) / maxSliceMs));
    let steps = 0;
    this.advancing = true;
    try {
      for (let remaining = slices - 1; remaining >= 0 && !this.disposed; remaining--) {
        const at = nowMs - remaining * maxSliceMs;
        // Büyük damgalarda kayan nokta kesinliği iki ara zamanı aynı değere yuvarlayabilir.
        if (this.lastTime !== undefined && at <= this.lastTime) continue;
        this.lastTime = at;
        const due = this.predict.tick(at);
        if (!Number.isSafeInteger(due) || due < 0 || due > maxSteps - steps)
          throw new RangeError('SDK öngörü bütçesi yapılandırılmış girdi sınırını aştı.');
        for (let index = 0; index < due && !this.disposed; index++) {
          consume();
          steps++;
        }
      }
      return steps;
    } catch (error) {
      // Tick/girdi dış etkisi geri alınamaz; kısmi işi sonraki karede tekrar üretme.
      this.dispose();
      throw error;
    } finally {
      this.advancing = false;
    }
  }

  dispose(): void {
    this.disposed = true;
  }
}
