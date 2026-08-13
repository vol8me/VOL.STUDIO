import { economyConfig } from '@/config/economy';

export interface RunEconomyCallbacks {
  /** Spark eşiği aşıldığında — Aşama 2'de kart seçim ekranı buna bağlanacak. */
  onLevelUp?: (level: number) => void;
}

/**
 * Koşu ekonomisi — Flux ve Spark sayaçları, Spark seviye eşikleri.
 *
 * Bu katman yalnızca SAYAÇ ve EŞİK mantığını tutar; Flux'un yerden
 * toplanması `FluxPickupManager`'ın, seviye atlamada ne gösterileceği
 * Aşama 2'nin işidir.
 */
export class RunEconomy {
  private flux = 0;
  private spark = 0;
  private level = 1;
  /** Bir sonraki seviye için gereken toplam Spark. */
  private nextThreshold: number = economyConfig.spark.baseThreshold;

  constructor(private readonly callbacks: RunEconomyCallbacks = {}) {}

  getFlux(): number {
    return this.flux;
  }

  getSpark(): number {
    return this.spark;
  }

  getLevel(): number {
    return this.level;
  }

  /** Mevcut seviye içinde biriken Spark — XP barının dolum değeri. */
  getSparkInLevel(): number {
    return this.spark - this.thresholdForLevel(this.level - 1);
  }

  /** Verilen seviyeyi tamamlamak için gereken Spark — XP barının max değeri. */
  getLevelSpan(level: number = this.level): number {
    return this.thresholdForLevel(level) - this.thresholdForLevel(level - 1);
  }

  /** Toplanan Flux'u sayaca ekler. Negatif değer yok sayılır. */
  addFlux(amount: number): void {
    if (amount <= 0) return;
    this.flux += amount;
  }

  /**
   * Flux harcar; yeterli bakiye yoksa false döner ve hiçbir şey değişmez.
   * (Dükkân Aşama 2'de bunu kullanacak.)
   */
  spendFlux(amount: number): boolean {
    if (amount <= 0 || this.flux < amount) return false;
    this.flux -= amount;
    return true;
  }

  /**
   * Düşman öldürmekten Spark kazandırır ve eşik aşıldıysa seviye atlatır.
   * Tek eklemede birden fazla eşik aşılabilir; her seviye ayrı bildirilir.
   */
  addSpark(amount: number): void {
    if (amount <= 0) return;
    this.spark += amount;

    while (this.spark >= this.nextThreshold) {
      this.level += 1;
      this.nextThreshold = this.thresholdForLevel(this.level);
      this.callbacks.onLevelUp?.(this.level);
    }
  }

  /** Yeni koşu — tüm sayaçlar başa döner. */
  reset(): void {
    this.flux = 0;
    this.spark = 0;
    this.level = 1;
    this.nextThreshold = economyConfig.spark.baseThreshold;
  }

  /**
   * `level` seviyesini tamamlamak için gereken kümülatif Spark.
   * Eşik her seviyede geometrik büyür; toplam, geometrik serinin toplamıdır.
   */
  private thresholdForLevel(level: number): number {
    if (level <= 0) return 0;
    const { baseThreshold, thresholdGrowth } = economyConfig.spark;
    let total = 0;
    let step = baseThreshold;
    for (let i = 0; i < level; i++) {
      total += step;
      step *= thresholdGrowth;
    }
    return Math.round(total);
  }
}
