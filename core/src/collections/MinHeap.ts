/**
 * Sayısal anahtarlı ikili yığın (min-heap) — en küçük anahtarlı değeri O(log n)
 * verir.
 *
 * Değerler `number` olarak tutulur; graf algoritmalarında düğüm İNDEKSİ
 * saklanır ve nesne referansı gerekmez. Bu bilinçlidir: tipli dizilerle
 * çalışan bir arama döngüsünde nesne kutulama, algoritmanın kendisinden pahalı
 * hâle gelir.
 *
 * `findPath` (A*) ve `FlowField` (Dijkstra) bir dönem KENDİ kopyalarını
 * taşıyordu — aynı yapının iki bağımsız uygulaması, ikisi de elle senkron
 * tutulmak zorundaydı.
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
      if (this.keys[parent] <= this.keys[i]) break;
      this.swap(parent, i);
      i = parent;
    }
  }

  /** En küçük anahtarlı değer; yığın boşsa `undefined`. */
  pop(): number | undefined {
    if (this.values.length === 0) return undefined;

    const top = this.values[0];
    const lastValue = this.values.pop()!;
    const lastKey = this.keys.pop()!;

    if (this.values.length > 0) {
      this.values[0] = lastValue;
      this.keys[0] = lastKey;

      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.keys.length && this.keys[left] < this.keys[smallest]) smallest = left;
        if (right < this.keys.length && this.keys[right] < this.keys[smallest]) smallest = right;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
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

  private swap(a: number, b: number): void {
    [this.values[a], this.values[b]] = [this.values[b], this.values[a]];
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
  }
}
