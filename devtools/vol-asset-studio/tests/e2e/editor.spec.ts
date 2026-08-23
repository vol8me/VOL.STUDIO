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
  await page.locator('.quick-look__edit').click();
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
