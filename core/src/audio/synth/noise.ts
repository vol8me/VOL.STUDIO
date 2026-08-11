/** Gürültü jeneratörleri. */

import { createRandom, DEFAULT_SEED, type Random } from './random';

export interface NoiseSource {
  /** Sonraki örneği döner. */
  next(): number;
  /** Dahili durumu sıfırlar. */
  reset(): void;
}

/** Beyaz gürültü. */
export class WhiteNoise implements NoiseSource {
  private readonly seed: number;
  private random: Random;

  constructor(seed: number = DEFAULT_SEED) {
    this.seed = seed;
    this.random = createRandom(seed);
  }

  next(): number {
    return this.random.bipolar();
  }

  reset(): void {
    this.random = createRandom(this.seed);
  }
}

/** Pink gürültü (Paul Kellet yaklaşımı). */
export class PinkNoise implements NoiseSource {
  private readonly seed: number;
  private random: Random;
  private b0 = 0;
  private b1 = 0;
  private b2 = 0;
  private b3 = 0;
  private b4 = 0;
  private b5 = 0;
  private b6 = 0;

  constructor(seed: number = DEFAULT_SEED) {
    this.seed = seed;
    this.random = createRandom(seed);
  }

  next(): number {
    const white = this.random.bipolar();
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
    this.random = createRandom(this.seed);
    this.b0 = this.b1 = this.b2 = this.b3 = this.b4 = this.b5 = this.b6 = 0;
  }
}

/** Brown gürültü — beyaz gürültünün sızıntılı integrali (-6 dB/oct). */
export class BrownNoise implements NoiseSource {
  private readonly seed: number;
  private random: Random;
  private y = 0;

  constructor(seed: number = DEFAULT_SEED) {
    this.seed = seed;
    this.random = createRandom(seed);
  }

  next(): number {
    const white = this.random.bipolar();
    this.y = (this.y + white * 0.02) / 1.02;
    return this.y * 3.5;
  }

  reset(): void {
    this.random = createRandom(this.seed);
    this.y = 0;
  }
}

/** İsme göre gürültü kaynağı üretir. Aynı seed her zaman aynı diziyi verir. */
export function createNoiseSource(
  type: 'noise' | 'pink' | 'brown',
  seed: number = DEFAULT_SEED,
): NoiseSource {
  switch (type) {
    case 'pink':
      return new PinkNoise(seed);
    case 'brown':
      return new BrownNoise(seed);
    case 'noise':
    default:
      return new WhiteNoise(seed);
  }
}
