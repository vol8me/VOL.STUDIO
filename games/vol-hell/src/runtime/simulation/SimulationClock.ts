/**
 * Tek bir simülasyon adımı.
 *
 * `stepIndex` bir RENDER FRAME içindeki sıradır ve her frame'de 0'dan başlar.
 *
 * **Neden gerekli:** girdi anlık görüntüsü frame başına BİR kez okunur ve
 * aynı nesne o frame'in bütün adımlarına verilir. Seviye tetikli eylemler
 * (`fire`, `dash` — kendi bekleme süreleri var) için bu doğrudur. Ama KENAR
 * tetikli bir eylem (bir kez basıldığında bir kez tetiklenmeli) aynı anlık
 * görüntüyle N adım boyunca `true` kalır ve yakalanan tek basış N kez
 * tetiklenir. Düşük FPS'te N büyür, yani hata kare hızına bağlı olur.
 *
 * Bugün böyle bir eylem tüketilmiyor; `stepIndex` bu tuzağı GÖRÜNÜR kılar:
 * kenar tetikli bir eylem eklendiğinde `stepIndex === 0` koşulu yazılır.
 */
export type SimulationStep = (stepMs: number, stepIndex: number) => void;

export interface SimulationClockConfig {
  /** Sabit simülasyon adımı (ms). */
  readonly fixedStepMs: number;
  /** Tek render frame'inde yapılabilecek azami sabit adım sayısı. */
  readonly maxStepsPerFrame: number;
}

/** Bir frame'de gerçekten ne olduğunu anlatan ölçüm — teşhis ve test için. */
export interface SimulationClockFrame {
  /** Tam `fixedStepMs` uzunluğunda kaç adım koşuldu. */
  readonly fixedSteps: number;
  /** Sabit adıma sığmayan artık dilim simüle edildi mi (60 FPS üstü tepki). */
  readonly partialStepMs: number;
  /** Catch-up sınırına takılıp ATILAN simülasyon zamanı (ms). */
  readonly droppedMs: number;
}

/**
 * Render frame süresini simülasyon adımlarına çeviren biriktirici.
 *
 * Sahne içinde satır satır yaşıyordu; ayrı bir nesne olarak üç şey kazanır:
 *
 * 1. **Test edilebilirlik.** Adımlama politikası (catch-up, artık dilim,
 *    üst sınır) Phaser sahnesi kurmadan sürülebilir.
 * 2. **Tek sahiplik.** Biriktirici ve simülasyon saati aynı yerde durur;
 *    sahne yalnızca "adımı koş" geri çağrısını verir.
 * 3. **Politikanın açık olması.** `SimulationClockFrame` her frame'de neyin
 *    atıldığını rapor eder — determinizm çalışması (render'dan tamamen
 *    bağımsız simülasyon) buradan ölçülür.
 *
 * **Bilinen sınır — henüz TAM deterministik değil:** `partialStepMs`, 60 FPS
 * üstünde girdi tepkisini bir sonraki sabit adıma bırakmamak için değişken
 * uzunlukta bir adım koşar. Bu, aynı girdinin farklı render hızlarında farklı
 * simülasyon sonucu vermesi demektir. Kaldırmak oynanış hissini değiştirir
 * (16 ms'e kadar girdi gecikmesi) ve render tarafında interpolasyon ister;
 * ayrı bir tur olarak planlıdır. Şimdilik politika en azından TEK yerde,
 * adlandırılmış ve ölçülüyor.
 */
export class SimulationClock {
  private accumulatorMs = 0;
  private simulationTimeMs = 0;
  private stepIndexInFrame = 0;

  constructor(private readonly config: SimulationClockConfig) {}

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

  /**
   * Gerçek frame süresini adımlara böler ve her adım için `step`i çağırır.
   *
   * @param realDeltaMs Ölçülmüş frame süresi. Sonlu olmayan/negatif değer
   *   çağıran tarafından temizlenmiş olmalıdır.
   */
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

    // 60 FPS üstünde input/dash tepkisini bir sonraki sabit adıma bırakma;
    // kalan küçük dilimi de simüle et. Düşük FPS'te üstteki döngü zaten tam
    // sabit adımlarla gerçek frame süresini geri kazanmış olur.
    let partialStepMs = 0;
    if (fixedSteps === 0 && this.accumulatorMs > 0) {
      partialStepMs = this.accumulatorMs;
      this.runStep(partialStepMs, step);
      this.accumulatorMs = 0;
    }

    // Sekme/uygulama dönüşü gibi çok büyük delta'lar sınırsız catch-up'a
    // dönüşmesin: biriken fazlalık ATILIR ve bu açıkça raporlanır.
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
