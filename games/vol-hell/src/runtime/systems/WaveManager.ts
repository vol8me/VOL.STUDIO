import { waveConfig } from '@/config/wave';

export interface WaveManagerCallbacks {
  /** Bir dalga başladığında (koşu başındaki 1. dalga dahil). */
  onWaveStart?: (wave: number) => void;
  /**
   * Bir dalga tamamlandığında — DÜKKAN EKRANI buna bağlanır.
   * Son dalganın bitiminde de çağrılır (ardından `onRunComplete`).
   */
  onWaveEnd?: (wave: number) => void;
  /**
   * Normal (elite/boss olmayan) bir dalganın süresi dolduğunda, dükkan
   * açılmadan ÖNCE çağrılır: sahnede kalan düşman/mermi/Flux temizlenir.
   * Zorunlu-engel dalgalarında (10, 20) ÇAĞRILMAZ.
   */
  onWaveClear?: (wave: number) => void;
  /** Elite dalgası başladığında. */
  onEliteWave?: (wave: number) => void;
  /** Boss dalgası başladığında. */
  onBossWave?: (wave: number) => void;
  /** Tüm dalgalar bittiğinde. */
  onRunComplete?: () => void;
  /**
   * Zorunlu-engel dalgalarında (elite/boss) engelin hâlâ hayatta olup
   * olmadığını bildirir. `true` dönerse süre dolsa bile dalga BİTMEZ.
   * Verilmezse engel yok sayılır (dalga saf zamanla ilerler).
   */
  isBlockerAlive?: () => boolean;
}

/** Bu dalga bir zorunlu-engel (elite/boss) dalgası mı? */
export function isBlockerWave(wave: number): boolean {
  return wave === waveConfig.eliteWave || wave === waveConfig.bossWave;
}

/**
 * Koşu yapısı — dalgalar, dalga geçiş olayları ve zorunlu-engel mantığı.
 *
 * İki farklı dalga bitiş kuralı vardır:
 *
 * - **Normal dalga (1-9, 11-19):** süre dolunca biter. Sahnede kalan her şey
 *   `onWaveClear` ile temizlenir — oyuncu ceza almaz, sonraki dalga temiz
 *   başlar.
 * - **Zorunlu-engel dalgası (10 = Elite, 20 = Boss):** süre dolsa bile engel
 *   hayattaysa dalga BİTMEZ. Sayaç sıfırda durur, dalga uzar; engel öldüğü
 *   anda `notifyBlockerDefeated()` ile dalga o an biter. Bu dalgalarda hiçbir
 *   şey temizlenmez.
 *
 * Bu sınıf UI bilmez: yalnızca doğru anda olay tetikler.
 */
export class WaveManager {
  /** Tek frame'de atılabilecek maksimum dalga adımı — `waveConfig.maxStepsPerFrame`. */
  private static readonly MAX_STEPS_PER_FRAME = waveConfig.maxStepsPerFrame;
  private wave = 0;
  private elapsedInWaveMs = 0;
  private complete = false;
  /** Zorunlu-engel dalgasında süre doldu ama engel hâlâ ayakta. */
  private blockedAtTimeUp = false;

  constructor(private readonly callbacks: WaveManagerCallbacks = {}) {}

  /** Koşuyu ilk dalgadan başlatır. `create()` içinde çağrılır. */
  start(): void {
    this.wave = 0;
    this.elapsedInWaveMs = 0;
    this.complete = false;
    this.blockedAtTimeUp = false;
    this.beginWave(1);
  }

  /** Aktif dalga numarası (1 tabanlı). Koşu başlamadıysa 0. */
  getCurrentWave(): number {
    return this.wave;
  }

  /** Aktif dalgada kalan süre (ms). Engel beklenirken 0'da durur. */
  getRemainingMs(): number {
    if (this.complete) return 0;
    return Math.max(0, waveConfig.waveDurationMs - this.elapsedInWaveMs);
  }

  /** Aktif dalganın ilerlemesi (0-1). */
  getProgress(): number {
    if (this.complete) return 1;
    return Math.min(1, this.elapsedInWaveMs / waveConfig.waveDurationMs);
  }

  /**
   * Süre doldu ama dalga bir engelin ölmesini bekliyor mu?
   * HUD bunu okuyup "Elite'i yen" göstergesini açar.
   */
  isAwaitingBlocker(): boolean {
    return this.blockedAtTimeUp;
  }

  /** Aktif dalga bir zorunlu-engel dalgası mı? */
  isBlockerWave(): boolean {
    return !this.complete && isBlockerWave(this.wave);
  }

  /** Tüm dalgalar tamamlandı mı? */
  isRunComplete(): boolean {
    return this.complete;
  }

  /**
   * Elite/Boss öldü — engel kalktı, dalga O AN biter.
   *
   * Zorunlu-engel dalgalarında engel ölür ölmez bir sonraki dalgaya geçilir;
   * bu hem süre dolduktan sonra beklerken hem erken devirme durumunda
   * geçerlidir. Engel dalgalarında sahnede kalan düşmanlar TEMİZLENMEZ
   * (`onWaveClear` çağrılmaz).
   */
  notifyBlockerDefeated(): void {
    if (this.complete || this.wave === 0 || !isBlockerWave(this.wave)) return;
    this.blockedAtTimeUp = false;
    this.elapsedInWaveMs = 0;
    this.finishWave();
  }

  update(deltaMs: number): void {
    if (this.complete || this.wave === 0) return;

    // Engel bekleniyor: sayaç ilerlemez, dalga yalnızca engel ölünce biter.
    if (this.blockedAtTimeUp) return;

    this.elapsedInWaveMs += deltaMs;
    // Bir frame birden fazla dalgayı geçebilecek kadar uzun olabilir
    // (sekme arka planda kaldıysa); while ile hepsi işlenir.
    let steps = 0;
    while (!this.complete && !this.blockedAtTimeUp && steps < WaveManager.MAX_STEPS_PER_FRAME) {
      if (this.elapsedInWaveMs < waveConfig.waveDurationMs) break;

      if (this.shouldWaitForBlocker()) {
        // Sayaç tam sınırda dondurulur: `getRemainingMs()` 0, ilerleme %100.
        this.elapsedInWaveMs = waveConfig.waveDurationMs;
        this.blockedAtTimeUp = true;
        break;
      }

      this.elapsedInWaveMs -= waveConfig.waveDurationMs;
      this.finishWave();
      steps++;
    }

    // Uzun frame veya yanlış dalga süresi: sonsuz döngüye girmemek için
    // kalan zamanı güncel dalga süresine modüler indir ve ertesi frame devam et.
    if (steps >= WaveManager.MAX_STEPS_PER_FRAME && !this.complete && !this.blockedAtTimeUp) {
      if (waveConfig.waveDurationMs > 0) {
        this.elapsedInWaveMs %= waveConfig.waveDurationMs;
      } else {
        this.elapsedInWaveMs = 0;
      }
      console.warn(
        "[WaveManager] Uzun frame/config hatası: tek frame'de maksimum dalga adımı aşıldı.",
      );
    }
  }

  /** Süre dolduğunda dalga bir engelin ölmesini beklemeli mi? */
  private shouldWaitForBlocker(): boolean {
    if (!isBlockerWave(this.wave)) return false;
    return this.callbacks.isBlockerAlive?.() === true;
  }

  private finishWave(): void {
    const finished = this.wave;

    // Sahne temizliği dükkandan ÖNCE: oyuncu dükkanı temiz bir arenanın
    // üstünde açar. Engel dalgalarında temizlik yapılmaz — orada zaten
    // beklenen tek şey engelin ölmesiydi.
    if (!isBlockerWave(finished)) {
      this.callbacks.onWaveClear?.(finished);
    }

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
    this.blockedAtTimeUp = false;
    this.callbacks.onWaveStart?.(wave);

    if (wave === waveConfig.eliteWave) {
      this.callbacks.onEliteWave?.(wave);
    }
    if (wave === waveConfig.bossWave) {
      this.callbacks.onBossWave?.(wave);
    }
  }
}
