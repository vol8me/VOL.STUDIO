import { fft } from '../analysis/spectrum';
import { convolve } from './convolution';

/**
 * Atmosferik soğurma — ISO 9613-1:1993, saf ton soğurma katsayısı α (dB/m).
 * Oksijen ve azotun titreşimsel gevşemesi + klasik/dönel soğurma; ölçüt
 * ISO 9613-2 Tablo 2'nin tam bant merkezlerindeki değerleridir
 * (`tests/effects/air.test.ts`). Sıcaklık 20 °C, basınç 101.325 kPa sabit;
 * nem bağıl nemdir (0–1).
 */
const REFERENCE_KELVIN = 293.15;
const TRIPLE_POINT_KELVIN = 273.16;

export function airAbsorptionDbPerMeter(frequency: number, humidity: number): number {
  const t = REFERENCE_KELVIN;
  const ratio = t / REFERENCE_KELVIN;
  const saturation = 10 ** (-6.8346 * (TRIPLE_POINT_KELVIN / t) ** 1.261 + 4.6151);
  const h = humidity * 100 * saturation;
  const oxygen = 24 + (4.04e4 * h * (0.02 + h)) / (0.391 + h);
  const nitrogen = ratio ** -0.5 * (9 + 280 * h * Math.exp(-4.17 * (ratio ** (-1 / 3) - 1)));
  const f2 = frequency * frequency;
  return (
    8.686 *
    f2 *
    (1.84e-11 * ratio ** 0.5 +
      ratio ** -2.5 *
        ((0.01275 * Math.exp(-2239.1 / t)) / (oxygen + f2 / oxygen) +
          (0.1068 * Math.exp(-3352 / t)) / (nitrogen + f2 / nitrogen)))
  );
}

/** Tasarım ızgarası ve FIR uzunluğu: 48 kHz'te 11.7 Hz çözünürlük, 21 ms tepki. */
const GRID = 4096;
export const AIR_TAPS = 1024;
/** Sayısal taban: bu zayıflamanın altı kesilir (log genliği sonlu kalsın). */
const FLOOR_DB = 120;

/**
 * Minimum fazlı soğurma filtresi (homomorfik yöntem, Oppenheim–Schafer
 * §5.6): istenen genlik → gerçek kepstrum → nedensel katlama → üstel →
 * dürtü tepkisi. Fiziksel yayılım nedenseldir; minimum faz enerjiyi başa
 * toplar, doğrusal fazın ön-çınlamasını ve gecikmesini getirmez. Son çeyrek
 * yarım Hann ile sönümlenir.
 */
export function airAbsorptionFir(
  distance: number,
  humidity: number,
  sampleRate: number,
): Float32Array {
  const logMagnitude = new Float64Array(GRID);
  for (let k = 0; k <= GRID / 2; k++) {
    const hz = (k * sampleRate) / GRID;
    const db = Math.min(FLOOR_DB, airAbsorptionDbPerMeter(hz, humidity) * distance);
    logMagnitude[k] = (-db / 20) * Math.LN10;
    if (k > 0 && k < GRID / 2) logMagnitude[GRID - k] = logMagnitude[k];
  }
  const re = logMagnitude;
  const im = new Float64Array(GRID);
  inverse(re, im);
  for (let n = 1; n < GRID / 2; n++) re[n] *= 2;
  for (let n = GRID / 2 + 1; n < GRID; n++) re[n] = 0;
  im.fill(0);
  fft(re, im);
  for (let k = 0; k < GRID; k++) {
    const magnitude = Math.exp(re[k]);
    re[k] = magnitude * Math.cos(im[k]);
    im[k] = magnitude * Math.sin(im[k]);
  }
  inverse(re, im);
  const taper = AIR_TAPS / 4;
  return Float32Array.from({ length: AIR_TAPS }, (_, n) => {
    const fade =
      n < AIR_TAPS - taper ? 1 : 0.5 + 0.5 * Math.cos((Math.PI * (n - AIR_TAPS + taper)) / taper);
    return re[n] * fade;
  });
}

/** Yerinde ters FFT: eşlenik → FFT → eşlenik / N. */
function inverse(re: Float64Array, im: Float64Array): void {
  for (let i = 0; i < im.length; i++) im[i] = -im[i];
  fft(re, im);
  for (let i = 0; i < re.length; i++) {
    re[i] /= re.length;
    im[i] = -im[i] / re.length;
  }
}

/** Kanal dizisini yerinde süzer; tampon uzunluğu korunur (kuyruk çağıranın payıdır). */
export function applyAirAbsorption(
  channels: readonly Float32Array[],
  distance: number,
  humidity: number,
  sampleRate: number,
): void {
  if (distance <= 0) return;
  const fir = airAbsorptionFir(distance, humidity, sampleRate);
  for (const channel of channels) channel.set(convolve(channel, fir));
}

/**
 * Orta/yan genişlik: orta korunur, yan `width` ile ölçeklenir. 0 → iki kanal
 * aynı (mono içerik), 1 → değişmez, >1 → genişler (mono uyumunu yerleşim
 * QA'sı ölçer). Mono tamponda etkisizdir.
 */
export function applyWidth(channels: readonly Float32Array[], width: number): void {
  if (channels.length !== 2) return;
  const [left, right] = channels;
  for (let i = 0; i < left.length; i++) {
    const mid = 0.5 * (left[i] + right[i]);
    const side = 0.5 * (left[i] - right[i]) * width;
    left[i] = mid + side;
    right[i] = mid - side;
  }
}
