import { describe, expect, it } from 'vitest';

import { Presets, synthesize } from '../../src/index';
import { INSTRUMENTS, measure } from './instrumentContractShared';

/**
 * Enstrüman kataloğu sözleşmesi — uzun süre, determinizm ve kısa nota davranışı.
 *
 * `instrumentContract.test.ts` ile birlikte kataloğun taban davranışını sınar.
 * Piyano ailesi 6 saniyelik modal sentezi v8 coverage altında ağır yüklüyor;
 * bu yüzden uzunluk 4 saniyeye indirilip kendi `it.each` bloğunda 10 saniye
 * sınırıyla ayrı koşulur.
 */

const PIANOS = INSTRUMENTS.filter(({ name }) => name.endsWith('Piano'));
const OTHERS = INSTRUMENTS.filter(({ name }) => !name.endsWith('Piano'));

describe('enstrüman kataloğu sözleşmesi', () => {
  it('katalog boş değil ve enstrümanlar bulunuyor', () => {
    expect(INSTRUMENTS.length).toBeGreaterThan(20);
  });

  it.each(OTHERS)('$name uzun süreyi bozulmadan taşır', ({ name, meta }) => {
    const m = measure(synthesize(Presets.getPreset(name, meta.typicalFrequency, 4)));
    expect(m.nonFinite, `${name} uzun notada NaN`).toBe(0);
    expect(m.peak, `${name} uzun notada kırpıyor`).toBeLessThan(1);
    expect(m.peak, `${name} uzun notada susuyor`).toBeGreaterThan(0.01);
  });

  it.each(PIANOS)(
    '$name uzun süreyi bozulmadan taşır',
    ({ name, meta }) => {
      const m = measure(synthesize(Presets.getPreset(name, meta.typicalFrequency, 4)));
      expect(m.nonFinite, `${name} uzun notada NaN`).toBe(0);
      expect(m.peak, `${name} uzun notada kırpıyor`).toBeLessThan(1);
      expect(m.peak, `${name} uzun notada susuyor`).toBeGreaterThan(0.01);
    },
    10000,
  );

  it.each(INSTRUMENTS)('$name DETERMİNİSTİKTİR', ({ name, meta }) => {
    const first = synthesize(Presets.getPreset(name, meta.typicalFrequency, 0.5)).channels[0];
    const second = synthesize(Presets.getPreset(name, meta.typicalFrequency, 0.5)).channels[0];
    expect(first.length).toBe(second.length);
    // Örnek örnek karşılaştırma milyonlarca assertion demektir; fark bir kez
    // sayılır ve iddia bir kez kurulur.
    let differing = 0;
    for (let i = 0; i < first.length; i++) if (first[i] !== second[i]) differing++;
    expect(differing, `${name} aynı girdiye farklı çıktı verdi`).toBe(0);
  });

  it('KISA nota kuyruğu uzatılmaz ama kesim yumuşatılır — BELGELENMİŞ sözleşme', () => {
    /*
     * `synthesize` tamponu tam `duration` kadar üretir; reverb ve delay
     * kuyruğunu UZATMAZ (`compose` uzatır). Kesim sert değildir:
     * `applyGlobalEffects` tamponun son ~10 ms'ine de-click sönümü uygular,
     * bu yüzden tampon sıfıra iner ama sesin sönümü tamamlanmaz — kısa
     * notada ses eksiktir, tık yoktur.
     *
     * Kilit üç yönde çalışır: tamponu uzatan, de-click'i kaldıran ya da
     * kesimi doğal sönüme çeviren her değişiklik bu testi düşürür.
     */
    const short = synthesize(Presets.heavyDrum(40, 0.12));
    const natural = measure(synthesize(Presets.heavyDrum(40, 1.1)));

    // Tampon uzunluğu sözleşmesi: duration'dan fazla örnek üretilmez.
    expect(short.channels[0].length).toBe(Math.floor(0.12 * short.sampleRate));

    // Kesim hâlâ gerçek: fade'in hemen öncesinde ses yüksekte kesiliyor —
    // yani kuyruk doğal sönümle değil, tampon sınırıyla bitiyor.
    const samples = short.channels[0];
    const fadeLen = Math.floor(short.sampleRate * 0.01);
    let sumSq = 0;
    const probeEnd = samples.length - fadeLen;
    const probeStart = probeEnd - Math.floor(short.sampleRate * 0.02);
    for (let i = probeStart; i < probeEnd; i++) sumSq += samples[i] * samples[i];
    const rmsBeforeCut = Math.sqrt(sumSq / (probeEnd - probeStart));
    expect(rmsBeforeCut, 'kısa nota kesim öncesi hâlâ seste').toBeGreaterThan(0.05);

    // Kesim yumuşak: son örnek sıfıra iner, doğal sürede de öyle.
    expect(Math.abs(samples[samples.length - 1]), 'kuyruk tık üretmemeli').toBeLessThan(0.02);
    expect(natural.last, 'tipik sürede kesilme olmamalı').toBeLessThan(0.02);
  });
});
