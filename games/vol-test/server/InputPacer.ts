/** Colyseus girdi erişicisinin pacer'ın okuduğu kısmı. */
export interface InputSource<I> {
  readonly size: number;
  next(): I | undefined;
}

export interface PacerStats {
  /** Tüketilen girdi sayısı. */
  readonly consumed: number;
  /** Girdi bulunamayıp boşta adım atılan adım sayısı (açılıştaki dolum adımları dahil). */
  readonly underflows: number;
  /** Boşta adımların sunucu adım numaraları (ilk 16). */
  readonly underflowTicks: readonly number[];
  /**
   * İlk tüketimden SONRAKİ boşta adım sayısı: aracın gerçekten ilerlediği bir sırada istemcinin
   * öngörmediği adımlar. Sıfırsa sunucu durumu istemci öngörüsüyle bit bit aynı olmalıdır.
   */
  readonly starved: number;
}

/**
 * Sunucu her sabit adımda dünyayı ilerletir; girdisi geç kalan araç için bu adım istemcinin
 * öngörmediği bir "boşta" adımdır ve uzlaştırmada düzeltme olarak geri döner. Pacer, tüketime
 * ancak tamponda `lead` girdi birikince başlayarak `lead - 1` adımı aşmayan geç kalmaları eler
 * (titreşim tamponu). Tampon boşalırsa yeniden dolana dek boşta adım atılır. Boşta adım, son
 * TÜKETİLEN komutu `holdSteps` adım sürdürür (ateş tutulmaz): henüz tüketilmemiş bir girdiyi
 * tutmak onu sonradan bir kez daha uygulatırdı. İlk girdi tüketilmeden önceki adımlar hep
 * boştadır.
 */
export class InputPacer<C> {
  private priming = true;
  private idleRun = 0;
  private consumedCount = 0;
  private underflowCount = 0;
  private starvedCount = 0;
  private last: C | undefined;
  private readonly marks: number[] = [];

  constructor(
    private readonly lead: number,
    private readonly holdSteps: number,
  ) {
    if (!Number.isSafeInteger(lead) || lead < 1)
      throw new RangeError('Tampon payı pozitif tam sayı olmalı.');
    if (!Number.isSafeInteger(holdSteps) || holdSteps < 0)
      throw new RangeError('Tutma adımı sıfır ya da pozitif tam sayı olmalı.');
  }

  /**
   * Bu adımın komutu. `convert` tüketilen girdiyi komuta çevirir; `hold` son tüketilen komuttan
   * boşta adımda sürdürülecek komutu üretir; `idle` hiç tüketim olmamışsa ya da tutma süresi
   * dolmuşsa verilir. `tick` yalnız ölçüm içindir.
   */
  pull<I>(
    source: InputSource<I>,
    convert: (input: I) => C,
    hold: (last: C) => C,
    idle: C,
    tick = 0,
  ): C {
    if (this.priming && source.size >= this.lead) this.priming = false;
    if (!this.priming) {
      const input = source.next();
      if (input !== undefined) {
        this.idleRun = 0;
        this.consumedCount++;
        this.last = convert(input);
        return this.last;
      }
      this.priming = true;
    }
    this.idleRun++;
    this.underflowCount++;
    if (this.consumedCount > 0) this.starvedCount++;
    if (this.marks.length < 16) this.marks.push(tick);
    if (this.last === undefined || this.idleRun > this.holdSteps) return idle;
    return hold(this.last);
  }

  get stats(): PacerStats {
    return {
      consumed: this.consumedCount,
      underflows: this.underflowCount,
      underflowTicks: this.marks,
      starved: this.starvedCount,
    };
  }
}
