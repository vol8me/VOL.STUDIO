import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const PACKAGE_ROOT = resolve(import.meta.dirname, '../..');
const PORT = Number(process.env.VOL_RECONNECT_E2E_PORT ?? 5198);
const URL = `http://127.0.0.1:${PORT}`;

async function stop(server: ChildProcess | null): Promise<void> {
  if (server === null || server.exitCode !== null || server.signalCode !== null) return;
  const exited = once(server, 'exit');
  // Ani sunucu kaybı EventSource'un kendi yeniden bağlanma yolunu sınar.
  server.kill('SIGKILL');
  await exited;
}

test('üretim sunucusu gerçekten kapanıp açılınca SSE yeniden bağlanır', async ({ page }) => {
  let server: ChildProcess | null = null;
  const start = async (): Promise<void> => {
    server = spawn(
      process.execPath,
      ['dist-server/server/cli.js', '--production', '--port', String(PORT)],
      {
        cwd: PACKAGE_ROOT,
        stdio: 'ignore',
      },
    );
    await expect
      .poll(
        async () => {
          if (server?.exitCode !== null) throw new Error('Test sunucusu başlatılamadı');
          try {
            return (await fetch(`${URL}/api/v1/health`)).ok;
          } catch {
            return false;
          }
        },
        { timeout: 15_000 },
      )
      .toBe(true);
  };
  try {
    await start();
    await page.goto(URL);
    const connection = page.locator('.studio-connection');
    await expect(connection).toHaveAttribute('data-state', 'live');
    await stop(server);
    await expect(connection).not.toHaveAttribute('data-state', 'live');
    await start();
    await expect(connection).toHaveAttribute('data-state', 'live', { timeout: 15_000 });
    await expect(page.locator('.asset-card').first()).toBeVisible();
  } finally {
    await page.close();
    await stop(server);
  }
});
