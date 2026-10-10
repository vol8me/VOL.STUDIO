import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import type { ShowcaseTab } from '../e2e/support/determinism';
import { APP_URL, OUT_DIR, expect, test } from './device';
import { cancel, centerOf, gesture, release, tap } from './touch';

/**
 * GERÇEK CİHAZ: SplitPane tutamağı ve kaydırma yüzeyleri (UI-10.2). Android Chrome'da gerçek dokunma (CDP
 * `Input.dispatchTouchEvent`, pointerType: touch): tutamak gerçek kutusu 44 px, parmakla sürülür, ikinci parmak sürüklemeyi
 * devralmaz, sistem dokunuşu keserse (`touchCancel` → `pointercancel`) boyut geri döner; ScrollView ve VirtualList
 * parmakla kayar, iç alan sona ulaşınca kaydırma dış panele geçer. Fiziksel kol/insan hissi bu kaydın dışındadır (UI-13.4).
 */
const serial = process.env.VOL_DEVICE_SERIAL;
const SPLIT = '.vol-showcase-workbench-split';
const SEPARATOR = `${SPLIT} .vol-split-pane__separator`;
const TAB_PANEL = '[role="tabpanel"]:not([aria-hidden="true"])';

function save(name: string, document: unknown): void {
  writeFileSync(resolve(OUT_DIR, name), `${JSON.stringify(document, null, 2)}\n`);
}

function shot(name: string): void {
  try {
    const png = execFileSync(
      process.env.ADB ?? 'adb',
      [...(serial ? ['-s', serial] : []), 'exec-out', 'screencap', '-p'],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    writeFileSync(resolve(OUT_DIR, name), png);
  } catch {
    /* ekran görüntüsü kanıtın eki; alınamazsa koşu durmaz */
  }
}

async function openTab(page: Page, tab: ShowcaseTab): Promise<void> {
  await page.goto(APP_URL, { waitUntil: 'load' });
  await page.waitForSelector('[role="tablist"]', { timeout: 30_000 });
  await tap(page, page.locator(`[role="tab"][id$="-tab-${tab}"]`));
  await page
    .locator(`[role="tabpanel"][id$="-panel-${tab}"]:not([aria-hidden="true"])`)
    .waitFor({ timeout: 15_000 });
  await page.waitForTimeout(400);
}

interface Split {
  now: number;
  min: number;
  max: number;
  handle: number;
  total: number;
}

/** Ayırıcının bildirdiği değerler (erişilebilir ad/değer) ve gerçek kutusu. */
async function readSplit(page: Page): Promise<Split> {
  return page.locator(SEPARATOR).evaluate((element) => ({
    now: Number(element.getAttribute('aria-valuenow')),
    min: Number(element.getAttribute('aria-valuemin')),
    max: Number(element.getAttribute('aria-valuemax')),
    handle: element.getBoundingClientRect().width,
    total: element.parentElement?.clientWidth ?? 0,
  }));
}

const primaryWidth = (page: Page): Promise<number> =>
  page
    .locator(`${SPLIT} .vol-split-pane__pane--primary`)
    .evaluate((element) => element.getBoundingClientRect().width);

/** Bölmenin boş yeri hangi yöndeyse oraya sürülür; sınırda kalan bir yöne sürmek boşa gider. */
function dragDelta(split: Split, wanted: number): number {
  const room = split.max - split.now;
  return room >= wanted ? wanted : -Math.min(wanted, split.now - split.min);
}

test('cihaz: SplitPane tutamağı 44 px; parmakla sürülür, bırakınca boyut kalır ve ayırıcı değeri bildirir', async ({
  device: page,
}) => {
  await openTab(page, 'workbench');
  const separator = page.locator(SEPARATOR);
  const before = await readSplit(page);
  expect(before.handle, 'tutamak kutusu 44 px olmalı (kaba işaretçi)').toBeGreaterThanOrEqual(43.5);

  const center = await centerOf(separator);
  const delta = dragDelta(before, 40);
  expect(
    Math.abs(delta),
    `bölmede sürülecek boş yer yok: ${JSON.stringify(before)}`,
  ).toBeGreaterThanOrEqual(20);
  const held = await gesture(
    page,
    [{ from: center, to: { x: center.x + delta, y: center.y } }],
    8,
    true,
  );
  const during = await readSplit(page);
  shot('split-dragging.png');
  await release(held);

  const after = await readSplit(page);
  expect(during.now).toBeCloseTo(before.now + delta, 0);
  expect(after.now, 'bırakınca boyut kalıcı').toBeCloseTo(before.now + delta, 0);
  expect(await primaryWidth(page)).toBeCloseTo(after.now, 0);

  save('split-drag.json', { handlePx: before.handle, before: before.now, delta, after: after.now });
});

test('cihaz: sürüklerken ikinci parmak devralmaz; touchCancel boyutu başlangıca döndürür', async ({
  device: page,
}) => {
  await openTab(page, 'workbench');
  const separator = page.locator(SEPARATOR);
  const start = await readSplit(page);
  await centerOf(separator);
  const box = (await separator.boundingBox())!;
  const first = { x: box.x + box.width / 2, y: box.y + box.height * 0.3 };
  const second = { x: box.x + box.width / 2, y: box.y + box.height * 0.7 };
  const delta = dragDelta(start, 30);
  expect(
    Math.abs(delta),
    `bölmede sürülecek boş yer yok: ${JSON.stringify(start)}`,
  ).toBeGreaterThanOrEqual(15);

  // İkinci parmak ters yöne sürmeye çalışır; yalnız ilk (birincil) parmak boyutu sürmeli.
  const held = await gesture(
    page,
    [
      { from: first, to: { x: first.x + delta, y: first.y } },
      { from: second, to: { x: second.x - delta * 2, y: second.y } },
    ],
    8,
    true,
  );
  const owned = await readSplit(page);
  await release(held);
  expect(owned.now, 'sahip parmak sürmeli, ikinci parmak değil').toBeCloseTo(start.now + delta, 0);

  // Aynı boyuttan yeni sürükleme: sistem keserse geri döner ve kalıcı olmaz.
  const base = await readSplit(page);
  await centerOf(separator);
  const center = await centerOf(separator);
  const cancelDelta = dragDelta(base, 30);
  const cut = await gesture(
    page,
    [{ from: center, to: { x: center.x + cancelDelta, y: center.y } }],
    6,
    true,
  );
  const moved = await readSplit(page);
  expect(moved.now).toBeCloseTo(base.now + cancelDelta, 0);
  await cancel(cut);
  await expect.poll(async () => (await readSplit(page)).now).toBeCloseTo(base.now, 0);
  await expect(page.locator(SPLIT)).not.toHaveClass(/vol-split-pane--resizing/);

  save('split-ownership-cancel.json', {
    ownerFollowedOnly: true,
    ownedDelta: owned.now - start.now,
    cancelRevertedTo: (await readSplit(page)).now,
    cancelStartedAt: base.now,
  });
});

const demoScroll = (page: Page): Locator =>
  page.locator(`${TAB_PANEL} .vol-scroll-view--vertical`).first();

async function swipeUp(page: Page, target: Locator, distance: number): Promise<void> {
  const point = await centerOf(target);
  await gesture(
    page,
    [
      {
        from: { x: point.x, y: point.y + distance / 2 },
        to: { x: point.x, y: point.y - distance / 2 },
      },
    ],
    10,
  );
  await page.waitForTimeout(500);
}

test('cihaz: ScrollView ve VirtualList parmakla kayar; iç alan sona ulaşınca kaydırma dış panele geçer', async ({
  device: page,
}) => {
  await openTab(page, 'scroll');
  const view = demoScroll(page);
  const topOf = (locator: Locator): Promise<number> =>
    locator.evaluate((element) => element.scrollTop);

  expect(await topOf(view)).toBe(0);
  await swipeUp(page, view, 160);
  const scrolled = await topOf(view);
  expect(scrolled, 'ScrollView parmakla kaymadı').toBeGreaterThan(20);

  // VirtualList: pencere kayar, DOM sınırlı kalır.
  const list = page.locator(`${TAB_PANEL} .vol-virtual-list`);
  const rows = list.locator('.vol-virtual-list__row');
  await centerOf(list);
  const firstBefore = Number(await rows.first().getAttribute('aria-posinset'));
  await swipeUp(page, list, 200);
  await swipeUp(page, list, 200);
  const firstAfter = Number(await rows.first().getAttribute('aria-posinset'));
  const listTop = await topOf(list);
  expect(listTop, 'VirtualList parmakla kaymadı').toBeGreaterThan(200);
  // Pencere kaydı: ilk render edilen satır, kaydırılan satır sayısından taşma (overscan) kadar geridedir.
  expect(firstAfter, 'VirtualList penceresi kaymadı').toBeGreaterThan(firstBefore);
  expect(await rows.count()).toBeLessThan(30);
  await expect(rows.first()).toHaveAttribute('aria-setsize', '5000');

  // Zincirleme: ScrollView'i sona kadar kaydır; sonra aynı alana yeni bir kaydırma dış paneli oynatır.
  for (let index = 0; index < 8; index += 1) await swipeUp(page, view, 200);
  const range = await view.evaluate((element) => element.scrollHeight - element.clientHeight);
  expect(await topOf(view)).toBeGreaterThanOrEqual(range - 2);

  // Hedef BİR KEZ ortalanır: `centerOf` sayfayı kaydırır, ölçümler arasında yeniden ortalamak dış kaydırmayı bozar.
  const point = await centerOf(view);
  const outerScroll = (): Promise<number> =>
    page.evaluate(
      () =>
        (document.scrollingElement?.scrollTop ?? 0) +
        (document.querySelector('.vol-tabs__panels')?.scrollTop ?? 0),
    );
  const outerBefore = await outerScroll();
  await gesture(
    page,
    [{ from: { x: point.x, y: point.y + 80 }, to: { x: point.x, y: point.y - 80 } }],
    10,
  );
  await page.waitForTimeout(500);
  const outerAfter = await outerScroll();
  expect(outerAfter, 'kaydırma dış panele geçmedi (iç alan kaydırmayı hapsediyor)').toBeGreaterThan(
    outerBefore,
  );

  const thickness = await view.evaluate(
    (element) => (element as HTMLElement).offsetWidth - element.clientWidth,
  );
  shot('scroll-surfaces.png');
  save('scroll-surfaces.json', {
    scrollViewMoved: scrolled,
    virtualList: {
      scrollTop: listTop,
      firstBefore,
      firstAfter,
      renderedRows: await rows.count(),
      setSize: 5000,
    },
    chainedToOuter: { before: outerBefore, after: outerAfter },
    scrollbarLayoutPx: thickness,
    note: 'Android Chrome kaydırma çubuğu bindirmelidir (0 px yerleşim); tutamak kullanıcı aracısı denetimidir',
  });
});

test('cihaz: DualAxisScrollPanel iki eksende parmakla kayar (sürükleme eşiği sonrası) ve ikinci parmak devralmaz', async ({
  device: page,
}) => {
  await openTab(page, 'touch');
  const panel = page.locator(`${TAB_PANEL} .vol-dual-scroll`);
  const offset = () =>
    panel.evaluate((element) => ({ x: element.scrollLeft, y: element.scrollTop }));
  const center = await centerOf(panel);
  expect(await offset()).toEqual({ x: 0, y: 0 });

  // Sola-yukarı sürükleme içeriği sağa-aşağı kaydırır (pan).
  await gesture(
    page,
    [{ from: { x: center.x + 60, y: center.y + 50 }, to: { x: center.x - 60, y: center.y - 50 } }],
    10,
  );
  const panned = await offset();
  expect(panned.x, 'yatay pan').toBeGreaterThan(60);
  expect(panned.y, 'dikey pan').toBeGreaterThan(40);

  // İkinci parmak (birincil değil) pan'ı bozmaz: yalnız ilk parmak konumu sürer.
  const base = await offset();
  const held = await gesture(
    page,
    [
      { from: { x: center.x + 40, y: center.y }, to: { x: center.x + 10, y: center.y } },
      { from: { x: center.x - 40, y: center.y }, to: { x: center.x + 90, y: center.y } },
    ],
    8,
    true,
  );
  const during = await offset();
  await release(held);
  expect(during.x - base.x, 'sahip parmak 30 px sola sürdü: içerik 30 px kaymalı').toBeCloseTo(
    30,
    0,
  );

  shot('dual-axis-pan.png');
  save('dual-axis-pan.json', { panned, ownerOnlyDeltaX: during.x - base.x });
});
