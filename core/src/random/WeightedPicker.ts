import type { Random } from './random';

export interface WeightedEntry<T> {
  value: T;
  /** Seçilme ağırlığı. Pozitif olmalı; 0 ve altı havuza HİÇ girmez. */
  weight: number;
}

/**
 * Ağırlıklı rastgele seçim — düşüş tablosu, üretim havuzu, olay dağılımı.
 *
 * Deterministik `Random` ile çalışır: aynı tohum aynı seçim dizisini üretir,
 * yani kaydedilmiş bir çalıştırma tekrar oynatılabilir.
 *
 * Kümülatif ağırlıklar BİR KEZ hesaplanır ve seçim ikili aramayla O(log n)
 * yapılır; her seçimde diziyi baştan toplamak, büyük tablolarda seçim başına
 * doğrusal maliyet demekti.
 */
export class WeightedPicker<T> {
  private readonly values: T[] = [];
  private readonly cumulative: number[] = [];
  private total = 0;

  constructor(entries: readonly WeightedEntry<T>[]) {
    for (const entry of entries) {
      // Sıfır/negatif/NaN ağırlık sessizce atlanır: "bu seçenek şu an kapalı"
      // demenin doğal yolu ağırlığı sıfırlamaktır ve çağıranı filtrelemeye
      // zorlamak gereksizdir.
      if (!(entry.weight > 0) || !Number.isFinite(entry.weight)) continue;
      this.total += entry.weight;
      this.values.push(entry.value);
      this.cumulative.push(this.total);
    }
  }

  /** Havuzda seçilebilir eleman var mı? */
  get isEmpty(): boolean {
    return this.values.length === 0;
  }

  /** Seçilebilir eleman sayısı. */
  get size(): number {
    return this.values.length;
  }

  /** Ağırlıklara göre bir eleman seçer. Havuz boşsa `undefined`. */
  pick(random: Random): T | undefined {
    if (this.isEmpty) return undefined;

    const roll = random.next() * this.total;

    // İkili arama: roll'dan büyük İLK kümülatif eşiği bul.
    let lo = 0;
    let hi = this.cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.cumulative[mid] <= roll) lo = mid + 1;
      else hi = mid;
    }
    return this.values[lo];
  }

  /**
   * TEKRARSIZ `count` eleman seçer (ağırlıklı örnekleme, iadesiz).
   *
   * Havuzda yeterli eleman yoksa olabildiğince çok döner — çağıranı, kaç
   * eleman kaldığını önceden hesaplamaya zorlamamak için.
   */
  pickUnique(random: Random, count: number): T[] {
    const remaining = this.values.map((value, i) => ({
      value,
      weight: this.cumulative[i] - (i > 0 ? this.cumulative[i - 1] : 0),
    }));

    const result: T[] = [];
    const wanted = Math.min(Math.max(0, Math.floor(count)), remaining.length);

    for (let picked = 0; picked < wanted; picked++) {
      const total = remaining.reduce((sum, entry) => sum + entry.weight, 0);
      if (total <= 0) break;

      let roll = random.next() * total;
      let index = remaining.length - 1;
      for (let i = 0; i < remaining.length; i++) {
        roll -= remaining[i].weight;
        if (roll < 0) {
          index = i;
          break;
        }
      }

      result.push(remaining[index].value);
      remaining.splice(index, 1);
    }

    return result;
  }
}
