/**
 * Stat/modifier motoru — oyuncu ve düşmanların ORTAK istatistik katmanı.
 *
 * Taban değerlerin üzerine kaynak (kart, zorluk eğrisi, arketip) bazlı
 * modifier'lar binerek sonuç değeri verir. Her entity tipi için ayrı bir
 * ölçekleme mantığı yazmak yerine tek motor kullanılır.
 */

/**
 * Modifier'ların etkileyebildiği dört temel stat.
 *
 * - `damage` — vuruş başına hasar.
 * - `speed` — hareket hızı (piksel/saniye).
 * - `health` — maksimum can.
 * - `fireRate` — saldırılar arası bekleme (COOLDOWN, ms). **Düşük değer =
 *   hızlı saldırı.** "Ateş hızı %25 artsın" isteyen bir kaynak
 *   `{ type: 'multiply', value: 0.8 }` verir; `1.25` vermek ateşi yavaşlatır.
 */
export type StatKey = 'damage' | 'speed' | 'health' | 'fireRate';

/** Tüm stat anahtarları — iterasyon ve doğrulama için. */
export const STAT_KEYS: readonly StatKey[] = ['damage', 'speed', 'health', 'fireRate'];

/**
 * Özyinelemeli getValue çağrısını tespit etmek için çağrı yığını.
 *
 * Modül-seviyesinde TEK yığın — farklı `TStat` ile parametrelenmiş
 * `StatBlock` örnekleri de aynı yığını paylaşır (yalnızca referans/kimlik
 * karşılaştırması yapılır, `stat` alanı hangi somut union'dan geldiğine
 * bakılmaksızın string olarak tutulur).
 */
interface ComputationFrame {
  block: unknown;
  stat: string;
}

const computationStack: ComputationFrame[] = [];

/** Modifier uygulama biçimi. */
export type StatModifierType = 'add' | 'multiply';

/**
 * Modifier değeri. Sabit bir sayı olabilir ya da her okumada yeniden
 * hesaplanan bir getter — zamanla/dalgayla değişen ölçeklemeler için
 * modifier'ı her frame kaldırıp yeniden eklemeye gerek kalmaz.
 */
export type StatModifierValue = number | (() => number);

export interface StatModifier<TStat extends string = StatKey> {
  /** Kaynağı izlemek için kimlik (kart id'si, 'difficulty', 'archetype' vb.). */
  id: string;
  stat: TStat;
  type: StatModifierType;
  value: StatModifierValue;
  /**
   * Verilirse modifier KOŞULLUDUR: her stat okumasında değerlendirilir,
   * `false` döndüğü sürece hesaba katılmaz. Verilmezse kalıcıdır.
   */
  condition?: () => boolean;
}

/** Taban stat değerleri — dört stat da zorunludur. */
export type StatBaseValues = Record<StatKey, number>;

/**
 * Taban değer + modifier listesinden sonuç stat üreten blok.
 *
 * **Hesaplama sırası (RPG standardı):** önce tüm aktif `add` modifier'ları
 * taban değere toplanır, ardından tüm aktif `multiply` modifier'ları bu
 * ara sonuçla çarpılır:
 *
 * ```
 * sonuç = (taban + Σ add) × Π multiply
 * ```
 *
 * Böylece sıralama kaynakların ekleniş sırasından bağımsızdır.
 *
 * **Kimlik sözleşmesi:** bir `id` her stat için EN FAZLA bir modifier
 * taşıyabilir; aynı `id` + `stat` ikilisiyle ikinci kez eklenen modifier
 * öncekinin yerine geçer (dinamik güncellemeler için idempotent). Aynı `id`
 * farklı stat'lara ayrı modifier ekleyebilir; `removeModifier(id)` bunların
 * hepsini birden kaldırır.
 *
 * **Kelepçeleme yoktur:** yeterince güçlü negatif modifier sonucu sıfırın
 * altına indirebilir. Anlamlı alt sınır entity'nin sorumluluğundadır.
 *
 * **Jenerik stat kümesi:** mekanizma stat adlarından bağımsızdır — `TStat`
 * verilmezse VOL.HELL'in dört stat'ı (`StatKey`) varsayılan olarak kullanılır,
 * bu yüzden mevcut `new StatBlock(baseStats)` çağrıları değişmeden çalışır.
 * Başka bir oyun/tüketici kendi stat kümesini
 * `new StatBlock<'armor' | 'range'>({ armor: 5, range: 120 })` şeklinde verebilir.
 */
export class StatBlock<TStat extends string = StatKey> {
  private readonly base: Record<TStat, number>;
  private readonly modifiers: StatModifier<TStat>[] = [];

  constructor(baseStats: Record<TStat, number>) {
    this.base = { ...baseStats };
  }

  /** Modifier uygulanmamış taban değer. */
  getBase(stat: TStat): number {
    return this.base[stat];
  }

  /** Taban değeri değiştirir — modifier'lar korunur. */
  setBase(stat: TStat, value: number): void {
    this.base[stat] = value;
  }

  /** Modifier ekler; aynı `id` + `stat` ikilisi varsa üzerine yazar. */
  addModifier(modifier: StatModifier<TStat>): void {
    const index = this.modifiers.findIndex((m) => m.id === modifier.id && m.stat === modifier.stat);
    if (index >= 0) {
      this.modifiers[index] = modifier;
      return;
    }
    this.modifiers.push(modifier);
  }

  /** Verilen kimliğe ait TÜM modifier'ları kaldırır. Kaldırılan sayısını döner. */
  removeModifier(id: string): number {
    let removed = 0;
    for (let i = this.modifiers.length - 1; i >= 0; i--) {
      if (this.modifiers[i].id !== id) continue;
      this.modifiers.splice(i, 1);
      removed++;
    }
    return removed;
  }

  /** Verilen kimlikte en az bir modifier var mı? */
  hasModifier(id: string): boolean {
    return this.modifiers.some((m) => m.id === id);
  }

  /** Tüm modifier'ları kaldırır — taban değerler korunur. */
  clearModifiers(): void {
    this.modifiers.length = 0;
  }

  /** Kayıtlı modifier'lar (koşulu şu an false olanlar dahil). */
  getModifiers(): readonly StatModifier<TStat>[] {
    return this.modifiers;
  }

  /** Taban değer + o an aktif olan tüm modifier'lar uygulanmış sonuç. */
  getValue(stat: TStat): number {
    // Koşul closure'ları başka stat'lara getValue() çağrısı yaparsa ve bir
    // döngü oluşursa sonsuz özyinelemeyi kırmak için taban değer döner.
    const existing = computationStack.find((frame) => frame.block === this && frame.stat === stat);
    if (existing) return this.base[stat];

    computationStack.push({ block: this, stat });
    try {
      let additive = 0;
      let multiplier = 1;

      for (const modifier of this.modifiers) {
        if (modifier.stat !== stat) continue;
        if (modifier.condition && !modifier.condition()) continue;

        const value = typeof modifier.value === 'function' ? modifier.value() : modifier.value;
        if (modifier.type === 'add') {
          additive += value;
        } else {
          multiplier *= value;
        }
      }

      return (this.base[stat] + additive) * multiplier;
    } finally {
      const top = computationStack.pop();
      if (top?.block !== this || top?.stat !== stat) {
        throw new Error('StatBlock: computationStack dengesi bozuldu');
      }
    }
  }

  /** Tüm stat'ların anlık sonuç değerleri — HUD/diagnostic için. */
  snapshot(): Record<TStat, number> {
    const result = {} as Record<TStat, number>;
    for (const stat of Object.keys(this.base) as TStat[]) {
      result[stat] = this.getValue(stat);
    }
    return result;
  }
}
