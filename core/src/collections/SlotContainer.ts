/** Bir slottaki yığın. */
export interface Slot<TItem> {
  item: TItem;
  count: number;
}

export interface SlotContainerOptions<TItem> {
  /** Slot sayısı. */
  size: number;
  /**
   * İki öğe aynı yığına girebilir mi? Verilmezse referans/değer eşitliği
   * (`===`) kullanılır.
   */
  isSameItem?: (a: TItem, b: TItem) => boolean;
  /**
   * Öğe başına azami yığın boyutu. Verilmezse 1 — yani yığınlama KAPALI.
   * Varsayılanın 1 olması bilinçli: yığınlanamayan bir öğeyi (benzersiz
   * silah, karakter) yanlışlıkla üst üste bindirmek, sessizce kopya üreten
   * bir hata biçimidir.
   */
  maxStack?: (item: TItem) => number;
}

/**
 * Slot tabanlı kap — envanter, hotbar, ekipman ızgarası, tarif girdisi.
 *
 * Sabit sayıda slot, slot başına isteğe bağlı yığınlama, taşıma ve takas.
 * Öğenin NE olduğunu bilmez: eşitlik ve yığın sınırı çağırandan gelir.
 *
 * Tüm mutasyonlar "ya hepsi ya hiçbiri" değildir — `add` KISMİ ekleme yapar ve
 * eklenemeyeni döndürür. Bu bilinçli: dolmakta olan bir envantere 64 öğe
 * eklerken "hiçbiri sığmadı" demek, oyuncunun 60'ını alabilecekken hiçbirini
 * alamaması demektir.
 */
export class SlotContainer<TItem> {
  private readonly slots: (Slot<TItem> | null)[];
  private readonly isSameItem: (a: TItem, b: TItem) => boolean;
  private readonly maxStack: (item: TItem) => number;

  constructor(options: SlotContainerOptions<TItem>) {
    if (!Number.isInteger(options.size) || options.size <= 0) {
      throw new Error(`SlotContainer: size pozitif tam sayı olmalı (gelen: ${options.size})`);
    }
    this.slots = new Array<Slot<TItem> | null>(options.size).fill(null);
    this.isSameItem = options.isSameItem ?? ((a, b) => a === b);
    this.maxStack = options.maxStack ?? (() => 1);
  }

  get size(): number {
    return this.slots.length;
  }

  /** Dolu slot sayısı. */
  get usedSlots(): number {
    return this.slots.reduce((n, slot) => (slot ? n + 1 : n), 0);
  }

  get isFull(): boolean {
    return this.usedSlots === this.slots.length;
  }

  /**
   * Slot içeriği (kopya); boş ya da geçersiz indekste `null`.
   *
   * Aralık dışı ve kesirli indeks de `null` döner — dizi erişimi `undefined`
   * verse bile sözleşme `null`dur.
   */
  get(index: number): Slot<TItem> | null {
    if (!this.inRange(index)) return null;
    const slot = this.slots[index];
    return slot ? { ...slot } : null;
  }

  /** Bir öğeden toplam kaç adet var? */
  countOf(item: TItem): number {
    let total = 0;
    for (const slot of this.slots) {
      if (slot && this.isSameItem(slot.item, item)) total += slot.count;
    }
    return total;
  }

  /**
   * Öğe ekler. Önce mevcut yığınları doldurur, sonra boş slotlara yerleşir.
   *
   * @returns Eklenemeyen adet (0 = hepsi girdi).
   */
  add(item: TItem, count = 1): number {
    let remaining = Math.max(0, Math.floor(count));
    if (remaining === 0) return 0;

    const stackLimit = Math.max(1, Math.floor(this.maxStack(item)));

    // Önce mevcut yığınlar: yeni slot açmadan önce boşluğu kullanmak,
    // envanteri gereksiz yere parçalamamak için.
    if (stackLimit > 1) {
      for (const slot of this.slots) {
        if (remaining === 0) break;
        if (!slot || !this.isSameItem(slot.item, item)) continue;
        const space = stackLimit - slot.count;
        if (space <= 0) continue;
        const moved = Math.min(space, remaining);
        slot.count += moved;
        remaining -= moved;
      }
    }

    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      if (this.slots[i]) continue;
      const moved = Math.min(stackLimit, remaining);
      this.slots[i] = { item, count: moved };
      remaining -= moved;
    }

    return remaining;
  }

  /**
   * Öğeden `count` adet çıkarır.
   *
   * @returns Gerçekten çıkarılan adet.
   */
  remove(item: TItem, count = 1): number {
    let wanted = Math.max(0, Math.floor(count));
    let removed = 0;

    for (let i = this.slots.length - 1; i >= 0 && wanted > 0; i--) {
      const slot = this.slots[i];
      if (!slot || !this.isSameItem(slot.item, item)) continue;

      const taken = Math.min(slot.count, wanted);
      slot.count -= taken;
      wanted -= taken;
      removed += taken;
      if (slot.count === 0) this.slots[i] = null;
    }

    return removed;
  }

  /**
   * Slotu boşaltır ve içeriğini döner. Geçersiz indekste `null` döner ve
   * HİÇBİR ŞEY yazmaz.
   *
   * Eskiden sınır kontrolü `inRange` yerine elle yapılıyor ve tam sayılığı
   * atlıyordu: `clearSlot(1.5)` diziye `"1.5"` adlı bir özellik ekliyor,
   * `fill()` onu temizleyemiyordu.
   */
  clearSlot(index: number): Slot<TItem> | null {
    if (!this.inRange(index)) return null;
    const slot = this.slots[index] ?? null;
    this.slots[index] = null;
    return slot;
  }

  /**
   * İki slotu takas eder — sürükle-bırak.
   *
   * Aynı öğe ve yığınlanabiliyorsa takas yerine BİRLEŞTİRİR: kullanıcı
   * beklentisi budur, iki yarım yığını üst üste bırakmak onları takas etmek
   * değil toplamaktır.
   *
   * @returns İşlem yapıldıysa `true`; geçersiz indekste `false`.
   */
  swap(a: number, b: number): boolean {
    if (a === b) return this.inRange(a);
    if (!this.inRange(a) || !this.inRange(b)) return false;

    const from = this.slots[a];
    const to = this.slots[b];

    if (from && to && this.isSameItem(from.item, to.item)) {
      const limit = Math.max(1, Math.floor(this.maxStack(to.item)));
      const space = limit - to.count;
      if (space > 0) {
        const moved = Math.min(space, from.count);
        to.count += moved;
        from.count -= moved;
        if (from.count === 0) this.slots[a] = null;
        return true;
      }
    }

    this.slots[a] = to;
    this.slots[b] = from;
    return true;
  }

  /** Tüm slotları boşaltır. */
  clear(): void {
    this.slots.fill(null);
  }

  /** Dolu slotların (indeks, içerik) listesi — kopya. */
  entries(): Array<{ index: number; slot: Slot<TItem> }> {
    const result: Array<{ index: number; slot: Slot<TItem> }> = [];
    this.slots.forEach((slot, index) => {
      if (slot) result.push({ index, slot: { ...slot } });
    });
    return result;
  }

  private inRange(index: number): boolean {
    return Number.isInteger(index) && index >= 0 && index < this.slots.length;
  }
}
