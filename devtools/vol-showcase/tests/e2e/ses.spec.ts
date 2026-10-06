import { expect, test, type Page } from '@playwright/test';
import { selectTab } from './support/determinism';

/**
 * Ses laboratuvarı: gerçek tarayıcıda anlamsal olay sondası ve UI ses yolu.
 *
 * Dondurulmuş ortam KULLANILMAZ: ses bağlamı ve örnek çözme gerçek saat ister.
 * Burada ölçülen şey sesin KENDİSİ (kulakla duyulan) değil, teknik zincirdir:
 * jest → niyet → kit → bağlam çalışıyor → ses başladı. İnsan dinleme onayı yayın
 * şartı değildir ve burada iddia edilmez.
 */
/**
 * Playwright'ın Windows WebKit derlemesinde Web Audio YOKTUR (`AudioContext` tanımsız,
 * Ogg Vorbis çalınamaz). Bu ortamda ses zinciri sınanamaz; laboratuvarın dürüst
 * "desteklenmiyor" durumu ve hatasızlığı sınanır, çalma iddiası SKIP edilir
 * (gerçek Safari/iOS ses çözümü ayrı bir cihaz kanıtıdır).
 */
async function hasWebAudio(page: Page): Promise<boolean> {
  return page.evaluate(() => typeof AudioContext === 'function');
}

async function openLab(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('[role="tablist"]');
  await selectTab(page, 'ses');
  await page.waitForSelector('[data-ses="probe-total"]');
}

const readout = (page: Page, key: string) => page.locator(`[data-ses="${key}"]`);

/** Dilden bağımsız ham değer (`data-value`); görünen metin yerelleştirilir. */
async function value(page: Page, key: string): Promise<string> {
  return (await readout(page, key).getAttribute('data-value')) ?? '';
}

async function played(page: Page): Promise<number> {
  return Number((await value(page, 'counts')).split('/')[0]);
}

async function dropped(page: Page): Promise<number> {
  return Number((await value(page, 'counts')).split('/')[1]);
}

test('ses laboratuvarı: jestten önce bağlam kurulmaz, durum dürüsttür', async ({ page }) => {
  await openLab(page);
  const audio = await hasWebAudio(page);
  await expect(readout(page, 'state')).toHaveAttribute('data-value', audio ? 'idle' : 'inert');
  await expect(readout(page, 'context')).toHaveAttribute('data-value', audio ? 'idle' : 'none');
  await expect(readout(page, 'probe-total')).toHaveAttribute('data-value', '0');
});

test('ses laboratuvarı: gerçek jest ses yolunu açar ve örnek gerçekten çalar', async ({ page }) => {
  await openLab(page);
  test.skip(!(await hasWebAudio(page)), 'Bu tarayıcı derlemesinde Web Audio yok');
  const press = page.locator('[data-ses-event="press"]');
  await press.click();
  await expect(readout(page, 'context')).toHaveAttribute('data-value', 'running');
  await expect(readout(page, 'state')).toHaveAttribute('data-value', 'ready');
  // Örnekler jestle birlikte yüklenir; yüklenene kadar istek düşer, sıraya alınmaz.
  await expect
    .poll(async () => {
      await press.click();
      return played(page);
    })
    .toBeGreaterThan(0);
  expect(await readout(page, 'context').textContent()).toMatch(/\d+ Hz/);
});

test('ses laboratuvarı: her kabul edilmiş niyet tek sayılır', async ({ page }) => {
  await openLab(page);
  const total = async (): Promise<number> => Number(await value(page, 'probe-total'));
  expect(await total()).toBe(0);
  for (let i = 1; i <= 4; i++) {
    await page.locator('[data-ses-comp="press"]').click();
    expect(await total()).toBe(i);
  }
  await expect(readout(page, 'probe-press')).toHaveAttribute('data-value', '4');
  // Klavye etkinleştirmesi de TEK niyettir (Enter ve Space; tuş çifti ya da tıklama ayrıca sayılmaz).
  await page.locator('[data-ses-comp="press"]').focus();
  await page.keyboard.press('Enter');
  expect(await total()).toBe(5);
  await page.locator('[data-ses-comp="press"]').focus();
  await page.keyboard.press('Space');
  expect(await total()).toBe(6);
  // Onay kutusu bir kez tıklanınca TEK `toggle` niyeti üretir (etiket + girdi çift tıklaması sayılmaz).
  await page.locator('[data-ses-comp="toggle"]').click();
  await expect(readout(page, 'probe-toggle')).toHaveAttribute('data-value', '1');
  // Olay düğmeleri doğrudan çalar ve sayımı değiştirmez.
  await page.locator('[data-ses-event="error"]').click();
  expect(await total()).toBe(7);
});

test('ses laboratuvarı: sessizlik sesi keser ve düşen isteği ayrı sayar', async ({ page }) => {
  await openLab(page);
  test.skip(!(await hasWebAudio(page)), 'Bu tarayıcı derlemesinde Web Audio yok');
  const press = page.locator('[data-ses-event="press"]');
  await press.click();
  await expect
    .poll(async () => {
      await press.click();
      return played(page);
    })
    .toBeGreaterThan(0);
  // Sessizleştirme onay kutusu da bir niyettir (kendi tıklaması sessizlikten ÖNCE çalabilir):
  // karşılaştırma tabanı sessizlik uygulandıktan sonra alınır.
  await page.locator('[data-ses="mute"]').click();
  await expect(readout(page, 'gain-ui')).toHaveAttribute('data-value', '0.00');
  const before = await played(page);
  const droppedBefore = await dropped(page);
  await press.click();
  await press.click();
  expect(await played(page)).toBe(before);
  expect(await dropped(page)).toBeGreaterThan(droppedBefore);
});

test('ses laboratuvarı: kuru ve kit yolu hatasız çalışır, örnek indirilir', async ({ page }) => {
  await openLab(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.locator('[data-ses="kit"]').click();
  await page.locator('[data-ses="dry"]').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-ses="download"]').click(),
  ]);
  expect(download.suggestedFilename()).toBe('press-a.ogg');
  expect(errors).toEqual([]);
});
