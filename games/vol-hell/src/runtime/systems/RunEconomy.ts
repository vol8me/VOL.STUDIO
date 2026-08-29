import { economyConfig } from '@/config/economy';
import { clampFinite, saturatingAdd } from '@/runtime/utils/numeric';

export interface RunEconomyCallbacks {
  /** Spark eşiği aşıldığında — `CardScreens` kart seçim ekranını buna bağlar. */
  onLevelUp?: (level: number) => void;
}

/**
 * Koşu ekonomisi — Flux ve Spark sayaçları, Spark seviye eşikleri.
 *
 * Bu katman yalnızca SAYAÇ ve EŞİK mantığını tutar; Flux'un yerden
 * toplanması `FluxPickupManager`'ın, seviye atlamada ne gösterileceği
 * `CardScreens`'in işidir.
 */
export class RunEconomy {
  private flux = 0;
  private readonly fluxListeners = new Set<(flux: number) => void>();
  private spark = 0;
  private level = economyConfig.spark.startLevel;
  /** Bir sonraki seviye için gereken toplam Spark. */
  private nextThreshold: number = economyConfig.spark.baseThreshold;

  constructor(private readonly callbacks: RunEconomyCallbacks = {}) {}

  getFlux(): number {
    return this.flux;
  }

  /** Flux değişimlerini izleyen UI/telemetri yüzeyleri için abonelik kapısı. */
  onFluxChange(listener: (flux: number) => void): () => void {
    this.fluxListeners.add(listener);
    return () => this.fluxListeners.delete(listener);
  }

  getSpark(): number {
    return this.spark;
  }

  getLevel(): number {
    return this.level;
  }

  /** Mevcut seviye içinde biriken Spark — XP barının dolum değeri. */
  getSparkInLevel(): number {
    return Math.max(0, this.spark - this.thresholdForLevel(this.level - 1));
  }

  /**
   * Verilen seviyeyi tamamlamak için gereken Spark — XP barının max değeri.
   *
   * **Asla 0 dönmez.** Geometrik eşik yüksek seviyelerde `MAX_SAFE_INTEGER`a
   * doyar; doyum noktasında `threshold(level)` ile `threshold(level - 1)`
   * EŞİTLENİR ve fark 0 olur. XPBar bu değeri bölen olarak kullandığı için
   * sonuç `Infinity`/`NaN` dolum oranına dönüşür ve bar sessizce bozulur.
   * Doyumda taban eşiğe düşülür: bar dolu görünür, sayısal olarak geçerli kalır.
   */
  getLevelSpan(level: number = this.level): number {
    const span = this.thresholdForLevel(level) - this.thresholdForLevel(level - 1);
    if (Number.isFinite(span) && span > 0) return span;
    return economyConfig.spark.baseThreshold;
  }

  /** Toplanan Flux'u sayaca ekler. Negatif, NaN veya Infinity değer yok sayılır. */
  addFlux(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const next = saturatingAdd(this.flux, amount);
    if (next === this.flux) return;
    this.flux = next;
    this.notifyFluxChange();
  }

  /**
   * Flux harcar; yeterli bakiye yoksa false döner ve hiçbir şey değişmez.
   * (Dükkân alımı ve reroll bunu kullanır.)
   */
  spendFlux(amount: number): boolean {
    if (!Number.isFinite(amount) || amount <= 0 || this.flux < amount) return false;
    this.flux -= amount;
    this.notifyFluxChange();
    return true;
  }

  /**
   * Tek seferde işlenebilecek maksimum level-up adımı. Config hatası veya
   * uç değerler (Infinity/NaN) durumunda sonsuz döngüyü kırar.
   */
  private static readonly MAX_LEVEL_UPS_PER_ADD = 100;

  /**
   * Düşman öldürmekten Spark kazandırır ve eşik aşıldıysa seviye atlatır.
   * Tek eklemede birden fazla eşik aşılabilir; her seviye ayrı bildirilir.
   */
  addSpark(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.spark = saturatingAdd(this.spark, amount);

    let steps = 0;
    while (this.spark >= this.nextThreshold && steps < RunEconomy.MAX_LEVEL_UPS_PER_ADD) {
      this.level += 1;
      this.nextThreshold = this.thresholdForLevel(this.level);
      this.callbacks.onLevelUp?.(this.level);
      steps++;
    }

    if (steps >= RunEconomy.MAX_LEVEL_UPS_PER_ADD) {
      console.warn('[RunEconomy] Spark level-up adım sınırı aşıldı, kalan Spark:', this.spark);
    }
  }

  /** Yeni koşu — tüm sayaçlar başa döner. */
  reset(): void {
    const hadFlux = this.flux !== 0;
    this.flux = 0;
    this.spark = 0;
    this.level = economyConfig.spark.startLevel;
    this.nextThreshold = economyConfig.spark.baseThreshold;
    if (hadFlux) this.notifyFluxChange();
  }

  /**
   * `level` seviyesini tamamlamak için gereken kümülatif Spark.
   * Eşik her seviyede geometrik büyür; toplam, geometrik serinin toplamıdır.
   */
  private thresholdForLevel(level: number): number {
    if (!Number.isFinite(level) || level <= 0) return 0;
    level = Math.min(100_000, Math.floor(level));
    const { baseThreshold } = economyConfig.spark;
    const thresholdGrowth: number = economyConfig.spark.thresholdGrowth;
    if (!(baseThreshold > 0) || !(thresholdGrowth > 0)) return 0;

    // Geometrik seri kapalı formu: yüksek Spark/config değerlerinde her
    // çağrıda 0..level döngüsü kurmak yerine O(1) hesaplanır.
    const total =
      thresholdGrowth === 1
        ? baseThreshold * level
        : (baseThreshold * (Math.pow(thresholdGrowth, level) - 1)) / (thresholdGrowth - 1);
    return Math.round(clampFinite(total, 0, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER));
  }

  private notifyFluxChange(): void {
    for (const listener of this.fluxListeners) {
      try {
        listener(this.flux);
      } catch (error) {
        // Bir UI aboneliği ekonomi işlemini bozmasın; sonraki frame tekrar
        // sorgulandığında gerçek bakiye yine tek kaynaktan okunur.
        console.warn('[RunEconomy] Flux dinleyicisi hata verdi:', error);
      }
    }
  }
}
