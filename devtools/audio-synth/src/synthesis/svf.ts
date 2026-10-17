/**
 * Topoloji-korumalı durum değişkenli filtre (Zavalishin, "The Art of VA
 * Filter Design", TPT SVF). Kesim ve Q örnek başına değişebilir: durum
 * değişkenleri integratör çıkışlarıdır ve katsayı değişiminde anlamlarını
 * korur — hızla süpürülen akış/rüzgar bantlarında direkt-form biquad'ın
 * enerji sıçraması yoktur. Kesim 0.49·fs altına kırpılır.
 */
export class StateVariableFilter {
  private s1 = 0;
  private s2 = 0;
  private g = 0;
  private k = 1;
  private a1 = 0;
  private lastFrequency = -1;
  private lastQ = -1;

  constructor(private readonly sampleRate: number) {}

  private tune(frequency: number, q: number): void {
    if (frequency === this.lastFrequency && q === this.lastQ) return;
    const f = Math.min(Math.max(frequency, 1), 0.49 * this.sampleRate);
    this.g = Math.tan((Math.PI * f) / this.sampleRate);
    this.k = 1 / Math.max(q, 0.05);
    this.a1 = 1 / (1 + this.g * (this.g + this.k));
    this.lastFrequency = frequency;
    this.lastQ = q;
  }

  /** Bir örnek işler; alçak/bant/yüksek geçiren çıkışları aynı anda döner. */
  step(x: number, frequency: number, q: number): { low: number; band: number; high: number } {
    this.tune(frequency, q);
    const v3 = x - this.s2;
    const v1 = this.a1 * (this.s1 + this.g * v3);
    const v2 = this.s2 + this.g * v1;
    this.s1 = 2 * v1 - this.s1;
    this.s2 = 2 * v2 - this.s2;
    return { low: v2, band: v1, high: x - this.k * v1 - v2 };
  }

  /** Tepe kazancı 1'e normalize bant geçiren (k·band). */
  bandpass(x: number, frequency: number, q: number): number {
    const { band } = this.step(x, frequency, q);
    return this.k * band;
  }

  lowpass(x: number, frequency: number, q = Math.SQRT1_2): number {
    return this.step(x, frequency, q).low;
  }

  highpass(x: number, frequency: number, q = Math.SQRT1_2): number {
    return this.step(x, frequency, q).high;
  }
}

/**
 * Ornstein–Uhlenbeck süreci (Euler–Maruyama): ortalamaya dönen, sınırlı
 * sapmalı rastgele yürüyüş — rüzgar/yangın/elektrik kararsızlığında çok
 * ölçekli hareket için. `tau` korelasyon süresi (sn), çıkış ~N(0, 1) durağan.
 */
export class OrnsteinUhlenbeck {
  private x = 0;
  private readonly decay: number;
  private readonly spread: number;

  constructor(
    tauSeconds: number,
    sampleRate: number,
    private readonly gauss: () => number,
  ) {
    const dt = 1 / sampleRate;
    this.decay = Math.exp(-dt / Math.max(tauSeconds, dt));
    this.spread = Math.sqrt(1 - this.decay * this.decay);
  }

  next(): number {
    this.x = this.decay * this.x + this.spread * this.gauss();
    return this.x;
  }
}

/** Box–Muller ile N(0, 1) örnekleyici (verilen [0, 1) üretecinden). */
export function gaussian(uniform: () => number): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    const u = Math.max(1e-12, uniform());
    const v = uniform();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
}
