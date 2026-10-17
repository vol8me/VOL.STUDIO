import { requiredAt, requiredNumberAt } from '../collections/requiredAt';
/**
 * Zamana bağlı verileri sıralı biriktirir ve zamanı gelince bırakır. Eşit zamanlar ekleme
 * sırasını korur; saat dışarıdan verilir ve kuyruk kendi zamanlayıcısını kurmaz. Kuyruk sınırlıdır:
 * boşaltılmayan (duran sekme) kuyruk belleği büyütmez, en eski öğe atılır.
 */
export class EventQueue<T> {
  private readonly times: number[] = [];
  private readonly items: T[] = [];
  private head = 0;

  constructor(private readonly capacity = 512) {
    if (!Number.isSafeInteger(capacity) || capacity < 1)
      throw new RangeError('Kuyruk kapasitesi pozitif tam sayı olmalı.');
  }

  get size(): number {
    return this.items.length - this.head;
  }

  /** Öğeyi zamanına göre yerleştirir; sıralı gelen (olağan) durumda sona eklenir. */
  push(timeMs: number, item: T): void {
    if (!Number.isFinite(timeMs)) throw new RangeError('Olay zamanı sonlu olmalı.');
    let at = this.items.length;
    while (at > this.head && requiredNumberAt(this.times, at - 1) > timeMs) at--;
    this.times.splice(at, 0, timeMs);
    this.items.splice(at, 0, item);
    if (this.size > this.capacity) this.head++;
    this.compact();
  }

  /** Zamanı `untilMs`e gelmiş öğeleri sırayla `out`a taşır. */
  release(untilMs: number, out: T[]): T[] {
    while (this.head < this.items.length && requiredNumberAt(this.times, this.head) <= untilMs) {
      out.push(requiredAt(this.items, this.head));
      this.head++;
    }
    this.compact();
    return out;
  }

  clear(): void {
    this.times.length = 0;
    this.items.length = 0;
    this.head = 0;
  }

  /** Öndeki boşluk büyüyünce dizileri kısaltır; bırakma başına ayırma yapmaz. */
  private compact(): void {
    if (this.head === 0 || (this.head < 64 && this.head < this.items.length)) return;
    this.times.splice(0, this.head);
    this.items.splice(0, this.head);
    this.head = 0;
  }
}
