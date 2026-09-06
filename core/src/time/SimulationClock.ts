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

/**
 * Sabit adıma sığmayan ARTIK dilim ne olsun?
 *
 * Bu, saatin tek sözleşme kararıdır ve iki değeri de meşrudur:
 *
 * - `'simulate'` — artık dilim değişken uzunlukta bir adım olarak koşulur.
 *   60 FPS üstünde girdi tepkisi bir sonraki sabit adıma ertelenmez, yani
 *   oynanış daha canlı hisseder. Bedeli: aynı girdi farklı render hızlarında
 *   FARKLI simülasyon sonucu verir — bu kip strict deterministik DEĞİLDİR.
 *
 * - `'defer'` — artık dilim biriktiricide bekler; simülasyon YALNIZ tam
 *   `fixedStepMs` katlarıyla ilerler. Aynı girdi ve aynı toplam süre, frame
 *   temposundan bağımsız olarak aynı sonucu verir. Bedeli: bir sabit adıma
 *   kadar girdi gecikmesi, ve render'ın akıcı görünmesi için
 *   `getInterpolationAlpha()` ile ara değer hesaplanması gerekir.
 *
 * Determinizm bir ölçüm ya da tekrar oynatma gerektiriyorsa `'defer'`,
 * doğrudan oynanan bir sahne için `'simulate'` seçilir.
 */
export type PartialStepPolicy = 'simulate' | 'defer';

export interface SimulationClockConfig {
  /** Sabit simülasyon adımı (ms). */
  readonly fixedStepMs: number;
  /** Tek render frame'inde yapılabilecek azami sabit adım sayısı. */
  readonly maxStepsPerFrame: number;
  /**
   * Artık dilim politikası. Varsayılan `'simulate'` — oynanış hissi korunur.
   * Strict deterministik davranış için `'defer'` verilir.
   */
  readonly partialStep?: PartialStepPolicy;
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
 * **Determinizm bir SEÇİMDİR, kaza değil.** Artık dilimin ne olacağı
 * `partialStep` ile açıkça verilir (bkz. `PartialStepPolicy`). Varsayılan
 * `'simulate'` oynanış tepkisini korur ama render hızına duyarlıdır;
 * `'defer'` strict sabit adım verir ve render'ın akıcı kalması için
 * `getInterpolationAlpha()` sunar. Politika tek yerde, adlandırılmış,
 * ölçülüyor ve tüketici tarafından seçiliyor.
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

    // `'simulate'` kipinde 60 FPS üstünde input/dash tepkisi bir sonraki sabit
    // adıma bırakılmaz; kalan küçük dilim de simüle edilir. Düşük FPS'te
    // üstteki döngü zaten tam sabit adımlarla gerçek frame süresini geri
    // kazanmış olur. `'defer'` kipinde artık biriktiricide bekler.
    let partialStepMs = 0;
    if (this.partialStepPolicy === 'simulate' && fixedSteps === 0 && this.accumulatorMs > 0) {
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
