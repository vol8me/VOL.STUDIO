import { expect, test, type Page } from '@playwright/test';
import { hitTargetSelectors } from './support/policy';
import { openShowcase, PHONE_VIEWPORT, selectTab, SHOWCASE_TABS } from './support/determinism';

/**
 * GEOMETRİ kapısı.
 *
 * Piksel temelinden ayrı durur çünkü farklı bir soruya cevap verir. Bir ekran
 * görüntüsü farkı "bir şey değişti" der; buradaki iddialar "ayarlar paneli
 * 393 px'de taşıyor" der. İkincisi düzeltilebilir bir teşhistir.
 *
 * Hepsi jsdom'un göremediği şeyleri ölçer: gerçek yerleşim, gerçek kırpma,
 * gerçek kutu boyutu.
 */

/** Sayfanın kendisi yatay kaymamalı — panel içi kaydırma meşrudur. */
async function documentOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe('geniş ekran', () => {
  test('hiçbir sekme sayfayı yatay kaydırılabilir yapmaz', async ({ page }) => {
    await openShowcase(page);
    const overflowing: string[] = [];
    for (const tab of SHOWCASE_TABS) {
      await selectTab(page, tab);
      const overflow = await documentOverflow(page);
      if (overflow > 0) overflowing.push(`${tab}: +${overflow}px`);
    }
    expect(overflowing).toEqual([]);
  });
});

test.describe('telefon genişliği', () => {
  test.use(PHONE_VIEWPORT);

  test('hiçbir sekme sayfayı yatay kaydırılabilir yapmaz', async ({ page }) => {
    /*
     * Bu kapı gerçek bir hatayla yazıldı. `hud` sekmesi 393 px'de sayfayı 57 px
     * yatay kaydırılabilir yapıyordu: `.vol-tabs__panels` `overflow: auto`
     * taşıyor ama `position: static`ti ve statik bir kap mutlak konumlu
     * torununun containing block'u olamaz — panelin `.vol-sr-only` açıklamaları
     * kırpmadan kaçıp belgeyi genişletiyordu. Parmakla boşluğa kayan bir sayfa,
     * hiçbir birim testin göremeyeceği bir kusurdur.
     */
    await openShowcase(page);
    const overflowing: string[] = [];
    for (const tab of SHOWCASE_TABS) {
      await selectTab(page, tab);
      const overflow = await documentOverflow(page);
      if (overflow > 0) overflowing.push(`${tab}: +${overflow}px`);
    }
    expect(
      overflowing,
      'Bir eleman kaydırma kabının kırpmasından kaçıyor olabilir: ' +
        '`overflow` taşıyan kabın `position: relative` olduğundan emin ol.',
    ).toEqual([]);
  });

  test('politika kapsamındaki dokunma hedefleri GERÇEKTEN 44 px çizilir', async ({ page }) => {
    /*
     * `hitTargetSync.test.ts` kuralın CSS'te var olduğunu doğrular ve kendi
     * yorumunda sınırını yazar: jsdom yerleşim hesaplamaz. Kural doğruyken
     * kutunun yine de küçük kalması mümkündür — rakip bir `max-height`,
     * kırpan bir ata ya da eşleşmeyen bir medya sorgusu yüzünden. Ölçüm ancak
     * gerçek tarayıcıda yapılabilir.
     */
    const selectors = hitTargetSelectors();
    expect(selectors.length, 'Politika seçicileri CSS’ten okunamadı').toBeGreaterThan(20);

    await openShowcase(page);
    const violations: string[] = [];
    for (const tab of SHOWCASE_TABS) {
      await selectTab(page, tab);
      const small = await page.evaluate((list) => {
        const bad: string[] = [];
        for (const selector of list) {
          for (const element of document.querySelectorAll<HTMLElement>(selector)) {
            const style = getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden') continue;
            if (Number(style.opacity) === 0) continue;
            const rect = element.getBoundingClientRect();
            // Hiç çizilmemiş (kapalı bir katmanın içindeki) eleman ölçülmez.
            if (rect.width === 0 && rect.height === 0) continue;
            // Yarım piksel payı: tarayıcı kutuyu alt piksele yuvarlayabilir.
            if (rect.width < 43.5 || rect.height < 43.5) {
              bad.push(`${selector} → ${Math.round(rect.width)}x${Math.round(rect.height)}`);
            }
          }
        }
        return [...new Set(bad)];
      }, selectors);
      if (small.length) violations.push(`${tab}: ${small.join(' | ')}`);
    }

    expect(
      violations,
      'Bu hedefler `--vol-hit-target-min` tüketiyor ama kaba işaretçide 44 px ' +
        'çizilmiyor. Kural doğru olsa bile kutu küçük kalabilir.',
    ).toEqual([]);
  });

  test('Kanban sütunları ezilmez, pano kayar', async ({ page }) => {
    /*
     * Dar bir kapta altı sütun `flex: 1` + `min-width: 0` ile 54 px'e iniyor,
     * kartlar 36 px kalıyordu: bileşen küçülmüş gibi görünüyor ama fiilen
     * çalışmıyordu — kart okunmuyor, sürükleme hedefi parmakla vurulamıyordu.
     */
    await openShowcase(page);
    await selectTab(page, 'advanced');

    const board = await page.evaluate(() => {
      const element = document.querySelector<HTMLElement>('.vol-kanban');
      if (!element) return null;
      const minimum = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--vol-kanban-column-min'),
      );
      return {
        minimum,
        overflowX: getComputedStyle(element).overflowX,
        columnWidths: [...element.querySelectorAll<HTMLElement>('.vol-kanban__column')].map(
          (column) => column.getBoundingClientRect().width,
        ),
      };
    });

    expect(board, 'Kanban demosu bulunamadı').not.toBeNull();
    expect(board!.columnWidths.length).toBeGreaterThan(1);
    // Taşma panonun KENDİ kabında karşılanır; belgeye sızmadığını yukarıdaki
    // taşma testi ayrıca doğrular.
    expect(board!.overflowX).toBe('auto');
    for (const width of board!.columnWidths) {
      expect(width).toBeGreaterThanOrEqual(board!.minimum - 0.5);
    }
  });

  test('görünür hiçbir etkileşimli eleman sıfır boyutlu değildir', async ({ page }) => {
    /*
     * Sıfır boyutlu bir düğme testten tıklanabilir ama parmakla vurulamaz;
     * yapısal testler onu "var" sayar. Görsel gizleme deseni (`clip` ile 1 px)
     * bilinçlidir ve ayrı tutulur.
     */
    await openShowcase(page);
    const broken: string[] = [];
    for (const tab of SHOWCASE_TABS) {
      await selectTab(page, tab);
      const zero = await page.evaluate((tabId) => {
        const panel = document.querySelector<HTMLElement>(
          `[role="tabpanel"][id$="-panel-${tabId}"]`,
        );
        if (!panel) return [];
        const bad: string[] = [];
        for (const element of panel.querySelectorAll<HTMLElement>(
          'button, a[href], input, select, textarea, [role="button"]',
        )) {
          const style = getComputedStyle(element);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          if (style.clip !== 'auto' || style.clipPath !== 'none') continue;
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) {
            bad.push(
              `${element.tagName.toLowerCase()}.${element.className.toString().split(' ')[0]}`,
            );
          }
        }
        return [...new Set(bad)];
      }, tab);
      if (zero.length) broken.push(`${tab}: ${zero.join(', ')}`);
    }
    expect(broken).toEqual([]);
  });
});
