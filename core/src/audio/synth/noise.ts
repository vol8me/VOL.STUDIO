/** Gürültü jeneratörleri. */

export interface NoiseSource {
  /** Sonraki örneği döner. */
  next(): number;
  /** Dahili durumu sıfırlar. */
  reset(): void;
}

/** Beyaz gürültü. */
export class WhiteNoise implements NoiseSource {
  next(): number {
    return Math.random() * 2 - 1;
  }

  reset(): void {
    // no state
  }
}

/** Pink gürültü (Paul Kellet yaklaşımı). */
export class PinkNoise implements NoiseSource {
  private b0 = 0;
  private b1 = 0;
  private b2 = 0;
  private b3 = 0;
  private b4 = 0;
  private b5 = 0;
  private b6 = 0;

  next(): number {
    const white = Math.random() * 2 - 1;
    this.b0 = 0.99886 * this.b0 + white * 0.0555179;
    this.b1 = 0.99332 * this.b1 + white * 0.0750759;
    this.b2 = 0.969 * this.b2 + white * 0.153852;
    this.b3 = 0.8665 * this.b3 + white * 0.3104856;
    this.b4 = 0.55 * this.b4 + white * 0.5329522;
    this.b5 = -0.7616 * this.b5 - white * 0.016898;
    const out =
      this.b0 + this.b1 + this.b2 + this.b3 + this.b4 + this.b5 + this.b6 + white * 0.5362;
    this.b6 = white * 0.115926;
    return out * 0.11;
  }

  reset(): void {
    this.b0 = this.b1 = this.b2 = this.b3 = this.b4 = this.b5 = this.b6 = 0;
  }
}

/** Brown gürültü. */
export class BrownNoise implements NoiseSource {
  private y = 0;

  next(): number {
    const white = Math.random() * 2 - 1;
    this.y = (this.y + white * 0.02) / 1.02;
    return this.y * 3.5;
  }

  reset(): void {
    this.y = 0;
  }
}

/** İsme göre gürültü kaynağı üretir. */
export function createNoiseSource(type: 'noise' | 'pink' | 'brown'): NoiseSource {
  switch (type) {
    case 'noise':
      return new WhiteNoise();
    case 'pink':
      return new PinkNoise();
    case 'brown':
      return new BrownNoise();
    default:
      return new WhiteNoise();
  }
}
