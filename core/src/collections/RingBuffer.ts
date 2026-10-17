/**
 * Sabit kapasiteli halka tampon — son N öğeyi tutar, eskisini düşürür.
 *
 * Dizi + `shift()` yerine kullanılır: `shift()` her çağrıda kalan tüm
 * elemanları kaydırır (O(n)); halka tamponda ekleme ve düşürme O(1)'dir.
 * Kare başına çalışan bir kayan pencerede (FPS geçmişi, son N hasar,
 * replay kaydı) bu fark ölçülebilir hâle gelir.
 */
export class RingBuffer<T> {
  private readonly items: (T | undefined)[];
  private start = 0;
  private count = 0;

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error(`RingBuffer: kapasite pozitif tam sayı olmalı (gelen: ${capacity})`);
    }
    this.items = new Array<T | undefined>(capacity);
  }

  get size(): number {
    return this.count;
  }

  get isFull(): boolean {
    return this.count === this.capacity;
  }

  /**
   * Öğe ekler. Doluysa EN ESKİSİ düşer ve döndürülür — düşen öğeyi bilmek,
   * kayan bir toplam/ortalama tutan çağıran için gereklidir (aksi halde
   * pencereden çıkanı çıkarmak için tüm tamponu gezmek gerekir).
   */
  push(item: T): T | undefined {
    let evicted: T | undefined;

    if (this.isFull) {
      evicted = this.items[this.start];
      this.items[this.start] = item;
      this.start = (this.start + 1) % this.capacity;
    } else {
      this.items[(this.start + this.count) % this.capacity] = item;
      this.count++;
    }

    return evicted;
  }

  /** Baştan (en eski) sıfır indeksli erişim; aralık dışıysa `undefined`. */
  at(index: number): T | undefined {
    if (index < 0 || index >= this.count) return undefined;
    return this.items[(this.start + index) % this.capacity];
  }

  /** En son eklenen öğe. */
  get last(): T | undefined {
    return this.at(this.count - 1);
  }

  /** En eski öğe. */
  get first(): T | undefined {
    return this.at(0);
  }

  /** Eskiden yeniye doğru gezinir. */
  *[Symbol.iterator](): IterableIterator<T> {
    for (let i = 0; i < this.count; i++) {
      yield this.items[(this.start + i) % this.capacity] as T;
    }
  }

  /** Eskiden yeniye sıralı KOPYA — saklanabilir. */
  toArray(): T[] {
    return [...this];
  }

  clear(): void {
    this.items.fill(undefined);
    this.start = 0;
    this.count = 0;
  }
}
