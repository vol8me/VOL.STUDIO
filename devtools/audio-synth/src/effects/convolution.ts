import { fft } from '../analysis/spectrum';

/**
 * Düzgün bölümlü overlap-save konvolüsyon (UPOLS; Wefers 2015, "Partitioned
 * convolution algorithms for real-time auralization"): IR B örneklik
 * bölümlere ayrılır, her bölümün 2B noktalı spektrumu bir kez hesaplanır;
 * giriş bloğu spektrumları bir frekans-alanı gecikme hattında tutulur ve
 * Y_k = Σ_p X_{k−p}·H_p. Bellek IR ve blok boyuyla sınırlıdır (tampon
 * uzunluğuyla değil); sonuç doğrudan konvolüsyonla kayan nokta hassasiyetinde
 * aynıdır ve deterministiktir.
 */
export const BLOCK = 2048;

export function convolve(input: Float32Array, ir: Float32Array): Float32Array {
  const n = input.length;
  const size = 2 * BLOCK;
  const parts = Math.max(1, Math.ceil(ir.length / BLOCK));
  const hRe: Float64Array[] = [];
  const hIm: Float64Array[] = [];
  for (let p = 0; p < parts; p++) {
    const re = new Float64Array(size);
    const im = new Float64Array(size);
    for (let i = 0; i < BLOCK; i++) re[i] = ir[p * BLOCK + i] ?? 0;
    fft(re, im);
    hRe.push(re);
    hIm.push(im);
  }
  const fdlRe = Array.from({ length: parts }, () => new Float64Array(size));
  const fdlIm = Array.from({ length: parts }, () => new Float64Array(size));
  const out = new Float32Array(n);
  const window = new Float64Array(size);
  const yRe = new Float64Array(size);
  const yIm = new Float64Array(size);
  const blocks = Math.ceil(n / BLOCK);
  for (let k = 0; k < blocks; k++) {
    window.copyWithin(0, BLOCK);
    for (let i = 0; i < BLOCK; i++) window[BLOCK + i] = input[k * BLOCK + i] ?? 0;
    const slot = k % parts;
    const xRe = fdlRe[slot];
    const xIm = fdlIm[slot];
    xRe.set(window);
    xIm.fill(0);
    fft(xRe, xIm);
    yRe.fill(0);
    yIm.fill(0);
    for (let p = 0; p < parts && p <= k; p++) {
      const s = (k - p) % parts;
      const aRe = fdlRe[s];
      const aIm = fdlIm[s];
      const bRe = hRe[p];
      const bIm = hIm[p];
      for (let i = 0; i < size; i++) {
        yRe[i] += aRe[i] * bRe[i] - aIm[i] * bIm[i];
        yIm[i] += aRe[i] * bIm[i] + aIm[i] * bRe[i];
      }
    }
    for (let i = 0; i < size; i++) yIm[i] = -yIm[i];
    fft(yRe, yIm);
    for (let i = 0; i < BLOCK && k * BLOCK + i < n; i++) out[k * BLOCK + i] = yRe[BLOCK + i] / size;
  }
  return out;
}

/**
 * Kanal yönlendirme matrisi (giriş × IR):
 * mono×mono → mono; mono×stereo → mono programda iki IR kanalının
 * ortalaması; stereo×mono → her kanal aynı IR; stereo×stereo → L*IR_L, R*IR_R.
 */
export function convolveChannels(
  channels: readonly Float32Array[],
  ir: readonly Float32Array[],
  mix: number,
  gain: number,
): void {
  const irFor = (ch: number): Float32Array => {
    if (ir.length === 1) return ir[0];
    if (channels.length === 2) return ir[ch];
    return Float32Array.from(ir[0], (v, i) => 0.5 * (v + ir[1][i]));
  };
  channels.forEach((channel, ch) => {
    const wet = convolve(channel, irFor(ch));
    for (let i = 0; i < channel.length; i++)
      channel[i] = channel[i] * (1 - mix) + gain * wet[i] * mix;
  });
}

/** Kare başına iş birimi tahmini (IR uzunluğu için). */
export function convolutionWork(irFrames: number): number {
  const parts = Math.max(1, Math.ceil(irFrames / BLOCK));
  return (
    Math.ceil((2 * 2 * BLOCK * Math.log2(2 * BLOCK) * 2 + parts * 2 * BLOCK * 4) / BLOCK / 20) + 2
  );
}
