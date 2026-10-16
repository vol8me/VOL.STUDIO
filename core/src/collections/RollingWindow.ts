/**
 * Son N sonlu sayının istatistiği. Ekleme sabit tamponu kullanır; uçlar yalnız
 * eski uç düştükten sonra okununca, yüzdelikler de istendiğinde hesaplanır.
 */
export class RollingWindow {
  private readonly values: Float64Array;
  private next = 0;
  private filled = 0;
  private total = 0;
  private correction = 0;
  private minValue = 0;
  private maxValue = 0;
  private extremesDirty = false;
  private sorted: Float64Array | null = null;

  constructor(capacity = 60) {
    if (!Number.isSafeInteger(capacity) || capacity < 1)
      throw new RangeError('Örnek penceresi kapasitesi pozitif güvenli tamsayı olmalı');
    this.values = new Float64Array(capacity);
  }

  /** Sonlu olmayan akış örneği pencereye girmez ve eski örneği düşürmez. */
  push(value: number): void {
    if (!Number.isFinite(value)) return;
    if (this.filled === this.values.length) {
      const removed = this.values[this.next];
      this.addToTotal(-removed);
      if (removed === this.minValue || removed === this.maxValue) this.extremesDirty = true;
    } else {
      this.filled++;
    }
    this.values[this.next] = value;
    this.next = (this.next + 1) % this.values.length;
    this.addToTotal(value);
    // Taşan ara toplam sonraki normal örnekleri kalıcı olarak kirletmez.
    if (!Number.isFinite(this.total) || !Number.isFinite(this.correction)) this.rebuildTotal();
    if (this.filled === 1) {
      this.minValue = this.maxValue = value;
      this.extremesDirty = false;
    } else if (!this.extremesDirty) {
      this.minValue = Math.min(this.minValue, value);
      this.maxValue = Math.max(this.maxValue, value);
    }
    this.sorted = null;
  }

  clear(): void {
    this.next = this.filled = 0;
    this.total = this.correction = 0;
    this.minValue = this.maxValue = 0;
    this.extremesDirty = false;
    this.sorted = null;
  }

  get count(): number {
    return this.filled;
  }

  get average(): number {
    if (this.filled === 0) return 0;
    const sum = this.total + this.correction;
    if (Number.isFinite(sum)) return sum / this.filled;
    // Örnekler sonlu olsa da toplam taşabilir; ağırlıklı ortalama aynı sınırı aşmaz.
    let mean = 0;
    for (let index = 0; index < this.filled; index++)
      mean = mean * (index / (index + 1)) + this.values[index] / (index + 1);
    return mean;
  }

  get min(): number {
    this.refreshExtremes();
    return this.minValue;
  }

  get max(): number {
    this.refreshExtremes();
    return this.maxValue;
  }

  /** Sıralı örneğin floor(N × oran) indisi; oran 1 son örnektir, boş pencere 0 verir. */
  percentile(fraction: number): number {
    if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1)
      throw new RangeError('Yüzdelik oranı sonlu ve 0–1 aralığında olmalı');
    if (this.filled === 0) return 0;
    this.sorted ??= this.values.slice(0, this.filled).sort();
    return this.sorted[Math.min(this.filled - 1, Math.floor(this.filled * fraction))];
  }

  private addToTotal(value: number): void {
    const next = this.total + value;
    // Büyük örnek düşerken yanında yutulmuş küçük örnek geri kazanılır.
    this.correction +=
      Math.abs(this.total) >= Math.abs(value)
        ? this.total - next + value
        : value - next + this.total;
    this.total = next;
  }

  private rebuildTotal(): void {
    this.total = this.correction = 0;
    for (let index = 0; index < this.filled; index++) this.addToTotal(this.values[index]);
  }

  private refreshExtremes(): void {
    if (!this.extremesDirty) return;
    let min = Infinity;
    let max = -Infinity;
    for (let index = 0; index < this.filled; index++) {
      min = Math.min(min, this.values[index]);
      max = Math.max(max, this.values[index]);
    }
    this.minValue = min;
    this.maxValue = max;
    this.extremesDirty = false;
  }
}
