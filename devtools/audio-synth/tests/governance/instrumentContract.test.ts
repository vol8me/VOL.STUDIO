import { describe, expect, it } from 'vitest';

import { Presets, synthesize } from '../../src/index';
import type { SynthesisResult } from '../../src/types';

/**
 * Enstrüman kataloğunun KULLANIM sözleşmesi.
 *
 * Bu presetleri üretim sırasında sürekli çağıran bir tüketici, her çağrının
 * makul bir ses döndüreceğine güvenir; tek tek dinleyecek hâli yoktur. Burada
 * sınanan şey tını DEĞİL (o `acousticSpectrum.test.ts`in işi), her çağrının
 * taşıması gereken taban: kırpmaz, susmaz, NaN üretmez, tıklamaz, DC
 * biriktirmez ve aynı girdiye aynı çıktıyı verir.
 *
 * Ölçüm noktaları presetin BEYAN ETTİĞİ aralıktan gelir. Aralık dışında bir
 * preset yanlış değildir, tanımsızdır — glockenspiel 65 Hz'de enstrüman değil
 * gürültüdür ve o yüzden aralık zorunludur.
 */
const INSTRUMENTS = Object.entries(Presets.PRESET_CATALOG)
  .filter(([, meta]) => meta.category === 'instrument')
  .map(([name, meta]) => ({ name, meta }));

interface Measurement {
  peak: number;
  dc: number;
  nonFinite: number;
  first: number;
  last: number;
}

function measure(result: SynthesisResult): Measurement {
  const samples = result.channels[0];
  if (!samples || samples.length === 0) throw new Error('kanal yok');
  let peak = 0;
  let sum = 0;
  let nonFinite = 0;
  for (const value of samples) {
    if (!Number.isFinite(value)) {
      nonFinite++;
      continue;
    }
    peak = Math.max(peak, Math.abs(value));
    sum += value;
  }
  return {
    peak,
    dc: Math.abs(sum / samples.length),
    nonFinite,
    first: Math.abs(samples[0]),
    last: Math.abs(samples[samples.length - 1]),
  };
}

/** Beyan edilen aralığın pes, orta (geometrik) ve tiz ucu. */
function testPitches(range: [number, number]): number[] {
  const [low, high] = range;
  return [low, Math.sqrt(low * high), high];
}

describe('enstrüman kataloğu sözleşmesi', () => {
  it('katalog boş değil ve enstrümanlar bulunuyor', () => {
    expect(INSTRUMENTS.length).toBeGreaterThan(20);
  });

  it.each(INSTRUMENTS)('$name kullanılabilir aralığını BEYAN eder', ({ name, meta }) => {
    expect(meta.range, `${name} aralık beyan etmiyor`).toBeDefined();
    const [low, high] = meta.range!;
    expect(low).toBeGreaterThan(0);
    expect(high).toBeGreaterThan(low);
    // Tipik frekans aralığın dışındaysa ikisinden biri yanlıştır.
    expect(meta.typicalFrequency).toBeGreaterThanOrEqual(low);
    expect(meta.typicalFrequency).toBeLessThanOrEqual(high);
  });

  it.each(INSTRUMENTS)('$name aralık boyunca sağlam ses üretir', ({ name, meta }) => {
    for (const frequency of testPitches(meta.range!)) {
      const at = `${name}@${frequency.toFixed(0)}Hz`;
      const m = measure(synthesize(Presets.getPreset(name, frequency, meta.typicalDuration)));

      expect(m.nonFinite, `${at} sonlu olmayan örnek üretti`).toBe(0);
      expect(m.peak, `${at} duyulmayacak kadar sessiz`).toBeGreaterThan(0.01);

      /*
       * SEVİYE ÖNGÖRÜLEBİLİR OLMALI.
       *
       * "Kırpmıyor" diye sınamak boştur: motor varsayılan olarak tepeyi
       * `0,95 × gain`e normalize eder, yani tek bir preset kırpamaz. Katman
       * toplayan bir tüketici için asıl soru başkadır — `gain` çıkış
       * seviyesini GERÇEKTEN öngörüyor mu? Öngörmüyorsa iki sesi toplarken
       * beklenen dengeyi kuramaz.
       *
       * Ölçüldü: oran katalog boyunca 0,929 ile 1,000 arasında. Alt sınır
       * pay bırakılarak 0,88'e konur; oranın düşmesi `normalize: false`
       * geçildiği ya da zincirin sonunda seviyeyi bozan bir şey eklendiği
       * anlamına gelir.
       */
      const declaredGain = Presets.getPreset(name, frequency, meta.typicalDuration).gain ?? 1;
      const levelRatio = m.peak / (0.95 * declaredGain);
      expect(levelRatio, `${at} seviyesi \`gain\`den öngörülemiyor`).toBeGreaterThan(0.88);
      expect(levelRatio, `${at} beyan ettiğinden yüksek çalıyor`).toBeLessThan(1.02);

      // DC hem tepe payını yer hem katmanlar toplandığında birikir. Ölçülen
      // en kötü 0,0068; eşik onun biraz üstünde.
      expect(m.dc, `${at} DC kaymalı`).toBeLessThan(0.01);
      // Nota sıfırdan başlamazsa girişte tık olur.
      expect(m.first, `${at} sıfırdan başlamıyor`).toBeLessThan(0.01);
    }
  });

  it.each(INSTRUMENTS)('$name tipik süresinde sessizce biter', ({ name, meta }) => {
    for (const frequency of testPitches(meta.range!)) {
      const m = measure(synthesize(Presets.getPreset(name, frequency, meta.typicalDuration)));
      // Art arda dizilen notalarda son örnek duyulur bir tık bırakmamalı.
      expect(m.last, `${name}@${frequency.toFixed(0)}Hz kuyrukta kesiliyor`).toBeLessThan(0.02);
    }
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
