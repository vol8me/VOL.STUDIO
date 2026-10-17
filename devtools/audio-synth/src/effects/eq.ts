/**
 * Parametrik EQ bantları — RBJ "Audio EQ Cookbook" (Bristow-Johnson)
 * biquad'ları, float64 durumlu transpoze direkt form II. Sentez filtresi
 * (`BiquadFilter`) örnek başına kesim otomasyonu için önbellekli ve float32
 * akışlıdır; işleme EQ'su sabit katsayılı ve 0.01 dB mertebesinde doğru
 * olmalıdır, bu yüzden ayrı bir çekirdektir.
 */
export type EqBandType = 'bell' | 'low-shelf' | 'high-shelf' | 'highpass' | 'lowpass';

export interface EqBand {
  readonly type: EqBandType;
  readonly frequency: number;
  /** Bell ve raf bantlarında kazanç (dB); geçirenlerde kullanılmaz. */
  readonly gainDb: number;
  /** Bell'de bant genişliği, rafta eğim (0.707 → S = 1, aşımsız), geçirende rezonans. */
  readonly q: number;
}

export interface BiquadCoefficients {
  readonly b0: number;
  readonly b1: number;
  readonly b2: number;
  readonly a1: number;
  readonly a2: number;
}

/** Katsayıları a0'a bölünmüş olarak verir. Frekans Nyquist'in altında olmalıdır (çağıran sınar). */
export function eqCoefficients(band: EqBand, sampleRate: number): BiquadCoefficients {
  const w0 = (2 * Math.PI * band.frequency) / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = sin / (2 * band.q);
  const A = Math.pow(10, band.gainDb / 40);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  switch (band.type) {
    case 'bell':
      b0 = 1 + alpha * A;
      b1 = -2 * cos;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * cos;
      a2 = 1 - alpha / A;
      break;
    case 'low-shelf': {
      const k = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 - (A - 1) * cos + k);
      b1 = 2 * A * (A - 1 - (A + 1) * cos);
      b2 = A * (A + 1 - (A - 1) * cos - k);
      a0 = A + 1 + (A - 1) * cos + k;
      a1 = -2 * (A - 1 + (A + 1) * cos);
      a2 = A + 1 + (A - 1) * cos - k;
      break;
    }
    case 'high-shelf': {
      const k = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 + (A - 1) * cos + k);
      b1 = -2 * A * (A - 1 + (A + 1) * cos);
      b2 = A * (A + 1 + (A - 1) * cos - k);
      a0 = A + 1 - (A - 1) * cos + k;
      a1 = 2 * (A - 1 - (A + 1) * cos);
      a2 = A + 1 - (A - 1) * cos - k;
      break;
    }
    case 'highpass':
      b0 = (1 + cos) / 2;
      b1 = -(1 + cos);
      b2 = (1 + cos) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    case 'lowpass':
      b0 = (1 - cos) / 2;
      b1 = 1 - cos;
      b2 = (1 - cos) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** |H(e^{jω})| dB olarak — testlerin ve context'in kullandığı analitik yanıt. */
export function biquadResponseDb(c: BiquadCoefficients, frequency: number, sampleRate: number) {
  const w = (2 * Math.PI * frequency) / sampleRate;
  const cos1 = Math.cos(w);
  const sin1 = Math.sin(w);
  const cos2 = Math.cos(2 * w);
  const sin2 = Math.sin(2 * w);
  const nr = c.b0 + c.b1 * cos1 + c.b2 * cos2;
  const ni = -(c.b1 * sin1 + c.b2 * sin2);
  const dr = 1 + c.a1 * cos1 + c.a2 * cos2;
  const di = -(c.a1 * sin1 + c.a2 * sin2);
  return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
}

/** Tek biquad'ı kanal üzerinde YERİNDE uygular (TDF-II, float64 durum). */
export function applyBiquad(channel: Float32Array, c: BiquadCoefficients): void {
  let z1 = 0;
  let z2 = 0;
  for (let i = 0; i < channel.length; i++) {
    const x = channel[i];
    const y = c.b0 * x + z1;
    z1 = c.b1 * x - c.a1 * y + z2;
    z2 = c.b2 * x - c.a2 * y;
    channel[i] = y;
  }
}

/**
 * Butterworth kaskadı: `order` 2. dereceli aşama (12·order dB/oktav). Aşama
 * Q'ları kutup açılarından gelir; `q` yalnız SON aşamaya çarpan olarak girer
 * (0.707 → düz Butterworth, büyük değer kesimde rezonans tepesi).
 */
export function passCascade(
  type: 'highpass' | 'lowpass',
  frequency: number,
  q: number,
  order: number,
  sampleRate: number,
): BiquadCoefficients[] {
  const stages: BiquadCoefficients[] = [];
  const poles = 2 * order;
  for (let k = 0; k < order; k++) {
    const theta = (Math.PI * (2 * k + 1)) / (2 * poles);
    const stageQ = 1 / (2 * Math.cos(theta));
    const scaled = k === order - 1 ? stageQ * (q / Math.SQRT1_2) : stageQ;
    stages.push(eqCoefficients({ type, frequency, gainDb: 0, q: scaled }, sampleRate));
  }
  return stages;
}
