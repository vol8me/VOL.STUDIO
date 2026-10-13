/** Colyseus girdi erişicisinin pacer'ın okuduğu kısmı. */
export interface InputSource<I> {
  readonly size: number;
  readonly latest: I | undefined;
  next(): I | undefined;
}

export interface PacerStats {
  /** Tüketilen girdi sayısı. */
  readonly consumed: number;
  /** Girdi bulunamayıp boşta adım atılan adım sayısı (açılıştaki dolum adımları dahil). */
  readonly underflows: number;
  /** Boşta adımların sunucu adım numaraları (ilk 16). */
  readonly underflowTicks: readonly number[];
}

/**
 * Sunucu her sabit adımda dünyayı ilerletir; girdisi geç kalan araç için bu adım istemcinin
 * öngörmediği bir "boşta" adımdır ve uzlaştırmada düzeltme olarak geri döner. Pacer, tüketime
 * ancak tamponda `lead` girdi birikince başlayarak `lead - 1` adımı aşmayan geç kalmaları eler
 * (titreşim tamponu). Tampon boşalırsa yeniden dolana dek boşta adım atılır; boşta adımda son
 * yönlendirme `holdSteps` adım tutulur, ateş tutulmaz. İlk girdi tüketilmeden önceki adımlar hep
 * boştadır: istemci o girdileri henüz onaylanmadan öngörür ve sunucunun tuttuğu adım, istemcinin
 * hiç oynamadığı bir adım olarak açılışta görünür bir düzeltme doğururdu.
 */
export class InputPacer {
  private priming = true;
  private idleRun = 0;
  private consumedCount = 0;
  private underflowCount = 0;
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
   * Bu adımın komutu. `convert` tüketilen girdiyi, `held` boşta adımda son girdiyi komuta çevirir;
   * `idle` hiç girdi yokken ya da tutma süresi dolunca verilir. `tick` yalnız ölçüm içindir.
   */
  pull<I, C>(
    source: InputSource<I>,
    convert: (input: I) => C,
    held: (latest: I) => C,
    idle: C,
    tick = 0,
  ): C {
    if (this.priming && source.size >= this.lead) this.priming = false;
    if (!this.priming) {
      const input = source.next();
      if (input !== undefined) {
        this.idleRun = 0;
        this.consumedCount++;
        return convert(input);
      }
      this.priming = true;
    }
    this.idleRun++;
    this.underflowCount++;
    if (this.marks.length < 16) this.marks.push(tick);
    const latest = source.latest;
    if (this.consumedCount === 0 || latest === undefined || this.idleRun > this.holdSteps)
      return idle;
    return held(latest);
  }

  get stats(): PacerStats {
    return {
      consumed: this.consumedCount,
      underflows: this.underflowCount,
      underflowTicks: this.marks,
    };
  }
}
