import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { NETWORK } from '../../src/config/network';
import { TANK } from '../../src/config/tank';
import { WORLD } from '../../src/config/world';
import { joinWorld, startServer, type TestServer } from '../support/netHarness';
import { startImpairedProxy, type ImpairedProxy } from '../support/impairedProxy';

/**
 * Bozuk ağ altında öngörü ve uzlaştırma (F13.6): gerçek tarayıcı, gerçek sunucunun önüne konan
 * gecikme/titreşim/bekleme vekili üzerinden bağlanır. Profil ve bütçeler `quality.json` →
 * `networkImpairment` içindedir; ölçülen: oturum boyunca en büyük düzeltme (`driftMax`), en büyük
 * gidiş-dönüş (`pingMaxMs`) ve ani sıçrama sayısı. Sürüş koşul tabanlıdır (konum eşiği), sabit
 * bekleme yoktur. Bütçe aşımı kapıyı düşürür; son durumda sayfa yetkiyle aynı yere oturmalıdır.
 */
interface Profile {
  readonly latencyMs: number;
  readonly jitterMs: number;
  readonly stallPct: number;
  readonly stallMs: number;
  readonly driftMax: number;
  readonly pingMaxMs: number;
  readonly snaps: number;
}

const BUDGETS = (
  JSON.parse(readFileSync(resolve(process.cwd(), '../../quality.json'), 'utf-8')) as {
    networkImpairment: Record<string, Record<string, Profile>>;
  }
).networkImpairment['games/vol-test'];

/** Sürüş hız tavanı (dünya birimi/sn): tavan hız ve hızlanma çarpanı. */
const TOP_SPEED = TANK.maxSpeed * TANK.boostMultiplier;

let server: TestServer;
let proxy: ImpairedProxy | undefined;

test.afterEach(async () => {
  await proxy?.stop();
  await server?.stop();
  proxy = undefined;
});

async function enter(page: Page, name: string, endpoint: string): Promise<void> {
  await page.goto(`/?server=${encodeURIComponent(endpoint)}`);
  await page.getByTestId('menu-play').click();
  await page.getByTestId('garage-name').fill(name);
  await page.getByTestId('garage-join').click();
  await expect(page.getByTestId('online')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('online-ping')).toHaveAttribute('data-pose-x', /\d/);
}

/** Öngörülen konum (dünya birimi). */
async function pose(page: Page): Promise<{ x: number; y: number }> {
  const ping = page.getByTestId('online-ping');
  return {
    x: Number(await ping.getAttribute('data-pose-x')),
    y: Number(await ping.getAttribute('data-pose-y')),
  };
}

/** Tuşu, tank bu eksende `metres` metre yol alana dek basılı tutar. */
async function drive(page: Page, key: string, axis: 'x' | 'y', metres: number): Promise<void> {
  const from = (await pose(page))[axis];
  await page.keyboard.down(key);
  await expect
    .poll(async () => Math.abs((await pose(page))[axis] - from) / WORLD.metre, {
      timeout: 15_000,
      intervals: [100],
    })
    .toBeGreaterThan(metres);
  await page.keyboard.up(key);
}

for (const [name, budget] of Object.entries(BUDGETS)) {
  test(`bozuk ağ (${name}): düzeltme, gidiş-dönüş ve sıçrama bütçesi içinde; durunca yetkiyle aynı yer`, async ({
    browser,
  }, info) => {
    test.setTimeout(120_000);
    server = await startServer();
    proxy = await startImpairedProxy(server.port, budget, 7);
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const player = `${info.project.name.slice(0, 4)}-${name}`;
    await enter(page, player, proxy.endpoint);

    // Sayfa içi kayıt: HUD her güncellendiğinde konum farkı ve gidiş-dönüş okunur.
    await page.evaluate(() => {
      const target = document.querySelector('[data-testid="online-ping"]') as HTMLElement;
      const store = { samples: [] as [number, number][], pings: [] as number[] };
      (window as unknown as { __net: typeof store }).__net = store;
      let last: [number, number, number] | undefined;
      new MutationObserver(() => {
        const t = performance.now();
        const x = Number(target.dataset.poseX);
        const y = Number(target.dataset.poseY);
        if (last) store.samples.push([Math.hypot(x - last[0], y - last[1]), t - last[2]]);
        last = [x, y, t];
        const ms = /(\d+)\s*ms/.exec(target.textContent ?? '');
        if (ms) store.pings.push(Number(ms[1]));
      }).observe(target, { attributes: true, subtree: true, childList: true, characterData: true });
    });

    await page.locator('#game > canvas').hover();
    for (const [key, axis] of [
      ['d', 'x'],
      ['w', 'y'],
      ['a', 'x'],
      ['s', 'y'],
    ] as const)
      await drive(page, key, axis, 3);
    await page.keyboard.down('Space');

    const result = await page.evaluate(() => {
      const store = (window as unknown as { __net: { samples: number[][]; pings: number[] } })
        .__net;
      const element = document.querySelector('[data-testid="online-ping"]') as HTMLElement;
      return {
        samples: store.samples,
        pings: store.pings,
        driftMax: Number(element.dataset.driftMax),
      };
    });

    const snaps = result.samples.filter(
      ([distance, dtMs]) => distance > (TOP_SPEED * dtMs) / 1000 + NETWORK.snapDistance / 2,
    ).length;
    const pingMax = Math.max(...result.pings, 0);
    info.annotations.push({
      type: 'network',
      description: `${name} ${info.project.name}: drift=${result.driftMax.toFixed(1)} pingMax=${pingMax} snaps=${snaps} stalled=${proxy.stats.stalled}/${proxy.stats.chunks}`,
    });
    expect(result.samples.length, 'ölçüm örnekleri toplandı').toBeGreaterThan(10);
    expect(result.driftMax, 'en büyük öngörü düzeltmesi').toBeLessThan(budget.driftMax);
    expect(pingMax, 'en büyük gidiş-dönüş (ms)').toBeLessThan(budget.pingMaxMs);
    expect(snaps, 'ani sıçrama').toBeLessThanOrEqual(budget.snaps);
    if (budget.stallPct > 0)
      expect(proxy.stats.stalled, 'vekil gerçekten beklettı').toBeGreaterThan(0);

    // Durunca öngörü yetkiyle aynı noktaya oturur: gözlemci vekilsiz, doğrudan sunucuya bağlanır.
    const watcher = await joinWorld(server, { name: `${player}-W` });
    try {
      const authority = (): { x: number; y: number } => {
        let found: { x: number; y: number } | undefined;
        watcher.state.players.forEach((entry) => {
          if (entry.name === player) found = { x: entry.x, y: entry.y };
        });
        if (!found) throw new Error('Sürücü sunucuda yok');
        return found;
      };
      await expect
        .poll(
          async () => {
            const mine = await pose(page);
            const server = authority();
            return Math.hypot(mine.x - server.x, mine.y - server.y) / WORLD.metre;
          },
          { timeout: 20_000, intervals: [200] },
        )
        .toBeLessThan(0.5);
    } finally {
      await page.keyboard.up('Space');
      await watcher.leave(true).catch(() => undefined);
      await context.close();
    }
  });
}
