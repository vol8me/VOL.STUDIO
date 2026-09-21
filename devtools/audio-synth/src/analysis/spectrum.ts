/**
 * Spektral ölçüm ilkelleri — QA, FM alias karakterizasyonu ve testler aynı
 * çekirdeği kullanır; her araç kendi FFT'sini yazmaz.
 */

/** Yerinde radix-2 karmaşık FFT. Uzunluk 2'nin kuvveti olmalı. */
export function fft(re: Float64Array | Float32Array, im: Float64Array | Float32Array): void {
  const n = re.length;
  if (n === 0 || (n & (n - 1)) !== 0 || im.length !== n) {
    throw new RangeError(`FFT uzunluğu 2'nin kuvveti olmalı ve eşleşmeli (${n}/${im.length})`);
  }
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      const half = len / 2;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const vRe = re[b] * curRe - im[b] * curIm;
        const vIm = re[b] * curIm + im[b] * curRe;
        re[b] = re[a] - vRe;
        im[b] = im[a] - vIm;
        re[a] += vRe;
        im[a] += vIm;
        const next = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = next;
      }
    }
  }
}

/**
 * 4 terimli Blackman-Harris penceresi (yan lob −92 dB, ana lob ±4 kutu).
 * −90 dB mertebesinde alias ölçerken Hann'ın −31 dB yan lobu ölçümü gömer.
 */
export function blackmanHarris(length: number): Float64Array {
  const w = new Float64Array(length);
  for (let i = 0; i < length; i++) {
    const a = (2 * Math.PI * i) / (length - 1);
    w[i] = 0.35875 - 0.48829 * Math.cos(a) + 0.14128 * Math.cos(2 * a) - 0.01168 * Math.cos(3 * a);
  }
  return w;
}

/**
 * Tek taraflı güç spektrumu: `samples[from .. from+size)` pencerelenir;
 * kutu k'nın frekansı k·sampleRate/size'dır.
 */
export function powerSpectrum(
  samples: Float32Array,
  from: number,
  size: number,
  window: Float64Array = blackmanHarris(size),
): Float64Array {
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < size; i++) re[i] = (samples[from + i] ?? 0) * window[i];
  fft(re, im);
  const power = new Float64Array(size / 2);
  for (let k = 0; k < size / 2; k++) power[k] = re[k] * re[k] + im[k] * im[k];
  return power;
}
