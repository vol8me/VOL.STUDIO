import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { SHOWCASE_TABS, type ShowcaseTab } from '../e2e/support/determinism';
import {
  HIT_MIN_PX,
  hitTargetProblems,
  loadGeometryRecords,
  measureTargets,
} from '../e2e/support/geometry';
import { hitTargetSelectors } from '../e2e/support/policy';
import { APP_URL, OUT_DIR, expect, test } from './device';

/**
 * GERÇEK CİHAZ kabulü (Android Chrome, CDP). Burada ölçülen şey cihazın KENDİ yerleşimi, dokunması,
 * yazı boyu, sesi ve girdi→kare gecikmesidir; başsız tarayıcı taklidi değildir. Sonuç kabul kaydıdır
 * (`records/ui-device/`, git dışı); insan hissi, sunulan kare ve ısınmış performans ayrıdır.
 *
 * Dokunma gerçek `Input.dispatchTouchEvent` ile yapılır (pointerType: touch), fare tıklaması değil.
 */

const MIN_TEXT_PX = 12;

async function touchTap(page: Page, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error('dokunulacak öğenin kutusu yok');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
}

/**
 * Ekran görüntüsü cihazın GERÇEK çıktısıdır (`adb screencap`): CDP `captureScreenshot` Android Chrome'da
 * görsel görüntü alanının yalnız bir kısmını döndürebiliyor; kırpılmış görüntüyü cihaz
 * görüntüsü sanmak yanıltıcı olur. adb yoksa CDP'ye düşülür.
 */
async function shot(page: Page, name: string): Promise<void> {
  const path = resolve(OUT_DIR, name);
  try {
    const serial = process.env.VOL_DEVICE_SERIAL;
    const png = execFileSync(
      process.env.ADB ?? 'adb',
      [...(serial ? ['-s', serial] : []), 'exec-out', 'screencap', '-p'],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    writeFileSync(path, png);
  } catch {
    await page.screenshot({ path });
  }
}

async function openApp(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !/favicon|404 \(Not Found\)/.test(message.text())) {
      problems.push(`console: ${message.text().slice(0, 160)}`);
    }
  });
  await page.goto(APP_URL, { waitUntil: 'load' });
  await page.waitForSelector('[role="tablist"]', { timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  return problems;
}

async function selectTab(page: Page, tab: ShowcaseTab): Promise<void> {
  await touchTap(page, page.locator(`[role="tab"][id$="-tab-${tab}"]`));
  await page
    .locator(`[role="tabpanel"][id$="-panel-${tab}"]:not([aria-hidden="true"])`)
    .waitFor({ timeout: 15_000 });
  await page.waitForTimeout(250);
}

interface Viewport {
  width: number;
  height: number;
  dpr: number;
  coarse: boolean;
  touchPoints: number;
  orientation: string;
}

const viewportOf = (page: Page): Promise<Viewport> =>
  page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    dpr: devicePixelRatio,
    coarse: matchMedia('(pointer: coarse)').matches,
    touchPoints: navigator.maxTouchPoints,
    orientation: innerWidth >= innerHeight ? 'landscape' : 'portrait',
  }));

function save(name: string, document: unknown): void {
  writeFileSync(resolve(OUT_DIR, name), `${JSON.stringify(document, null, 2)}\n`);
}

test('cihaz: açılış, ölçüler ve konsol temiz', async ({ device: page }) => {
  const problems = await openApp(page);
  const viewport = await viewportOf(page);
  const agent = await page.evaluate(() => navigator.userAgent);
  save('info.json', { viewport, agent, appUrl: APP_URL });
  await shot(page, 'open.png');
  expect(viewport.coarse, 'cihazın birincil işaretçisi kaba (dokunma)').toBe(true);
  expect(problems).toEqual([]);
});

test('cihaz: her sekme çizilir; yazı ≥ 12 px, taşma yok, dokunma hedefleri ölçülür', async ({
  device: page,
}) => {
  await openApp(page);
  const records = loadGeometryRecords();
  const selectors = hitTargetSelectors();
  const report: Record<string, unknown> = {};
  const failures: string[] = [];

  for (const tab of SHOWCASE_TABS) {
    await selectTab(page, tab);
    await shot(page, `tab-${tab}.png`);

    const text = await page.evaluate((min) => {
      const small: string[] = [];
      for (const element of document.querySelectorAll('body *')) {
        let own = '';
        for (const node of element.childNodes) {
          if (node.nodeType === Node.TEXT_NODE) own += node.textContent ?? '';
        }
        own = own.trim();
        if (!own) continue;
        const style = getComputedStyle(element);
        if (style.visibility === 'hidden' || style.display === 'none') continue;
        if (Number.parseFloat(style.opacity) === 0) continue;
        const rect = element.getBoundingClientRect();
        if (rect.width < 3 || rect.height < 3) continue;
        const size = Number.parseFloat(style.fontSize);
        if (size < min)
          small.push(`${element.tagName.toLowerCase()} ${size}px "${own.slice(0, 20)}"`);
      }
      return small;
    }, MIN_TEXT_PX);

    const overflow = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('.vol-tabs__panels');
      return {
        document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        panel: panel ? panel.scrollWidth - panel.clientWidth : 0,
      };
    });

    const measures = await measureTargets(
      page.locator(`[role="tabpanel"][id$="-panel-${tab}"]`),
      selectors,
    );
    const known = records.filter((record) => record.scope === `tab/${tab}`);
    const problems = hitTargetProblems(measures).filter(
      (problem) =>
        !known.some((record) => record.rule === problem.rule && problem.target === record.target),
    );

    report[tab] = {
      smallText: text.length,
      smallTextSamples: text.slice(0, 5),
      overflow,
      measured: measures.length,
      hitProblems: problems.map(
        (problem) => `${problem.rule} @ ${problem.target} (${problem.detail})`,
      ),
    };
    if (text.length > 0) failures.push(`${tab}: ${text.length} metin < ${MIN_TEXT_PX}px`);
    if (overflow.document > 1)
      failures.push(`${tab}: belge yatay taşıyor (${overflow.document}px)`);
    if (problems.length > 0) failures.push(`${tab}: ${problems.length} dokunma hedefi sorunu`);
  }

  save('tabs.json', { hitMinPx: HIT_MIN_PX, report });
  expect(failures).toEqual([]);
});

test('cihaz: ekran klavyesi dokunmayla yazılır; sembol, dil ve vazgeç çalışır; ekrana sığar', async ({
  device: page,
}) => {
  await openApp(page);
  await selectTab(page, 'forms');
  const trigger = page
    .locator('.vol-showcase-card', { hasText: /klavye|keyboard/i })
    .locator('button')
    .first();
  await touchTap(page, trigger);
  const osk = page.locator('.vol-osk');
  await osk.waitFor({ timeout: 10_000 });
  await page.waitForTimeout(300);
  await shot(page, 'osk-letters.png');

  const geometry = await page.evaluate(() => {
    const element = document.querySelector('.vol-osk') as HTMLElement;
    const box = element.getBoundingClientRect();
    const keys = [...element.querySelectorAll<HTMLElement>('.vol-osk__key')].map((key) => {
      const rect = key.getBoundingClientRect();
      return { w: rect.width, h: rect.height, l: rect.left, r: rect.right };
    });
    return { top: box.top, bottom: box.bottom, vw: innerWidth, vh: innerHeight, keys };
  });
  expect(geometry.top).toBeGreaterThanOrEqual(-1);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.vh + 1);
  for (const key of geometry.keys) {
    expect(key.l).toBeGreaterThanOrEqual(-1);
    expect(key.r).toBeLessThanOrEqual(geometry.vw + 1);
    expect(key.h).toBeGreaterThanOrEqual(40);
  }

  const value = osk.locator('.vol-osk__value');
  const before = ((await value.textContent()) ?? '').trim();
  await touchTap(page, osk.locator('.vol-osk__key[data-value="x"]'));
  await expect(value).toContainText(`${before}x`);
  await touchTap(page, osk.locator('.vol-osk__key[data-action="left"]'));
  await touchTap(page, osk.locator('.vol-osk__key[data-value="y"]'));
  await touchTap(page, osk.locator('.vol-osk__key[data-action="backspace"]'));

  await touchTap(page, osk.locator('.vol-osk__key[data-action="symbols"]'));
  await expect(osk.locator('.vol-osk__key[data-value="@"]')).toBeVisible();
  await shot(page, 'osk-symbols.png');
  await touchTap(page, osk.locator('.vol-osk__key[data-action="letters"]'));

  const code = osk.locator('.vol-osk__layout-code');
  const initial = (await code.textContent()) ?? '';
  await touchTap(page, osk.locator('.vol-osk__key[data-action="layout"]'));
  await expect(code).not.toHaveText(initial);
  await shot(page, 'osk-layout-switched.png');

  await touchTap(page, osk.locator('.vol-osk__key[data-action="cancel"]'));
  await expect(osk).toHaveCount(0);
});

test('cihaz: katmanlar çizilir; diyalog kutusu sayfanın üstünde, katmanlar ekrana sığar', async ({
  device: page,
}) => {
  await openApp(page);

  await selectTab(page, 'panels');
  await touchTap(
    page,
    page.locator('.vol-showcase-card', { hasText: /modal/i }).locator('button').first(),
  );
  await page.locator('.vol-modal--visible').first().waitFor({ timeout: 10_000 });
  await page.waitForTimeout(300);
  await shot(page, 'layer-modal.png');
  await page.keyboard.press('Escape');

  await selectTab(page, 'advanced');
  const dialogueCard = page.locator('.vol-showcase-card', { hasText: /diyalog|dialogue/i }).first();
  await touchTap(page, dialogueCard.locator('button').first());
  await page.locator('.vol-dialogue--visible').waitFor({ timeout: 10_000 });
  await expect
    .poll(async () => (await page.locator('.vol-dialogue__text').textContent())?.length ?? 0)
    .toBeGreaterThan(40);
  const onTop = await page.evaluate(() => {
    const box = document.querySelector('.vol-dialogue')!.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return hit?.closest('.vol-dialogue') !== null;
  });
  await shot(page, 'layer-dialogue.png');
  expect(onTop, 'diyalog kutusu başka bir yüzeyin arkasında kalmamalı').toBe(true);
});

test('cihaz: ses zinciri gerçek cihazda çalışır (bağlam çalışıyor, örnek çözüldü ve çaldı)', async ({
  device: page,
}) => {
  await openApp(page);
  await selectTab(page, 'ses');
  await page.waitForSelector('[data-ses="probe-total"]');
  const press = page.locator('[data-ses-event="press"]');
  await touchTap(page, press);
  await expect(page.locator('[data-ses="context"]')).toHaveAttribute('data-value', 'running', {
    timeout: 15_000,
  });
  await expect
    .poll(async () => {
      await touchTap(page, press);
      const counts =
        (await page.locator('[data-ses="counts"]').getAttribute('data-value')) ?? '0/0';
      return Number(counts.split('/')[0]);
    })
    .toBeGreaterThan(0);
  const state = await page.locator('[data-ses="state"]').getAttribute('data-value');
  save('sound.json', {
    state,
    context: await page.locator('[data-ses="context"]').textContent(),
    counts: await page.locator('[data-ses="counts"]').getAttribute('data-value'),
  });
  await shot(page, 'sound.png');
});

test('cihaz: dokunma → ilk görünür geri bildirim gecikmesi (rAF + mesaj turu)', async ({
  device: page,
}) => {
  await openApp(page);
  await selectTab(page, 'buttons');
  const target = page.locator('.vol-button').first();
  const samples: number[] = [];
  for (let i = 0; i < 40; i += 1) {
    await page.evaluate(() => {
      const holder = window as unknown as { __latency?: Promise<number> };
      holder.__latency = new Promise<number>((resolve) => {
        window.addEventListener(
          'pointerdown',
          (event) => {
            const origin = event.timeStamp;
            requestAnimationFrame(() => {
              const channel = new MessageChannel();
              channel.port1.onmessage = () => resolve(performance.now() - origin);
              channel.port2.postMessage(0);
            });
          },
          { capture: true, once: true },
        );
      });
    });
    await touchTap(page, target);
    samples.push(
      await page.evaluate(() => (window as unknown as { __latency: Promise<number> }).__latency),
    );
    await page.waitForTimeout(120);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q: number): number =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const result = { n: samples.length, p50: at(0.5), p95: at(0.95), max: sorted.at(-1) };
  save('latency.json', result);
  expect(result.p95, `p95 ${result.p95.toFixed(1)} ms`).toBeLessThan(100);
});
