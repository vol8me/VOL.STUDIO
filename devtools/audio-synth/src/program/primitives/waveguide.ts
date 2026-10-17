import { choiceOf, numberOf, sampleAt, signalOf } from '../params';
import type { ProcessorEntry } from '../registry';

/**
 * Tüp dalga kılavuzu (dijital waveguide, tek döngü): basınç dalgası tüpün
 * iki ucu arasında gidip gelir; gidiş-dönüş gecikmesi D = 2L·fs/c örnek,
 * iki ucun yansıma çarpımı s ve uçlardaki yüksek frekans kaybı tek sıfırlı
 * alçak geçiren (1−a) + a·z⁻¹ ile modellenir. Açık uç basıncı ters yansıtır
 * (−1), kapalı uç aynen (+1):
 *
 * - açık/açık, kapalı/kapalı: s = +1 → f_n = n·c/(2L) (bütün harmonikler)
 * - açık/kapalı: s = −1 → f_n = (2n−1)·c/(4L) (yalnız tek harmonikler)
 *
 * Kayıp süzgecinin DC grup gecikmesi (a örnek) gecikmeden düşülür; kesirli
 * gecikme doğrusal ara değerle okunur, bu yüzden uzunluk örnek başına
 * değişebilir (tık yok, perde kayar). Döngü kazancı |g·s| < 1 ve süzgeç
 * kazancı ≤ 1 olduğundan kararlıdır. Uç düzeltmesi ve tüp ışıması
 * modellenmez: bu bir genel rezonatör ilkelidir, enstrüman modeli değil.
 */
export const SPEED_OF_SOUND = 343;

export type TubeEnds = 'open-open' | 'open-closed' | 'closed-closed';

/** Uç koşulunun n. (1'den başlayan) rezonans frekansı — testler ve agent'lar için. */
export function tubeResonance(lengthMeters: number, ends: TubeEnds, n: number): number {
  return ends === 'open-closed'
    ? ((2 * n - 1) * SPEED_OF_SOUND) / (4 * lengthMeters)
    : (n * SPEED_OF_SOUND) / (2 * lengthMeters);
}

const MIN_DELAY = 2;

export const TUBE: ProcessorEntry = {
  id: 'resonator.tube',
  kind: 'resonator',
  version: 1,
  description:
    'Genel tüp dalga kılavuzu: gidiş-dönüş gecikme hattı + uç yansıma işareti (açık −1, ' +
    'kapalı +1) + uç kaybı. Açık/açık bütün harmonikleri, açık/kapalı yalnız tek ' +
    'harmonikleri taşır; uzunluk otomasyon alır. Kanıt ve modal yaklaşımla maliyet ' +
    'kıyası DESIGN "Biyolojik yapı taşları".',
  capabilities: ['waveguide', 'resonant', 'time-varying', 'physical'],
  params: {
    length: {
      type: 'number',
      unit: 'm',
      min: 0.02,
      max: 5,
      default: 0.3,
      automatable: true,
      description: 'Tüp uzunluğu (c = 343 m/sn).',
    },
    ends: {
      type: 'choice',
      choices: ['open-open', 'open-closed', 'closed-closed'],
      default: 'open-closed',
      description: 'Uç koşulları.',
    },
    loss: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 0.5,
      default: 0.15,
      description: 'Uçlardaki yüksek frekans kaybı (0 → kayıpsız).',
    },
    decay: {
      type: 'number',
      unit: 's',
      min: 0.01,
      max: 10,
      default: 0.6,
      description: 'Temel rezonansın T60 süresi.',
    },
  },
  causal: [
    { param: 'length', dimension: 'pitch', direction: -1, note: 'f ∝ 1/L.' },
    { param: 'loss', dimension: 'brightness', direction: -1, note: 'Tizler söner.' },
    { param: 'decay', dimension: 'decay', direction: 1, note: 'T60 doğrudan.' },
  ],
  determinism: { stochastic: false, substreams: [] },
  resource: {
    model: 'O(kare) — mod sayısından bağımsız',
    workPerFrame: () => 6,
    stateBytes: (p, sampleRate) =>
      4 * (Math.ceil((2 * Number(p.length) * sampleRate) / SPEED_OF_SOUND) + 8),
  },
  process(buffer, params, ctx) {
    const { sampleRate } = ctx;
    const length = signalOf(params, 'length');
    const sign = choiceOf(params, 'ends') === 'open-closed' ? -1 : 1;
    const a = numberOf(params, 'loss');
    const t60 = numberOf(params, 'decay');
    let longest = 0;
    for (let i = 0; i < (typeof length === 'number' ? 1 : length.length); i++) {
      longest = Math.max(longest, sampleAt(length, i));
    }
    const size = Math.ceil((2 * longest * sampleRate) / SPEED_OF_SOUND) + 8;
    const line = new Float64Array(size);
    let write = 0;
    let previous = 0;
    for (let i = 0; i < buffer.length; i++) {
      const delay = Math.max(
        MIN_DELAY,
        (2 * sampleAt(length, i) * sampleRate) / SPEED_OF_SOUND - a,
      );
      const gain = Math.pow(10, (-3 * (delay / sampleRate)) / t60);
      const position = write - delay;
      const base = Math.floor(position);
      const frac = position - base;
      const i0 = ((base % size) + size) % size;
      const i1 = (i0 + 1) % size;
      const delayed = line[i0] + (line[i1] - line[i0]) * frac;
      const reflected = (1 - a) * delayed + a * previous;
      previous = delayed;
      const y = buffer[i] + sign * gain * reflected;
      line[write] = y;
      write = (write + 1) % size;
      buffer[i] = y;
    }
  },
};
