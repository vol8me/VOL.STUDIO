import { describe, expect, it } from 'vitest';

import { Presets, synthesize } from '../../src/index';
import { INSTRUMENTS, measure } from './instrumentContractShared';

/**
 * Enstrüman kataloğu sözleşmesi — uzun süre, determinizm ve kısa nota davranışı.
 *
 * `instrumentContract.test.ts` ile birlikte kataloğun taban davranışını sınar.
 */

describe('enstrüman kataloğu sözleşmesi', () => {
  it('katalog boş değil ve enstrümanlar bulunuyor', () => {
    expect(INSTRUMENTS.length).toBeGreaterThan(20);
  });

  it.each(INSTRUMENTS)('$name uzun süreyi bozulmadan taşır', ({ name, meta }) => {
    const m = measure(synthesize(Presets.getPreset(name, meta.typicalFrequency, 6)));
    expect(m.nonFinite, `${name} uzun notada NaN`).toBe(0);
    expect(m.peak, `${name} uzun notada kırpıyor`).toBeLessThan(1);
    expect(m.peak, `${name} uzun notada susuyor`).toBeGreaterThan(0.01);
  });

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

  it('KISA nota kuyruğu kesilir — bu bilinen ve BELGELENMİŞ bir sınırdır', () => {
    /*
     * `synthesize` tamponu tam `duration` kadar üretir; reverb ve delay
     * kuyruğunu UZATMAZ (`compose` uzatır). Kısa bir nota istendiğinde ses
     * hâlâ yüksekken tampon biter ve duyulur bir tık kalır.
     *
     * Bu test o davranışı KİLİTLER, düzeltmez: tampon uzunluğunu değiştirmek
     * `duration` kadar örnek bekleyen her çağıranı ve gönderilen ses
     * varlıklarının bayt eşitliğini etkiler. Kuyruk isteyen çağıran ya
     * `compose` kullanır ya süreye kendi payını ekler.
     *
     * Kilit ters yönde de çalışır: biri tamponu uzatırsa bu test düşer ve
     * karar bilinçli olarak verilir.
     */
    const short = measure(synthesize(Presets.heavyDrum(40, 0.12)));
    const natural = measure(synthesize(Presets.heavyDrum(40, 1.1)));

    expect(short.last, 'kısa nota artık kesilmiyor — davranış değişti').toBeGreaterThan(0.05);
    expect(natural.last, 'tipik sürede kesilme olmamalı').toBeLessThan(0.02);
  });
});
