export interface PointerSample {
  readonly timeMs: number;
  readonly x: number;
  readonly y: number;
}

export interface PathDelta {
  readonly dx: number;
  readonly dy: number;
  /** Tüketilen zaman dilimi; sıfırsa bu karede yeni yol yoktur. */
  readonly spanMs: number;
}

const EMPTY: PathDelta = { dx: 0, dy: 0, spanMs: 0 };

/**
 * İşaretçi yolunu ZAMANDA tutar (D1).
 *
 * Hareketi olay anında uygulamak, kareyi olay zamanlamasına bağlar: olay
 * gelmeyen kare sıfır ilerler, olay gelen kare sıçrar (bugünkü kodda ölçüldü:
 * varyasyon katsayısı 1,68). Burada yol örnekler arasında DOĞRUSAL kabul edilir
 * ve her kare kendi zaman dilimine düşen parçayı alır. Tahmin (extrapolation)
 * YOKTUR: son örneğin ötesine geçilmez, o yüzden gecikme bir örnekle sınırlıdır.
 */
export class PointerPath {
  private samples: PointerSample[] = [];
  private consumed: PointerSample = { timeMs: 0, x: 0, y: 0 };

  reset(sample: PointerSample): void {
    this.samples = [sample];
    this.consumed = sample;
  }

  append(sample: PointerSample): void {
    if (this.samples.length === 0) {
      this.reset(sample);
      return;
    }
    const last = this.samples[this.samples.length - 1];
    // Zamanda geriye giden ya da aynı ana düşen örnek yolu bozar; son örnek güncellenir.
    if (sample.timeMs <= last.timeMs) {
      this.samples[this.samples.length - 1] = { ...sample, timeMs: last.timeMs };
      return;
    }
    this.samples.push(sample);
  }

  get lastTimeMs(): number {
    return this.samples.length > 0 ? this.samples[this.samples.length - 1].timeMs : 0;
  }

  get hasPath(): boolean {
    return this.samples.length > 0;
  }

  /**
   * `until` anına kadar olan yer değiştirmeyi verir ve o ana kadarını tüketir.
   *
   * Zaman damgası ilerlemeyen ortamlarda (jsdom'da `timeStamp` varsayılan 0)
   * yol zamanla çözülemez. O durumda zaman UYDURULMAZ: son örneğe kadar kalan
   * yer değiştirme olduğu gibi uygulanır, yani davranış eski koda döner ve
   * hareket kaybolmaz.
   */
  consumeUntil(until: number): PathDelta {
    if (this.samples.length === 0) return EMPTY;
    const target = Math.min(until, this.lastTimeMs);
    if (target > this.consumed.timeMs) {
      const to = this.positionAt(target);
      const spanMs = target - this.consumed.timeMs;
      const delta = { dx: to.x - this.consumed.x, dy: to.y - this.consumed.y, spanMs };
      this.consumed = { timeMs: target, x: to.x, y: to.y };
      this.dropConsumed();
      return delta;
    }
    const last = this.samples[this.samples.length - 1];
    if (last.x === this.consumed.x && last.y === this.consumed.y) return EMPTY;
    const delta = { dx: last.x - this.consumed.x, dy: last.y - this.consumed.y, spanMs: 0 };
    this.consumed = { timeMs: this.consumed.timeMs, x: last.x, y: last.y };
    return delta;
  }

  /** Örnekler arasında doğrusal; dışında uçlara sabitlenir. */
  private positionAt(timeMs: number): { x: number; y: number } {
    const first = this.samples[0];
    if (timeMs <= first.timeMs) return { x: first.x, y: first.y };
    for (let index = 1; index < this.samples.length; index++) {
      const previous = this.samples[index - 1];
      const current = this.samples[index];
      if (timeMs <= current.timeMs) {
        const span = current.timeMs - previous.timeMs;
        const ratio = span > 0 ? (timeMs - previous.timeMs) / span : 1;
        return {
          x: previous.x + (current.x - previous.x) * ratio,
          y: previous.y + (current.y - previous.y) * ratio,
        };
      }
    }
    const last = this.samples[this.samples.length - 1];
    return { x: last.x, y: last.y };
  }

  /** Tüketilen örnekler atılır; tampon sürükleme boyunca büyümez. */
  private dropConsumed(): void {
    let keepFrom = 0;
    for (let index = 1; index < this.samples.length; index++) {
      if (this.samples[index].timeMs <= this.consumed.timeMs) keepFrom = index;
      else break;
    }
    if (keepFrom > 0) this.samples = this.samples.slice(keepFrom);
  }
}
