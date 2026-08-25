import { saturatingAddSigned } from '@/runtime/utils/numeric';

/**
 * Ability'lere özel, koşu boyunca birikeen yükseltmeler.
 *
 * Bunlar dört temel stat'ın (`damage/speed/health/fireRate`) dışında kalan
 * MEKANİĞE ÖZEL parametrelerdir — zincirin sıçrama sayısı, kulenin hasarı gibi.
 * `StatBlock`'a zorla sokulmazlar; ama aynı desenle çalışırlar: taban değer
 * ability tanımında, üzerine binen artışlar burada.
 *
 * Koşu seviyesinde tutulurlar: "+1 sıçrama" kartı, zincir ability'si henüz
 * alınmamışken de satın alınabilir ve sonradan alınan ability'ye uygulanır.
 */
export type AbilityUpgradeKey =
  /** Zincir yıldırımın ek sıçrama sayısı. */
  | 'chainBounces'
  /** Kulenin atış başına ek hasarı. */
  | 'turretDamage'
  /** Ateş alanının ek süresi (ms). */
  | 'fireZoneDurationMs'
  /** Çoklu atışın ek mermi sayısı. */
  | 'multiShotProjectiles';

export class AbilityUpgrades {
  private readonly values = new Map<AbilityUpgradeKey, number>();

  /** Yükseltmeyi birikimli olarak ekler. Negatif değer de geçerlidir (takas kartları). */
  add(key: AbilityUpgradeKey, amount: number): void {
    if (!Number.isFinite(amount) || amount === 0) return;
    const current = this.values.get(key) ?? 0;
    this.values.set(key, saturatingAddSigned(current, amount));
  }

  /** İşlem geri alma sırasında önceki değeri doygunluk kaybı olmadan yükler. */
  restore(key: AbilityUpgradeKey, value: number): void {
    const safeValue = saturatingAddSigned(0, value);
    if (safeValue === 0) {
      this.values.delete(key);
      return;
    }
    this.values.set(key, safeValue);
  }

  /** Birikmiş yükseltme miktarı (hiç eklenmediyse 0). */
  get(key: AbilityUpgradeKey): number {
    return this.values.get(key) ?? 0;
  }

  /** Yeni koşu — tüm yükseltmeler sıfırlanır. */
  reset(): void {
    this.values.clear();
  }
}
