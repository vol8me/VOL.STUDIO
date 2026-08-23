import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * Aşama 5'in çıkış kriteri: GERÇEK bir PNG aç, düzenle, kaydet.
 *
 * jsdom testleri belge modelini ve girdi yönlendirmesini kanıtlar ama tuvalin
 * gerçekten çizdiğini, `toBlob`un PNG ürettiğini ve multipart kaydın diskteki
 * baytları değiştirdiğini gösteremez. Bu dosya o zinciri uçtan uca yürütür.
 */
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const SANDBOX_DIR = join(REPO_ROOT, 'games/design/pen_export');
const FIXTURE_NAME = '__e2e-editor-fixture.png';
const FIXTURE_PATH = join(SANDBOX_DIR, FIXTURE_NAME);

/** 8×8 tek renkli PNG; küçük tutulur ki karşılaştırma hızlı ve kesin olsun. */
async function writeFixture(): Promise<void> {
  const sharp = (await import('sharp')).default;
  await mkdir(SANDBOX_DIR, { recursive: true });
  const png = await sharp({
    create: { width: 8, height: 8, channels: 4, background: '#204060ff' },
  })
    .png()
    .toBuffer();
  await writeFile(FIXTURE_PATH, png);
}

async function openFixtureInEditor(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('.asset-card').first().waitFor({ timeout: 30_000 });
  await page.locator('.asset-search__input').fill('__e2e-editor-fixture');
  const card = page.locator('.asset-card', { hasText: FIXTURE_NAME });
  await card.first().click();
  await page.locator('.quick-look__edit:visible').click();
  await expect(page.locator('.editor-panel')).toHaveClass(/editor-panel--open/);
  await expect(page.locator('.pixel-editor__canvas')).toBeVisible();

  // Tuval GERÇEKTEN yer kaplamalı. Bir yerleşim regresyonunda sahne sıfır
  // yükseklikte kaldı, tuval 1 piksele indi ve tıklamalar araca hiç ulaşmadı;
  // belirti "kaydet düğmesi pasif" gibi görünüp asıl nedeni gizledi.
  const box = await page.locator('.pixel-editor__canvas').boundingBox();
  expect(box, 'tuval ölçülemedi').not.toBeNull();
  expect(box!.width, 'tuval genişliği çöktü').toBeGreaterThan(200);
  expect(box!.height, 'tuval yüksekliği çöktü').toBeGreaterThan(200);
}

// Her test TAZE fixture ile başlar. Paylaşılan dosyada önceki testin darbesi
// kalıyor ve "beyaz üstüne beyaz" boyayan bir sonraki test hiç değişiklik
// üretmiyordu — testler birbirinin sonucunu sessizce bozuyordu.
test.beforeEach(writeFixture);
test.afterAll(async () => {
  await rm(FIXTURE_PATH, { force: true });
});

test('gerçek PNG açılır, düzenlenir ve diske kaydedilir', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(message.text());
  });
  const before = await readFile(FIXTURE_PATH);

  await openFixtureInEditor(page);
  await expect(page.locator('.editor-panel__save')).toBeDisabled();

  // Belgenin ortasına gerçek bir kalem darbesi.
  const canvas = page.locator('.pixel-editor__canvas');
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('tuval ölçülemedi');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 12, { steps: 6 });
  await page.mouse.up();

  await expect(page.locator('.editor-panel__save')).toBeEnabled();
  await expect(page.locator('.editor-panel__status')).toHaveText(/kaydedilmemiş|unsaved/i);

  await page.locator('.editor-panel__save').click();
  await expect(page.locator('.editor-panel__status')).toHaveText(/kaydedilmiş|saved/i, {
    timeout: 15_000,
  });

  const after = await readFile(FIXTURE_PATH);
  expect(after.equals(before), 'diskteki dosya değişmeliydi').toBe(false);
  // Yazılan dosya gerçekten PNG olmalı; kabuk bozuk bayt yazmamalı.
  expect(after.subarray(1, 4).toString()).toBe('PNG');
  expect(failures).toEqual([]);
});

test('undo diski değiştirmez, yalnız belgeyi geri alır', async ({ page }) => {
  await openFixtureInEditor(page);
  const canvas = page.locator('.pixel-editor__canvas');
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('tuval ölçülemedi');
  const before = await readFile(FIXTURE_PATH);

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator('.editor-panel__undo')).toBeEnabled();

  await page.locator('.editor-panel__undo').click();

  // Kaydedilmiş duruma dönen belge yeniden TEMİZDİR; kayıt düğmesi kapanır.
  await expect(page.locator('.editor-panel__save')).toBeDisabled();
  expect((await readFile(FIXTURE_PATH)).equals(before)).toBe(true);
});

test('harici değişiklik çakışma şeridini açar ve dosyayı ezmez', async ({ page }) => {
  await openFixtureInEditor(page);
  const original = await readFile(FIXTURE_PATH);

  // Başka bir araç dosyayı değiştirdi.
  const sharp = (await import('sharp')).default;
  const external = await sharp({
    create: { width: 8, height: 8, channels: 4, background: '#a01010ff' },
  })
    .png()
    .toBuffer();
  await writeFile(FIXTURE_PATH, external);

  await expect(page.locator('.editor-panel__conflict')).toBeVisible({ timeout: 20_000 });
  expect(
    createHash('sha256')
      .update(await readFile(FIXTURE_PATH))
      .digest('hex'),
  ).toBe(createHash('sha256').update(external).digest('hex'));
  expect(original.equals(external)).toBe(false);
});

test('katman, kare ve palet panelleri gerçekten çalışır', async ({ page }) => {
  await openFixtureInEditor(page);

  // Palet belgeden çıkarılır; tek renkli fixture en az bir swatch verir.
  await expect(page.locator('.palette-swatch').first()).toBeVisible();

  // Katman ekle → liste iki satır olur, yeni katman aktif.
  await expect(page.locator('.layer-row')).toHaveCount(1);
  await page.locator('.layer-panel__add').click();
  await expect(page.locator('.layer-row')).toHaveCount(2);
  await expect(page.locator('.layer-row--active')).toHaveCount(1);

  // Görünürlük kapatılabilir.
  const topVisible = page.locator('.layer-row').first().locator('.layer-row__visible');
  await topVisible.click();
  await expect(topVisible).toHaveAttribute('aria-pressed', 'false');

  // Kare ekle → şerit iki hücre gösterir ve ikincisi aktif olur.
  await expect(page.locator('.frame-cell')).toHaveCount(1);
  await page.locator('.frame-panel__frameCopy').click();
  await expect(page.locator('.frame-cell')).toHaveCount(2);
  await expect(page.locator('.frame-cell--active')).toHaveText('2');

  // Yapısal işlemler geçmişe girer: undo kareyi geri alır.
  await page.locator('.editor-panel__undo').click();
  await expect(page.locator('.frame-cell')).toHaveCount(1);
});

test('ses editörü dalga formu seçimini gerçek işlem zincirine alır', async ({ page }) => {
  await page.goto('/');
  await page.locator('.asset-card').first().waitFor({ timeout: 30_000 });
  await page.locator('[data-filter="audio"]').click();
  await page.locator('.asset-search__input').fill('lock-0.ogg');
  await page.locator('.asset-card').first().click();
  await page.locator('.quick-look__edit:visible').click();
  await expect(page.locator('.audio-editor')).toHaveClass(/audio-editor--open/);
  await expect(page.locator('.audio-editor__status')).toHaveText(/hazır|ready/i, {
    timeout: 30_000,
  });
  const waveform = page.locator('.waveform__overlay');
  await expect(waveform).toBeVisible();
  const box = await waveform.boundingBox();
  if (box === null) throw new Error('dalga formu ölçülemedi');

  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();

  const trim = page.locator('.audio-editor__processes .vol-button').first();
  await expect(trim).toBeEnabled();
  await trim.click();
  await expect(page.locator('.audio-editor__operation')).toHaveCount(1);
  await expect(page.locator('.audio-editor__transport .vol-button')).toBeEnabled();
});

test('katman opaklığı bileşiği değiştirir ve tek undo üretir', async ({ page }) => {
  await openFixtureInEditor(page);
  await page.locator('.layer-panel__add').click();

  const canvas = page.locator('.pixel-editor__canvas');
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('tuval ölçülemedi');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();

  const opacity = page.locator('.layer-row').first().locator('.layer-row__opacity');
  await opacity.fill('40');
  await opacity.dispatchEvent('change');

  // Opaklık değişimi ayrı bir undo adımıdır; darbeyi geri almamalı.
  await page.locator('.editor-panel__undo').click();
  await expect(opacity).toHaveValue('100');
});
