/**
 * Stat/modifier motoru — bir oyunun tüm varlıkları (oyuncu, düşman, yapı)
 * için ORTAK istatistik katmanı.
 *
 * Taban değerlerin üzerine kaynak (kart, zorluk eğrisi, arketip) bazlı
 * modifier'lar binerek sonuç değeri verir. Her entity tipi için ayrı bir
 * ölçekleme mantığı yazmak yerine tek motor kullanılır.
 *
 * **Stat kümesi bu modülde TANIMLI DEĞİLDİR.** `TStat` zorunlu bir tip
 * parametresidir; hangi stat'ların var olduğu tüketicinin kararıdır
 * (`new StatBlock<'armor' | 'range'>({ armor: 5, range: 120 })`). Motorun
 * `'damage'`/`'health'` gibi bir kelime bilmesi, CORE'u tek bir oyunun
 * sözlüğüne bağlar — bu yüzden varsayılan bir stat kümesi BİLİNÇLİ OLARAK
 * sunulmaz. VOL.HELL'in kendi kümesi için bkz.
 * `games/vol-hell/src/config/stats.ts`.
 */

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

export interface StatModifier<TStat extends string> {
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
 * **Jenerik stat kümesi:** mekanizma stat adlarından tamamen bağımsızdır ve
 * `TStat` ZORUNLUDUR — varsayılan bir küme yoktur. Bir tüketici kendi
 * sözlüğünü verir (`new StatBlock<'armor' | 'range'>({ armor: 5, range: 120 })`);
 * çoğu durumda tip parametresi taban obje literalinden çıkarsanır, ama
 * paylaşılan bir union kullanılıyorsa açıkça yazmak (`StatBlock<HellStat>`)
 * yanlış bir stat adının derleme zamanında yakalanmasını garanti eder.
 */
export class StatBlock<TStat extends string> {
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
