import { expect, test } from '@playwright/test';
import { startWorldServer } from '../../server/index';

let server: Awaited<ReturnType<typeof startWorldServer>>;

test.beforeAll(async () => {
  server = await startWorldServer(0);
});

test.afterAll(async () => {
  await server?.server.gracefullyShutdown(false);
});

test('iki tarayıcı gerçek odayı paylaşır; hareket sunucudan gelir ve leave uzak oyuncuyu kaldırır', async ({
  page,
  browser,
}) => {
  const second = await browser.newPage();
  try {
    const route = '/?net=' + encodeURIComponent(server.endpoint);
    await page.goto(route);
    await second.goto(route);
    await expect(page.getByTestId('network-hud')).toBeVisible();
    await expect(page.getByTestId('network-status')).toHaveAttribute(
      'data-connection',
      'connected',
    );
    await expect(second.getByTestId('network-status')).toHaveAttribute(
      'data-connection',
      'connected',
    );
    await expect(page.getByTestId('network-summary')).toHaveAttribute('data-players', '2');
    await expect(second.getByTestId('network-summary')).toHaveAttribute('data-players', '2');
    await expect(page.locator('#game > canvas')).toBeVisible();
    await expect(second.locator('#game > canvas')).toBeVisible();
    await expect(page.getByTestId('network-summary')).toContainText('Can: 100 / 100');
    const x = Number(await page.getByTestId('network-summary').getAttribute('data-self-x'));
    await page.keyboard.down('d');
    await expect
      .poll(
        async () => Number(await page.getByTestId('network-summary').getAttribute('data-self-x')),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(x + 2);
    await page.keyboard.up('d');

    await second.getByTestId('network-leave').click();
    await expect(second).toHaveURL(/\/(?:\?.*)?$/);
    await expect(second.getByTestId('hud')).toBeVisible();
    await expect(page.getByTestId('network-summary')).toHaveAttribute('data-players', '1');
  } finally {
    await second.close();
  }
});

test('geçersiz adreste bağlantı hatasını gösterir ve oyuncu çıkabilir', async ({ page }) => {
  await page.goto('/?net=invalid-endpoint');
  await expect(page.getByTestId('network-hud')).toBeVisible();
  await expect(page.getByTestId('network-status')).toHaveAttribute('data-connection', 'error', {
    timeout: 15_000,
  });
  await expect(page.getByTestId('network-status')).toContainText('Bağlantı kurulamadı');
  await page.getByTestId('network-leave').click();
  await expect(page.getByTestId('hud')).toBeVisible();
});
