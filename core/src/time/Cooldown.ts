import { finiteOr, requireFinite } from '../math/numeric';

/**
 * Delta-time ile sürülen bekleme. Oyun döngüsüne BAĞLIDIR: `update()`
 * çağrılmadıkça süre akmaz, yani duraklatılmış oyunda cooldown ilerlemez.
 */
export class Cooldown {
  private remainingMs = 0;
  private durationMs: number;

  /** Negatif 0'a kelepçelenir; sonlu değilse REDDEDİLİR — `NaN` beklemeyi sonsuz yapardı. */
  constructor(durationMs: number) {
    this.durationMs = Math.max(0, requireFinite(durationMs, 'Cooldown durationMs'));
  }

  /** Bekleme bitti mi? */
  isReady(): boolean {
    return this.remainingMs <= 0;
  }

  /** Kalan süre (ms); hazırsa 0. */
  getRemaining(): number {
    return Math.max(0, this.remainingMs);
  }

  /** [0,1]; süre 0 ise her zaman 1. */
  getProgress(): number {
    if (this.durationMs <= 0) return 1;
    return 1 - Math.max(0, this.remainingMs) / this.durationMs;
  }

  /**
   * Hazırsa başlatır ve `true` döner. Kontrol ile tetikleme AYRI adım olsaydı
   * araya giren bir çağrı beklemeyi ikisinin arasında tüketebilirdi.
   */
  tryTrigger(): boolean {
    if (!this.isReady()) return false;
    this.remainingMs = this.durationMs;
    return true;
  }

  /** Hazır olup olmadığına BAKMADAN beklemeyi başlatır. */
  trigger(): void {
    this.remainingMs = this.durationMs;
  }

  /** Beklemeyi anında bitirir. */
  reset(): void {
    this.remainingMs = 0;
  }

  /** Devam eden bekleme KELEPÇELENİR: süre kısalınca eski uzun bekleme çekilmez. */
  setDuration(durationMs: number): void {
    this.durationMs = Math.max(0, requireFinite(durationMs, 'Cooldown durationMs'));
    this.remainingMs = Math.min(this.remainingMs, this.durationMs);
  }

  getDuration(): number {
    return this.durationMs;
  }

  /** Sonlu olmayan `deltaMs` YOKSAYILIR; tek bozuk kare beklemeyi `NaN` yapmamalı. */
  update(deltaMs: number): void {
    const delta = finiteOr(deltaMs, 0);
    if (delta <= 0 || this.remainingMs <= 0) return;
    this.remainingMs -= delta;
  }
}
