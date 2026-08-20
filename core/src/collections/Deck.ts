import type { Random } from '../random/random';

export interface DeckOptions {
  /**
   * Deste tükendiğinde iskarta yığını karılıp yeniden çekme yığını olsun mu?
   * Varsayılan `true`. `false` ise tükenen desteden çekmek `undefined` döner.
   */
  reshuffleFromDiscard?: boolean;
}

/**
 * Karılmış çekme yığını — iskarta ve yeniden karma ile.
 *
 * Ağırlıksız ve TEKRARSIZ çekim yapar; `WeightedPicker`den farkı budur:
 * `WeightedPicker` her seferinde bağımsız bir ağırlıklı zar atar, `Deck` sonlu
 * bir yığından sırayla çeker. "Yedi çekişte her renk en az bir kez gelsin"
 * garantisini yalnızca ikincisi verir.
 *
 * Deterministiktir: aynı tohum + aynı işlem sırası = aynı çekiliş.
 */
export class Deck<T> {
  private drawPile: T[] = [];
  private readonly discardPile: T[] = [];
  private readonly reshuffle: boolean;

  constructor(
    cards: readonly T[],
    private readonly random: Random,
    options: DeckOptions = {},
  ) {
    this.drawPile = [...cards];
    this.reshuffle = options.reshuffleFromDiscard ?? true;
    this.shuffleDrawPile();
  }

  get remaining(): number {
    return this.drawPile.length;
  }

  get discarded(): number {
    return this.discardPile.length;
  }

  /**
   * Bir kart çeker. Çekme yığını boşsa ve `reshuffleFromDiscard` açıksa
   * iskarta karılıp yeniden kullanılır. Her ikisi de boşsa `undefined`.
   */
  draw(): T | undefined {
    if (this.drawPile.length === 0) {
      if (!this.reshuffle || this.discardPile.length === 0) return undefined;
      // discardPile readonly; referans takası yerine elemanları taşıp temizle.
      // splice(0, n) her elemanı kaydırırdı; push + length=0 O(n) ama kaydırma yok.
      for (let i = 0; i < this.discardPile.length; i++) {
        this.drawPile[i] = this.discardPile[i];
      }
      this.drawPile.length = this.discardPile.length;
      this.discardPile.length = 0;
      this.shuffleDrawPile();
    }
    return this.drawPile.pop();
  }

  /**
   * `count` kart çeker. Yeterli kart yoksa olabildiğince çok döner —
   * çağıranı kalan sayıyı önceden hesaplamaya zorlamamak için.
   */
  drawMany(count: number): T[] {
    const result: T[] = [];
    const wanted = Math.max(0, Math.floor(count));
    for (let i = 0; i < wanted; i++) {
      const card = this.draw();
      if (card === undefined) break;
      result.push(card);
    }
    return result;
  }

  /** Kartı iskartaya atar. */
  discard(card: T): void {
    this.discardPile.push(card);
  }

  /** Kartı çekme yığınının ÜSTÜNE koyar — bir sonraki çekişte gelir. */
  putOnTop(card: T): void {
    this.drawPile.push(card);
  }

  /** Kartı çekme yığınının ALTINA koyar. */
  putOnBottom(card: T): void {
    this.drawPile.unshift(card);
  }

  /** Çekmeden en üstteki karta bakar. */
  peek(): T | undefined {
    return this.drawPile[this.drawPile.length - 1];
  }

  /** İskartayı çekme yığınına katıp yeniden karar. */
  reset(): void {
    this.drawPile.push(...this.discardPile.splice(0, this.discardPile.length));
    this.shuffleDrawPile();
  }

  /**
   * Fisher-Yates karma — her permütasyon eşit olasılıklı.
   *
   * `sort(() => random() - 0.5)` YAYGIN ama YANLIŞTIR: karşılaştırma
   * fonksiyonu tutarsız olduğu için sonuç sıralama algoritmasına bağlı,
   * dağılım da düzgün değildir.
   */
  private shuffleDrawPile(): void {
    for (let i = this.drawPile.length - 1; i > 0; i--) {
      const j = Math.floor(this.random.next() * (i + 1));
      [this.drawPile[i], this.drawPile[j]] = [this.drawPile[j], this.drawPile[i]];
    }
  }
}
