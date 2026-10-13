/**
 * Sabit boyutlu halka: son `capacity` ölçümün ortalaması ve yüzdelikleri. Ölçüm hattı kare başına tahsis
 * yapmaz; yüzdelik yalnız okunurken (HUD yenilemesinde) sıralanır.
 */
export class RingStats {
  private readonly values: Float64Array;
  private filled = 0;
  private cursor = 0;

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1)
      throw new RangeError('RingStats kapasitesi pozitif tamsayı olmalı');
    this.values = new Float64Array(capacity);
  }

  get count(): number {
    return this.filled;
  }

  push(value: number): void {
    this.values[this.cursor] = value;
    this.cursor = (this.cursor + 1) % this.capacity;
    if (this.filled < this.capacity) this.filled++;
  }

  mean(): number {
    if (this.filled === 0) return 0;
    let sum = 0;
    for (let index = 0; index < this.filled; index++) sum += this.values[index];
    return sum / this.filled;
  }

  /** En yakın sıra yüzdeliği; `fraction` 0..1. Boş halkada 0. */
  percentile(fraction: number): number {
    if (this.filled === 0) return 0;
    const sorted = this.values.slice(0, this.filled).sort();
    const rank = Math.min(this.filled - 1, Math.max(0, Math.ceil(fraction * this.filled) - 1));
    return sorted[rank];
  }

  clear(): void {
    this.filled = 0;
    this.cursor = 0;
  }
}
