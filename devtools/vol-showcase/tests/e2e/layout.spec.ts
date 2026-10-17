import { expect, test, type Page } from '@playwright/test';
import { LAYER_SCENARIOS, openLayer, reconcile } from './support/accessibility';
import { writeFileSync } from 'node:fs';
import {
  coverage,
  geometryShifts,
  hitTargetProblems,
  loadGeometryRecords,
  measureTargets,
  snapshotGeometry,
  type HitProblem,
  type TargetMeasure,
} from './support/geometry';
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

/*
 * Bilinen kusur kaydı (`support/geometryExceptions.json`): her kayıt sahip UI
 * görevine bağlıdır. Bulgu kayıtta yoksa test düşer; kaydı olup artık bulunmayan
 * (düzelmiş) bulgu da düşer, böylece kayıt görev kapanınca silinir.
 * `GEOMETRY_RECORD=<dosya>` yalnız yeni kayıt taslağı için ham bulguları yazar.
 */
const geometryRecords = loadGeometryRecords();
const recordPath = process.env.GEOMETRY_RECORD;
const recorded: Record<string, HitProblem[]> = {};

test.afterAll(() => {
  if (recordPath) writeFileSync(recordPath, JSON.stringify(recorded, null, 2));
});

function reconcileHitTargets(scope: string, measures: TargetMeasure[]): void {
  const found = hitTargetProblems(measures);
  if (recordPath) {
    recorded[`${test.info().project.name}/${scope}`] = found;
    return;
  }
  const result = reconcile(found, geometryRecords, scope);
  expect(
    result.unexpected,
    `${scope}: kayıtsız hedef bulgusu (44 px çizilmiyor, örtülü ya da kırpılıyor)`,
  ).toEqual([]);
  expect(result.stale, `${scope}: bayat kayıt (bulgu düzelmiş, kaydı sil)`).toEqual([]);
}

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

  test('Sheet sağdan açılır, ekranın en az yarısını ve tam yüksekliğini kaplar', async ({
    page,
  }) => {
    await openShowcase(page);
    await selectTab(page, 'panels');
    await page.locator('.vol-showcase-sheet-trigger').click();
    const geometry = await page
      .locator('.vol-showcase-sheet .vol-modal__content')
      .evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, width: rect.width, height: rect.height };
      });
    const viewport = page.viewportSize();

    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.width).toBeGreaterThanOrEqual(viewport!.width / 2);
    expect(geometry.height).toBe(viewport!.height);
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

  test('Sheet telefonda tam genişlikte kalır ve kapatma hedefi 44 px olur', async ({ page }) => {
    await openShowcase(page);
    await selectTab(page, 'panels');
    await page.locator('.vol-showcase-sheet-trigger').click();
    const content = page.locator('.vol-showcase-sheet .vol-modal__content');
    const close = page.locator('.vol-showcase-sheet .vol-sheet__close');

    await expect(content).toBeVisible();
    expect((await content.boundingBox())?.width).toBe(393);
    expect((await close.boundingBox())?.width).toBeGreaterThanOrEqual(44);
    expect((await close.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  });

  test('politika kapsamındaki dokunma hedefleri GERÇEKTEN 44 px çizilir', async ({
    page,
  }, info) => {
    /*
     * `hitTargetSync.test.ts` kuralın CSS'te var olduğunu doğrular ve kendi
     * yorumunda sınırını yazar: jsdom yerleşim hesaplamaz. Kural doğruyken
     * kutunun yine de küçük kalması mümkündür — rakip bir `max-height`,
     * kırpan bir ata ya da eşleşmeyen bir medya sorgusu yüzünden. Ölçüm ancak
     * gerçek tarayıcıda yapılabilir.
     *
     * Ölçüm `support/geometry.ts`dedir: saydam ama tıklanabilir yerel giriş
     * (kaydırıcı) dışlanmaz, örtülen ya da kırpılan hedef küçük sayılır ve
     * çizilmediği için ölçülemeyenler ayrı raporlanır.
     */
    const selectors = hitTargetSelectors();
    expect(selectors.length, 'Politika seçicileri CSS’ten okunamadı').toBeGreaterThan(20);

    await openShowcase(page);
    let measured = 0;
    let transparent = 0;
    let unrendered = 0;
    for (const tab of SHOWCASE_TABS) {
      await selectTab(page, tab);
      const measures = await measureTargets(page.locator('body'), selectors);
      const counts = coverage(measures);
      measured += counts.measured;
      transparent += counts.transparentHit;
      unrendered += counts.unrendered;
      reconcileHitTargets(`tab/${tab}`, measures);
    }
    info.annotations.push({
      type: 'kapsam',
      description: `ölçülen ${measured} (saydam-vuruş ${transparent}), çizilmediği için ölçülemeyen ${unrendered}`,
    });
    expect(measured, 'hiç hedef ölçülmedi').toBeGreaterThan(0);
    expect(transparent, 'saydam yerel giriş (kaydırıcı) ölçüme girmeli').toBeGreaterThan(0);
  });

  test('açık katmanların içindeki hedefler de ölçülür', async ({ page }, info) => {
    /*
     * Kapalı katmanın içi çizilmez, bu yüzden sekme taraması onları hiç
     * ölçemez ("ölçülemedi", "geçti" değildir). Katman açılıp kökü ayrıca
     * ölçülür ve kapalı örnekle açık örnek ayrı sayılır.
     */
    const selectors = hitTargetSelectors();
    const lines: string[] = [];
    for (const scenario of LAYER_SCENARIOS) {
      await openShowcase(page);
      await openLayer(page, scenario);
      const measures = await measureTargets(scenario.root(page), selectors);
      const counts = coverage(measures);
      expect(
        counts.measured,
        `${scenario.scope}: açık katmanda hiç hedef ölçülmedi`,
      ).toBeGreaterThan(0);
      lines.push(`${scenario.scope}: ölçülen ${counts.measured}, ölçülemeyen ${counts.unrendered}`);
      reconcileHitTargets(`layer/${scenario.scope}`, measures);
    }
    info.annotations.push({ type: 'kapsam', description: lines.join('; ') });
  });

  test('ölçüm düzeneği saydam, örtülü ve kırpılan hedefi yakalar', async ({ page }) => {
    // Düzeneğin kendisi sınanır: kör nokta geri gelirse bu test düşer.
    await openShowcase(page);
    await page.evaluate(() => {
      const host = document.createElement('div');
      host.id = 'geometry-fixture';
      host.style.cssText =
        'position:fixed;left:0;top:0;width:600px;height:400px;z-index:2147483647';
      host.innerHTML = [
        // Saydam ama vuruş alan küçük giriş: ölçülmeli ve küçük sayılmalı.
        '<input id="fx-transparent" type="range" style="position:absolute;left:10px;top:10px;width:30px;height:12px;opacity:0;margin:0">',
        // Büyük düğme, üstünü başka bir kutu örtüyor.
        '<button id="fx-covered" style="position:absolute;left:100px;top:10px;width:60px;height:60px">a</button>',
        '<div style="position:absolute;left:100px;top:10px;width:60px;height:60px;background:#000"></div>',
        // Büyük düğme, overflow:hidden atası 20 px'e kırpıyor.
        '<div style="position:absolute;left:200px;top:10px;width:20px;height:20px;overflow:hidden"><button id="fx-clipped" style="width:60px;height:60px">c</button></div>',
        // Saydam ve vuruş almayan: hiç hedef değil.
        '<button id="fx-ghost" style="position:absolute;left:300px;top:10px;width:10px;height:10px;opacity:0;pointer-events:none">g</button>',
        // Düzgün hedef: sorunsuz.
        '<button id="fx-good" style="position:absolute;left:100px;top:100px;width:60px;height:60px">ok</button>',
      ].join('');
      document.body.append(host);
    });
    const measures = await measureTargets(page.locator('#geometry-fixture'), [
      '#fx-transparent',
      '#fx-covered',
      '#fx-clipped',
      '#fx-ghost',
      '#fx-good',
    ]);
    const by = Object.fromEntries(measures.map((m) => [m.selector, m]));

    expect(by['#fx-transparent'].render).toBe('transparent-hit');
    expect(by['#fx-ghost'].render).toBe('hidden');
    expect(by['#fx-good'].render).toBe('painted');
    expect(by['#fx-clipped'].width).toBe(60);
    expect(by['#fx-clipped'].visibleWidth).toBe(20);

    const problems = Object.fromEntries(
      hitTargetProblems(measures).map((problem) => [problem.target, problem.rule]),
    );
    expect(problems).toEqual({
      '#fx-transparent': 'size',
      '#fx-covered': 'covered',
      '#fx-clipped': 'clipped',
    });
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

test.describe('geometri kayma sondası (tema/mod değişimi için)', () => {
  /*
   * Tema yöneticisi (UI-01) gelmeden önce sonda ve kontrolleri hazırdır: renk
   * ve kenarlık TOKEN değişimi hiçbir kutuyu oynatmamalı. Sonda kendi kör
   * noktalarını sınar — A/A (değişiklik yok) sıfır kayma, kasıtlı enjekte
   * kayma ise yakalanır — böylece "kayma yok" iddiası sondanın körlüğünden
   * değil gerçek sabitlikten gelir. Kayma kayıpsız bir A/A olmadan okunmaz.
   */
  const ALL = '[class^="vol-"], [class*=" vol-"]';

  test('A/A: değişiklik yokken hiçbir kutu kaymaz', async ({ page }) => {
    await openShowcase(page);
    for (const tab of SHOWCASE_TABS) {
      await selectTab(page, tab);
      const first = await snapshotGeometry(page, [ALL]);
      const second = await snapshotGeometry(page, [ALL]);
      expect(first[ALL].length, `${tab}: hiç eleman ölçülmedi`).toBeGreaterThan(5);
      expect(geometryShifts(first, second), tab).toEqual([]);
    }
  });

  test('kontrol: kasıtlı yerleşim değişimi sonda tarafından yakalanır', async ({ page }) => {
    await openShowcase(page);
    await selectTab(page, 'buttons');
    const before = await snapshotGeometry(page, [ALL]);
    await page.addStyleTag({ content: '.vol-button { padding: 30px !important; }' });
    const shifts = geometryShifts(before, await snapshotGeometry(page, [ALL]));
    expect(shifts.length).toBeGreaterThan(0);
  });

  test('renk/kenarlık tokenı değişimi hiçbir sekmede geometriyi kaydırmaz', async ({ page }) => {
    await openShowcase(page);
    const offenders: string[] = [];
    for (const tab of SHOWCASE_TABS) {
      await selectTab(page, tab);
      const before = await snapshotGeometry(page, [ALL]);
      const paint = (): Promise<string> =>
        page.evaluate((selector) => {
          const parts: string[] = [];
          for (const element of document.querySelectorAll(selector)) {
            const style = getComputedStyle(element);
            parts.push(`${style.color}|${style.backgroundColor}|${style.borderTopColor}`);
          }
          return parts.join(';');
        }, ALL);
      const paintBefore = await paint();
      await page.evaluate(() => {
        const root = document.documentElement.style;
        for (const name of [
          '--vol-ui-text',
          '--vol-ui-surface-1',
          '--vol-ui-surface-2',
          '--vol-ui-border-soft',
          '--vol-ui-focus-ring',
        ])
          root.setProperty(name, '#ff00ff');
      });
      // Kontrol: token gerçekten boyayı değiştirdi; yoksa "kayma yok" boş bir iddiadır.
      expect(await paint(), `${tab}: token değişimi hiçbir rengi değiştirmedi`).not.toBe(
        paintBefore,
      );
      const shifts = geometryShifts(before, await snapshotGeometry(page, [ALL]));
      await page.evaluate(() => document.documentElement.removeAttribute('style'));
      if (shifts.length) offenders.push(`${tab}: ${shifts.slice(0, 3).join(' | ')}`);
    }
    expect(offenders).toEqual([]);
  });
});

test.describe('tema, yoğunluk ve hedef tabanı (ThemeController nitelikleri)', () => {
  const ALL = '[class^="vol-"], [class*=" vol-"]';
  const setRoot = (page: Page, name: string, value: string | null): Promise<void> =>
    page.evaluate(
      ([attribute, next]) => {
        if (next === null) document.documentElement.removeAttribute(attribute);
        else document.documentElement.setAttribute(attribute, next);
      },
      [name, value] as const,
    );

  test('aurum teması gerçekten renk değiştirir ve hiçbir sekmede kutuyu kaydırmaz', async ({
    page,
  }) => {
    await openShowcase(page);
    const offenders: string[] = [];
    for (const tab of SHOWCASE_TABS) {
      await selectTab(page, tab);
      const before = await snapshotGeometry(page, [ALL]);
      const background = (): Promise<string> =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--vol-ui-bg').trim(),
        );
      const defaultBg = await background();
      await setRoot(page, 'data-vol-theme', 'aurum');
      expect(await background(), `${tab}: aurum --vol-ui-bg uygulanmadı`).not.toBe(defaultBg);
      const shifts = geometryShifts(before, await snapshotGeometry(page, [ALL]));
      await setRoot(page, 'data-vol-theme', null);
      if (shifts.length) offenders.push(`${tab}: ${shifts.slice(0, 3).join(' | ')}`);
    }
    expect(offenders).toEqual([]);
  });

  test('yoğunluk yalnız boşluk ölçeğini değiştirir ve geri dönünce geometri birebir aynıdır', async ({
    page,
  }) => {
    await openShowcase(page);
    await selectTab(page, 'buttons');
    const read = (): Promise<{ space: string; text: string }> =>
      page.evaluate(() => {
        const style = getComputedStyle(document.documentElement);
        return {
          space: style.getPropertyValue('--vol-space-md').trim(),
          text: style.getPropertyValue('--vol-text-body').trim(),
        };
      });
    const base = await read();
    const geometry = await snapshotGeometry(page, [ALL]);

    await setRoot(page, 'data-vol-density', 'compact');
    const compact = await read();
    expect(compact.space).toBe('12px');
    expect(compact.text, 'yoğunluk yazı boyunu değiştirmemeli').toBe(base.text);
    await setRoot(page, 'data-vol-density', 'spacious');
    expect((await read()).space).toBe('20px');

    await setRoot(page, 'data-vol-density', 'comfortable');
    expect((await read()).space).toBe(base.space);
    expect(geometryShifts(geometry, await snapshotGeometry(page, [ALL]))).toEqual([]);
    await setRoot(page, 'data-vol-density', null);
  });

  test('büyük hedef tabanı ince işaretçide de 44 px verir; niteliksiz token tanımsız kalır', async ({
    page,
  }) => {
    await openShowcase(page);
    const token = (): Promise<string> =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--vol-hit-target-min').trim(),
      );
    // Masaüstü (ince işaretçi) projesi: taban yok, token tanımsız.
    expect(await page.evaluate(() => matchMedia('(pointer: fine)').matches)).toBe(true);
    expect(await token()).toBe('');
    await setRoot(page, 'data-vol-target', 'large');
    expect(await token()).toBe('44px');
    // İç içe kapsam: nitelik yalnız bağlı alt ağaçta geçerlidir.
    await setRoot(page, 'data-vol-target', null);
    expect(await token()).toBe('');
  });
});

test.describe('sürükleme jesti', () => {
  test('sürüklemek METİN SEÇMEZ', async ({ page }) => {
    /*
     * Tarayıcı aynı jesti hem sürükleme hem metin seçimi olarak yorumlar:
     * kart mavi vurguya boyanır, imleç I-beam'e döner, mobilde "kopyala"
     * balonu açılır.
     *
     * Koruma yalnız `.vol-ui-root` üzerinde olsaydı başka bir yere monte edilen
     * bileşen korumasız kalırdı; davranış nereye asıldığına bağlı olmamalı.
     */
    await openShowcase(page);
    await selectTab(page, 'advanced');

    const card = page.locator('.vol-kanban__card').first();
    const box = await card.boundingBox();
    expect(box, 'Kanban kartı bulunamadı').not.toBeNull();

    await page.mouse.move(box!.x + 10, box!.y + 10);
    await page.mouse.down();
    await page.mouse.move(box!.x + 160, box!.y + 60, { steps: 8 });
    const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    await page.mouse.up();

    expect(selected, `sürüklerken metin seçildi: "${selected.slice(0, 40)}"`).toBe('');
  });

  test('her sürükleme yüzeyi seçimi KENDİ kapatır', async ({ page }) => {
    // Bir bileşenin sözleşmesi, monte edildiği yere bağlı olamaz.
    await openShowcase(page);
    await selectTab(page, 'advanced');

    const leaked = await page.evaluate(() =>
      ['.vol-kanban-wrap', '.vol-skill-tree', '.vol-carousel'].filter((selector) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (element === null) return false;
        // WebKit hesaplı stilde yalnız ön ekli özelliği gösterir; CSS ikisini de yazar.
        const style = getComputedStyle(element);
        return (style.userSelect ?? style.webkitUserSelect) !== 'none';
      }),
    );
    expect(leaked).toEqual([]);
  });
});

test.describe('FPS göstergesi', () => {
  /*
   * Gösterge bir köşeye SABİTLENİR; kutusu her okumada yeniden boyutlanırsa
   * karşı kenarı oynar ve gözle "gösterge yer değiştirdi" diye okunur.
   *
   * `font-variant-numeric: tabular-nums` tek başına YETMEZ — VOL fontları
   * tabular rakam varyantı taşımaz, yani aynı basamak sayısındaki iki değer
   * bile farklı genişlik üretir. Çözüm sabit bir `min-width`tir ve bu ancak
   * gerçek font metrikleriyle ölçülebilir; jsdom bunu göremez.
   */
  test('okuma değiştiğinde kutu genişliği DEĞİŞMEZ', async ({ page }) => {
    await openShowcase(page);
    await selectTab(page, 'hud');

    const meter = page.locator('.vol-showcase-fps-meter');
    await meter.waitFor();

    const widths = await meter.evaluate((element) => {
      const readings = ['1 FPS', '9 FPS', '60 FPS', '99 FPS', '144 FPS', '240 FPS', '999 FPS'];
      const original = element.textContent;
      const measured = readings.map((text) => {
        element.textContent = text;
        return Math.round(element.getBoundingClientRect().width);
      });
      element.textContent = original;
      return measured;
    });

    expect(new Set(widths).size, `okumaya göre değişen genişlikler: ${widths.join(', ')}`).toBe(1);
  });
});
