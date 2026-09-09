import { describe, it, expect } from 'vitest';
import { Chorus, Flanger, PhaserEffect } from '../../src/effects/modulation';
import { createRandom } from '@volstudio/core/random';

/**
 * MODÜLASYON EFEKTLERİ — gecikme hattı ve allpass zinciri.
 *
 * Bu üç sınıf reçetelerden çağrılıyordu ama hiç doğrudan test edilmemişti;
 * kapsam şekli bekçisi (`scripts/quality/coverageShape.mjs`) 142 satırın
 * %26,1'inin koşulduğunu gösterince yazıldı.
 *
 * İddialar DSP ÖZELLİĞİDİR, örnek örnek sabit değil: kuru geçiş, sarmal
 * indeksin sınır dışına çıkmaması, parametre kırpmasının ıraksamayı önlemesi,
 * allpass zincirinin genliği koruması, `reset()`in taze örnekle aynı çıktıyı
 * vermesi. Sabit örnek dizisi yazmak her katsayı değişiminde kırılır ve
 * kırıldığında hiçbir şey öğretmez.
 */
const SR = 44100;

/** `t` saniyedir; örnek indeksinden türetilir, böylece LFO gerçek hızda döner. */
function drive(effect: { process(input: number, t: number): number }, input: number[]): number[] {
  return input.map((sample, i) => effect.process(sample, i / SR));
}

function noise(count: number): number[] {
  const random = createRandom(0x9e3779b9);
  return Array.from({ length: count }, () => random.bipolar());
}

function rms(values: number[]): number {
  return Math.sqrt(values.reduce((sum, v) => sum + v * v, 0) / values.length);
}

describe('Chorus', () => {
  it('mix 0 kuru geçiştir — sinyale dokunmaz', () => {
    const input = noise(512);
    const output = drive(new Chorus({ mix: 0 }, SR), input);

    for (let i = 0; i < input.length; i++) expect(output[i]).toBeCloseTo(input[i], 12);
  });

  it('mix 1 gecikmiş sinyali verir — darbe taban gecikmesi kadar sonra çıkar', () => {
    // depth 0 ⇒ LFO sapması yok, gecikme tam olarak baseMs (15 ms).
    const baseSamples = Math.floor(SR * 0.015);
    const impulse = Array.from({ length: baseSamples + 64 }, (_, i) => (i === 0 ? 1 : 0));

    const output = drive(new Chorus({ mix: 1, depth: 0 }, SR), impulse);
    const peakIndex = output.reduce(
      (best, v, i) => (Math.abs(v) > Math.abs(output[best]) ? i : best),
      0,
    );

    expect(peakIndex).toBe(baseSamples);
    expect(output[peakIndex]).toBeCloseTo(1, 6);
  });

  it('derinlik tabanı aşamaz — negatif gecikme sarmalı bozmaz', () => {
    /*
     * `depth` taban gecikmeden (15 ms) büyük verilirse LFO'nun negatif yarısında
     * gecikme sıfırın altına iner; kırpma olmasa okuma indeksi sarmalın yanlış
     * tarafına düşer ve efekt sessizce GELECEKTEKİ örneği okur.
     */
    const output = drive(new Chorus({ mix: 1, depth: 500, rate: 40 }, SR), noise(4096));

    for (const sample of output) {
      expect(Number.isFinite(sample)).toBe(true);
      expect(Math.abs(sample)).toBeLessThanOrEqual(1);
    }
  });

  it('reset taze örnekle aynı çıktıyı verir', () => {
    const input = noise(256);
    const used = new Chorus({ mix: 0.5 }, SR);
    drive(used, noise(256));
    used.reset();

    expect(drive(used, input)).toEqual(drive(new Chorus({ mix: 0.5 }, SR), input));
  });
});

describe('Flanger', () => {
  it('mix 0 kuru geçiştir', () => {
    const input = noise(512);
    const output = drive(new Flanger({ mix: 0 }, SR), input);

    for (let i = 0; i < input.length; i++) expect(output[i]).toBeCloseTo(input[i], 12);
  });

  it('feedback ±0,95 aralığına kırpılır — hat ıraksamaz', () => {
    /* Kırpma olmasa 5 kazançlı geri besleme hattı üstel büyütür ve çıktı Inf olur. */
    const output = drive(new Flanger({ mix: 1, feedback: 5 }, SR), noise(8192));

    for (const sample of output) expect(Number.isFinite(sample)).toBe(true);
    expect(Math.max(...output.map(Math.abs))).toBeLessThan(50);
  });

  it('geri besleme sinyali gerçekten uzatır', () => {
    const impulse = Array.from({ length: 4096 }, (_, i) => (i === 0 ? 1 : 0));
    const tail = (feedback: number) =>
      rms(drive(new Flanger({ mix: 1, feedback, time: 2, depth: 0 }, SR), impulse).slice(1000));

    expect(tail(0.9)).toBeGreaterThan(tail(0));
  });

  it('reset taze örnekle aynı çıktıyı verir', () => {
    const input = noise(256);
    const used = new Flanger({ mix: 0.5, feedback: 0.4 }, SR);
    drive(used, noise(256));
    used.reset();

    expect(drive(used, input)).toEqual(drive(new Flanger({ mix: 0.5, feedback: 0.4 }, SR), input));
  });
});

describe('PhaserEffect', () => {
  it('mix 0 kuru geçiştir', () => {
    const input = noise(512);
    const output = drive(new PhaserEffect({ mix: 0 }, SR), input);

    for (let i = 0; i < input.length; i++) expect(output[i]).toBeCloseTo(input[i], 12);
  });

  it('allpass zinciri genliği korur — mix 1, feedback 0', () => {
    /*
     * Birinci derece allpass kademelerinin kaskadı FAZI çevirir, GENLİĞİ değil.
     * Çıkış RMS'i girişten belirgin sapıyorsa kademe bir alçak/yüksek geçirene
     * dönüşmüştür — `setFreq` katsayısındaki bir hata tam olarak böyle görünür.
     */
    const input = noise(16384);
    const output = drive(new PhaserEffect({ mix: 1, feedback: 0, stages: 4 }, SR), input);

    expect(rms(output)).toBeCloseTo(rms(input), 1);
  });

  it('kademeler yayılır — 8 kademe 1 kademeden farklı çentik üretir', () => {
    const input = noise(2048);
    const one = drive(new PhaserEffect({ mix: 1, stages: 1 }, SR), input);
    const eight = drive(new PhaserEffect({ mix: 1, stages: 8 }, SR), input);

    expect(rms(one.map((v, i) => v - eight[i]))).toBeGreaterThan(0.01);
  });

  it('triangle ve sine LFO farklı süpürme verir', () => {
    const input = noise(2048);
    const sine = drive(new PhaserEffect({ mix: 1, wave: 'sine', rate: 8 }, SR), input);
    const triangle = drive(new PhaserEffect({ mix: 1, wave: 'triangle', rate: 8 }, SR), input);

    expect(rms(sine.map((v, i) => v - triangle[i]))).toBeGreaterThan(0.01);
  });

  it('feedback kırpması ıraksamayı önler', () => {
    const output = drive(new PhaserEffect({ mix: 1, feedback: 12, stages: 6 }, SR), noise(8192));

    for (const sample of output) expect(Number.isFinite(sample)).toBe(true);
  });

  it('reset taze örnekle aynı çıktıyı verir', () => {
    const input = noise(256);
    const used = new PhaserEffect({ mix: 0.6, feedback: 0.5 }, SR);
    drive(used, noise(256));
    used.reset();

    expect(drive(used, input)).toEqual(
      drive(new PhaserEffect({ mix: 0.6, feedback: 0.5 }, SR), input),
    );
  });
});
