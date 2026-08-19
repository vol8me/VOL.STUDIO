/**
 * Tipli kaynak cüzdanı — altın, enerji, mana, araştırma puanı, bilet.
 *
 * **Kaynak kümesi bu modülde TANIMLI DEĞİLDİR.** `TResource` zorunlu bir tip
 * parametresidir; hangi kaynakların var olduğu tüketicinin kararıdır
 * (`new ResourcePool<'gold' | 'energy'>({ gold: 100, energy: 3 })`).
 * `StatBlock<TStat>` ile aynı sözleşme: mekanizma CORE'da, sözlük oyunda.
 *
 * vol-hell'in `RunEconomy`si bu desenin Flux/Spark'a özel hâliydi.
 */

/** Çok kaynaklı bir maliyet: kaynak → miktar. */
export type ResourceCost<TResource extends string> = Partial<Record<TResource, number>>;

export class ResourcePool<TResource extends string> {
  private readonly amounts: Record<TResource, number>;
  private readonly caps: Partial<Record<TResource, number>>;

  /**
   * @param initial Başlangıç miktarları — kaynak kümesini de tanımlar.
   * @param caps Üst sınırlar (opsiyonel). Sınırı olmayan kaynak sınırsızdır.
   */
  constructor(initial: Record<TResource, number>, caps: Partial<Record<TResource, number>> = {}) {
    this.amounts = { ...initial };
    this.caps = { ...caps };
    for (const key of Object.keys(this.amounts) as TResource[]) {
      this.amounts[key] = this.clamp(key, this.amounts[key]);
    }
  }

  get(resource: TResource): number {
    return this.amounts[resource] ?? 0;
  }

  /** Anlık tüm miktarlar — HUD/kayıt için. */
  snapshot(): Record<TResource, number> {
    return { ...this.amounts };
  }

  /** Miktar ekler (negatif verilmez; düşürmek için `spend`). Sınır varsa kelepçelenir. */
  add(resource: TResource, amount: number): void {
    if (amount <= 0) return;
    this.amounts[resource] = this.clamp(resource, this.get(resource) + amount);
  }

  /** Maliyetin TAMAMI karşılanabiliyor mu? */
  canAfford(cost: ResourceCost<TResource>): boolean {
    for (const [resource, amount] of Object.entries(cost) as [TResource, number][]) {
      if (amount > 0 && this.get(resource) < amount) return false;
    }
    return true;
  }

  /**
   * Maliyeti düşer. **Ya hepsi ya hiçbiri:** tek bir kaynak yetmiyorsa
   * HİÇBİRİ düşülmez ve `false` döner.
   *
   * Kısmi harcama, "altını gitti ama enerjisi yetmediği için kule kurulamadı"
   * gibi geri alınamaz bir duruma yol açardı; kontrol ve düşme tek çağrıda
   * atomik olarak yapılır.
   */
  spend(cost: ResourceCost<TResource>): boolean {
    if (!this.canAfford(cost)) return false;
    for (const [resource, amount] of Object.entries(cost) as [TResource, number][]) {
      if (amount > 0) this.amounts[resource] = this.get(resource) - amount;
    }
    return true;
  }

  /** Miktarı doğrudan belirler (kayıt yükleme). Sınır varsa kelepçelenir. */
  set(resource: TResource, amount: number): void {
    this.amounts[resource] = this.clamp(resource, amount);
  }

  /** Üst sınırı değiştirir; mevcut miktar aşıyorsa kelepçelenir. */
  setCap(resource: TResource, cap: number | undefined): void {
    if (cap === undefined) {
      delete this.caps[resource];
      return;
    }
    this.caps[resource] = cap;
    this.amounts[resource] = this.clamp(resource, this.get(resource));
  }

  getCap(resource: TResource): number | undefined {
    return this.caps[resource];
  }

  private clamp(resource: TResource, value: number): number {
    const cap = this.caps[resource];
    const floored = Math.max(0, value);
    return cap === undefined ? floored : Math.min(cap, floored);
  }
}
