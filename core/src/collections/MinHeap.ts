import { requiredNumberAt } from './requiredAt';
/**
 * Sayısal anahtarlı ikili yığın (min-heap) — en küçük anahtarlı değeri O(log n)
 * verir.
 *
 * Değerler `number` olarak tutulur; graf algoritmalarında düğüm İNDEKSİ
 * saklanır ve nesne referansı gerekmez. Bu bilinçlidir: tipli dizilerle
 * çalışan bir arama döngüsünde nesne kutulama, algoritmanın kendisinden pahalı
 * hâle gelir.
 *
 * `findPath` (A*) ve `FlowField` (Dijkstra) bu TEK uygulamayı paylaşır;
 * öncelik kuyruğu davranışı ikisinde de aynıdır.
 */
export class MinHeap {
  private readonly values: number[] = [];
  private readonly keys: number[] = [];

  get size(): number {
    return this.values.length;
  }

  push(value: number, key: number): void {
    this.values.push(value);
    this.keys.push(key);

    let i = this.values.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const parentKey = requiredNumberAt(this.keys, parent);
      if (parentKey <= key) break;
      // Sabit öğeyi her seviyede takas etmek yerine üst öğeyi boşluğa kaydır.
      this.values[i] = requiredNumberAt(this.values, parent);
      this.keys[i] = parentKey;
      i = parent;
    }
    this.values[i] = value;
    this.keys[i] = key;
  }

  /** En küçük anahtarlı değer; yığın boşsa `undefined`. */
  pop(): number | undefined {
    if (this.values.length === 0) return undefined;

    const top = requiredNumberAt(this.values, 0);
    const lastIndex = this.values.length - 1;
    const lastValue = requiredNumberAt(this.values, lastIndex);
    const lastKey = requiredNumberAt(this.keys, lastIndex);
    this.values.pop();
    this.keys.pop();

    if (this.values.length > 0) {
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        let smallestKey = lastKey;
        if (left < this.keys.length) {
          const leftKey = requiredNumberAt(this.keys, left);
          if (leftKey < smallestKey) {
            smallest = left;
            smallestKey = leftKey;
          }
        }
        if (right < this.keys.length) {
          const rightKey = requiredNumberAt(this.keys, right);
          if (rightKey < smallestKey) {
            smallest = right;
            smallestKey = rightKey;
          }
        }
        if (smallest === i) break;
        this.values[i] = requiredNumberAt(this.values, smallest);
        this.keys[i] = smallestKey;
        i = smallest;
      }
      this.values[i] = lastValue;
      this.keys[i] = lastKey;
    }

    return top;
  }

  /** En küçük anahtarlı değerin ANAHTARI; boşsa `undefined`. */
  peekKey(): number | undefined {
    return this.keys.length > 0 ? this.keys[0] : undefined;
  }

  clear(): void {
    this.values.length = 0;
    this.keys.length = 0;
  }
}
