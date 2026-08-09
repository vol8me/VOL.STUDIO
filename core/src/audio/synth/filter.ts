import type { FilterParams } from './types';

export interface Filter {
  process(sample: number, cutoff: number): number;
  reset(): void;
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
