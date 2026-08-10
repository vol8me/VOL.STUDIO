import type { FilterParams, FilterType } from './types';

export interface Filter {
  process(sample: number, cutoff: number): number;
  reset(): void;
}

/** Rezonanslı 2-kutuplu biquad filtre (12dB/oct slope).
 *  Cookbook formülleri (RBJ Audio EQ Cookbook). cutoff ve Q zamanla değişebilir.
 *  Cutoff değişmediğinde katsayıları cache'ler — performans. */
export class BiquadFilter implements Filter {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  private readonly sampleRate: number;
  private readonly q: number;
  private readonly type: FilterType;
  // Cache — cutoff değişmediğinde katsayıları yeniden hesaplama
  private lastCutoff = -1;
  private nb0 = 0;
  private nb1 = 0;
  private nb2 = 0;
  private na1 = 0;
  private na2 = 0;

  constructor(sampleRate: number, type: FilterType, q = 0.707) {
    this.sampleRate = sampleRate;
    this.type = type;
    this.q = Math.max(0.1, q);
  }

  /** Cutoff için katsayıları hesapla (cache'li). */
  private computeCoeffs(cutoff: number): void {
    const w0 = (2 * Math.PI * Math.max(1, Math.min(this.sampleRate * 0.49, cutoff))) / this.sampleRate;
    const cosW0 = Math.cos(w0);
    const sinW0 = Math.sin(w0);
    const alpha = sinW0 / (2 * this.q);

    let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;

    switch (this.type) {
      case 'highpass':
        b0 = (1 + cosW0) / 2;
        b1 = -(1 + cosW0);
        b2 = (1 + cosW0) / 2;
        a0 = 1 + alpha;
        a1 = -2 * cosW0;
        a2 = 1 - alpha;
        break;
      case 'bandpass':
        // Sabit gain = 1 (peak gain = Q)
        b0 = alpha;
        b1 = 0;
        b2 = -alpha;
        a0 = 1 + alpha;
        a1 = -2 * cosW0;
        a2 = 1 - alpha;
        break;
      case 'notch':
        b0 = 1;
        b1 = -2 * cosW0;
        b2 = 1;
        a0 = 1 + alpha;
        a1 = -2 * cosW0;
        a2 = 1 - alpha;
        break;
      case 'lowpass':
      default:
        b0 = (1 - cosW0) / 2;
        b1 = 1 - cosW0;
        b2 = (1 - cosW0) / 2;
        a0 = 1 + alpha;
        a1 = -2 * cosW0;
        a2 = 1 - alpha;
        break;
    }

    // Normalize (a0'a böl)
    this.nb0 = b0 / a0;
    this.nb1 = b1 / a0;
    this.nb2 = b2 / a0;
    this.na1 = a1 / a0;
    this.na2 = a2 / a0;
    this.lastCutoff = cutoff;
  }

  process(sample: number, cutoff: number): number {
    // Cutoff değişmediğinde katsayıları yeniden hesaplama
    if (cutoff !== this.lastCutoff) {
      this.computeCoeffs(cutoff);
    }

    const y = this.nb0 * sample + this.nb1 * this.x1 + this.nb2 * this.x2 - this.na1 * this.y1 - this.na2 * this.y2;

    this.x2 = this.x1;
    this.x1 = sample;
    this.y2 = this.y1;
    this.y1 = y;

    return y;
  }

  reset(): void {
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
    this.lastCutoff = -1;
  }
}

/** 4-kutuplu cascade — iki biquad seri, 24dB/oct slope. Analog synth karakteri. */
export class Cascade4Filter implements Filter {
  private readonly stage1: BiquadFilter;
  private readonly stage2: BiquadFilter;

  constructor(sampleRate: number, type: FilterType, q = 0.707) {
    // İkinci stage'e biraz daha düşük Q — rezonans çok keskin olmasın
    this.stage1 = new BiquadFilter(sampleRate, type, q);
    this.stage2 = new BiquadFilter(sampleRate, type, q * 0.6);
  }

  process(sample: number, cutoff: number): number {
    const s1 = this.stage1.process(sample, cutoff);
    return this.stage2.process(s1, cutoff);
  }

  reset(): void {
    this.stage1.reset();
    this.stage2.reset();
  }
}

/** Değişken kesim frekanslı 1-kutuplu lowpass filtre. */
export class LowpassFilter implements Filter {
  private y = 0;
  private readonly sampleRate: number;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  process(sample: number, cutoff: number): number {
    const safeCutoff = Math.max(1, Math.min(this.sampleRate / 2, cutoff));
    const rc = 1 / (2 * Math.PI * safeCutoff);
    const dt = 1 / this.sampleRate;
    const alpha = dt / (rc + dt);
    this.y += alpha * (sample - this.y);
    return this.y;
  }

  reset(): void {
    this.y = 0;
  }
}

/** Değişken kesim frekanslı 1-kutuplu highpass filtre. */
export class HighpassFilter implements Filter {
  private y = 0;
  private prevX = 0;
  private readonly sampleRate: number;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  process(sample: number, cutoff: number): number {
    const safeCutoff = Math.max(1, Math.min(this.sampleRate / 2, cutoff));
    const rc = 1 / (2 * Math.PI * safeCutoff);
    const dt = 1 / this.sampleRate;
    const alpha = rc / (rc + dt);
    this.y = alpha * (this.y + sample - this.prevX);
    this.prevX = sample;
    return this.y;
  }

  reset(): void {
    this.y = 0;
    this.prevX = 0;
  }
}

/** Filtre parametrelerinden anlık kesim frekansı hesaplar. */
export function getCutoffAtTime(
  params: FilterParams | undefined,
  t: number,
  duration: number,
): number {
  if (!params) return Number.MAX_VALUE;
  const start = params.cutoff;
  const slide = params.slide ?? 0;
  const ratio = t / duration;
  return Math.max(1, start + slide * ratio);
}

/** FilterParams'tan uygun filtre örneği oluşturur.
 *  resonance > 0 veya poles === 2 ise biquad, değilse eski 1-kutuplu filtre. */
export function createFilter(
  params: FilterParams | undefined,
  sampleRate: number,
  kind: 'lowpass' | 'highpass',
): Filter | undefined {
  if (!params) return undefined;

  const resonance = params.resonance ?? 0;
  const poles = params.poles ?? (resonance > 0 ? 2 : 1);
  const filterType: FilterType = params.type ?? kind;

  if (poles === 2) {
    // Q: resonance 0-1 → 0.707-20 aralığına haritala
    const q = resonance > 0 ? 0.707 + resonance * 19.293 : 0.707;
    if (poles === 2) {
      return new BiquadFilter(sampleRate, filterType, q);
    }
  }

  // 1-kutuplu eski filtre (geriye dönük uyum)
  return kind === 'lowpass' ? new LowpassFilter(sampleRate) : new HighpassFilter(sampleRate);
}
