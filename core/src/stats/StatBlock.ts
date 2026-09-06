/**
 * Stat/modifier motoru: taban değerlerin üzerine kaynak bazlı (kart, zorluk,
 * arketip) modifier'lar biner.
 *
 * Stat kümesi bu modülde TANIMLI DEĞİLDİR — `TStat` zorunlu tip parametresidir
 * ve hangi stat'ların olduğu tüketicinin kararıdır. Motorun `'damage'` gibi bir
 * kelime bilmesi CORE'u tek bir oyunun sözlüğüne bağlardı.
 */

/**
 * Özyinelemeli `getValue` çağrısını yakalayan yığın. Modül seviyesinde TEK:
 * farklı `TStat` ile parametrelenmiş örnekler de paylaşır, karşılaştırma
 * referans üzerinden yapılır.
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
 * hesaplanan bir getter — zamanla ya da salınımla değişen ölçeklemeler için
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
 * ```
 * sonuç = (taban + Σ add) × Π multiply
 * ```
 *
 * **Sıra bir konvansiyon değil GEREKLİLİKTİR.** Çarpan önce uygulansaydı sonuç
 * modifier'ların ekleniş sırasına bağlı olurdu — `(taban × 2) + 10` ile
 * `(taban + 10) × 2` farklıdır — ve aynı iki etki kazanılma sırasına göre
 * farklı sonuç verirdi.
 *
 * **Bir `id` her stat için EN FAZLA bir modifier taşır**; aynı `id` + `stat`
 * ikilisi ikinci kez eklenirse öncekinin yerine geçer (idempotent güncelleme).
 * `removeModifier(id)` o id'nin tüm stat'lardaki modifier'larını kaldırır.
 *
 * **Kelepçeleme yoktur:** yeterince güçlü negatif modifier sonucu sıfırın
 * altına indirir. Anlamlı alt sınır tüketicinin sorumluluğudur.
 *
 * `TStat` ZORUNLUDUR; varsayılan stat kümesi yoktur.
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
