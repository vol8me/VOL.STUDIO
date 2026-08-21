import { finiteOr, requireFinite } from '../math/numeric';

/**
 * Delta-time ile sürülen bekleme süresi — ateş temposu, yetenek cooldown'ı,
 * yeniden doğma gecikmesi.
 *
 * vol-hell'de bu desen (`lastUse`, `elapsed`, `if (now - last < cd) return`)
 * en az altı sınıfta elle tekrarlanıyordu ve her biri duraklamayı biraz farklı
 * ele alıyordu. `Scheduler` gibi oyun döngüsüne bağlıdır: `update()`
 * çağrılmadıkça süre akmaz, yani duraklatılmış bir oyunda cooldown ilerlemez.
 */
export class Cooldown {
  private remainingMs = 0;
  private durationMs: number;

  /**
   * `durationMs` negatifse 0'a kelepçelenir (her zaman hazır); sonlu değilse
   * REDDEDİLİR — `new Cooldown(NaN)` sessizce kabul edilirse `trigger()`
   * sonrası bekleme sonsuza dek bitmez ve neden bitmediği hiçbir yerde
   * görünmez.
   */
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

  /** Tamamlanma oranı [0, 1] — HUD göstergeleri için. Süre 0 ise her zaman 1. */
  getProgress(): number {
    if (this.durationMs <= 0) return 1;
    return 1 - Math.max(0, this.remainingMs) / this.durationMs;
  }

  /**
   * Hazırsa beklemeyi başlatır ve `true` döner; hazır değilse hiçbir şey
   * yapmadan `false` döner.
   *
   * "Kontrol et, sonra tetikle" iki ayrı adım olsaydı araya giren bir çağrı
   * ikisinin arasında beklemeyi tüketebilirdi; tek çağrı bunu imkânsız kılar.
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

  /**
   * Süreyi değiştirir. Devam eden bekleme KELEPÇELENİR: süre kısaldığında
   * çağıran, eski uzun beklemeyi sonuna kadar çekmez.
   */
  setDuration(durationMs: number): void {
    this.durationMs = Math.max(0, requireFinite(durationMs, 'Cooldown durationMs'));
    this.remainingMs = Math.min(this.remainingMs, this.durationMs);
  }

  getDuration(): number {
    return this.durationMs;
  }

  /**
   * Zamanı ilerletir. Sonlu olmayan `deltaMs` YOKSAYILIR: tek bozuk bir kare
   * yüzünden beklemenin kalıcı olarak `NaN`e düşmesi, hatayı kaynağından çok
   * uzakta görünür kılardı.
   */
  update(deltaMs: number): void {
    const delta = finiteOr(deltaMs, 0);
    if (delta <= 0 || this.remainingMs <= 0) return;
    this.remainingMs -= delta;
  }
}
