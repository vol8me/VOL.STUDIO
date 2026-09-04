import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface ShippedMetadata {
  parts: ReadonlyArray<{ partId: string; file: string }>;
}

const metadata = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../src/assets/rig/arachnid.metadata.json'), 'utf8'),
) as ShippedMetadata;

test('oyun gerçek tarayıcıda açılır ve rig dokularının HEPSİ yüklenir', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  const requested = new Set<string>();
  const failed: string[] = [];
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (!url.pathname.includes('/assets/rig/arachnid/parts/')) return;
    const file = url.pathname.split('/').pop() ?? '';
    requested.add(file);
    if (!response.ok()) failed.push(`${file} → ${response.status()}`);
  });

  await page.goto('/');

  // Kanvas gerçekten kuruldu ve ölçüldü.
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(100);
  expect(box?.height ?? 0).toBeGreaterThan(100);

  // Phaser dokuları yüklemeyi bitirene kadar bekle.
  await expect
    .poll(() => requested.size, { timeout: 20_000, message: 'rig dokuları yüklenmedi' })
    .toBe(metadata.parts.length);

  expect(failed, 'gönderilen bir parça sunulamadı').toEqual([]);

  // Metadata'nın vaat ettiği HER parça gerçekten istendi.
  const expectedFiles = metadata.parts.map((part) => part.file.split('/').pop());
  expect([...requested].sort()).toEqual([...expectedFiles].sort());

  expect(consoleErrors, 'konsola hata düştü').toEqual([]);
});

test('HUD ve oyun alanı birlikte çizilir, sayfa yatay taşmaz', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();

  // HUD kamera boşluklarında yaşar; oyun alanının üstüne binmemeli ve sayfa
  // hiçbir koşulda yatay kaymamalı.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
