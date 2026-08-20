import type { FilterParams, FilterType } from './types';

/**
 * 4. derece Butterworth'ün iki biquad kaskadı için Q değerleri.
 * Kutup açıları 22.5° ve 67.5° → Q = 1/(2·cos θ).
 * Rastgele seçilmiş bir `q * 0.6` bu tepkiyi vermez.
 */
export const BUTTERWORTH_Q4: readonly [number, number] = [0.5411961, 1.306563];

/** Katsayı yeniden hesabı için minimum bağıl cutoff değişimi (%0.1). */
const COEFF_UPDATE_EPSILON = 0.001;

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
    const w0 =
      (2 * Math.PI * Math.max(1, Math.min(this.sampleRate * 0.49, cutoff))) / this.sampleRate;
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
    // Katsayılar yalnızca cutoff ANLAMLI ölçüde değiştiğinde yeniden hesaplanır.
    // Tam eşitlik kontrolü, modüle edilen bir cutoff'ta (filtre zarfı/LFO) her
    // örnekte tam trigonometrik hesap demekti; ayrıca durum değişkenleri
    // korunurken katsayıyı her örnek oynatmak yüksek Q'da zipper gürültüsü
    // üretiyordu.
    if (
      this.lastCutoff <= 0 ||
      Math.abs(cutoff - this.lastCutoff) > this.lastCutoff * COEFF_UPDATE_EPSILON
    ) {
      this.computeCoeffs(cutoff);
    }

    const y =
      this.nb0 * sample +
      this.nb1 * this.x1 +
      this.nb2 * this.x2 -
      this.na1 * this.y1 -
      this.na2 * this.y2;

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

/**
 * 4-kutuplu kaskad — iki biquad seri, 24 dB/oct.
 *
 * Rezonans istenmediğinde (q ≈ 0.707) kademeler Butterworth Q'larını kullanır;
 * düz bir geçiş bandı verir. Rezonans istendiğinde fazlalık ikinci kademeye
 * verilir — tek kademede toplamak filtreyi kararsızlığa yaklaştırır.
 */
export class Cascade4Filter implements Filter {
  private readonly stage1: BiquadFilter;
  private readonly stage2: BiquadFilter;

  constructor(sampleRate: number, type: FilterType, q = 0.707) {
    const excess = Math.max(1, q / 0.707);
    this.stage1 = new BiquadFilter(sampleRate, type, BUTTERWORTH_Q4[0]);
    this.stage2 = new BiquadFilter(sampleRate, type, BUTTERWORTH_Q4[1] * excess);
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
  const ratio = duration > 0 ? Math.max(0, Math.min(1, t / duration)) : 0;
  return Math.max(1, start + slide * ratio);
}

/**
 * FilterParams'tan uygun filtre örneği oluşturur.
 *
 * - `poles: 1` → tek kutuplu RC (6 dB/oct), rezonans yok
 * - `poles: 2` → biquad (12 dB/oct)
 * - `poles: 4` → iki biquad kaskadı (24 dB/oct)
 *
 * `resonance` 0-1 NORMALİZE bir değerdir, doğrudan Q değil: 0 → Q 0.707
 * (Butterworth), 1 → Q 20 (güçlü rezonans). Q değeri doğrudan gerekiyorsa
 * `BiquadFilter` sınıfı doğrudan kullanılmalıdır.
 */
export function createFilter(
  params: FilterParams | undefined,
  sampleRate: number,
  kind: 'lowpass' | 'highpass',
): Filter | undefined {
  if (!params) return undefined;

  const resonance = Math.max(0, Math.min(1, params.resonance ?? 0));
  const poles = params.poles ?? (resonance > 0 ? 2 : 1);
  const filterType: FilterType = params.type ?? kind;
  const q = resonance > 0 ? 0.707 + resonance * 19.293 : 0.707;

  if (poles === 4) {
    return new Cascade4Filter(sampleRate, filterType, q);
  }
  if (poles === 2) {
    return new BiquadFilter(sampleRate, filterType, q);
  }

  // 1-kutuplu eski filtre (geriye dönük uyum)
  return kind === 'lowpass' ? new LowpassFilter(sampleRate) : new HighpassFilter(sampleRate);
}
