/**
 * Zamana bağlı öğeleri sıralı biriktirir ve zamanı gelince bırakır. Uzak oyuncuların olayları
 * (atış, patlama, ölüm) pozlarla aynı geriye dönük süreyle çizilir; böylece namlu ağzı
 * parlaması tankın göründüğü yerle, ölüm tankın kaybolduğu anla örtüşür. Kuyruk sınırlıdır:
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
    while (at > this.head && this.times[at - 1] > timeMs) at--;
    this.times.splice(at, 0, timeMs);
    this.items.splice(at, 0, item);
    if (this.size > this.capacity) this.head++;
    this.compact();
  }

  /** Zamanı `untilMs`e gelmiş öğeleri sırayla `out`a taşır. */
  release(untilMs: number, out: T[]): T[] {
    while (this.head < this.items.length && this.times[this.head] <= untilMs) {
      out.push(this.items[this.head]);
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

/**
 * Sunucunun benzetim saatini (`WorldState.timeMs`) SDK'nın sunucu-saati eksenine bağlar. Pozlar
 * SDK'da yama kodlama anıyla (`clock.lastServerTime`) damgalanır; olaylar ise benzetim saatiyle
 * gelir. Yama başına bir (benzetim, sunucu) çifti gözlenir ve fark üstel ortalamayla izlenir.
 */
export class ServerTimeline {
  private offset: number | undefined;

  constructor(private readonly smoothing = 0.2) {
    if (!(smoothing > 0 && smoothing <= 1))
      throw new RangeError('Yumuşatma (0, 1] aralığında olmalı.');
  }

  /** Sunucu ekseni henüz bilinmiyorsa `false`. */
  get known(): boolean {
    return this.offset !== undefined;
  }

  observe(simMs: number, serverMs: number): void {
    if (!Number.isFinite(simMs) || !Number.isFinite(serverMs) || serverMs <= 0) return;
    const sample = serverMs - simMs;
    this.offset =
      this.offset === undefined ? sample : this.offset + (sample - this.offset) * this.smoothing;
  }

  /** Benzetim saatindeki bir anın sunucu eksenindeki karşılığı; ilk gözlemden önce `undefined`. */
  toServer(simMs: number): number | undefined {
    return this.offset === undefined ? undefined : simMs + this.offset;
  }
}
