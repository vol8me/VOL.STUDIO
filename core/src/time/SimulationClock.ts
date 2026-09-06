/**
 * `stepIndex` bir RENDER FRAME içindeki sıradır, her frame'de 0'dan başlar.
 *
 * Girdi anlık görüntüsü frame başına BİR kez okunur ve tüm adımlara aynı nesne
 * verilir. KENAR tetikli bir eylem böylece N adım boyunca `true` kalır ve tek
 * basış N kez tetiklenir; N düşük FPS'te büyür. Böyle bir eylem eklendiğinde
 * `stepIndex === 0` koşulu yazılır.
 */
export type SimulationStep = (stepMs: number, stepIndex: number) => void;

/**
 * Sabit adıma sığmayan ARTIK dilim ne olsun? Saatin tek sözleşme kararı.
 *
 * - `'simulate'` — artık değişken bir adım olarak koşulur; girdi tepkisi
 *   ertelenmez ama aynı girdi farklı render hızında FARKLI sonuç verir.
 * - `'defer'` — artık biriktiricide bekler, yalnız tam adım ilerler; tempodan
 *   bağımsız aynı sonuç, karşılığında bir adımlık gecikme ve render'da
 *   `getInterpolationAlpha()` ihtiyacı.
 *
 * Ölçüm ya da tekrar oynatma `'defer'`, oynanan sahne `'simulate'` ister.
 */
export type PartialStepPolicy = 'simulate' | 'defer';

export interface SimulationClockConfig {
  /** Sabit simülasyon adımı (ms). */
  readonly fixedStepMs: number;
  /** Tek render frame'inde yapılabilecek azami sabit adım sayısı. */
  readonly maxStepsPerFrame: number;
  /** Varsayılan `'simulate'`; strict davranış için `'defer'`. */
  readonly partialStep?: PartialStepPolicy;
}

/** Bir frame'de gerçekten ne olduğunu anlatan ölçüm — teşhis ve test için. */
export interface SimulationClockFrame {
  /** Tam `fixedStepMs` uzunluğunda kaç adım koşuldu. */
  readonly fixedSteps: number;
  /** Artık dilim simüle edildiyse süresi; `'defer'` kipinde her zaman 0. */
  readonly partialStepMs: number;
  /** Catch-up sınırına takılıp ATILAN simülasyon zamanı (ms). */
  readonly droppedMs: number;
}

/**
 * Render frame süresini simülasyon adımlarına çeviren biriktirici. Adımlama
 * politikası (catch-up, artık dilim, üst sınır) Phaser kurmadan sürülebilir ve
 * `SimulationClockFrame` her frame'de neyin atıldığını RAPOR eder.
 *
 * Determinizm bir SEÇİMDİR: artık dilimin ne olacağı `partialStep` ile açıkça
 * verilir (bkz. `PartialStepPolicy`).
 */
export class SimulationClock {
  private accumulatorMs = 0;
  private simulationTimeMs = 0;
  private stepIndexInFrame = 0;

  private readonly partialStepPolicy: PartialStepPolicy;

  constructor(private readonly config: SimulationClockConfig) {
    this.partialStepPolicy = config.partialStep ?? 'simulate';
  }

  /** Yürürlükteki artık dilim politikası. */
  getPartialStepPolicy(): PartialStepPolicy {
    return this.partialStepPolicy;
  }

  /**
   * Bir sonraki sabit adıma ne kadar yaklaşıldığı: [0, 1).
   *
   * `'defer'` kipinde render, simülasyondan geride kalan bu payı kullanarak
   * ÖNCEKİ ve GÜNCEL durum arasında ara değer hesaplar; aksi halde sabit adım
   * render hızından yavaşken görüntü kesik kesik ilerler. `'simulate'` kipinde
   * artık zaten simüle edildiği için değer sıfıra yakın kalır.
   */
  getInterpolationAlpha(): number {
    const fixedStep = this.config.fixedStepMs;
    if (!(fixedStep > 0) || !Number.isFinite(fixedStep)) return 0;
    return Math.min(0.999999, Math.max(0, this.accumulatorMs / fixedStep));
  }

  /** Simülasyonun başından beri geçen süre (ms) — koşu içi mantık saati. */
  getSimulationTimeMs(): number {
    return this.simulationTimeMs;
  }

  /** Henüz adıma dönüşmemiş artık süre (ms). */
  getAccumulatorMs(): number {
    return this.accumulatorMs;
  }

  /** Yeni koşu / sahne yeniden başlatma. */
  reset(): void {
    this.accumulatorMs = 0;
    this.simulationTimeMs = 0;
  }

  /** @param realDeltaMs Ölçülmüş frame süresi; çağıran tarafından temizlenmiş olmalı. */
  advance(realDeltaMs: number, step: SimulationStep): SimulationClockFrame {
    const fixedStep = this.config.fixedStepMs;
    if (!(fixedStep > 0) || !Number.isFinite(fixedStep)) {
      return { fixedSteps: 0, partialStepMs: 0, droppedMs: 0 };
    }

    this.stepIndexInFrame = 0;
    this.accumulatorMs += Number.isFinite(realDeltaMs) ? Math.max(0, realDeltaMs) : 0;

    let fixedSteps = 0;
    while (this.accumulatorMs >= fixedStep && fixedSteps < this.config.maxStepsPerFrame) {
      this.runStep(fixedStep, step);
      this.accumulatorMs -= fixedStep;
      fixedSteps++;
    }

    // `'simulate'`: kalan dilim de simüle edilir, girdi tepkisi ertelenmez.
    // `'defer'`: artık biriktiricide bekler.
    let partialStepMs = 0;
    if (this.partialStepPolicy === 'simulate' && fixedSteps === 0 && this.accumulatorMs > 0) {
      partialStepMs = this.accumulatorMs;
      this.runStep(partialStepMs, step);
      this.accumulatorMs = 0;
    }

    // Sekme dönüşü gibi devasa delta sınırsız catch-up'a dönüşmesin: fazlalık
    // ATILIR ve raporlanır.
    let droppedMs = 0;
    if (fixedSteps >= this.config.maxStepsPerFrame && this.accumulatorMs >= fixedStep) {
      const remainder = this.accumulatorMs % fixedStep;
      droppedMs = this.accumulatorMs - remainder;
      this.accumulatorMs = remainder;
    }

    return { fixedSteps, partialStepMs, droppedMs };
  }

  private runStep(stepMs: number, step: SimulationStep): void {
    this.simulationTimeMs += stepMs;
    step(stepMs, this.stepIndexInFrame++);
  }
}
