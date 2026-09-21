import { describe, expect, it } from 'vitest';

import { processSample, resample } from '../src/index';

/**
 * Yeniden örnekleyicinin spektral sözleşmesi, çıkışın KENDİSİNDE ölçülür.
 *
 * Tek tonlu girdi çıkış Nyquist'inin üstündeyse ideal çıkış sıfırdır; çıkışta
 * kalan her enerji alias'tır ve RMS'i doğrudan ölçülür. Eski kayan ortalama +
 * doğrusal enterpolasyon aynı ölçümde 2× aşağı örneklemede −3.3 dB (11.5 kHz)
 * ile −16.7 dB (20 kHz) arası alias veriyordu. Bütçe: −90 dB (16-bit teslim
 * biçiminin tabanına yakın; tasarım 96 dB).
 */

const SR = 44100;
const AMPLITUDE = 0.5;

function tone(frequency: number, sampleRate: number, length: number): Float32Array {
  return Float32Array.from(
    { length },
    (_, i) => Math.sin((2 * Math.PI * frequency * i) / sampleRate) * AMPLITUDE,
  );
}

/** Kenarlar dışarıda: çekirdek oraya sıfır dolgu görür. */
function relativeRmsDb(y: Float32Array): number {
  let sum = 0;
  const from = 2000;
  const to = y.length - 2000;
  for (let i = from; i < to; i++) sum += y[i] * y[i];
  return 20 * Math.log10(Math.sqrt(sum / (to - from)) / (AMPLITUDE / Math.SQRT2));
}

/** 4 terimli Blackman-Harris (yan lob −92 dB) pencereli Goertzel genliği. */
function levelAt(y: Float32Array, sampleRate: number, frequency: number): number {
  const length = 16384;
  const from = 8000;
  const coeff = 2 * Math.cos((2 * Math.PI * frequency) / sampleRate);
  let s1 = 0;
  let s2 = 0;
  let windowSum = 0;
  for (let i = 0; i < length; i++) {
    const a = (2 * Math.PI * i) / (length - 1);
    const w =
      0.35875 - 0.48829 * Math.cos(a) + 0.14128 * Math.cos(2 * a) - 0.01168 * Math.cos(3 * a);
    const s0 = y[from + i] * w + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
    windowSum += w;
  }
  const magnitude = Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2)) * (2 / windowSum);
  return 20 * Math.log10(Math.max(magnitude, 1e-12) / AMPLITUDE);
}

describe('resample — bant sınırlı', () => {
  it.each([11500, 13000, 16000, 20000])(
    '2× aşağı örneklemede %s Hz (çıkış Nyquist üstü) −90 dB altına iner',
    (frequency) => {
      expect(relativeRmsDb(resample(tone(frequency, SR, SR), 2))).toBeLessThan(-90);
    },
  );

  it.each([1000, 5000, 9900])('%s Hz geçiş bandında ±0.1 dB korunur', (frequency) => {
    expect(Math.abs(relativeRmsDb(resample(tone(frequency, SR, SR), 2)))).toBeLessThan(0.1);
  });

  it('kesirli oran (48 → 44.1 kHz): 23 kHz tonu alias üretmez', () => {
    expect(relativeRmsDb(resample(tone(23000, 48000, 48000), 48000 / 44100))).toBeLessThan(-90);
  });

  it('yukarı örneklemede (22.05 → 44.1 kHz) görüntü bastırılır, ton korunur', () => {
    const y = resample(tone(5000, 22050, 22050), 0.5);
    expect(Math.abs(levelAt(y, SR, 5000))).toBeLessThan(0.1);
    // Görüntü: 22050 − 5000 = 17050 Hz. Doğrusal enterpolasyon −18 dB bırakıyordu.
    expect(levelAt(y, SR, 17050)).toBeLessThan(-90);
  });

  it('maxLength gerekenden fazla çıkış hesaplamaz', () => {
    const x = tone(440, SR, SR);
    expect(resample(x, 0.25, 1000).length).toBe(1000);
    expect(resample(x, 0.25).length).toBe(SR * 4);
    // Kısaltılmış çıkış, tam çıkışın başıyla aynıdır.
    expect(Array.from(resample(x, 0.5, 500))).toEqual(
      Array.from(resample(x, 0.5).subarray(0, 500)),
    );
  });

  it('processSample pitch/oran dönüşümünde aynı çekirdeği kullanır', () => {
    // Bir oktav aşağı kaydırılan 30 kHz'lik kaynak: çıkış 44.1 kHz'de
    // Nyquist'i aşan içerik taşımamalı (kaynakta 18 kHz ton → 9 kHz'e iner,
    // 30 kHz'lik kaynak oranı 44.1'e eşlenir).
    const source = tone(14000, 30000, 30000);
    const out = processSample({ data: source, sampleRate: 30000, pitchShift: 12 }, SR, SR / 2);
    // +12 yarım ton: 14 kHz → 28 kHz > 22.05 kHz Nyquist → çıkışta alias kalmamalı.
    expect(relativeRmsDb(out)).toBeLessThan(-90);
  });
});
