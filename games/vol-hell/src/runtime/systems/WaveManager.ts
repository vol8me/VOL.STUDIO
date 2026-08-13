import { waveConfig } from '@/config/wave';

export interface WaveManagerCallbacks {
  /** Bir dalga başladığında (koşu başındaki 1. dalga dahil). */
  onWaveStart?: (wave: number) => void;
  /**
   * Bir dalga tamamlandığında — Aşama 2'de DÜKKAN EKRANI buna bağlanacak.
   * Son dalganın bitiminde de çağrılır (ardından `onRunComplete`).
   */
  onWaveEnd?: (wave: number) => void;
  /** Elite dalgası başladığında — Elite implementasyonu Aşama 3'te gelecek. */
  onEliteWave?: (wave: number) => void;
  /** Boss dalgası başladığında — Boss implementasyonu Aşama 3'te gelecek. */
  onBossWave?: (wave: number) => void;
  /** Tüm dalgalar bittiğinde. */
  onRunComplete?: () => void;
}

/**
 * Koşu yapısı — sabit süreli dalgalar ve dalga geçiş olayları.
 *
 * Zorluk eğrisi (`DifficultyCalculator`) zamana bağlı kalmaya devam eder;
 * dalga kavramı onun ÜSTÜNE biner: hangi düşman türlerinin havuzda olduğunu,
 * dükkânın ne zaman açılacağını ve Elite/Boss'un ne zaman çağrılacağını
 * dalga numarası belirler.
 *
 * Bu sınıf UI bilmez: yalnızca doğru anda olay tetikler.
 */
export class WaveManager {
  private wave = 0;
  private elapsedInWaveMs = 0;
  private complete = false;

  constructor(private readonly callbacks: WaveManagerCallbacks = {}) {}

  /** Koşuyu ilk dalgadan başlatır. `create()` içinde çağrılır. */
  start(): void {
    this.wave = 0;
    this.elapsedInWaveMs = 0;
    this.complete = false;
    this.beginWave(1);
  }

  /** Aktif dalga numarası (1 tabanlı). Koşu başlamadıysa 0. */
  getCurrentWave(): number {
    return this.wave;
  }

  /** Aktif dalgada kalan süre (ms). */
  getRemainingMs(): number {
    if (this.complete) return 0;
    return Math.max(0, waveConfig.waveDurationMs - this.elapsedInWaveMs);
  }

  /** Aktif dalganın ilerlemesi (0-1). */
  getProgress(): number {
    if (this.complete) return 1;
    return Math.min(1, this.elapsedInWaveMs / waveConfig.waveDurationMs);
  }

  /** Tüm dalgalar tamamlandı mı? */
  isRunComplete(): boolean {
    return this.complete;
  }

  update(deltaMs: number): void {
    if (this.complete || this.wave === 0) return;

    this.elapsedInWaveMs += deltaMs;
    // Bir frame birden fazla dalgayı geçebilecek kadar uzun olabilir
    // (sekme arka planda kaldıysa); while ile hepsi işlenir.
    while (!this.complete && this.elapsedInWaveMs >= waveConfig.waveDurationMs) {
      this.elapsedInWaveMs -= waveConfig.waveDurationMs;
      this.finishWave();
    }
  }

  private finishWave(): void {
    const finished = this.wave;
    this.callbacks.onWaveEnd?.(finished);

    if (finished >= waveConfig.totalWaves) {
      this.complete = true;
      this.elapsedInWaveMs = 0;
      this.callbacks.onRunComplete?.();
      return;
    }

    this.beginWave(finished + 1);
  }

  private beginWave(wave: number): void {
    this.wave = wave;
    this.callbacks.onWaveStart?.(wave);

    if (wave === waveConfig.eliteWave) {
      this.callbacks.onEliteWave?.(wave);
    }
    if (wave === waveConfig.bossWave) {
      this.callbacks.onBossWave?.(wave);
    }
  }
}
