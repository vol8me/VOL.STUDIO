import { expect, test, type Locator, type Page } from '@playwright/test';
import { selectTab } from './support/determinism';

/**
 * HUD gösterge durumları (UI-08.1) GERÇEK saatle ve gerçek motorlarda: dondurma katmanı kullanılmaz çünkü sayma, doldurma
 * ve yükselme zamana bağlıdır. Her ölçüm iki ortamda yapılır: normal ve `prefers-reduced-motion: reduce` (tarayıcı
 * emülasyonu, mock değil).
 *
 * Kapsam: Bar boş/dolu/meşgul/hata/geçersiz sayı + okuyucu değer metni; 6 haneli sayaç düşüşü; çoklu seviye atlama;
 * hareket azaltmada TimerBar'ın İŞLEVSEL zamanı ve yüzen metnin yükselmemesi; yüzen metin havuz sınırı.
 */
async function openHud(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('[role="tablist"]');
  await page.evaluate(() => document.fonts.ready);
  await selectTab(page, 'hud');
}

const REDUCED = { reducedMotion: 'reduce' } as const;
const NORMAL = { reducedMotion: 'no-preference' } as const;

const bar = (page: Page): Locator => page.locator('[data-hud-state="bar"]');
const score = (page: Page): Locator => page.locator('[data-hud-state="score"]');
const display = (page: Page): Locator => score(page).locator('.vol-counter__display');

/** Etkin sekme panelindeki düğme; metinle (varsayılan dil İngilizce). */
const press = (page: Page, name: string): Promise<void> =>
  page
    .locator('[role="tabpanel"]:not([aria-hidden="true"])')
    .getByRole('button', { name, exact: true })
    .first()
    .click();

/** Dolgunun çubuğa oranı (%). */
async function fillPercent(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const fill = element.querySelector<HTMLElement>('.vol-bar__fill')!;
    return (fill.getBoundingClientRect().width / element.getBoundingClientRect().width) * 100;
  });
}

test.describe('Bar durumları', () => {
  test('normal: progressbar rolü, adı "Health", değer metni görünür etiketten ("60 / 100")', async ({
    page,
  }) => {
    await page.emulateMedia(NORMAL);
    await openHud(page);
    const target = bar(page);
    await expect(target).toHaveAttribute('role', 'progressbar');
    await expect(target).toHaveAttribute('aria-valuenow', '60');
    await expect(target).toHaveAttribute('aria-valuemax', '100');
    await expect(target).toHaveAttribute('aria-label', 'Health');
    await expect(target).toHaveAttribute('aria-valuetext', '60 / 100');
    await expect(target).not.toHaveAttribute('aria-labelledby', /.*/);
  });

  for (const [mode, media] of [
    ['normal', NORMAL],
    ['hareket azaltma', REDUCED],
  ] as const) {
    test(`boş ve dolu (${mode}): dolgu hedefe oturur, aria hemen hedefi söyler`, async ({
      page,
    }) => {
      await page.emulateMedia(media);
      await openHud(page);
      const target = bar(page);
      await press(page, 'Empty');
      await expect(target).toHaveAttribute('aria-valuenow', '0');
      await expect.poll(() => fillPercent(target)).toBeLessThan(1);
      await press(page, 'Full');
      await expect(target).toHaveAttribute('aria-valuenow', '100');
      await expect.poll(() => fillPercent(target)).toBeGreaterThan(97);
    });
  }

  test('hareket azaltmada değer değişimi ilk karede biter (sayma/doldurma geçişi yok)', async ({
    page,
  }) => {
    await page.emulateMedia(REDUCED);
    await openHud(page);
    const target = bar(page);
    const frames = await target.evaluate((element) => {
      const fill = element.querySelector<HTMLElement>('.vol-bar__fill')!;
      const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
        (candidate) => candidate.textContent === 'Empty',
      )!;
      button.click();
      return fill.style.width;
    });
    // Tıklamayla aynı eşzamanlı çağrıda satır içi genişlik zaten hedeftedir.
    expect(frames).toBe('0%');
  });

  test('normal ortamda aynı değişim geçişle yapılır (karşı sınama: ilk karede hedefte değil)', async ({
    page,
  }) => {
    await page.emulateMedia(NORMAL);
    await openHud(page);
    const width = await bar(page).evaluate((element) => {
      const fill = element.querySelector<HTMLElement>('.vol-bar__fill')!;
      const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
        (candidate) => candidate.textContent === 'Empty',
      )!;
      button.click();
      return fill.style.width;
    });
    expect(width).not.toBe('0%');
  });

  test('meşgul: aria-busy, değer yok, dolgu kuyuda kayan dar bant; normale dönünce değer yerinde', async ({
    page,
  }) => {
    await page.emulateMedia(NORMAL);
    await openHud(page);
    const target = bar(page);
    await press(page, 'Busy');
    await expect(target).toHaveAttribute('aria-busy', 'true');
    for (const name of ['aria-valuenow', 'aria-valuemax', 'aria-valuetext'])
      await expect(target).not.toHaveAttribute(name, /.*/);
    expect(await fillPercent(target)).toBeGreaterThan(28);
    expect(await fillPercent(target)).toBeLessThan(40);

    // Bant gerçekten kayıyor: iki örnekte dönüşüm farklı.
    const sample = (): Promise<string> =>
      target.evaluate(
        (element) => getComputedStyle(element.querySelector('.vol-bar__fill')!).transform,
      );
    const first = await sample();
    await page.waitForTimeout(350);
    expect(await sample()).not.toBe(first);

    await press(page, 'Busy');
    await expect(target).not.toHaveAttribute('aria-busy', /.*/);
    await expect(target).toHaveAttribute('aria-valuenow', '60');
    await expect.poll(() => fillPercent(target)).toBeGreaterThan(55);
  });

  test('meşgul + hareket azaltma: bant kaymaz, kuyu boyunca sönük dolgu kalır; anlamı aria-busy taşır', async ({
    page,
  }) => {
    await page.emulateMedia(REDUCED);
    await openHud(page);
    const target = bar(page);
    await press(page, 'Busy');
    await expect(target).toHaveAttribute('aria-busy', 'true');
    const style = await target.evaluate((element) => {
      const computed = getComputedStyle(element.querySelector('.vol-bar__fill')!);
      return {
        animation: computed.animationName,
        opacity: computed.opacity,
        transform: computed.transform,
      };
    });
    expect(style.animation).toBe('none');
    expect(Number(style.opacity)).toBeCloseTo(0.35, 1);
    expect(style.transform).toBe('none');
    expect(await fillPercent(target)).toBeGreaterThan(95);
  });

  test('hata: okuyucu "hata" der; renk tek başına değil, çapraz şerit de var', async ({ page }) => {
    await page.emulateMedia(NORMAL);
    await openHud(page);
    const target = bar(page);
    await press(page, 'Error');
    await expect(target).toHaveAttribute('aria-valuetext', 'error');
    await expect(target).toHaveAttribute('aria-valuenow', '60');
    const image = await target.evaluate(
      (element) => getComputedStyle(element.querySelector('.vol-bar__fill')!).backgroundImage,
    );
    expect(image).toContain('repeating-linear-gradient');
    await press(page, 'Error');
    await expect(target).toHaveAttribute('aria-valuetext', '60 / 100');
  });

  test('geçersiz sayı yok sayılır: değer, aria ve satır içi genişlik bozulmaz', async ({
    page,
  }) => {
    await page.emulateMedia(NORMAL);
    await openHud(page);
    const target = bar(page);
    await press(page, 'Empty');
    await expect(target).toHaveAttribute('aria-valuenow', '0');
    await press(page, 'Invalid number');
    await expect(target).toHaveAttribute('aria-valuenow', '0');
    const inline = await target.evaluate(
      (element) =>
        element.querySelector<HTMLElement>('.vol-bar__fill')!.getAttribute('style') ?? '',
    );
    expect(inline).not.toContain('NaN');
    expect(await fillPercent(target)).toBeLessThan(1);
  });
});

test.describe('6 haneli sayaç', () => {
  test('999 999 tek satırda sığar; 0’a düşerken ara sayılar görünür, sonunda tam 0 ve tek duyuru', async ({
    page,
  }) => {
    await page.emulateMedia(NORMAL);
    await openHud(page);
    await expect(display(page)).toHaveText('999,999');
    const overflow = await score(page).evaluate((element) => {
      const card =
        element.closest<HTMLElement>('.vol-showcase-card, section, article') ??
        element.parentElement!;
      return { client: card.clientWidth, scroll: card.scrollWidth };
    });
    expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);

    await press(page, 'Drop to 0');
    // Sayma süresi 600 ms: ortada kalan bir örnek 0 ile 999.999 arasında olmalı.
    const seen = await page.evaluate(
      () =>
        new Promise<number[]>((resolve) => {
          const element = document.querySelector('[data-hud-state="score"] .vol-counter__display')!;
          const samples: number[] = [];
          const started = performance.now();
          const step = (): void => {
            samples.push(Number((element.textContent ?? '').replaceAll(',', '')));
            if (performance.now() - started < 900) requestAnimationFrame(step);
            else resolve(samples);
          };
          step();
        }),
    );
    expect(seen.some((value) => value > 0 && value < 999_999)).toBe(true);
    expect(seen.at(-1)).toBe(0);
    // Azalan sırada: sayı hiçbir karede geri sıçramaz.
    for (let index = 1; index < seen.length; index += 1)
      expect(seen[index], `kare ${index}`).toBeLessThanOrEqual(seen[index - 1]);
    await expect(score(page).locator('.vol-sr-only')).toHaveText('Score 0');
  });

  test('hareket azaltmada sayı tıklamayla aynı anda 0 olur', async ({ page }) => {
    await page.emulateMedia(REDUCED);
    await openHud(page);
    const immediate = await page.evaluate(() => {
      const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
        (candidate) => candidate.textContent === 'Drop to 0',
      )!;
      button.click();
      return document.querySelector('[data-hud-state="score"] .vol-counter__display')!.textContent;
    });
    expect(immediate).toBe('0');
  });
});

test.describe('XPBar çoklu seviye', () => {
  test('+2.000 XP birden çok seviye atlar; çubuk son seviyeyi gösterir, vurgu halkası oynar', async ({
    page,
  }) => {
    await page.emulateMedia(NORMAL);
    await openHud(page);
    const xp = page.locator('.vol-xp-bar').first();
    await press(page, '+2,000 XP (many levels)');
    // 1. seviyeden 2.000 XP: eşik 50 + 25·seviye ⇒ 10 seviye atlanır (11. seviye, 125 XP).
    await expect(xp).toHaveAttribute('aria-valuemax', '325');
    await expect(xp).toHaveAttribute('aria-valuenow', '125');
    await expect(xp.locator('.vol-bar__label')).toContainText('Lv. 11');
    await expect(xp).toHaveClass(/vol-xp-bar--level-up/);
  });

  test('hareket azaltmada halka hareket etmez: animasyon yok, sabit ışıma vurguyu taşır', async ({
    page,
  }) => {
    await page.emulateMedia(REDUCED);
    await openHud(page);
    const xp = page.locator('.vol-xp-bar').first();
    await press(page, '+2,000 XP (many levels)');
    await expect(xp).toHaveClass(/vol-xp-bar--level-up/);
    const style = await xp.evaluate((element) => {
      const computed = getComputedStyle(element);
      return { animation: computed.animationName, shadow: computed.boxShadow };
    });
    expect(style.animation).toBe('none');
    expect(style.shadow).toMatch(/0px 0px 0px 4px/);
  });
});

test.describe('TimerBar işlevsel zaman', () => {
  test('hareket azaltmada çubuk yine akar (zaman anlamı taşır) ve okuyucu kalan süreyi söyler', async ({
    page,
  }) => {
    await page.emulateMedia(REDUCED);
    await page.goto('/');
    await page.waitForSelector('[role="tablist"]');
    await selectTab(page, 'forms');
    const timer = page.locator('.vol-showcase-timer-variations .vol-timer-bar').first();
    const width = (): Promise<number> =>
      timer.evaluate((element) =>
        parseFloat(element.querySelector<HTMLElement>('.vol-timer-bar__fill')!.style.width),
      );
    const first = await width();
    await page.waitForTimeout(700);
    const second = await width();
    expect(second, 'boşalan çubuk hareket azaltmada da küçülür').not.toBe(first);
    await expect(timer).toHaveAttribute('aria-valuetext', / s left$/);
  });

  test('aria-valuetext tam saniyede bir yazılır (kare başına değil)', async ({ page }) => {
    await page.emulateMedia(NORMAL);
    await page.goto('/');
    await page.waitForSelector('[role="tablist"]');
    await selectTab(page, 'forms');
    const timer = page.locator('.vol-showcase-timer-variations .vol-timer-bar').first();
    const writes = await timer.evaluate(
      (element) =>
        new Promise<number>((resolve) => {
          let count = 0;
          const observer = new MutationObserver((records) => {
            count += records.filter((record) => record.attributeName === 'aria-valuetext').length;
          });
          observer.observe(element, { attributes: true, attributeFilter: ['aria-valuetext'] });
          setTimeout(() => {
            observer.disconnect();
            resolve(count);
          }, 2200);
        }),
    );
    // 2,2 sn içinde en çok 3 yazım (≈60 kare var); 4 sn'lik döngü yeniden başlarsa bir yazım daha olabilir.
    expect(writes).toBeLessThanOrEqual(4);
    expect(writes).toBeGreaterThanOrEqual(1);
  });
});

test.describe('FloatingTextManager', () => {
  /** Eşik: yaylanan girişten sonra yerleşmiş dönüşüm matrisi. */
  async function settledTransform(page: Page, selector: string): Promise<DOMMatrix | null> {
    return page.evaluate((sel) => {
      const element = document.querySelector<HTMLElement>(sel);
      return element ? new DOMMatrix(getComputedStyle(element).transform) : null;
    }, selector);
  }

  test('kap okuyucu ağacından gizlidir ve yoğun çatışmada sayı sınırı aşılmaz', async ({
    page,
  }) => {
    await page.emulateMedia(NORMAL);
    await openHud(page);
    const container = page.locator('.vol-floating-text-container').first();
    await expect(container).toHaveAttribute('aria-hidden', 'true');
    await press(page, 'Crowded fight (×60)');
    await expect(page.getByText(/^On screen: \d+ \(limit 24\)$/)).toHaveText(
      'On screen: 24 (limit 24)',
    );
    expect(await container.locator('.vol-floating-text').count()).toBeLessThanOrEqual(24);
  });

  test('vurgu (emphasis) yaylanarak büyür ve yerleşir: ölçek ≈ 1,15 (eski CSS adı uyuşmazlığında 0,4 kalırdı)', async ({
    page,
  }) => {
    await page.emulateMedia(NORMAL);
    await openHud(page);
    await press(page, 'Critical');
    await expect
      .poll(
        async () =>
          (await settledTransform(page, '.vol-floating-text--emphasis.vol-floating-text--visible'))
            ?.a ?? 0,
        {
          timeout: 3000,
          intervals: [50],
        },
      )
      .toBeGreaterThan(1.1);
    const matrix = await settledTransform(
      page,
      '.vol-floating-text--emphasis.vol-floating-text--visible',
    );
    expect(matrix!.a).toBeLessThan(1.25);
  });

  test('hareket azaltmada vurgu ölçeklenmez ve metin yükselmez', async ({ page }) => {
    await page.emulateMedia(REDUCED);
    await openHud(page);
    await press(page, 'Critical');
    await expect(
      page.locator('.vol-floating-text--emphasis.vol-floating-text--visible'),
    ).toBeVisible();
    const emphasis = await settledTransform(page, '.vol-floating-text--emphasis');
    expect(emphasis!.a).toBeCloseTo(1, 2);

    await press(page, 'Damage');
    await expect(
      page.locator('.vol-floating-text--negative.vol-floating-text--visible').first(),
    ).toBeVisible();
    const rise = await settledTransform(
      page,
      '.vol-floating-text--negative.vol-floating-text--visible',
    );
    expect(rise!.f, 'yükselme yok').toBeCloseTo(0, 1);
  });

  test('normal ortamda hasar sayısı yükselir (karşı sınama)', async ({ page }) => {
    await page.emulateMedia(NORMAL);
    await openHud(page);
    await press(page, 'Damage');
    await expect
      .poll(
        async () =>
          (await settledTransform(page, '.vol-floating-text--negative.vol-floating-text--visible'))
            ?.f ?? 0,
        {
          timeout: 3000,
          intervals: [50],
        },
      )
      .toBeLessThan(-30);
  });
});
