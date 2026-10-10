import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { openShowcase, selectTab, SHOWCASE_TABS } from './support/determinism';

/**
 * KAPININ KENDİSİNİ sınayan katman.
 *
 * Piksel temeli, ancak dondurma katmanı çalışıyorsa bir şey ifade eder.
 * Çalışmazsa kapı gerçek bir gerileme olmadan kırılır; birkaç yanlış alarmdan
 * sonra "yine o test" denip görmezden gelinir ve kapı fiilen ölür. Bu yüzden
 * kararlılık VARSAYILMAZ, ölçülür.
 *
 * Ölçüm AYRI SAYFA YÜKLEMELERİ arasında yapılır. Aynı yükleme içinde iki kez
 * görüntü almak neredeyse her zaman aynı sonucu verir — rastgelelik kurulum
 * anında bir kez tüketilmiştir. Kapının gerçekte karşılaştığı durum ise iki
 * ayrı koşudur.
 */
test.describe('dondurma katmanı', () => {
  test('rastgelelik ve saat gerçekten donar', async ({ page }) => {
    await openShowcase(page);

    const readings = await page.evaluate(() => ({
      randoms: [Math.random(), Math.random(), Math.random()],
      now: Date.now(),
      date: new Date().toISOString(),
      perf: performance.now(),
      // Argümanlı biçim dokunulmamış olmalı: dondurma `new Date()`i sabitler,
      // tarih ARİTMETİĞİNİ bozmaz.
      parsed: new Date('2030-05-05T00:00:00Z').toISOString(),
    }));

    expect(readings.now).toBe(Date.UTC(2026, 0, 1));
    expect(readings.date).toBe('2026-01-01T00:00:00.000Z');
    expect(readings.perf).toBe(0);
    expect(readings.parsed).toBe('2030-05-05T00:00:00.000Z');

    // Tohumlu üreteç: aynı tohum, aynı dizi.
    const second = await page.evaluate(() => {
      const values: number[] = [];
      for (let i = 0; i < 3; i++) values.push(Math.random());
      return values;
    });
    expect(second.every((value) => value >= 0 && value < 1)).toBe(true);

    await page.reload();
    const afterReload = await page.evaluate(() => [Math.random(), Math.random(), Math.random()]);
    expect(afterReload).toEqual(readings.randoms);
  });

  /*
   * Bu testlerin ölçtüğü şey piksel temelinin sıfır toleransının gerekçesidir.
   * Sekme iki yüklemede birebir aynı çıkıyorsa tolerans gerekmez; bir sekme
   * burada kaymaya başlarsa piksel temeli o sekme için güvenilmezdir ve eşiği
   * gevşetmek yerine kaynağı dondurulmalıdır.
   *
   * Sekme başına ayrı test: tek testte tüm sekmeleri iki kez gezmek, yük altında
   * test zaman aşımının büyük kısmını yer ve düşen sekmenin adını gizler.
   */
  for (const tab of SHOWCASE_TABS) {
    test(`AYRI yüklemelerde "${tab}" sekmesinin görüntüsü birebir aynıdır`, async ({ page }) => {
      const digest = async (): Promise<string> => {
        await openShowcase(page);
        await selectTab(page, tab);
        const shot = await page.locator(`[role="tabpanel"][id$="-panel-${tab}"]`).screenshot();
        return createHash('sha256').update(shot).digest('hex');
      };

      const first = await digest();
      const second = await digest();

      expect(
        second,
        `"${tab}" iki AYRI yüklemede farklı çizildi. Bir dondurulmamış ` +
          `rastgelelik/zaman kaynağı var; eşiği gevşetmek yerine kaynağı bul.`,
      ).toBe(first);
    });
  }
});
