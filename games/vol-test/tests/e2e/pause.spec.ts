import { expect, test, type Page } from '@playwright/test';

/**
 * Duraklatma/ayarlar tüketicisi: CORE Button/Slider/SegmentedControl/Modal'ın oyunun gerçek yerleşimindeki
 * davranışı (UI-03.3). Yeni menü yok; her denetim adlıdır, ekrana sığar ve merkezi başka öğe tarafından
 * örtülmez; klavye açar, Escape kapatır ve oyun devam eder.
 */
const OPEN = /vol-modal--visible/;
/**
 * HUD, yükleme ekranının arkasındaki gölgelendirici ısınması bitince görünür: yazılım GL'li WebKit'te
 * tablet çözünürlüğünde 5 sn'yi aşar. Kare ve etkileşim beklemeleri değişmez; yalnız açılış beklemesi uzar.
 */
const BOOT_MS = 30_000;
const CONTROLS = ['button', 'input', 'select', '[role="radio"]']
  .map((control) => `.vt-pause ${control}`)
  .join(', ');

async function openPause(page: Page): Promise<void> {
  await page.goto('/?start=world');
  await expect(page.locator('[data-testid="hud"]')).toBeVisible({ timeout: BOOT_MS });
  await page.keyboard.press('Escape');
  await expect(page.locator('.vt-pause')).toHaveClass(OPEN);
}

/** `count` çizim karesi bekler (sabit süre beklemeden). */
function frames(page: Page, count: number): Promise<void> {
  return page.evaluate(
    (total) =>
      new Promise<void>((resolve) => {
        let left = total;
        const tick = (): void => (--left <= 0 ? resolve() : void requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    count,
  );
}

/** Görünür her denetimin ekran içinde, adlı ve merkezinden tıklanabilir olduğunu raporlar. */
async function controlReport(page: Page) {
  return page.evaluate((selector) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const controls = [...document.querySelectorAll<HTMLElement>(selector)].filter(
      (el) => el.getBoundingClientRect().width > 0,
    );
    return controls.map((el) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      const labelled = el.getAttribute('aria-label') ?? el.getAttribute('aria-labelledby');
      const labels = (el as HTMLInputElement).labels;
      const name = (
        labelled ||
        el.textContent ||
        (labels && labels.length > 0 ? labels[0].textContent : '') ||
        el.closest('label')?.textContent ||
        el.parentElement?.getAttribute('aria-label') ||
        ''
      ).trim();
      return {
        tag: el.tagName.toLowerCase(),
        name,
        inside: rect.left >= -1 && rect.top >= -1 && rect.right <= vw + 1 && rect.bottom <= vh + 1,
        // Saydam yerel giriş (anahtar/kaydırıcı) kendi etiketi ya da adlı sarmalayıcısı tarafından karşılanır.
        hitIsSelf:
          hit === el ||
          el.contains(hit) ||
          (hit?.contains(el) ?? false) ||
          (el.closest('label, [data-testid]')?.contains(hit) ?? false),
      };
    });
  }, CONTROLS);
}

/** Donmuş kareler arasında hoş görülen dağınık piksel sayısı (kareler ~384.000 pikseldir). */
const NOISE_PIXELS = 40;

/** İki PNG ekran görüntüsü arasında herhangi bir kanalı farklı piksellerin sayısı. */
function changedPixels(page: Page, first: Buffer, second: Buffer): Promise<number> {
  return page.evaluate(
    async ([a, b]) => {
      const read = async (base64: string): Promise<ImageData> => {
        const image = new Image();
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error('ekran görüntüsü çözülemedi'));
          image.src = `data:image/png;base64,${base64}`;
        });
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, image.width, image.height);
      };
      const [x, y] = await Promise.all([read(a), read(b)]);
      if (x.width !== y.width || x.height !== y.height) return Number.POSITIVE_INFINITY;
      let count = 0;
      for (let index = 0; index < x.data.length; index += 4) {
        if (
          x.data[index] !== y.data[index] ||
          x.data[index + 1] !== y.data[index + 1] ||
          x.data[index + 2] !== y.data[index + 2]
        )
          count++;
      }
      return count;
    },
    [first.toString('base64'), second.toString('base64')] as const,
  );
}

test('duraklatılmış dünya donar: araçlar, duman ve kıvılcımlar, yağış dahil hiçbir şey ilerlemez', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'device.voltest.preferences',
      JSON.stringify({ scenario: 'multitank', seed: 5 }),
    );
  });
  await page.goto('/?start=world&season=winter&weather=snow');
  await expect(page.locator('[data-testid="hud"]')).toBeVisible({ timeout: BOOT_MS });
  // Botlar ateş edip duman ve kıvılcım üretene dek akış sürer.
  await frames(page, 120);
  await page.keyboard.press('Escape');
  await expect(page.locator('.vt-pause')).toHaveClass(OPEN);
  // Katman geçişi (scrim solması) bitsin.
  await frames(page, 30);
  // Sağ şerit (440 px), kare sayacı ve alt ipucu çubuğu dışında kalan dünya bölgesi.
  const clip = { x: 20, y: 20, width: 780, height: 600 };
  const first = await page.screenshot({ clip });
  await frames(page, 45);
  const second = await page.screenshot({ clip });
  // Donmuş dünyada tek tük piksel WebKit'in 1 piksellik duyarga uçlarını yeniden tarayışından oynar
  // (ölçüm: kare çifti başına 0–25 piksel, duyarga kaydı tüm karelerde aynıdır); gerçek hareket binlercesini
  // değiştirir. Eşik gürültüyü geçirir, ilerleyen duman, kıvılcım ya da yağışı yakalar.
  const changed = await changedPixels(page, first, second);
  expect(
    changed,
    'duraklatılmış dünya iki kare arasında değişen piksel sayısı',
  ).toBeLessThanOrEqual(NOISE_PIXELS);
});

test('duraklatma şeridi ve ayar görünümleri ekrana sığar; her denetim adlıdır ve merkezi hit-test ile kendisidir', async ({
  page,
}) => {
  await openPause(page);
  // Ana şeritte yalnız düğmeler: devam, ayarlar, geliştirici ve sürücü eylemleri.
  const views: Array<[string, string, number]> = [
    ['ana', '', 4],
    ['ayarlar', 'pause-settings', 4],
    ['geliştirici', 'pause-dev', 3],
  ];
  for (const [name, open, least] of views) {
    if (open) await page.getByTestId(open).click();
    const report = await controlReport(page);
    expect(report.length, `${name} görünümünde denetimler bulundu`).toBeGreaterThanOrEqual(least);
    for (const control of report) {
      expect(control.inside, `${name}: ${control.tag} "${control.name}" ekran içinde`).toBe(true);
      expect(control.name, `${name}: ${control.tag} adı boş değil`).not.toBe('');
      expect(
        control.hitIsSelf,
        `${name}: ${control.tag} "${control.name}" merkezi örtülmüyor`,
      ).toBe(true);
    }
    if (open) {
      await page.getByTestId(name === 'ayarlar' ? 'settings-back' : 'dev-back').click();
    }
  }
});

test('duraklatmada ayar satırı yoktur; ayar etiketleri geniş denetimle harf harf kırılmaz', async ({
  page,
}) => {
  await openPause(page);
  const rows = (): Promise<number[]> =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.vt-pause .vol-settings-row__label')]
        .map((el) => el.getBoundingClientRect())
        .filter((rect) => rect.width > 0)
        .map((rect) => rect.width),
    );
  expect(await rows(), 'ana şeritte ayar satırı yok').toHaveLength(0);
  for (const [open, back] of [
    ['pause-settings', 'settings-back'],
    ['pause-dev', 'dev-back'],
  ]) {
    await page.getByTestId(open).click();
    const widths = await rows();
    expect(widths.length, `${open}: etiketli satırlar bulundu`).toBeGreaterThanOrEqual(2);
    for (const width of widths) expect(width, 'etiket sütunu sıkışmadı').toBeGreaterThanOrEqual(80);
    await page.getByTestId(back).click();
  }
});

test('klavye: odak katmanın içindedir, Escape kapatır ve oyun devam eder', async ({ page }) => {
  await openPause(page);
  const focusInside = await page.evaluate(
    () => document.querySelector('.vt-pause')?.contains(document.activeElement) ?? false,
  );
  expect(focusInside, 'odak duraklatma katmanında').toBe(true);

  await page.keyboard.press('Escape');
  await expect(page.locator('.vt-pause')).not.toHaveClass(OPEN);
  await expect
    .poll(
      () =>
        page.evaluate(
          () => !(document.querySelector('.vt-pause')?.contains(document.activeElement) ?? false),
        ),
      { message: 'kapanınca odak katmanda kalmaz' },
    )
    .toBe(true);
});

test('Devam düğmesi Enter ile katmanı kapatır; yeniden açılır', async ({ page }) => {
  await openPause(page);
  await page.locator('[data-testid="pause-resume"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.vt-pause')).not.toHaveClass(OPEN);
  // Kapanış geçişi bitip odak katmandan ayrılana kadar Escape oyuna ulaşmaz (insan eli bunu beklemez).
  await expect
    .poll(() =>
      page.evaluate(
        () => !(document.querySelector('.vt-pause')?.contains(document.activeElement) ?? false),
      ),
    )
    .toBe(true);
  // Sürdürme basışı bastırır (`suppress`): oyun en az bir kare tuşun bırakıldığını görmeden Escape kenarı yutulur.
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
  // Basış bir kare sürmeli: kare başında okunan klavye, aynı karede basılıp bırakılan tuşu görmez (WebKit).
  await page.keyboard.down('Escape');
  await expect(page.locator('.vt-pause')).toHaveClass(OPEN);
  await page.keyboard.up('Escape');
});

test.describe('dokunmatik tablet (yatay, ~750 px CSS yükseklik)', () => {
  test.use({
    viewport: { width: 1250, height: 750 },
    deviceScaleFactor: 1.6,
    hasTouch: true,
    isMobile: true,
  });

  // Android'de ölçülen yerleşim: şeridin gövdesi kayar ama eylem şeridi (devam ve sürücü eylemleri)
  // hiçbir koşulda ekranın dışına düşmez ve gövdeyle üst üste binmez.
  test('duraklatma eylem şeridi ekran içindedir ve gövdeyi örtmez', async ({ page }) => {
    await openPause(page);
    const fit = await page.evaluate(() => {
      const box = (selector: string): DOMRect =>
        document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
      const footer = box('.vt-pause .vt-screen__actions');
      const body = box('.vt-pause .vt-screen__body');
      return {
        footerBottom: footer.bottom,
        bodyBottom: body.bottom,
        footerTop: footer.top,
        viewport: window.innerHeight,
      };
    });
    expect(fit.footerBottom).toBeLessThanOrEqual(fit.viewport);
    expect(fit.bodyBottom).toBeLessThanOrEqual(fit.footerTop + 1);
  });
});
