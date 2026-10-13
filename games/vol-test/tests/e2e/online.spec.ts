import { expect, test, type Browser, type Page } from '@playwright/test';
import { Client, type Room } from '@colyseus/sdk';
import { PROTOCOL_VERSION } from '@volstudio/network/protocol';
import { WORLD } from '../../src/config/world';
import { EVENT_MESSAGE, type EventBatch } from '../../src/network/events';
import { ROOM } from '../../src/network/rooms';
import { MATCH_SCHEMA, type MatchSnapshot, type PlayerSnapshot } from '../../src/network/schema';
import { serverRoom, startServer, type TestServer } from '../support/netHarness';

/**
 * Çok oyunculu tüketici: gönderilen istemci gerçek tarayıcıda, gerçek Colyseus sunucusuna (bu
 * işlemde, rastgele portta) bağlanır. Sunucu tarafı yetkili durumu bir Node gözlemcisi okur;
 * sayfaların gösterdiği (öngörülen) konumla karşılaştırılır. Ölüm gibi sürüşle zor üretilen olaylar
 * sunucudaki yetkili `Simulation`a hasar verilerek tetiklenir; sayfa gerçek tel olayını işler.
 */
let server: TestServer;
const observers: Room[] = [];

// Her test kendi sunucusunu kurar: önceki testin kopan bağlantıları yeniden bağlanma penceresinde
// koltukta kalır ve skor tablosunu doldurur.
test.beforeEach(async () => {
  server = await startServer();
});

test.afterEach(async () => {
  for (const room of observers.splice(0)) await room.leave(true).catch(() => undefined);
  await server.stop();
});

interface Observer {
  readonly room: Room<MatchSnapshot>;
  readonly events: EventBatch[];
  find(name: string): PlayerSnapshot | undefined;
  /** Oyuncunun oturum kimliği (sunucudaki araca ulaşmak için). */
  sessionOf(name: string): string;
}

/** Odaya görünmez bir tanık olarak girer: durumu ve olay iletilerini kaydeder. */
async function observe(name: string): Promise<Observer> {
  const room = await (new Client(server.endpoint).joinOrCreate<MatchSnapshot>(
    ROOM.match,
    { protocol: PROTOCOL_VERSION, name, mode: 'ffa' },
    MATCH_SCHEMA,
  ) as Promise<Room<MatchSnapshot>>);
  observers.push(room);
  const events: EventBatch[] = [];
  room.onMessage(EVENT_MESSAGE, (batch: EventBatch) => events.push(batch));
  const find = (who: string): PlayerSnapshot | undefined => {
    let found: PlayerSnapshot | undefined;
    room.state.players.forEach((player) => {
      if (player.name === who) found = player;
    });
    return found;
  };
  const sessionOf = (who: string): string => {
    let key: string | undefined;
    room.state.players.forEach((player, id) => {
      if (player.name === who) key = id;
    });
    if (key === undefined) throw new Error(`Oyuncu odada yok: ${who}`);
    return key;
  };
  return { room, events, find, sessionOf };
}

/** Sayfayı bu testin sunucusuna yönlendiren adres. */
const serverUrl = (): string => `/?server=${encodeURIComponent(server.endpoint)}`;

type Entry = 'quick' | 'create' | { readonly join: string };

/** Duraklatma menüsünden lobiyi açıp seçilen yolla maça girer. */
async function enter(page: Page, name: string, how: Entry = 'quick'): Promise<void> {
  await page.goto(serverUrl());
  await expect(page.getByTestId('hud')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('pause-online').click();
  await page.getByTestId('lobby-name').fill(name);
  if (how === 'quick') {
    await page.getByTestId('lobby-quick').click();
  } else if (how === 'create') {
    await page.getByTestId('lobby-create').click();
  } else {
    await page.getByTestId('lobby-code').fill(how.join);
    await page.getByTestId('lobby-join').click();
  }
  await expect(page.getByTestId('online')).toBeVisible({ timeout: 15_000 });
}

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    locale: 'tr-TR',
    viewport: { width: 1280, height: 800 },
  });
  return context.newPage();
}

/** Minimap'in bildirdiği (öngörülen) konum, metre. */
async function position(page: Page): Promise<{ x: number; y: number }> {
  const value = (await page.locator('.vt-hud__map').getAttribute('data-position')) ?? '0,0';
  const [x, y] = value.split(',').map(Number);
  return { x: x ?? 0, y: y ?? 0 };
}

const ping = (page: Page) => page.getByTestId('online-ping');

test('iki tarayıcı aynı odaya girer: tablo, gözlemci ve çubuk birbirini görür', async ({
  browser,
}, info) => {
  const tag = info.project.name.slice(0, 4);
  const first = await newPage(browser);
  const second = await newPage(browser);
  await enter(first, `${tag}-A`);
  await enter(second, `${tag}-B`);
  const watcher = await observe(`${tag}-W`);

  for (const page of [first, second]) {
    const board = page.getByTestId('online-board');
    await expect(board).toContainText(`${tag}-A`);
    await expect(board).toContainText(`${tag}-B`);
    await expect(page.getByTestId('online-room')).not.toBeEmpty();
  }
  await expect.poll(() => watcher.room.state.players.size).toBeGreaterThanOrEqual(3);
  expect(watcher.find(`${tag}-A`)?.connected).toBe(true);
  expect(watcher.find(`${tag}-B`)?.connected).toBe(true);
  // Ping ölçülür ve derecelendirilir; yerel döngüde kötü olmamalı.
  await expect(ping(first)).toHaveAttribute('data-grade', /good|fair/);
});

test('özel oda: kuran kodu görür, kodla gelen aynı odaya düşer, yanlış kod hata verir', async ({
  browser,
}, info) => {
  const tag = info.project.name.slice(0, 4);
  const host = await newPage(browser);
  await enter(host, `${tag}-H`, 'create');
  const label = (await host.getByTestId('online-room').textContent()) ?? '';
  const code = /[A-Z0-9]{5}/.exec(label)?.[0];
  expect(code, `Oda etiketinde kod yok: ${label}`).toBeDefined();

  const guest = await newPage(browser);
  await enter(guest, `${tag}-G`, { join: code! });
  await expect(guest.getByTestId('online-room')).toContainText(code!);
  for (const page of [host, guest]) {
    await expect(page.getByTestId('online-board')).toContainText(`${tag}-H`);
    await expect(page.getByTestId('online-board')).toContainText(`${tag}-G`);
  }

  // Var olmayan kod: lobi hatayı yazar, oyuncu çevrimdışı dünyada kalır.
  const stray = await newPage(browser);
  await stray.goto(serverUrl());
  await expect(stray.getByTestId('hud')).toBeVisible();
  await stray.keyboard.press('Escape');
  await stray.getByTestId('pause-online').click();
  await stray.getByTestId('lobby-code').fill('ZZZZZ');
  await stray.getByTestId('lobby-join').click();
  await expect(stray.getByTestId('lobby-status')).toHaveAttribute('data-tone', 'danger');
  await expect(stray.getByTestId('online')).toHaveCount(0);
});

test('klavyeyle sürülen tank sunucudaki konumla aynı yere oturur', async ({ browser }, info) => {
  const tag = info.project.name.slice(0, 4);
  const page = await newPage(browser);
  await enter(page, `${tag}-D`);
  const watcher = await observe(`${tag}-W`);
  await expect.poll(() => watcher.find(`${tag}-D`) !== undefined).toBe(true);
  const start = await position(page);
  const record = (): PlayerSnapshot => {
    const found = watcher.find(`${tag}-D`);
    if (!found) throw new Error('Sürücü kaydı sunucuda yok');
    return found;
  };
  /** Yetkili konum, minimap ile aynı birimde (metre). */
  const authority = (): { x: number; y: number; speed: number } => ({
    x: record().x / WORLD.metre,
    y: record().y / WORLD.metre,
    speed: Math.hypot(record().vx, record().vy) / WORLD.metre,
  });

  await page.locator('#game > canvas').hover();
  await page.keyboard.down('d');
  await expect
    .poll(async () => (await position(page)).x, { timeout: 10_000 })
    .toBeGreaterThan(start.x + 3);
  await page.keyboard.down('Space');
  await page.keyboard.up('d');
  await expect.poll(() => authority().speed, { timeout: 10_000 }).toBeLessThan(0.05);
  await page.keyboard.up('Space');

  // Durgun tankta öngörü ile yetki aynı noktayı gösterir.
  await expect
    .poll(
      async () => {
        const mine = await position(page);
        return Math.hypot(mine.x - authority().x, mine.y - authority().y);
      },
      { timeout: 8000 },
    )
    .toBeLessThan(0.5);
  expect(authority().x).toBeGreaterThan(start.x + 3);

  // Öngörü sapması: sürüş boyunca görülen en büyük değer kayıt altındadır (sönümlü tepe, durgunken
  // sıfıra iner; `driftMax` oturum boyunca en büyüğünü tutar).
  const drift = async () =>
    ping(page).evaluate((element) => ({
      ema: Number((element as HTMLElement).dataset.driftEma),
      peak: Number((element as HTMLElement).dataset.driftPeak),
      max: Number((element as HTMLElement).dataset.driftMax),
    }));
  const driven = await drift();
  info.annotations.push({
    type: 'drift',
    description: `max=${driven.max.toFixed(3)} (${info.project.name})`,
  });
  // Sınır, sunucunun adım kaçırdığı tek tük düzeltmeyi taşır; gerçek ayrışma onlarca birimdir.
  expect(driven.max).toBeLessThan(16);

  // Ölçümün canlı olduğunun kanıtı: yetkili aracı kaydır. Sapma görünmeli, istemci yakınsamalı.
  // (SDK eşiksiz sapmayı hiç ölçmez; bu adım olmadan "sapma 0" boş bir iddia olurdu.)
  const room = serverRoom(watcher.room);
  const vehicle = room.vehicleOf(watcher.sessionOf(`${tag}-D`))!;
  vehicle.tank.x += 3 * WORLD.metre;
  await expect.poll(async () => (await drift()).max, { timeout: 8000 }).toBeGreaterThan(1);
  await expect
    .poll(
      async () => {
        const mine = await position(page);
        return Math.hypot(mine.x - authority().x, mine.y - authority().y);
      },
      { timeout: 8000 },
    )
    .toBeLessThan(0.5);
});

test('atış sunucuda yayınlanır: gözlemci kendi olay akışında atışı görür', async ({
  browser,
}, info) => {
  const tag = info.project.name.slice(0, 4);
  const page = await newPage(browser);
  await enter(page, `${tag}-F`);
  const watcher = await observe(`${tag}-W`);
  await expect.poll(() => watcher.find(`${tag}-F`) !== undefined).toBe(true);
  const shooter = watcher.find(`${tag}-F`)!.vehicleId;

  const shots = (): number =>
    watcher.events
      .flatMap((batch) => batch.events)
      .filter((event) => event.kind === 'fired' && event.source === shooter).length;
  await page.mouse.move(900, 400);
  await page.mouse.down();
  await expect.poll(shots, { timeout: 10_000 }).toBeGreaterThan(0);
  await page.mouse.up();
});

test('ölüm ve yeniden doğuş: skor tablosu, akış ve can çubuğu tarayıcıda güncellenir', async ({
  browser,
}, info) => {
  const tag = info.project.name.slice(0, 4);
  const killer = await newPage(browser);
  const victim = await newPage(browser);
  await enter(killer, `${tag}-K`);
  await enter(victim, `${tag}-V`);
  const watcher = await observe(`${tag}-W`);
  await expect.poll(() => watcher.find(`${tag}-K`) && watcher.find(`${tag}-V`)).toBeTruthy();
  const room = serverRoom(watcher.room);
  const vehicle = (name: string) => room.vehicleOf(watcher.sessionOf(name))!;
  // Doğma koruması hasarı yutar; test sürüşle değil hasarla öldürür.
  for (const name of [`${tag}-K`, `${tag}-V`]) vehicle(name).vitality.protectionRemainingMs = 0;

  const health = victim.getByRole('progressbar', { name: 'Araç canı' });
  await expect(health).not.toHaveAttribute('aria-valuenow', '0');
  room.simulation.applyDamage(vehicle(`${tag}-V`).id, 1e6, vehicle(`${tag}-K`).id);

  await expect(health).toHaveAttribute('aria-valuenow', '0');
  for (const page of [killer, victim])
    await expect(page.getByTestId('online-feed')).toContainText(`${tag}-K » ${tag}-V`);
  // Öldürenin satırında öldürme, ölenin satırında ölüm bir artar.
  const cell = (page: Page, who: string, column: number) =>
    page.locator('.vol-datatable__row', { hasText: who }).locator('td').nth(column);
  await expect(cell(killer, `${tag}-K`, 2)).toHaveText('1');
  await expect(cell(killer, `${tag}-V`, 3)).toHaveText('1');

  // Doğma süresi dolunca araç korumayla geri gelir; can çubuğu dolar.
  vehicle(`${tag}-V`).vitality.respawnRemainingMs = 5;
  await expect.poll(() => watcher.find(`${tag}-V`)?.alive).toBe(true);
  await expect(health).not.toHaveAttribute('aria-valuenow', '0');
});

test('Ayrıl: oyuncu sunucudan düşer ve oyun çevrimdışı dünyaya döner', async ({
  browser,
}, info) => {
  const tag = info.project.name.slice(0, 4);
  const page = await newPage(browser);
  await enter(page, `${tag}-L`);
  const watcher = await observe(`${tag}-W`);
  await expect.poll(() => watcher.find(`${tag}-L`) !== undefined).toBe(true);

  await page.keyboard.press('Escape');
  await page.getByTestId('pause-leave').click();
  await expect(page.getByTestId('online')).toHaveCount(0);
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect.poll(() => watcher.find(`${tag}-L`)).toBeUndefined();
  // Çevrimdışı dünyada çubuk yok, ama duraklatma menüsünde "Çok oyunculu" yine var.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-online')).toBeVisible();
});

test('çevrimdışı açılış ağ parçasını yüklemez ve soket açmaz; lobi açılınca parça gelir', async ({
  page,
}) => {
  const requests: string[] = [];
  const sockets: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await page.goto('/');
  await expect(page.getByTestId('hud')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-online')).toBeVisible();
  const online = (url: string): boolean => /\/assets\/online-[\w-]+\.(js|css)/.test(url);
  expect(requests.filter(online)).toEqual([]);
  expect(sockets).toEqual([]);

  await page.getByTestId('pause-online').click();
  await expect(page.getByTestId('lobby-quick')).toBeVisible();
  expect(requests.some(online)).toBe(true);
  expect(sockets).toEqual([]);
});

test('ulaşılamayan sunucuda lobi hatayı yazar ve yeniden denemeye açık kalır', async ({ page }) => {
  await page.goto('/?server=127.0.0.1:1');
  await expect(page.getByTestId('hud')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('pause-online').click();
  await page.getByTestId('lobby-quick').click();
  await expect(page.getByTestId('lobby-status')).toHaveAttribute('data-tone', 'danger', {
    timeout: 15_000,
  });
  await expect(page.getByTestId('lobby-status')).not.toBeEmpty();
  await expect(page.getByTestId('lobby-quick')).toBeEnabled();
  await expect(page.getByTestId('online')).toHaveCount(0);
});
