import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { KIND } from '../../src/config/forge';
import { averageColor, decodePng } from './png';
import { SYNC_MODE } from '../../src/net/protocol';
import { startForge, type RunningForge } from '../../server/index';

let forge: RunningForge;
let dataDir: string;

test.beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'vol-forge-e2e-'));
  forge = await startForge(
    [
      { worldId: 'world-1', dataDir, mode: SYNC_MODE.lockstep, seed: 7 },
      { worldId: 'aoi-1', dataDir, mode: SYNC_MODE.aoi, seed: 8, width: 64, height: 64 },
    ],
    0,
  );
});

test.afterAll(async () => {
  await forge?.stop();
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

const joinUrl = (world: string): string =>
  `/?server=${encodeURIComponent(forge.endpoint)}&world=${world}`;

const status = (page: Page) => page.getByTestId('forge-status');
const stats = (page: Page) => page.getByTestId('forge-stats');

function countKind(world: string, kind: number): number {
  const s = forge.rooms.get(world)!.simulation.state;
  let count = 0;
  for (let tile = 0; tile < s.count; tile++) if (s.kind[tile] === kind) count++;
  return count;
}

test('iki oyuncu aynı dünyayı paylaşır; yerleştirme sunucuya ulaşır, eşitlik bozulmaz', async ({
  page,
  browser,
}) => {
  const other = await browser.newContext({ locale: 'tr-TR' });
  const second = await other.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  second.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(joinUrl('world-1'));
    await second.goto(joinUrl('world-1'));
    await expect(status(page)).toHaveAttribute('data-status', 'live', { timeout: 30_000 });
    await expect(status(second)).toHaveAttribute('data-status', 'live', { timeout: 30_000 });
    await expect(page.locator('#game canvas')).toBeVisible();
    await expect(stats(page)).toHaveAttribute('data-players', '2');
    await expect(stats(second)).toHaveAttribute('data-players', '2');

    // Konveyör: çekirdeğin dört karo doğusunda boş bir noktaya tıkla.
    const before = countKind('world-1', KIND.conveyor);
    await page.locator('[data-item-id="conveyor"]').click();
    const box = (await page.locator('#game canvas').boundingBox())!;
    await page.mouse.click(box.x + box.width / 2 + 60, box.y + box.height / 2);
    await expect.poll(() => countKind('world-1', KIND.conveyor)).toBe(before + 1);

    // En az bir durum karması denetimi (150 adım ≈ 5 sn) sapma vermeden geçmiş olmalı.
    await expect
      .poll(async () => Number(await stats(page).getAttribute('data-tick')), { timeout: 30_000 })
      .toBeGreaterThan(400);
    for (const view of [page, second]) {
      await expect(status(view)).toHaveAttribute('data-status', 'live');
      await expect(stats(view)).toHaveAttribute('data-resyncs', '0');
    }

    // Çizim gerçekten dünyayı gösteriyor: ekran ortasında çekirdeğin mavisi var (düz arka plan değil).
    const core = averageColor(
      decodePng(
        await page.screenshot({
          clip: {
            x: box.x + box.width / 2 - 10,
            y: box.y + box.height / 2 - 10,
            width: 6,
            height: 6,
          },
        }),
      ),
    );
    expect(core.b).toBeGreaterThan(150);
    expect(core.b).toBeGreaterThan(core.r + 60);

    expect(errors).toEqual([]);
  } finally {
    await other.close();
  }
});

test('Ayrıl düğmesi sunucudaki oyuncuyu kaldırır ve formu geri getirir', async ({ page }) => {
  await page.goto(joinUrl('world-1'));
  await expect(status(page)).toHaveAttribute('data-status', 'live', { timeout: 30_000 });
  await expect.poll(() => forge.rooms.get('world-1')!.clients.length).toBe(1);
  await page.getByTestId('forge-leave').click();
  await expect(page.getByTestId('forge-connect')).toBeVisible();
  await expect.poll(() => forge.rooms.get('world-1')!.clients.length).toBe(0);
});

test('ilgi alanı dünyasında desteklenmediğini söyler ve odadan ayrılır', async ({ page }) => {
  await page.goto(joinUrl('aoi-1'));
  await expect(page.getByTestId('forge-error')).not.toBeEmpty({ timeout: 30_000 });
  await expect(page.getByTestId('forge-connect')).toBeVisible();
  await expect.poll(() => forge.rooms.get('aoi-1')!.clients.length).toBe(0);
});

test('geçersiz adres bağlantı denemeden hata gösterir', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('forge-connect')).toBeVisible();
  await page.getByTestId('forge-server').fill('ftp://sunucu');
  await page.getByTestId('forge-join').click();
  await expect(page.getByTestId('forge-error')).not.toBeEmpty();
  await expect(page.getByTestId('forge-server')).toHaveAttribute('aria-invalid', 'true');
});

test('ulaşılamayan sunucuda bağlantı hatası gösterir ve form kullanılabilir kalır', async ({
  page,
}) => {
  await page.goto('/?server=' + encodeURIComponent('http://127.0.0.1:9') + '&world=world-1');
  await expect(page.getByTestId('forge-error')).not.toBeEmpty({ timeout: 30_000 });
  await expect(page.getByTestId('forge-join')).toBeEnabled();
});
