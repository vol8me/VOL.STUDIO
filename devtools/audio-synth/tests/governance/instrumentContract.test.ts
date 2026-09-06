import { describe, expect, it } from 'vitest';

import { Presets, synthesize } from '../../src/index';
import { INSTRUMENTS, measure, testPitches } from './instrumentContractShared';

/**
 * Enstrüman kataloğunun KULLANIM sözleşmesi — aralık ve kuyruk.
 *
 * Bu dosya ağır `it.each` bloklarından birini taşır; coverage altında tek dosya
 * Vitest worker RPC zaman aşımına düştüğü için parçalandı.
 */

describe('enstrüman kataloğu sözleşmesi', () => {
  const RANGE_CASES = INSTRUMENTS.flatMap(({ name, meta }) =>
    testPitches(meta.range!).map((frequency) => ({ name, meta, frequency })),
  );

  // Her (enstrüman, frekans) çifti ayrı bir testte; tek testte 3 frekansı
  // dönmek coverage altında zaman aşımına düşüyor (örn. `additivePad`).
  it.each(RANGE_CASES)(
    '$name $frequency Hz aralık boyunca sağlam ses üretir',
    ({ name, meta, frequency }) => {
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
       */
      const declaredGain = Presets.getPreset(name, frequency, meta.typicalDuration).gain ?? 1;
      const levelRatio = m.peak / (0.95 * declaredGain);
      expect(levelRatio, `${at} seviyesi \`gain\`den öngörülemiyor`).toBeGreaterThan(0.88);
      expect(levelRatio, `${at} beyan ettiğinden yüksek çalıyor`).toBeLessThan(1.02);

      // DC hem tepe payını yer hem katmanlar toplandığında birikir.
      expect(m.dc, `${at} DC kaymalı`).toBeLessThan(0.01);
      // Nota sıfırdan başlamazsa girişte tık olur.
      expect(m.first, `${at} sıfırdan başlamıyor`).toBeLessThan(0.01);
    },
  );

  it.each(RANGE_CASES)(
    '$name $frequency Hz tipik süresinde sessizce biter',
    ({ name, meta, frequency }) => {
      const m = measure(synthesize(Presets.getPreset(name, frequency, meta.typicalDuration)));
      // Art arda dizilen notalarda son örnek duyulur bir tık bırakmamalı.
      expect(m.last, `${name}@${frequency.toFixed(0)}Hz kuyrukta kesiliyor`).toBeLessThan(0.02);
    },
  );
});
